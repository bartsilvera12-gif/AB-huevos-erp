import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  asuncionRangeBoundsUtc,
  diasEntre,
  normalizarFecha,
  semanaAsuncion,
  sumarDias,
} from "@/lib/fechas/asuncion-bounds";
import type {
  ClasificacionReporte,
  ClasificacionTipoTotal,
  ClasificacionDetalleRow,
} from "@/lib/reportes/types";

const HUEVOS_POR_PLANCHA = 30;

/** Rango pedido por querystring, con fallback a la semana actual (lunes→domingo). */
export function rangoDesdeQuery(url: string): { desde: string; hasta: string } {
  const sp = new URL(url).searchParams;
  const semana = semanaAsuncion(0);
  let desde = normalizarFecha(sp.get("desde")) ?? semana.desde;
  let hasta = normalizarFecha(sp.get("hasta")) ?? semana.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta };
}

/** PostgREST arma la query en la URL: partimos los `in()` largos. */
const CHUNK = 200;
function chunks<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
}

type ProduccionRow = {
  id: string;
  codigo: number;
  galpon_id: string;
  fecha: string;
  cantidad_huevos: number;
  bajas: number;
  clasificada: boolean;
};

/**
 * Suma el detalle de clasificación de las producciones cuya `fecha` cae en el
 * rango [desde, hasta] (días completos en Asunción).
 *
 * El período se define por la fecha de PRODUCCIÓN, no por la de clasificación:
 * es lo que permite comparar "qué salió de la producción de esta semana".
 */
async function totalesPorTipo(
  supabase: AppSupabaseClient,
  empresaId: string,
  desde: string,
  hasta: string
): Promise<{
  producciones: ProduccionRow[];
  clasifIds: Map<string, string>; // clasificacion_id → produccion_id
  stockAplicado: Map<string, boolean>;
  porTipo: Map<string, number>;
  totalPorClasificacion: Map<string, number>;
  total: number;
}> {
  const { start, end } = asuncionRangeBoundsUtc(desde, hasta);

  const prodQ = await supabase
    .from("granja_producciones")
    .select("id, codigo, galpon_id, fecha, cantidad_huevos, bajas, clasificada")
    .eq("empresa_id", empresaId)
    .gte("fecha", start)
    .lte("fecha", end)
    .order("fecha", { ascending: true });
  if (prodQ.error) throw new Error(prodQ.error.message);
  const producciones = (prodQ.data ?? []) as ProduccionRow[];

  const clasifIds = new Map<string, string>();
  const stockAplicado = new Map<string, boolean>();
  const porTipo = new Map<string, number>();
  const totalPorClasificacion = new Map<string, number>();
  let total = 0;
  if (producciones.length === 0) {
    return { producciones, clasifIds, stockAplicado, porTipo, totalPorClasificacion, total };
  }

  const prodIds = producciones.map((p) => p.id);
  for (const grupo of chunks(prodIds)) {
    const q = await supabase
      .from("granja_clasificaciones")
      .select("id, produccion_id, stock_aplicado")
      .eq("empresa_id", empresaId)
      .in("produccion_id", grupo);
    if (q.error) throw new Error(q.error.message);
    for (const c of (q.data ?? []) as Array<{ id: string; produccion_id: string; stock_aplicado: boolean | null }>) {
      clasifIds.set(c.id, c.produccion_id);
      stockAplicado.set(c.id, !!c.stock_aplicado);
    }
  }
  if (clasifIds.size === 0) {
    return { producciones, clasifIds, stockAplicado, porTipo, totalPorClasificacion, total };
  }

  for (const grupo of chunks([...clasifIds.keys()])) {
    const q = await supabase
      .from("granja_clasificacion_detalle")
      .select("clasificacion_id, tipo_huevo_id, cantidad")
      .in("clasificacion_id", grupo);
    if (q.error) throw new Error(q.error.message);
    for (const d of (q.data ?? []) as Array<{ clasificacion_id: string; tipo_huevo_id: string; cantidad: number }>) {
      const n = Number(d.cantidad) || 0;
      porTipo.set(d.tipo_huevo_id, (porTipo.get(d.tipo_huevo_id) ?? 0) + n);
      totalPorClasificacion.set(d.clasificacion_id, (totalPorClasificacion.get(d.clasificacion_id) ?? 0) + n);
      total += n;
    }
  }

  return { producciones, clasifIds, stockAplicado, porTipo, totalPorClasificacion, total };
}

