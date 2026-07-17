import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** GET /api/granja/sueltos — acumulador de huevos sueltos por tipo. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("granja_sueltos_acumulados")
      .select("tipo_id, cantidad")
      .eq("empresa_id", auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const map: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ tipo_id: string; cantidad: number }>) {
      map[r.tipo_id] = r.cantidad;
    }
    return NextResponse.json(successResponse({ acumulador: map }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
