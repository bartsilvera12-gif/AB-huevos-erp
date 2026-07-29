import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { insertVentaPagoDetalle } from "@/lib/ventas/server/pago-detalle-pg";

/**
 * GET /api/ventas/[id]/pagos
 * Devuelve las líneas de ventas_pagos_detalle de una venta.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const q = await ctx.supabase
      .from("ventas_pagos_detalle")
      .select("id, metodo_pago, entidad_bancaria_id, entidad_nombre_snapshot, monto, referencia, titular, fecha_acreditacion, observacion")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("venta_id", id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(q.error.message);

    return NextResponse.json(successResponse({ pagos: q.data ?? [] }));
  } catch (err) {
    console.error("[/api/ventas/[id]/pagos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los pagos."), { status: 500 });
  }
}

/**
 * PATCH /api/ventas/[id]/pagos
 * Body: { pagos: Array<{ metodo_pago, monto, entidad_bancaria_id?, entidad_nombre_snapshot?, referencia?, titular? }> }
 * Reemplaza todos los detalles de pago de la venta y actualiza ventas.metodo_pago
 * según los métodos presentes (si hay 2+ distintos, marca 'mixto'; si hay 1, ese método).
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const pagosRaw = Array.isArray(body.pagos) ? (body.pagos as Record<string, unknown>[]) : [];
    if (pagosRaw.length === 0) {
      return NextResponse.json(errorResponse("Se requiere al menos un pago."), { status: 400 });
    }

    // Validar que la venta exista, sea contado y no esté anulada.
    const vQ = await ctx.supabase
      .from("ventas")
      .select("id, total, tipo_venta, anulada")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (vQ.error) throw new Error(vQ.error.message);
    if (!vQ.data) return NextResponse.json(errorResponse("Venta no encontrada."), { status: 404 });
    const venta = vQ.data as { id: string; total: number | string; tipo_venta: string; anulada?: boolean };
    if (venta.anulada) return NextResponse.json(errorResponse("La venta está anulada."), { status: 409 });
    if (String(venta.tipo_venta).toUpperCase() !== "CONTADO") {
      return NextResponse.json(errorResponse("Sólo las ventas contado admiten edición de pagos."), { status: 409 });
    }

    // Suma debe cuadrar con total (tolerancia 1 Gs.).
    const total = Number(venta.total) || 0;
    const suma = pagosRaw.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    if (Math.abs(suma - total) >= 1) {
      return NextResponse.json(errorResponse(`La suma de los pagos (${suma}) debe ser igual al total de la venta (${total}).`), { status: 400 });
    }

    // Borrar detalles anteriores.
    const del = await ctx.supabase
      .from("ventas_pagos_detalle")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("venta_id", id);
    if (del.error) throw new Error(del.error.message);

    // Insertar los nuevos (via helper pg directo por seguridad de tipos).
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const str = (v: unknown, max = 200) =>
      v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().slice(0, max);
    const VALID = new Set(["efectivo", "transferencia", "tarjeta", "qr", "billetera", "otro"] as const);
    for (const p of pagosRaw) {
      const raw = typeof p.metodo_pago === "string" ? p.metodo_pago : "efectivo";
      const m = (VALID.has(raw as "efectivo" | "transferencia" | "tarjeta" | "qr" | "billetera" | "otro")
        ? raw
        : "efectivo") as "efectivo" | "transferencia" | "tarjeta" | "qr" | "billetera" | "otro";
      const monto = Number(p.monto);
      if (!Number.isFinite(monto) || monto <= 0) continue;
      await insertVentaPagoDetalle(schema, ctx.auth.empresa_id, id, {
        metodo_pago: m,
        entidad_bancaria_id: p.entidad_bancaria_id ? String(p.entidad_bancaria_id) : null,
        entidad_nombre_snapshot: str(p.entidad_nombre_snapshot),
        monto,
        referencia: str(p.referencia),
        titular: str(p.titular),
        fecha_acreditacion:
          typeof p.fecha_acreditacion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_acreditacion)
            ? p.fecha_acreditacion
            : null,
        observacion: str(p.observacion, 500),
      });
    }

    // Recalcular metodo_pago global.
    const metodosUnicos = new Set(pagosRaw.map((p) => String(p.metodo_pago ?? "efectivo")));
    const nuevoMetodo = metodosUnicos.size > 1 ? "mixto" : [...metodosUnicos][0] ?? "efectivo";
    try {
      await createServiceRoleClientWithDbSchema(schema)
        .from("ventas")
        .update({ metodo_pago: nuevoMetodo })
        .eq("id", id)
        .eq("empresa_id", ctx.auth.empresa_id);
    } catch (e) {
      console.warn("[ventas/pagos PATCH] no se pudo actualizar metodo_pago:", e instanceof Error ? e.message : e);
    }

    return NextResponse.json(successResponse({ ok: true, metodo_pago: nuevoMetodo }));
  } catch (err) {
    console.error("[/api/ventas/[id]/pagos PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