/** Informe de clasificación para el rango [desde, hasta] + comparativo con el período anterior. */
export async function getReporteClasificacion(
  supabase: AppSupabaseClient,
  empresaId: string,
  desde: string,
  hasta: string
): Promise<ClasificacionReporte> {
  // Período anterior: misma cantidad de días, terminando el día antes de `desde`.
  const dias = diasEntre(desde, hasta);
  const antHasta = sumarDias(desde, -1);
  const antDesde = sumarDias(antHasta, -(dias - 1));

  const [actual, anterior, tiposQ] = await Promise.all([
    totalesPorTipo(supabase, empresaId, desde, hasta),
    totalesPorTipo(supabase, empresaId, antDesde, antHasta),
    supabase
      .from("granja_tipos_huevo")
      .select("id, codigo, nombre")
      .eq("empresa_id", empresaId)
      .order("codigo", { ascending: true }),
  ]);
  if (tiposQ.error) throw new Error(tiposQ.error.message);
  const tipos = (tiposQ.data ?? []) as Array<{ id: string; codigo: number; nombre: string }>;
  const tipoById = new Map(tipos.map((t) => [t.id, t]));

  // Incluimos todo tipo con movimiento en el período aunque haya sido borrado
  // del catálogo, para que la suma de las filas dé el total general.
  const idsConDatos = new Set<string>([...actual.porTipo.keys()]);
  const orden = [
    ...tipos.filter((t) => actual.porTipo.has(t.id) || anterior.porTipo.has(t.id)).map((t) => t.id),
    ...[...idsConDatos].filter((id) => !tipoById.has(id)),
  ];

  const porTipo: ClasificacionTipoTotal[] = orden.map((id) => {
    const cantidad = actual.porTipo.get(id) ?? 0;
    const cantidadAnterior = anterior.porTipo.get(id) ?? 0;
    const t = tipoById.get(id);
    return {
      tipo_huevo_id: id,
      codigo: t?.codigo ?? 0,
      nombre: t?.nombre ?? "(tipo eliminado)",
      cantidad,
      planchas: Math.floor(cantidad / HUEVOS_POR_PLANCHA),
      sobrantes: cantidad % HUEVOS_POR_PLANCHA,
      porcentaje: actual.total > 0 ? (cantidad / actual.total) * 100 : 0,
      cantidadAnterior,
      variacion: cantidadAnterior > 0 ? ((cantidad - cantidadAnterior) / cantidadAnterior) * 100 : null,
    };
  });
  porTipo.sort((a, b) => b.cantidad - a.cantidad || a.codigo - b.codigo);

  // Nombre de galpón para el detalle (no hay FK, se resuelve aparte).
  const galponIds = [...new Set(actual.producciones.map((p) => p.galpon_id).filter(Boolean))];
  const galponNombre = new Map<string, string>();
  for (const grupo of chunks(galponIds)) {
    const q = await supabase
      .from("granja_galpones")
      .select("id, nombre")
      .eq("empresa_id", empresaId)
      .in("id", grupo);
    if (q.error) throw new Error(q.error.message);
    for (const g of (q.data ?? []) as Array<{ id: string; nombre: string }>) galponNombre.set(g.id, g.nombre);
  }

  const prodById = new Map(actual.producciones.map((p) => [p.id, p]));
  const clasificaciones: ClasificacionDetalleRow[] = [...actual.clasifIds.entries()]
    .map(([clasificacionId, produccionId]) => {
      const p = prodById.get(produccionId);
      return {
        clasificacion_id: clasificacionId,
        produccion_codigo: p?.codigo ?? 0,
        galpon: p?.galpon_id ? (galponNombre.get(p.galpon_id) ?? "") : "",
        fecha: p?.fecha ?? "",
        huevos_producidos: p?.cantidad_huevos ?? 0,
        bajas: p?.bajas ?? 0,
        clasificado: actual.totalPorClasificacion.get(clasificacionId) ?? 0,
        stock_aplicado: actual.stockAplicado.get(clasificacionId) ?? false,
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.produccion_codigo - b.produccion_codigo);

  return {
    desde,
    hasta,
    anterior: { desde: antDesde, hasta: antHasta, totalClasificado: anterior.total },
    totalClasificado: actual.total,
    totalPlanchas: Math.floor(actual.total / HUEVOS_POR_PLANCHA),
    huevosProducidos: actual.producciones.reduce((s, p) => s + (Number(p.cantidad_huevos) || 0), 0),
    bajas: actual.producciones.reduce((s, p) => s + (Number(p.bajas) || 0), 0),
    cantidadProducciones: actual.producciones.length,
    produccionesSinClasificar: actual.producciones.filter((p) => !p.clasificada).length,
    porTipo,
    clasificaciones,
  };
}
