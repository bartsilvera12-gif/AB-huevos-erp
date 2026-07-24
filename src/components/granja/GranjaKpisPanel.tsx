"use client";

import { useEffect, useState } from "react";
import { Egg, PieChart } from "lucide-react";
import Link from "next/link";

type Data = {
  puesta_pct_7d: number;
  huevos_ultimos_7d: number;
  total_gallinas_iniciales: number;
  total_gallinas_activas: number;
  huevos_mes: number;
  bajas_gallinas_mes: number;
  bajas_gallinas_totales: number;
  pct_mortalidad_historica: number;
  por_galpon: Array<{
    galpon_id: string;
    nombre: string;
    gallinas_iniciales: number;
    gallinas_activas: number;
    bajas_gallinas_totales: number;
    huevos_mes: number;
    bajas_gallinas_mes: number;
    pct_del_total: number;
    puesta_pct_7d: number;
  }>;
  huevos_sin_clasificar: number;
  producciones_sin_clasificar: number;
  huevos_rotos_mes: number;
  huevos_rotos_totales: number;
  tipo_roto_configurado: boolean;
  produccion_diaria_7d?: Array<{ fecha: string; total: number }>;
  produccion_por_galpon_7d?: Array<{ fecha: string; galpon_id: string; galpon_nombre: string; huevos: number; gallinas: number; pct_puesta: number; diff_vs_ant: number | null }>;
  produccion_por_tipo_7d?: Array<{ fecha: string; tipo_id: string; tipo_nombre: string; cantidad: number }>;
};

function fmtFechaDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function fmtNumero(n: number): string {
  return n.toLocaleString("es-PY");
}

function colorPct(p: number): string {
  if (p >= 85) return "text-emerald-700";
  if (p >= 70) return "text-amber-700";
  if (p > 0) return "text-rose-700";
  return "text-slate-500";
}

