import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** ¿La fecha ISO cae en el día de hoy (server local, se compara Y/M/D)? */
function esHoyIso(iso: string): boolean {
  try {
    const d = new Date(iso);
    const hoy = new Date();
    return d.getFullYear() === hoy.getFullYear() &&
           d.getMonth() === hoy.getMonth() &&
           d.getDate() === hoy.getDate();
  } catch {
    return false;
  }
}

type ItemInput = {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta: number;
  precio_venta_original?: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
  tipo_precio?: string | null;
  subtotal: number;
  monto_iva: number;
  total_linea: number;
};

/**
 * PATCH /api/ventas/[id]
 * Edita una venta que sea del día actual y no esté anulada.
 * Estrategia: revertir stock original → borrar items → actualizar header → insertar items → descontar stock nuevo.
 *
 * body: {
 *   cliente_id?: string | null,
 *   tipo_venta?: "CONTADO" | "CREDITO",
 *   plazo_dias?: number | null,
 *   metodo_pago?: "efectivo" | "tarjeta" | "transferencia" | null,
 *   items: ItemInput[],
 *   subtotal: number,
 *   monto_iva: number,
 *   total: number
 * }
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    // 1) Cargar venta y validar reglas
    const vQ = await sb
      .from("ventas")
      .select("id, empresa_id, numero_control, fecha, anulada")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (vQ.error) throw new Error(vQ.error.message);
    if (!vQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const venta = vQ.data as { id: string; numero_control: string; fecha: string; anulada?: boolean };
    if (venta.anulada) {
      return NextResponse.json(errorResponse("La venta está anulada. No se puede editar."), { status: 400 });
    }
    if (!esHoyIso(venta.fecha)) {
      return NextResponse.json(errorResponse("Solo se pueden editar ventas del día actual."), { status: 400 });
    }

    // 2) Parsear body
    const body = (await request.json().catch(() => ({}))) as {
      cliente_id?: string | null;
      tipo_venta?: "CONTADO" | "CREDITO";
      plazo_dias?: number | null;
      metodo_pago?: "efectivo" | "tarjeta" | "transferencia" | null;
      items?: ItemInput[];
      subtotal?: number;
      monto_iva?: number;
      total?: number;
    };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(errorResponse("Debe haber al menos un producto."), { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 3) Revertir stock: cada movimiento SALIDA de esta venta se compensa con ENTRADA.
    const movQ = await sb
      .from("movimientos_inventario")
      .select("id, producto_id, producto_nombre, producto_sku, cantidad, costo_unitario")
      .eq("empresa_id", empresaId)
      .eq("venta_id", id)
      .eq("tipo", "SALIDA");
    if (movQ.error) throw new Error(movQ.error.message);
    const movsOrig = (movQ.data ?? []) as Array<{
      id: string; producto_id: string;
      producto_nombre: string | null; producto_sku: string | null;
      cantidad: number; costo_unitario: number | null;
    }>;

    // 3a) Sumar por producto y devolver el stock actual + cantidad revertida.
    const deltaPorProducto = new Map<string, number>();
    for (const m of movsOrig) {
      deltaPorProducto.set(m.producto_id, (deltaPorProducto.get(m.producto_id) ?? 0) + Number(m.cantidad));
    }
    for (const [productoId, delta] of deltaPorProducto) {
      const pQ = await sb
        .from("productos")
        .select("stock_actual")
        .eq("empresa_id", empresaId)
        .eq("id", productoId)
        .maybeSingle();
      if (pQ.error) throw new Error(pQ.error.message);
      if (!pQ.data) continue;
      const actual = Number((pQ.data as { stock_actual: number | string }).stock_actual) || 0;
      const upd = await sb
        .from("productos")
        .update({ stock_actual: actual + delta })
        .eq("empresa_id", empresaId)
        .eq("id", productoId);
      if (upd.error) throw new Error(upd.error.message);
    }

    // 3b) Insertar movimientos ENTRADA de reversión (trazabilidad).
    for (const m of movsOrig) {
      const ins = await sb.from("movimientos_inventario").insert({
        empresa_id: empresaId,
        producto_id: m.producto_id,
        producto_nombre: m.producto_nombre,
        producto_sku: m.producto_sku,
        tipo: "ENTRADA",
        cantidad: m.cantidad,
        costo_unitario: m.costo_unitario ?? 0,
        origen: "venta_anulada",
        referencia: `EDIT-${venta.numero_control}`,
        fecha: nowIso,
        venta_id: id,
      });
      if (ins.error) throw new Error(ins.error.message);
    }

    // 4) Borrar items originales
    const del = await sb.from("ventas_items")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("venta_id", id);
    if (del.error) throw new Error(del.error.message);

    // 5) Actualizar header
    const subtotal = Number(body.subtotal ?? 0);
    const montoIva = Number(body.monto_iva ?? 0);
    const total = Number(body.total ?? 0);
    const updV = await sb.from("ventas")
      .update({
        cliente_id: body.cliente_id ?? null,
        tipo_venta: body.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        plazo_dias: body.tipo_venta === "CREDITO" ? (body.plazo_dias ?? null) : null,
        metodo_pago: body.metodo_pago ?? null,
        subtotal,
        monto_iva: montoIva,
        total,
      })
      .eq("empresa_id", empresaId)
      .eq("id", id);
    if (updV.error) throw new Error(updV.error.message);

    // 6) Insertar items nuevos
    for (const it of items) {
      const ins = await sb.from("ventas_items").insert({
        empresa_id: empresaId,
        venta_id: id,
        producto_id: it.producto_id,
        producto_nombre: it.producto_nombre,
        sku: it.sku,
        cantidad: Number(it.cantidad),
        precio_venta: Number(it.precio_venta),
        precio_venta_original: Number(it.precio_venta_original ?? it.precio_venta),
        tipo_iva: it.tipo_iva,
        tipo_precio: it.tipo_precio ?? "minorista",
        subtotal: Number(it.subtotal),
        monto_iva: Number(it.monto_iva),
        total_linea: Number(it.total_linea),
      });
      if (ins.error) throw new Error(ins.error.message);
    }

    // 7) Descontar stock nuevo + registrar SALIDA
    for (const it of items) {
      const pQ = await sb.from("productos")
        .select("stock_actual, costo_promedio, controla_stock")
        .eq("empresa_id", empresaId)
        .eq("id", it.producto_id)
        .maybeSingle();
      if (pQ.error) throw new Error(pQ.error.message);
      if (!pQ.data) continue;
      const p = pQ.data as { stock_actual: number | string; costo_promedio: number | string; controla_stock: boolean | null };
      if (p.controla_stock === false) continue; // no descuenta
      const actual = Number(p.stock_actual) || 0;
      const nuevo = Math.max(0, actual - Number(it.cantidad));
      const upd = await sb.from("productos")
        .update({ stock_actual: nuevo })
        .eq("empresa_id", empresaId)
        .eq("id", it.producto_id);
      if (upd.error) throw new Error(upd.error.message);

      const ins = await sb.from("movimientos_inventario").insert({
        empresa_id: empresaId,
        producto_id: it.producto_id,
        producto_nombre: it.producto_nombre,
        producto_sku: it.sku,
        tipo: "SALIDA",
        cantidad: it.cantidad,
        costo_unitario: Number(p.costo_promedio) || 0,
        origen: "venta",
        referencia: `EDIT-${venta.numero_control}`,
        fecha: nowIso,
        venta_id: id,
      });
      if (ins.error) throw new Error(ins.error.message);
    }

    return NextResponse.json(successResponse({ id, numero_control: venta.numero_control }));
  } catch (err) {
    console.error("[/api/ventas/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "No se pudo editar la venta."), { status: 500 });
  }
}
