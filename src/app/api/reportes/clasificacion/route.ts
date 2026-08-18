import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getReporteClasificacion, rangoDesdeQuery } from "@/lib/reportes/server/clasificacion-reporte";

/** GET /api/reportes/clasificacion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { desde, hasta } = rangoDesdeQuery(request.url);
    const data = await getReporteClasificacion(ctx.supabase, ctx.auth.empresa_id, desde, hasta);
    return NextResponse.json(successResponse(data));
  } catch (err) {
    console.error("[/api/reportes/clasificacion]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el informe de clasificación."), { status: 500 });
  }
}
