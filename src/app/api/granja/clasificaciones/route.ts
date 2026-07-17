import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, empresa_id, codigo, galpon_id, fecha, cantidad_huevos, bajas, responsable, fecha_distribucion, resp_distribucion, stock_aplicado, created_at, updated_at";

type ClasRow = {
  id: string; codigo: number; galpon_id: string;
  fecha: string; cantidad_huevos: number; bajas: number;
  responsable: string;
  fecha_distribucion: string | null; resp_distribucion: string | null;
  stock_aplicado: boolean | null;
  granja_galpones?: { id: string; nombre: string } | { id: string; nombre: string }[];
};

/** GET /api/granja/clasificaciones — lista con detalle y nombre de galpón. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const { data: heads, error } = await supabase
      .from("granja_clasificaciones")
      .select(`${COLS}, granja_galpones!inner(id, nombre)`)
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const ids = (heads ?? []).map((r) => (r as ClasRow).id);
    let detalleMap: Record<string, Array<{ tipo_id: string; cantidad: number; planchas: number; unidades: number }>> = {};
    if (ids.length > 0) {
      const { data: det, error: eDet } = await supabase
        .from("granja_clasificacion_detalle")
        .select("clasificacion_id, tipo_id, cantidad, planchas, unidades")
        .in("clasificacion_id", ids);
      if (eDet) return NextResponse.json(errorResponse(eDet.message), { status: 400 });
      detalleMap = (det ?? []).reduce((acc: Record<string, Array<{ tipo_id: string; cantidad: number; planchas: number; unidades: number }>>, d) => {
        const dd = d as { clasificacion_id: string; tipo_id: string; cantidad: number; planchas: number; unidades: number };
        (acc[dd.clasificacion_id] ??= []).push({ tipo_id: dd.tipo_id, cantidad: dd.cantidad, planchas: dd.planchas, unidades: dd.unidades });
        return acc;
      }, {});
    }

    const clasificaciones = (heads ?? []).map((r) => {
      const rr = r as ClasRow;
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
        fecha_distribucion: rr.fecha_distribucion,
        resp_distribucion: rr.resp_distribucion ?? "",
        stock_aplicado: !!rr.stock_aplicado,
        detalle: detalleMap[rr.id] ?? [],
      };
    });
    return NextResponse.json(successResponse({ clasificaciones }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/granja/clasificaciones — alta de cabecera de clasificación. */
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
      fecha_distribucion?: string | null;
      resp_distribucion?: string;
    };
    const galponId = String(body.galpon_id ?? "").trim();
    if (!galponId) return NextResponse.json(errorResponse("Galpón obligatorio."), { status: 400 });
    const cant = Number(body.cantidad_huevos ?? 0);
    if (!Number.isFinite(cant) || cant < 0) return NextResponse.json(errorResponse("Cantidad inválida."), { status: 400 });
    const bajas = Number(body.bajas ?? 0);
    if (!Number.isFinite(bajas) || bajas < 0) return NextResponse.json(errorResponse("Bajas inválidas."), { status: 400 });
    const responsable = String(body.responsable ?? "").trim();
    if (!responsable) return NextResponse.json(errorResponse("Responsable obligatorio."), { status: 400 });

    const galpQ = await supabase
      .from("granja_galpones")
      .select("id, nombre")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", galponId)
      .maybeSingle();
    if (galpQ.error) throw new Error(galpQ.error.message);
    if (!galpQ.data) return NextResponse.json(errorResponse("El galpón no existe."), { status: 400 });

    const maxQ = await supabase
      .from("granja_clasificaciones")
      .select("codigo")
      .eq("empresa_id", auth.empresa_id)
      .order("codigo", { ascending: false })
      .limit(1);
    if (maxQ.error) throw new Error(maxQ.error.message);
    const nextCodigo = (maxQ.data?.[0]?.codigo ?? 0) + 1;

    const { data, error } = await supabase
      .from("granja_clasificaciones")
      .insert({
        empresa_id: auth.empresa_id,
        codigo: nextCodigo,
        galpon_id: galponId,
        fecha: body.fecha || new Date().toISOString(),
        cantidad_huevos: cant,
        bajas,
        responsable,
        fecha_distribucion: body.fecha_distribucion || null,
        resp_distribucion: String(body.resp_distribucion ?? "").trim(),
      })
      .select(COLS)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const row = data as ClasRow;
    return NextResponse.json(successResponse({
      clasificacion: {
        id: row.id,
        codigo: row.codigo,
        galpon_id: row.galpon_id,
        galpon: (galpQ.data as { nombre: string }).nombre,
        fecha: row.fecha,
        cantidad_huevos: row.cantidad_huevos,
        bajas: row.bajas,
        responsable: row.responsable,
        fecha_distribucion: row.fecha_distribucion,
        resp_distribucion: row.resp_distribucion ?? "",
        stock_aplicado: false,
        detalle: [],
      },
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
