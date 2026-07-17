import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("granja_sueltos_acumulados")
      .select("tipo_huevo_id, cantidad")
      .eq("empresa_id", auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const map: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ tipo_huevo_id: string; cantidad: number }>) {
      map[r.tipo_huevo_id] = r.cantidad;
    }
    return NextResponse.json(successResponse({ acumulador: map }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
