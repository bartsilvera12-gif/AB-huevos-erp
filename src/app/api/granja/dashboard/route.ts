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

    const [galponesQ, prods7Q, prodsMesQ, sinClasQ, todasBajasQ] = await Promise.all([
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
        .select("cantidad_huevos")
        .eq("empresa_id", auth.empresa_id)
        .eq("clasificada", false),
      // Todas las bajas históricas para calcular gallinas activas por galpón
      supabase
        .from("granja_producciones")
        .select("galpon_id, bajas")
        .eq("empresa_id", auth.empresa_id),
    ]);

    if (galponesQ.error) throw new Error(galponesQ.error.message);
    if (prods7Q.error) throw new Error(prods7Q.error.message);
    if (prodsMesQ.error) throw new Error(prodsMesQ.error.message);
    if (sinClasQ.error) throw new Error(sinClasQ.error.message);
    if (todasBajasQ.error) throw new Error(todasBajasQ.error.message);

    const galpones = (galponesQ.data ?? []) as Array<{ id: string; nombre: string; inicial_gallinas: number }>;
    // Gallinas activas por galpón = inicial - suma histórica de bajas (mortalidad acumulada)
    const bajasHistoricas = (todasBajasQ.data ?? []) as Array<{ galpon_id: string; bajas: number }>;
    const bajasPorGalpon: Record<string, number> = {};
    for (const b of bajasHistoricas) {
      bajasPorGalpon[b.galpon_id] = (bajasPorGalpon[b.galpon_id] ?? 0) + (b.bajas ?? 0);
    }
    const gallinasActivasPorGalpon: Record<string, number> = {};
    for (const g of galpones) {
      gallinasActivasPorGalpon[g.id] = Math.max(0, (g.inicial_gallinas ?? 0) - (bajasPorGalpon[g.id] ?? 0));
    }
    const totalGallinasActivas = Object.values(gallinasActivasPorGalpon).reduce((s, n) => s + n, 0);

    // % puesta últimos 7 días
    const prods7 = (prods7Q.data ?? []) as Array<{ galpon_id: string; cantidad_huevos: number; bajas: number }>;
    const huevos7 = prods7.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
    const puestaPct7 = totalGallinasActivas > 0 ? Math.round((huevos7 / (totalGallinasActivas * 7)) * 1000) / 10 : 0;

    // Por galpón mes actual
    const prodsMes = (prodsMesQ.data ?? []) as Array<{ galpon_id: string; cantidad_huevos: number; bajas: number }>;
    const totalMes = prodsMes.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
    const totalBajasMes = prodsMes.reduce((s, p) => s + (p.bajas ?? 0), 0);
    const porGalpon = galpones.map((g) => {
      const rowsMes = prodsMes.filter((p) => p.galpon_id === g.id);
      const huevos = rowsMes.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
      const bajasGallinasMes = rowsMes.reduce((s, p) => s + (p.bajas ?? 0), 0);
      const pct = totalMes > 0 ? Math.round((huevos / totalMes) * 1000) / 10 : 0;
      const activas = gallinasActivasPorGalpon[g.id] ?? 0;
      const puestaGalpon = activas > 0
        ? Math.round((prods7
            .filter((p) => p.galpon_id === g.id)
            .reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0) / (activas * 7)) * 1000) / 10
        : 0;
      return {
        galpon_id: g.id,
        nombre: g.nombre,
        gallinas_iniciales: g.inicial_gallinas ?? 0,
        gallinas_activas: activas,
        bajas_gallinas_totales: bajasPorGalpon[g.id] ?? 0,
        huevos_mes: huevos,
        bajas_gallinas_mes: bajasGallinasMes,
        pct_del_total: pct,
        puesta_pct_7d: puestaGalpon,
      };
    }).sort((a, b) => b.huevos_mes - a.huevos_mes);

    // Sin clasificar — bajas son gallinas (mortalidad), no se restan de huevos
    const sinClas = (sinClasQ.data ?? []) as Array<{ cantidad_huevos: number }>;
    const huevosSinClasificar = sinClas.reduce((s, p) => s + (p.cantidad_huevos ?? 0), 0);
    const produccionesSinClasificar = sinClas.length;

    const totalInicial = galpones.reduce((s, g) => s + (g.inicial_gallinas ?? 0), 0);
    const totalBajasHistoricas = Object.values(bajasPorGalpon).reduce((s, n) => s + n, 0);
    const pctMortalidadHistorica = totalInicial > 0
      ? Math.round((totalBajasHistoricas / totalInicial) * 1000) / 10
      : 0;

    return NextResponse.json(successResponse({
      puesta_pct_7d: puestaPct7,
      huevos_ultimos_7d: huevos7,
      total_gallinas_iniciales: totalInicial,
      total_gallinas_activas: totalGallinasActivas,
      huevos_mes: totalMes,
      bajas_gallinas_mes: totalBajasMes,
      bajas_gallinas_totales: totalBajasHistoricas,
      pct_mortalidad_historica: pctMortalidadHistorica,
      por_galpon: porGalpon,
      huevos_sin_clasificar: huevosSinClasificar,
      producciones_sin_clasificar: produccionesSinClasificar,
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
