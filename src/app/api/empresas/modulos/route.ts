import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/empresas/modulos
 * Devuelve TODO el catálogo de módulos disponibles en el schema del tenant,
 * marcando cuáles están activos en `empresa_modulos` para la empresa actual.
 * Pensado para pintar la lista de checkboxes al crear/editar un usuario.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    // 1) Catálogo completo
    const catQ = await supabase
      .from("modulos")
      .select("id, nombre, slug, descripcion")
      .order("nombre");
    if (catQ.error) return NextResponse.json(errorResponse(catQ.error.message), { status: 400 });

    // 2) Activos en empresa_modulos → sirve para marcar en UI
    const emQ = await supabase
      .from("empresa_modulos")
      .select("modulo_id, activo")
      .eq("empresa_id", auth.empresa_id);
    const activos = new Set(
      (emQ.data ?? [])
        .filter((r) => (r as { activo?: boolean }).activo === true)
        .map((r) => (r as { modulo_id: string }).modulo_id)
    );

    const modulos = (catQ.data ?? [])
      .map((r) => {
        const m = r as { id: string; nombre: string; slug: string; descripcion: string | null };
        return {
          id: m.id,
          nombre: m.nombre ?? "",
          slug: m.slug ?? "",
          descripcion: m.descripcion ?? null,
          activo_empresa: activos.has(m.id),
        };
      })
      .filter((m) => m.slug);

    return NextResponse.json(successResponse({ modulos }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
