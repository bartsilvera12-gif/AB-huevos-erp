import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getReporteClasificacion, rangoDesdeQuery } from "@/lib/reportes/server/clasificacion-reporte";
import { sheetFromRows, buildXlsxBufferSheets, xlsxResponseHeaders } from "@/lib/excel/export";

/** GET /api/reportes/clasificacion/export?desde=&hasta= → XLSX (Resumen + Por clasificación + Detalle). */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  try {
    const { desde, hasta } = rangoDesdeQuery(request.url);
    const r = await getReporteClasificacion(ctx.supabase, ctx.auth.empresa_id, desde, hasta);

    const resumen = [
      { concepto: "Reporte", valor: "Clasificación por período" },
      { concepto: "Desde", valor: r.desde },
      { concepto: "Hasta", valor: r.hasta },
      { concepto: "Huevos producidos", valor: r.huevosProducidos },
      { concepto: "Bajas", valor: r.bajas },
      { concepto: "Total clasificado (huevos)", valor: r.totalClasificado },
      { concepto: "Total en planchas", valor: r.totalPlanchas },
      { concepto: "Producciones del período", valor: r.cantidadProducciones },
      { concepto: "Producciones sin clasificar", valor: r.produccionesSinClasificar },
      { concepto: "Período anterior", valor: `${r.anterior.desde} a ${r.anterior.hasta}` },
      { concepto: "Total clasificado anterior", valor: r.anterior.totalClasificado },
    ];

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Resumen", resumen, [
        { header: "Concepto", value: (x) => x.concepto, width: 34 },
        { header: "Valor", value: (x) => x.valor, width: 30 },
      ]),
      sheetFromRows("Por clasificación", r.porTipo, [
        { header: "Clasificación", value: (x) => x.nombre, width: 28 },
        { header: "Huevos", value: (x) => x.cantidad, width: 12 },
        { header: "Planchas", value: (x) => x.planchas, width: 10 },
        { header: "Sobrantes", value: (x) => x.sobrantes, width: 10 },
        { header: "% del total", value: (x) => Number(x.porcentaje.toFixed(2)), width: 12 },
        { header: "Período anterior", value: (x) => x.cantidadAnterior, width: 16 },
        { header: "Variación %", value: (x) => (x.variacion == null ? "" : Number(x.variacion.toFixed(2))), width: 12 },
      ]),
      sheetFromRows("Clasificaciones", r.clasificaciones, [
        { header: "Fecha producción", value: (x) => (x.fecha ? new Date(x.fecha) : ""), width: 20 },
        { header: "N° Producción", value: (x) => x.produccion_codigo, width: 14 },
        { header: "Galpón", value: (x) => x.galpon, width: 20 },
        { header: "Huevos producidos", value: (x) => x.huevos_producidos, width: 18 },
        { header: "Bajas", value: (x) => x.bajas, width: 10 },
        { header: "Clasificado", value: (x) => x.clasificado, width: 14 },
        { header: "Stock aplicado", value: (x) => (x.stock_aplicado ? "Sí" : "No"), width: 14 },
      ]),
    ]);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`clasificacion-${r.desde}_${r.hasta}`),
    });
  } catch (err) {
    console.error("[/api/reportes/clasificacion/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
