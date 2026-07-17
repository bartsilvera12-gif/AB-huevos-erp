import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, empresa_id, codigo, nombre, producto_id, created_at, updated_at";

/** GET /api/granja/tipos-huevo — catálogo de tipos de huevo. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("granja_tipos_huevo")
      .select(COLS)
      .eq("empresa_id", auth.empresa_id)
      .order("codigo", { ascending: true });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ tipos: data ?? [] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/granja/tipos-huevo — alta de tipo. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as { nombre?: string; producto_id?: string | null };
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json(errorResponse("Nombre obligatorio."), { status: 400 });
    const producto_id = body.producto_id ? String(body.producto_id).trim() : null;

    const maxQ = await supabase
      .from("granja_tipos_huevo")
      .select("codigo")
      .eq("empresa_id", auth.empresa_id)
      .order("codigo", { ascending: false })
      .limit(1);
    if (maxQ.error) throw new Error(maxQ.error.message);
    const nextCodigo = (maxQ.data?.[0]?.codigo ?? 0) + 1;

    const { data, error } = await supabase
      .from("granja_tipos_huevo")
      .insert({ empresa_id: auth.empresa_id, codigo: nextCodigo, nombre, producto_id })
      .select(COLS)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ tipo: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
