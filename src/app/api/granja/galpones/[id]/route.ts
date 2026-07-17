import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, empresa_id, codigo, nombre, inicial_gallinas, fecha_inicio, fecha_fin, activo, created_at, updated_at";

/** PATCH /api/granja/galpones/[id] — edición de galpón. */
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
      nombre?: string;
      inicial_gallinas?: number;
      fecha_inicio?: string | null;
      fecha_fin?: string | null;
      activo?: boolean;
    };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.nombre !== undefined) patch.nombre = String(body.nombre).trim().toUpperCase();
    if (body.inicial_gallinas !== undefined) {
      const n = Number(body.inicial_gallinas);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(errorResponse("Cantidad de gallinas inválida."), { status: 400 });
      }
      patch.inicial_gallinas = n;
    }
    if (body.fecha_inicio !== undefined) patch.fecha_inicio = body.fecha_inicio || null;
    if (body.fecha_fin !== undefined) patch.fecha_fin = body.fecha_fin || null;
    if (body.activo !== undefined) patch.activo = body.activo === true;

    const { data, error } = await supabase
      .from("granja_galpones")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ galpon: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE /api/granja/galpones/[id] — borra el galpón (si no tiene producciones asociadas). */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const { error } = await supabase
      .from("granja_galpones")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) {
      const msg = error.message ?? "";
      if (/foreign key|violates|referenced/i.test(msg)) {
        return NextResponse.json(
          errorResponse("No se puede borrar: el galpón tiene producciones asociadas."),
          { status: 409 }
        );
      }
      return NextResponse.json(errorResponse(msg), { status: 400 });
    }
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
