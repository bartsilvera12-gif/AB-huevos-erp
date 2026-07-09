import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** DELETE /api/gastos/[id] — service role para evitar problemas de RLS. */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const exists = await supabase
      .from("gastos")
      .select("id")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (exists.error) throw new Error(exists.error.message);
    if (!exists.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const { error } = await supabase
      .from("gastos")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** PATCH /api/gastos/[id] — actualiza un gasto (service role). */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as {
      categoria?: string; descripcion?: string; monto?: number;
      tipo?: string; recurrente?: boolean; frecuencia?: string | null; fecha?: string;
    };

    const patch: Record<string, unknown> = {};
    if (body.categoria !== undefined) patch.categoria = (body.categoria ?? "").trim() || null;
    if (body.descripcion !== undefined) patch.descripcion = (body.descripcion ?? "").trim() || null;
    if (body.monto !== undefined) {
      const n = Number(body.monto);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(errorResponse("El monto debe ser mayor a 0"), { status: 400 });
      }
      patch.monto = n;
    }
    if (body.tipo !== undefined) patch.tipo = body.tipo;
    if (body.recurrente !== undefined) patch.recurrente = body.recurrente === true;
    if (body.frecuencia !== undefined) patch.frecuencia = (body.frecuencia ?? "").toString().trim() || null;
    if (body.fecha !== undefined) patch.fecha = body.fecha;

    const { data, error } = await supabase
      .from("gastos")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ gasto: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
