"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import RangoFechasSelector, { type Rango } from "@/components/reportes/RangoFechasSelector";
import { getClasificacionReporte } from "@/lib/reportes/storage";
import { semanaAsuncion } from "@/lib/fechas/asuncion-bounds";
import type { ClasificacionReporte } from "@/lib/reportes/types";

const HUEVOS_POR_PLANCHA = 30;

function fmt(n: number) {
  return Math.round(n).toLocaleString("es-PY");
}
function fmtPct(n: number) {
  return `${n.toLocaleString("es-PY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function fmtFechaCorta(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
function fmtFechaIso(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Barra proporcional del porcentaje, para leer la mezcla de un vistazo. */
function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-[#4FAEB2]" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function Variacion({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-300">—</span>;
  const sube = v >= 0;
  return (
    <span className={sube ? "text-emerald-600" : "text-rose-600"}>
      {sube ? "+" : ""}
      {v.toLocaleString("es-PY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
    </span>
  );
}

export default function ClasificacionReportePage() {
  const [rango, setRango] = useState<Rango>(() => semanaAsuncion(-1));
  const [data, setData] = useState<ClasificacionReporte | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getClasificacionReporte(rango.desde, rango.hasta).then((d) => {
      if (!cancel) {
        setData(d);
        setCargando(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, [rango.desde, rango.hasta]);

  const variacionTotal =
    data && data.anterior.totalClasificado > 0
      ? ((data.totalClasificado - data.anterior.totalClasificado) / data.anterior.totalClasificado) * 100
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Clasificación"
        description="Cuánto salió de cada clasificación en el período, con comparativo contra el período anterior"
        backHref="/reportes"
        backLabel="Reportes"
        actions={
          <ExportExcelButton
            url={`/api/reportes/clasificacion/export?desde=${rango.desde}&hasta=${rango.hasta}`}
          />
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <RangoFechasSelector rango={rango} onChange={setRango} />
        <p className="mt-2 text-xs text-slate-400">
          El período se toma por fecha de producción: {fmtFechaCorta(rango.desde)} a {fmtFechaCorta(rango.hasta)}.
        </p>
      </div>

      {cargando ? (
        <p className="animate-pulse text-slate-500">Cargando…</p>
      ) : !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
          No se pudo cargar el informe de clasificación.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard compact label="Total clasificado" value={fmt(data.totalClasificado)} hint="huevos" accent />
            <StatCard compact label="En planchas" value={fmt(data.totalPlanchas)} hint={`${HUEVOS_POR_PLANCHA} huevos c/u`} />
            <StatCard compact label="Producido" value={fmt(data.huevosProducidos)} hint={`${fmt(data.bajas)} bajas`} />
            <StatCard
              compact
              label="Período anterior"
              value={fmt(data.anterior.totalClasificado)}
              hint={`${fmtFechaCorta(data.anterior.desde)} – ${fmtFechaCorta(data.anterior.hasta)}`}
            />
            <StatCard
              compact
              label="Variación"
              value={variacionTotal == null ? "—" : <Variacion v={variacionTotal} />}
              hint="vs. período anterior"
            />
          </div>

          {data.produccionesSinClasificar > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {data.produccionesSinClasificar} de {data.cantidadProducciones} producciones del período todavía no
              fueron clasificadas. Sus huevos no están incluidos en el desglose.
            </div>
          )}

          {/* Desglose por clasificación */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Total por clasificación</h2>
            {data.porTipo.length === 0 ? (
              <p className="text-sm text-slate-400">No hay clasificaciones registradas en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Clasificación</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Huevos</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Planchas</th>
                      <th className="py-2.5 pr-4 text-right font-medium">%</th>
                      <th className="w-40 py-2.5 pr-4 font-medium">Participación</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Anterior</th>
                      <th className="py-2.5 text-right font-medium">Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porTipo.map((t) => (
                      <tr key={t.tipo_huevo_id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 text-slate-700">{t.nombre}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-slate-800">
                          {fmt(t.cantidad)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">
                          {fmt(t.planchas)}
                          {t.sobrantes > 0 && <span className="text-slate-400"> +{t.sobrantes}</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{fmtPct(t.porcentaje)}</td>
                        <td className="py-2.5 pr-4">
                          <Barra pct={t.porcentaje} />
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">
                          {fmt(t.cantidadAnterior)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          <Variacion v={t.variacion} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-3 pr-4 font-semibold text-slate-800">Total general</td>
                      <td className="py-3 pr-4 text-right font-bold tabular-nums text-slate-900">
                        {fmt(data.totalClasificado)}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-700">
                        {fmt(data.totalPlanchas)}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-700">
                        {data.totalClasificado > 0 ? "100,0%" : "—"}
                      </td>
                      <td />
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-600">
                        {fmt(data.anterior.totalClasificado)}
                      </td>
                      <td className="py-3 text-right font-semibold tabular-nums">
                        <Variacion v={variacionTotal} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Producciones que componen el período */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Clasificaciones del período</h2>
            {data.clasificaciones.length === 0 ? (
              <p className="text-sm text-slate-400">Sin clasificaciones en el rango seleccionado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Fecha</th>
                      <th className="py-2.5 pr-4 font-medium">N° Prod.</th>
                      <th className="py-2.5 pr-4 font-medium">Galpón</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Producido</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Bajas</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Clasificado</th>
                      <th className="py-2.5 font-medium">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clasificaciones.map((c) => (
                      <tr key={c.clasificacion_id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 text-xs tabular-nums text-slate-600">{fmtFechaIso(c.fecha)}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{c.produccion_codigo || "—"}</td>
                        <td className="py-2.5 pr-4 text-slate-700">{c.galpon || "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{fmt(c.huevos_producidos)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{fmt(c.bajas)}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-slate-800">
                          {fmt(c.clasificado)}
                        </td>
                        <td className="py-2.5">
                          {c.stock_aplicado ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                              Aplicado
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
