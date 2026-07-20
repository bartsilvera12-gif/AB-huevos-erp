"use client";

import { useEffect, useState } from "react";
import { Egg, PieChart, Layers } from "lucide-react";
import Link from "next/link";

type Data = {
  puesta_pct_7d: number;
  huevos_ultimos_7d: number;
  total_gallinas: number;
  huevos_mes: number;
  bajas_mes: number;
  pct_bajas_mes: number;
  por_galpon: Array<{
    galpon_id: string;
    nombre: string;
    gallinas: number;
    huevos_mes: number;
    bajas_mes: number;
    pct_bajas: number;
    pct_del_total: number;
    puesta_pct_7d: number;
  }>;
  huevos_sin_clasificar: number;
  producciones_sin_clasificar: number;
};

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

  if (cargando) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-400">Cargando indicadores de granja…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error ?? "Sin datos de granja"}
      </div>
    );
  }

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

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">% Puesta (últimos 7 días)</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${puestaColor}`}>{data.puesta_pct_7d}%</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {fmtNumero(data.huevos_ultimos_7d)} huevos · {fmtNumero(data.total_gallinas)} gallinas
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bajas del mes</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-rose-700">{fmtNumero(data.bajas_mes)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            <strong>{data.pct_bajas_mes}%</strong> del total (huevos rotos / descartados)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sin clasificar</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-amber-700">{fmtNumero(data.huevos_sin_clasificar)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {data.producciones_sin_clasificar} producción(es) pendiente(s)
          </p>
        </div>
      </div>

      {/* Distribución por galpón */}
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
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">{g.nombre}</span>
                  <span className="tabular-nums text-slate-600">
                    {fmtNumero(g.huevos_mes)} huevos · <strong>{g.pct_del_total}%</strong>
                    {g.bajas_mes > 0 && (
                      <span className="ml-2 text-rose-600">· {fmtNumero(g.bajas_mes)} bajas ({g.pct_bajas}%)</span>
                    )}
                    {g.gallinas > 0 && (
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
          <strong>% puesta</strong>: huevos últimos 7 días ÷ (gallinas × 7). Rango sano: 85-95%.
        </p>
      </div>
    </section>
  );
}
