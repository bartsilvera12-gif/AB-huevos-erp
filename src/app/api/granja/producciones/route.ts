import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, empresa_id, codigo, galpon_id, fecha, cantidad_huevos, bajas, responsable, clasificada, created_at, updated_at";

/** GET /api/granja/producciones — lista con nombre del galpón embebido. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const { data, error } = await supabase
      .from("granja_producciones")
      .select(`${COLS}, granja_galpones!inner(id, nombre)`)
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    type Row = {
      id: string; codigo: number; galpon_id: string;
      fecha: string; cantidad_huevos: number; bajas: number;
      responsable: string; clasificada: boolean;
      granja_galpones?: { id: string; nombre: string } | { id: string; nombre: string }[];
    };
    const producciones = (data ?? []).map((r) => {
      const rr = r as Row;
      const g = Array.isArray(rr.granja_galpones) ? rr.granja_galpones[0] : rr.granja_galpones;
      return {
        id: rr.id,
        codigo: rr.codigo,
        galpon_id: rr.galpon_id,
        galpon: g?.nombre ?? "",
        fecha: rr.fecha,
        cantidad_huevos: rr.cantidad_huevos,
        bajas: rr.bajas,
        responsable: rr.responsable,
        clasificada: rr.clasificada,
      };
    });
    return NextResponse.json(successResponse({ producciones }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/granja/producciones — alta de registro de recolección diaria. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as {
      galpon_id?: string;
      fecha?: string;
      cantidad_huevos?: number;
      bajas?: number;
      responsable?: string;
    };
    const galponId = String(body.galpon_id ?? "").trim();
    if (!galponId) return NextResponse.json(errorResponse("Galpón obligatorio."), { status: 400 });
    const cant = Number(body.cantidad_huevos ?? 0);
    if (!Number.isFinite(cant) || cant < 0) return NextResponse.json(errorResponse("Cantidad inválida."), { status: 400 });
    const bajas = Number(body.bajas ?? 0);
    if (!Number.isFinite(bajas) || bajas < 0) return NextResponse.json(errorResponse("Bajas inválidas."), { status: 400 });
    const responsable = String(body.responsable ?? "").trim();
    if (!responsable) return NextResponse.json(errorResponse("Responsable obligatorio."), { status: 400 });

    // Validar que el galpón exista y pertenezca a la empresa
    const galpQ = await supabase
      .from("granja_galpones")
      .select("id")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", galponId)
      .maybeSingle();
    if (galpQ.error) throw new Error(galpQ.error.message);
    if (!galpQ.data) return NextResponse.json(errorResponse("El galpón no existe."), { status: 400 });

    // Próximo código
    const maxQ = await supabase
      .from("granja_producciones")
      .select("codigo")
      .eq("empresa_id", auth.empresa_id)
      .order("codigo", { ascending: false })
      .limit(1);
    if (maxQ.error) throw new Error(maxQ.error.message);
    const nextCodigo = (maxQ.data?.[0]?.codigo ?? 0) + 1;

    const { data, error } = await supabase
      .from("granja_producciones")
      .insert({
        empresa_id: auth.empresa_id,
        codigo: nextCodigo,
        galpon_id: galponId,
        fecha: body.fecha || new Date().toISOString(),
        cantidad_huevos: cant,
        bajas,
        responsable,
        clasificada: false,
      })
      .select(`${COLS}, granja_galpones!inner(id, nombre)`)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const row = data as { id: string; codigo: number; galpon_id: string; fecha: string; cantidad_huevos: number; bajas: number; responsable: string; clasificada: boolean; granja_galpones?: { nombre: string } | { nombre: string }[] };
    const g = Array.isArray(row.granja_galpones) ? row.granja_galpones[0] : row.granja_galpones;
    return NextResponse.json(successResponse({
      produccion: {
        id: row.id, codigo: row.codigo, galpon_id: row.galpon_id,
        galpon: g?.nombre ?? "",
        fecha: row.fecha, cantidad_huevos: row.cantidad_huevos, bajas: row.bajas,
        responsable: row.responsable, clasificada: row.clasificada,
      },
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
