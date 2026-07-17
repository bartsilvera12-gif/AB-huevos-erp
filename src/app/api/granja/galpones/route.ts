import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, empresa_id, codigo, nombre, inicial_gallinas, fecha_inicio, fecha_fin, activo, created_at, updated_at";

/** GET /api/granja/galpones — lista todos los galpones de la empresa. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("granja_galpones")
      .select(COLS)
      .eq("empresa_id", auth.empresa_id)
      .order("codigo", { ascending: true });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ galpones: data ?? [] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/granja/galpones — alta de galpón. */
export async function POST(request: NextRequest) {
  try {
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
    const nombre = (body.nombre ?? "").trim();
    if (!nombre) {
      return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    }
    const inicial = Number(body.inicial_gallinas ?? 0);
    if (!Number.isFinite(inicial) || inicial < 0) {
      return NextResponse.json(errorResponse("Cantidad de gallinas inválida."), { status: 400 });
    }

    // Calcular el próximo código (autoincremental por empresa)
    const maxQ = await supabase
      .from("granja_galpones")
      .select("codigo")
      .eq("empresa_id", auth.empresa_id)
      .order("codigo", { ascending: false })
      .limit(1);
    if (maxQ.error) throw new Error(maxQ.error.message);
    const nextCodigo = (maxQ.data?.[0]?.codigo ?? 0) + 1;

    const { data, error } = await supabase
      .from("granja_galpones")
      .insert({
        empresa_id: auth.empresa_id,
        codigo: nextCodigo,
        nombre: nombre.toUpperCase(),
        inicial_gallinas: inicial,
        fecha_inicio: body.fecha_inicio || null,
        fecha_fin: body.fecha_fin || null,
        activo: body.activo !== false,
      })
      .select(COLS)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ galpon: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
