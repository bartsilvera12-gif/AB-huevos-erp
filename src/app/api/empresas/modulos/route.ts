import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/empresas/modulos
 * Devuelve los módulos activos para la empresa del usuario autenticado,
 * pensado para pintar la lista de checkboxes al crear/editar un usuario.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const emQ = await supabase
      .from("empresa_modulos")
      .select("modulo_id, activo, modulos!inner(id, nombre, slug, descripcion)")
      .eq("empresa_id", auth.empresa_id)
      .eq("activo", true);
    if (emQ.error) return NextResponse.json(errorResponse(emQ.error.message), { status: 400 });

    type Row = {
      modulo_id: string;
      modulos: { id: string; nombre: string; slug: string; descripcion?: string | null } | Array<{ id: string; nombre: string; slug: string; descripcion?: string | null }>;
    };
    const modulos = (emQ.data ?? []).map((r) => {
      const rr = r as Row;
      const m = Array.isArray(rr.modulos) ? rr.modulos[0] : rr.modulos;
      return {
        id: m?.id ?? rr.modulo_id,
        nombre: m?.nombre ?? "",
        slug: m?.slug ?? "",
        descripcion: m?.descripcion ?? null,
      };
    }).filter((m) => m.slug).sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json(successResponse({ modulos }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