export default function GranjaKpisPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/granja/dashboard", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? "Error");
        setData(j.data as Data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando) return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-400">Cargando indicadores de granja…</p>
    </div>
  );
  if (error || !data) return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      {error ?? "Sin datos de granja"}
    </div>
  );

  const puestaColor = colorPct(data.puesta_pct_7d);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Egg className="h-5 w-5 text-[#4FAEB2]" />
          Granja — indicadores
        </h2>
        <div className="flex gap-3 text-[11px]">
          <Link href="/produccion" className="text-[#4FAEB2] hover:underline">Producción →</Link>
          <Link href="/clasificacion" className="text-[#4FAEB2] hover:underline">Clasificación →</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">% Puesta (día)</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${puestaColor}`}>{data.puesta_pct_7d}%</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {fmtNumero(data.total_gallinas_activas)} gallinas activas · último día registrado
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Huevos del mes</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-sky-700">{fmtNumero(data.huevos_mes)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            Repartidos en {data.por_galpon.filter((g) => g.huevos_mes > 0).length} galpones
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bajas de gallinas (mes)</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-rose-700">{fmtNumero(data.bajas_gallinas_mes)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            Mortalidad total: {fmtNumero(data.bajas_gallinas_totales)} ({data.pct_mortalidad_historica}%)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Huevos sin clasificar</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-amber-700">{fmtNumero(data.huevos_sin_clasificar)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {data.producciones_sin_clasificar} producción(es) pendiente(s)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Huevos rotos (mes)</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-orange-700">{fmtNumero(data.huevos_rotos_mes)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {data.tipo_roto_configurado ? <>Total histórico: {fmtNumero(data.huevos_rotos_totales)}</> : <span className="italic text-slate-400">Falta tipo &quot;Roto&quot;</span>}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <PieChart className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Distribución de huevos por galpón (mes actual)</h3>
        </div>
        {data.por_galpon.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Sin galpones activos.</p>
        ) : data.huevos_mes === 0 ? (
          <p className="text-xs text-slate-400 italic">Sin producciones cargadas este mes.</p>
        ) : (
          <div className="space-y-2">
            {data.por_galpon.map((g) => (
              <div key={g.galpon_id}>
                <div className="flex justify-between text-xs mb-1 gap-2 flex-wrap">
                  <span className="font-medium text-slate-700">
                    {g.nombre}
                    <span className="ml-2 text-[10px] text-slate-500 font-normal">
                      ({fmtNumero(g.gallinas_activas)}/{fmtNumero(g.gallinas_iniciales)} gallinas)
                    </span>
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {fmtNumero(g.huevos_mes)} huevos · <strong>{g.pct_del_total}%</strong>
                    {g.bajas_gallinas_mes > 0 && (
                      <span className="ml-2 text-rose-600">· {fmtNumero(g.bajas_gallinas_mes)} baja(s) mes</span>
                    )}
                    {g.gallinas_activas > 0 && (
                      <span className={`ml-2 ${colorPct(g.puesta_pct_7d)}`}>({g.puesta_pct_7d}% puesta)</span>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] transition-all"
                    style={{ width: `${g.pct_del_total}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400">
          <strong>Gallinas activas</strong> = inicial − bajas históricas. <strong>% puesta</strong> = huevos del último día registrado ÷ gallinas activas × 100. Rango sano: 85-95%.
        </p>
      </div>

      <ProduccionGeneralChart data={data.produccion_diaria_7d ?? []} />
      <ProduccionPorTipoChart data={data.produccion_por_tipo_7d ?? []} />
      <ProduccionPorGalponTabla data={data.produccion_por_galpon_7d ?? []} />
    </section>
  );
}

// ── Chart: producción general últimos 7 días ────────────────────────────────
function ProduccionGeneralChart({ data }: { data: Array<{ fecha: string; total: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Producción general — semanal</h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos del período.</p>
      ) : (
        <div className="flex items-stretch gap-2 h-56">
          {data.map((d) => {
            const h = max > 0 ? Math.round((d.total / max) * 100) : 0;
            return (
              <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-semibold text-slate-700 tabular-nums">{fmtNumero(d.total)}</span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-emerald-300 transition-all"
                    style={{ height: `${d.total === 0 ? 2 : Math.max(6, h)}%`, opacity: d.total === 0 ? 0.25 : 1 }}
                    title={`${fmtFechaDMY(d.fecha)}: ${fmtNumero(d.total)} huevos`}
                  />
                </div>
                <span className="text-[9px] text-slate-500 tabular-nums whitespace-nowrap">{fmtFechaDMY(d.fecha)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Chart: producción por tipo de huevo (últimos 7 días) ────────────────────
function ProduccionPorTipoChart({ data }: { data: Array<{ fecha: string; tipo_id: string; tipo_nombre: string; cantidad: number }> }) {
  const tipos = Array.from(new Map(data.map((d) => [d.tipo_id, d.tipo_nombre])));
  const fechas = Array.from(new Set(data.map((d) => d.fecha))).sort();
  const colors = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#eab308", "#14b8a6", "#f97316"];
  const totalPorTipo = new Map<string, number>();
  for (const d of data) totalPorTipo.set(d.tipo_id, (totalPorTipo.get(d.tipo_id) ?? 0) + d.cantidad);
  const max = Math.max(1, ...fechas.map((f) => tipos.reduce((s, [id]) => s + (data.find((x) => x.fecha === f && x.tipo_id === id)?.cantidad ?? 0), 0)));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Producción por tipo — semanal</h3>
      <p className="mb-3 text-[11px] text-slate-500">Indicador de salud y alimentación (distribución de tipos por día).</p>
      {data.length === 0 || tipos.length === 0 ? (
        <p className="text-sm text-slate-400">Sin clasificaciones registradas en el período.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-[11px]">
            {tipos.map(([id, nombre], i) => (
              <span key={id} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[i % colors.length] }} />
                <span className="text-slate-600">{nombre}</span>
                <span className="tabular-nums text-slate-400">({fmtNumero(totalPorTipo.get(id) ?? 0)})</span>
              </span>
            ))}
          </div>
          <div className="flex items-stretch gap-3 h-56">
            {fechas.map((f) => (
              <div key={f} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end gap-0.5">
                  {tipos.map(([id], i) => {
                    const v = data.find((x) => x.fecha === f && x.tipo_id === id)?.cantidad ?? 0;
                    const h = max > 0 ? Math.round((v / max) * 100) : 0;
                    return (
                      <div
                        key={id}
                        className="flex-1 rounded-t transition-all"
                        style={{ background: colors[i % colors.length], height: `${v === 0 ? 2 : Math.max(4, h)}%`, opacity: v === 0 ? 0.15 : 1 }}
                        title={`${fmtFechaDMY(f)} · ${data.find(x => x.fecha === f && x.tipo_id === id)?.tipo_nombre}: ${fmtNumero(v)}`}
                      />
                    );
                  })}
                </div>
                <span className="text-[9px] text-slate-500 tabular-nums whitespace-nowrap">{fmtFechaDMY(f)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tabla: producción por galpón con % puesta y diff vs día anterior ────────
function ProduccionPorGalponTabla({ data }: { data: Array<{ fecha: string; galpon_id: string; galpon_nombre: string; huevos: number; gallinas: number; pct_puesta: number; diff_vs_ant: number | null }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Producción por galpón — semanal</h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos del período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Galpón</th>
                <th className="py-2 pr-3 font-medium text-right">Producción / Gallinas</th>
                <th className="py-2 pr-3 font-medium text-right">% Puesta</th>
                <th className="py-2 pr-3 font-medium text-right">Dif. día anterior</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={`${r.fecha}-${r.galpon_id}-${i}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{fmtFechaDMY(r.fecha)}</td>
                  <td className="py-2 pr-3 text-slate-800 font-medium">{r.galpon_nombre}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                    {fmtNumero(r.huevos)} / {fmtNumero(r.gallinas)}
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${colorPct(r.pct_puesta)}`}>{r.pct_puesta}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.diff_vs_ant === null ? (
                      <span className="text-slate-400">—</span>
                    ) : r.diff_vs_ant > 0 ? (
                      <span className="text-emerald-700">↑ {r.diff_vs_ant}%</span>
                    ) : r.diff_vs_ant < 0 ? (
                      <span className="text-rose-700">↓ {Math.abs(r.diff_vs_ant)}%</span>
                    ) : (
                      <span className="text-slate-500">0%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
