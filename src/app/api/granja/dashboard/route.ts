import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/granja/dashboard — KPIs del módulo granja:
 *  - puesta_pct_7d: % de puesta últimos 7 días (huevos / (gallinas * 7))
 *  - por_galpon: distribución de huevos del mes por galpón
 *  - huevos_sin_clasificar: total de huevos en producciones no clasificadas
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const hoy = new Date();
    const hace7 = new Date(hoy);
    hace7.setDate(hoy.getDate() - 7);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [galponesQ, prods7Q, prodsMesQ, sinClasQ] = await Promise.all([
      supabase
        .from("granja_galpones")
        .select("id, nombre, inicial_gallinas, activo")
        .eq("empresa_id", auth.empresa_id)
        .eq("activo", true),
      supabase
        .from("granja_producciones")
        .select("galpon_id, cantidad_huevos, bajas, fecha")
        .eq("empresa_id", auth.empresa_id)
        .gte("fecha", hace7.toISOString()),
      supabase
        .from("granja_producciones")
        .select("galpon_id, cantidad_huevos, bajas")
        .eq("empresa_id", auth.empresa_id)
        .gte("fecha", inicioMes.toISOString()),
      supabase
        .from("granja_producciones")
        .select("cantidad_huevos, bajas")
        .eq("empresa_id", auth.empresa_id)
        .eq("clasificada", false),
    ]);

    if (galponesQ.error) throw new Error(galponesQ.error.message);
    if (prods7Q.error) throw new Error(prods7Q.error.message);
    if (prodsMesQ.error) throw new Error(prodsMesQ.error.message);
    if (sinClasQ.error) throw new Error(sinClasQ.error.message);

    const galpones = (galponesQ.data ?? []) as Array<{ id: string; nombre: string; inicial_gallinas: number }>;
    const totalGallinas = galpones.reduce((s, g) => s + (g.inicial_gallinas ?? 0), 0);

    // % puesta últimos 7 días
    const prods7 = (prods7Q.data ?? []) as Array<{ galpon_id: string; cantidad_huevos: number; bajas: number }>;
    const huevos7 = prods7.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
    const puestaPct7 = totalGallinas > 0 ? Math.round((huevos7 / (totalGallinas * 7)) * 1000) / 10 : 0;

    // Por galpón mes actual
    const prodsMes = (prodsMesQ.data ?? []) as Array<{ galpon_id: string; cantidad_huevos: number; bajas: number }>;
    const totalMes = prodsMes.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
    const totalBajasMes = prodsMes.reduce((s, p) => s + (p.bajas ?? 0), 0);
    const porGalpon = galpones.map((g) => {
      const rowsMes = prodsMes.filter((p) => p.galpon_id === g.id);
      const huevos = rowsMes.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
      const bajas = rowsMes.reduce((s, p) => s + (p.bajas ?? 0), 0);
      const pct = totalMes > 0 ? Math.round((huevos / totalMes) * 1000) / 10 : 0;
      const pctBajas = huevos > 0 ? Math.round((bajas / huevos) * 1000) / 10 : 0;
      const puestaGalpon = g.inicial_gallinas > 0
        ? Math.round((prods7
            .filter((p) => p.galpon_id === g.id)
            .reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0) / (g.inicial_gallinas * 7)) * 1000) / 10
        : 0;
      return { galpon_id: g.id, nombre: g.nombre, gallinas: g.inicial_gallinas ?? 0, huevos_mes: huevos, bajas_mes: bajas, pct_bajas: pctBajas, pct_del_total: pct, puesta_pct_7d: puestaGalpon };
    }).sort((a, b) => b.huevos_mes - a.huevos_mes);

    // Sin clasificar
    const sinClas = (sinClasQ.data ?? []) as Array<{ cantidad_huevos: number; bajas: number }>;
    const huevosSinClasificar = sinClas.reduce((s, p) => s + Math.max(0, (p.cantidad_huevos ?? 0) - (p.bajas ?? 0)), 0);
    const produccionesSinClasificar = sinClas.length;

    const pctBajasTotal = totalMes > 0 ? Math.round((totalBajasMes / totalMes) * 1000) / 10 : 0;

    return NextResponse.json(successResponse({
      puesta_pct_7d: puestaPct7,
      huevos_ultimos_7d: huevos7,
      total_gallinas: totalGallinas,
      huevos_mes: totalMes,
      bajas_mes: totalBajasMes,
      pct_bajas_mes: pctBajasTotal,
      por_galpon: porGalpon,
      huevos_sin_clasificar: huevosSinClasificar,
      producciones_sin_clasificar: produccionesSinClasificar,
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
