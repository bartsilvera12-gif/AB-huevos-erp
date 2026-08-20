import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, empresa_id, produccion_id, fecha_distribucion, resp_distribucion, stock_aplicado, created_at, updated_at";

/**
 * GET — lista clasificaciones con datos de la producción y galpón asociados.
 * PostgREST no tiene FK entre granja_clasificaciones y granja_galpones, así que
 * hacemos el fetch en dos pasos: 1) clasificaciones + producciones, 2) galpones por id.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    console.log("[DEBUG granja/clasificaciones] empresa_id:", auth.empresa_id, "url:", process.env.NEXT_PUBLIC_SUPABASE_URL, "schema:", process.env.NEURA_CLIENT_SCHEMA);
    const t0 = Date.now();
    const { data: heads, error } = await supabase
      .from("granja_clasificaciones")
      .select(`${COLS}, granja_producciones!inner(id, codigo, galpon_id, fecha, cantidad_huevos, bajas, responsable)`)
      .eq("empresa_id", auth.empresa_id)
      .order("created_at", { ascending: false });
    console.log("[DEBUG granja/clasificaciones] query1 ms:", Date.now() - t0, "rows:", heads?.length ?? "null", "error:", error?.message ?? "none");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    type ProdEmb = { id: string; codigo: number; galpon_id: string; fecha: string; cantidad_huevos: number; bajas: number; responsable: string };
    type Row = {
      id: string; produccion_id: string;
      fecha_distribucion: string | null; resp_distribucion: string | null;
      stock_aplicado: boolean | null;
      granja_producciones?: ProdEmb | ProdEmb[];
    };
    const rows = (heads ?? []) as Row[];

    // Traer nombres de galpones aparte
    const galponIds = Array.from(new Set(rows.map((r) => {
      const p = Array.isArray(r.granja_producciones) ? r.granja_producciones[0] : r.granja_producciones;
      return p?.galpon_id;
    }).filter(Boolean) as string[]));
    let galponNombre: Record<string, string> = {};
    if (galponIds.length > 0) {
      const gq = await supabase
        .from("granja_galpones")
        .select("id, nombre")
        .eq("empresa_id", auth.empresa_id)
        .in("id", galponIds);
      if (gq.error) throw new Error(gq.error.message);
      galponNombre = ((gq.data ?? []) as Array<{ id: string; nombre: string }>).reduce((acc, g) => {
        acc[g.id] = g.nombre; return acc;
      }, {} as Record<string, string>);
    }

    // Detalle por clasificación. Con muchas clasificaciones (>30) la URL con
    // todos los IDs supera el límite del gateway (~4KB) y Cloudflare rechaza
    // con 502. Batcheamos de a 30 IDs por request.
    const clasIds = rows.map((r) => r.id);
    let detalleMap: Record<string, Array<{ tipo_huevo_id: string; cantidad: number; planchas_generadas: number; unidades_sobrantes: number }>> = {};
    if (clasIds.length > 0) {
      const CHUNK = 30;
      type DetRow = { clasificacion_id: string; tipo_huevo_id: string; cantidad: number; planchas_generadas: number; unidades_sobrantes: number };
      const all: DetRow[] = [];
      for (let i = 0; i < clasIds.length; i += CHUNK) {
        const grupo = clasIds.slice(i, i + CHUNK);
        const dQ = await supabase
          .from("granja_clasificacion_detalle")
          .select("clasificacion_id, tipo_huevo_id, cantidad, planchas_generadas, unidades_sobrantes")
          .in("clasificacion_id", grupo);
        if (dQ.error) throw new Error(dQ.error.message);
        all.push(...((dQ.data ?? []) as DetRow[]));
      }
      detalleMap = all.reduce((acc, d) => {
        (acc[d.clasificacion_id] ??= []).push({
          tipo_huevo_id: d.tipo_huevo_id,
          cantidad: d.cantidad,
          planchas_generadas: d.planchas_generadas,
          unidades_sobrantes: d.unidades_sobrantes,
        });
        return acc;
      }, {} as Record<string, Array<{ tipo_huevo_id: string; cantidad: number; planchas_generadas: number; unidades_sobrantes: number }>>);
    }

    const clasificaciones = rows.map((r) => {
      const p = (Array.isArray(r.granja_producciones) ? r.granja_producciones[0] : r.granja_producciones) as ProdEmb | undefined;
      return {
        id: r.id,
        produccion_id: r.produccion_id,
        codigo: p?.codigo ?? 0,
        galpon_id: p?.galpon_id ?? "",
        galpon: p?.galpon_id ? (galponNombre[p.galpon_id] ?? "") : "",
        fecha: p?.fecha ?? "",
        cantidad_huevos: p?.cantidad_huevos ?? 0,
        bajas: p?.bajas ?? 0,
        responsable: p?.responsable ?? "",
        fecha_distribucion: r.fecha_distribucion,
        resp_distribucion: r.resp_distribucion ?? "",
        stock_aplicado: !!r.stock_aplicado,
        detalle: detalleMap[r.id] ?? [],
      };
    });
    return NextResponse.json(successResponse({ clasificaciones }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[ERROR granja/clasificaciones]", { msgPreview: msg.slice(0, 300), msgLen: msg.length, stack: stack?.split("\n").slice(0, 5).join(" | ") });
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST — crear cabecera de clasificación linkeada a una producción existente.
 * Solo se puede clasificar una producción NO clasificada aún.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as {
      produccion_id?: string;
      fecha_distribucion?: string | null;
      resp_distribucion?: string;
    };
    const produccionId = String(body.produccion_id ?? "").trim();
    if (!produccionId) return NextResponse.json(errorResponse("Producción obligatoria."), { status: 400 });

    const prodQ = await supabase
      .from("granja_producciones")
      .select("id, codigo, galpon_id, fecha, cantidad_huevos, bajas, responsable, clasificada")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", produccionId)
      .maybeSingle();
    if (prodQ.error) throw new Error(prodQ.error.message);
    if (!prodQ.data) return NextResponse.json(errorResponse("La producción no existe."), { status: 400 });
    const prod = prodQ.data as { id: string; codigo: number; galpon_id: string; fecha: string; cantidad_huevos: number; bajas: number; responsable: string; clasificada: boolean };
    if (prod.clasificada) {
      return NextResponse.json(errorResponse("Esta producción ya fue clasificada."), { status: 409 });
    }

    // Si ya existe una clasificación en curso (cabecera sin detalle) para esta producción, la devolvemos
    const existQ = await supabase
      .from("granja_clasificaciones")
      .select("id")
      .eq("empresa_id", auth.empresa_id)
      .eq("produccion_id", produccionId)
      .maybeSingle();
    if (existQ.data) {
      return NextResponse.json(errorResponse("Ya hay una clasificación en curso para esta producción. Buscala en la lista y completá el detalle."), { status: 409 });
    }

    const { data, error } = await supabase
      .from("granja_clasificaciones")
      .insert({
        empresa_id: auth.empresa_id,
        produccion_id: produccionId,
        fecha_distribucion: body.fecha_distribucion || null,
        resp_distribucion: String(body.resp_distribucion ?? "").trim() || null,
      })
      .select(COLS)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const galpQ = await supabase
      .from("granja_galpones").select("nombre").eq("id", prod.galpon_id).maybeSingle();

    const row = data as { id: string; produccion_id: string; fecha_distribucion: string | null; resp_distribucion: string | null; stock_aplicado: boolean | null };
    return NextResponse.json(successResponse({
      clasificacion: {
        id: row.id,
        produccion_id: row.produccion_id,
        codigo: prod.codigo,
        galpon_id: prod.galpon_id,
        galpon: (galpQ.data as { nombre?: string } | null)?.nombre ?? "",
        fecha: prod.fecha,
        cantidad_huevos: prod.cantidad_huevos,
        bajas: prod.bajas,
        responsable: prod.responsable,
        fecha_distribucion: row.fecha_distribucion,
        resp_distribucion: row.resp_distribucion ?? "",
        stock_aplicado: false,
        detalle: [],
      },
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
