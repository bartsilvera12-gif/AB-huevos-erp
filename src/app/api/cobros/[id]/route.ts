import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { actualizarCobro, CobroError } from "@/lib/cobros/server/cobros-pg";

/**
 * PATCH /api/cobros/[id] — edita un cobro existente.
 * Campos editables: monto, metodo_pago, entidad_bancaria_id, entidad_nombre_snapshot,
 *   referencia, titular, observaciones, fecha_pago.
 * Si cambia el monto, recalcula el saldo y estado de la cuenta por cobrar asociada.
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const result = await actualizarCobro(ctx.supabase, ctx.auth.empresa_id, id, {
      cuenta_por_cobrar_id: "",
      monto: body.monto != null ? Number(body.monto) : (undefined as unknown as number),
      metodo_pago: body.metodo_pago as "efectivo" | "transferencia" | "tarjeta" | "otro" | undefined ?? undefined as never,
      entidad_bancaria_id: body.entidad_bancaria_id !== undefined ? (body.entidad_bancaria_id ? String(body.entidad_bancaria_id) : null) : undefined,
      entidad_nombre_snapshot: body.entidad_nombre_snapshot !== undefined ? (body.entidad_nombre_snapshot ? String(body.entidad_nombre_snapshot) : null) : undefined,
      referencia: body.referencia !== undefined ? (body.referencia ? String(body.referencia) : null) : undefined,
      titular: body.titular !== undefined ? (body.titular ? String(body.titular) : null) : undefined,
      observaciones: body.observaciones !== undefined ? (body.observaciones ? String(body.observaciones) : null) : undefined,
      fecha_pago: typeof body.fecha_pago === "string" ? body.fecha_pago : undefined,
    });

    return NextResponse.json(successResponse(result));
  } catch (err) {
    if (err instanceof CobroError) {
      return NextResponse.json(errorResponse(err.message), { status: err.status });
    }
    console.error("[/api/cobros/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar el cobro."), { status: 500 });
  }
}
