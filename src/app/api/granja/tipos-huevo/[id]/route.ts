import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, empresa_id, codigo, nombre, producto_id, activo, created_at";

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as { nombre?: string; producto_id?: string | null };
    const patch: Record<string, unknown> = {};
    if (body.nombre !== undefined) {
      const n = String(body.nombre).trim();
      if (!n) return NextResponse.json(errorResponse("Nombre inválido."), { status: 400 });
      patch.nombre = n;
    }
    if (body.producto_id !== undefined) {
      patch.producto_id = body.producto_id ? String(body.producto_id).trim() : null;
    }
    const { data, error } = await supabase
      .from("granja_tipos_huevo")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ tipo: data }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

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
      .from("granja_tipos_huevo")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) {
      const msg = error.message ?? "";
      if (/foreign key|violates|referenced/i.test(msg)) {
        return NextResponse.json(errorResponse("No se puede borrar: el tipo está en uso en clasificaciones."), { status: 409 });
      }
      return NextResponse.json(errorResponse(msg), { status: 400 });
    }
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
