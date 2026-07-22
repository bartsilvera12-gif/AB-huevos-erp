import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getUbicacionIdByCodigo, ajustarStockUbicacion } from "@/lib/multideposito/server";

/**
 * POST /api/ventas/[id]/anular
 * body: { motivo?: string }
 *
 * Marca la venta como anulada. Revierte stock:
 * - Por cada movimiento SALIDA asociado a la venta, inserta un ENTRADA equivalente
 *   con origen='venta_anulada' y suma la cantidad al stock del producto.
 *   Cubre tanto productos vendidos como insumos consumidos por receta.
 * - No borra los movimientos originales (trazabilidad).
 * - Idempotente: si ya está anulada, no hace nada.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    let body: { motivo?: string } = {};
    try { body = await request.json(); } catch { /* body opcional */ }
    const motivo = (body.motivo ?? "").trim() || null;

    // Cargar venta
    const vQ = await sb
      .from("ventas")
      .select("id, empresa_id, numero_control, anulada")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (vQ.error) throw new Error(vQ.error.message);
    if (!vQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((vQ.data as { anulada?: boolean }).anulada) {
      return NextResponse.json(successResponse({ id, anulada: true, alreadyAnulada: true }));
    }
    const numeroControl = (vQ.data as { numero_control: string }).numero_control;

    // Movimientos SALIDA originales de la venta
    const movQ = await sb
      .from("movimientos_inventario")
      .select("id, producto_id, producto_nombre, producto_sku, cantidad, costo_unitario")
      .eq("empresa_id", empresaId)
      .eq("venta_id", id)
      .eq("tipo", "SALIDA");
    if (movQ.error) throw new Error(movQ.error.message);
    const movs = (movQ.data ?? []) as Array<{
      id: string;
      producto_id: string;
      producto_nombre: string | null;
      producto_sku: string | null;
      cantidad: number;
      costo_unitario: number | null;
    }>;

    const nowIso = new Date().toISOString();

    // Revertir stock producto por producto (acumular por producto por si hay varias líneas)
    const stockDelta = new Map<string, number>();
    for (const m of movs) {
      stockDelta.set(m.producto_id, (stockDelta.get(m.producto_id) ?? 0) + Number(m.cantidad));
    }

    // Multi-depósito: devolver stock a Abasto Norte también
    const ubicacionVentaId = await getUbicacionIdByCodigo(sb, empresaId, "ABASTO-N");

    for (const [productoId, delta] of stockDelta) {
      const pQ = await sb
        .from("productos")
        .select("stock_actual")
        .eq("empresa_id", empresaId)
        .eq("id", productoId)
        .maybeSingle();
      if (pQ.error) throw new Error(pQ.error.message);
      if (!pQ.data) continue;
      const actual = Number((pQ.data as { stock_actual: number | string }).stock_actual) || 0;
      const nuevo = actual + delta;
      const upd = await sb
        .from("productos")
        .update({ stock_actual: nuevo })
        .eq("empresa_id", empresaId)
        .eq("id", productoId);
      if (upd.error) throw new Error(upd.error.message);

      if (ubicacionVentaId) {
        const errAju = await ajustarStockUbicacion(sb, empresaId, ubicacionVentaId, productoId, delta);
        if (errAju) console.warn(`[anular] ajuste stock Abasto Norte falló para ${productoId}: ${errAju}`);
      }
    }

    // Insertar movimientos ENTRADA de reversión (uno por cada SALIDA original)
    for (const m of movs) {
      const ins = await sb.from("movimientos_inventario").insert({
        empresa_id: empresaId,
        producto_id: m.producto_id,
        producto_nombre: m.producto_nombre,
        producto_sku: m.producto_sku,
        tipo: "ENTRADA",
        cantidad: m.cantidad,
        costo_unitario: m.costo_unitario ?? 0,
        origen: "venta_anulada",
        referencia: `ANUL-${numeroControl}`,
        fecha: nowIso,
        venta_id: id,
        ubicacion_id: ubicacionVentaId,
      });
      if (ins.error) {
        // Si el CHECK bloquea 'venta_anulada' o 'ENTRADA', devolvemos error claro
        return NextResponse.json(
          errorResponse(
            `No se pudo registrar el movimiento de reversión. Correr la migración SQL de anulación (columns 'anulada*' + relajar CHECKs de movimientos_inventario). Detalle: ${ins.error.message}`,
          ),
          { status: 500 },
        );
      }
    }

    // Marcar venta como anulada
    const updV = await sb
      .from("ventas")
      .update({
        anulada: true,
        anulada_at: nowIso,
        anulada_por: ctx.auth.usuarioCatalogId ?? null,
        anulada_motivo: motivo,
      })
      .eq("empresa_id", empresaId)
      .eq("id", id);
    if (updV.error) throw new Error(updV.error.message);

    // Anular cuentas por cobrar asociadas (si era venta a crédito).
    // Saldo → 0, estado → 'anulado' — así no aparecen en Pendiente por Cobrar / Vencido.
    const updCxc = await sb
      .from("cuentas_por_cobrar")
      .update({ estado: "anulado", saldo: 0 })
      .eq("empresa_id", empresaId)
      .eq("venta_id", id);
    if (updCxc.error) {
      // No fatal: la venta ya está anulada, avisamos por log pero devolvemos success.
      console.warn("[/api/ventas/[id]/anular] no se pudo anular CxC:", updCxc.error.message);
    }

    return NextResponse.json(successResponse({ id, anulada: true }));
  } catch (err) {
    console.error("[/api/ventas/[id]/anular]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo anular la venta."), { status: 500 });
  }
}
