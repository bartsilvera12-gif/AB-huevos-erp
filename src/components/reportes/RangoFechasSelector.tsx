"use client";

import { hoyAsuncion, semanaAsuncion, sumarDias } from "@/lib/fechas/asuncion-bounds";

export type Rango = { desde: string; hasta: string };

/** Primer y último día del mes que contiene `hoy` (en Asunción). */
function mesActual(): Rango {
  const hoy = hoyAsuncion();
  const [y, m] = hoy.split("-").map(Number);
  const primero = `${y}-${String(m).padStart(2, "0")}-01`;
  // Último día = día 0 del mes siguiente.
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde: primero, hasta: ultimo };
}

/** Mismo cálculo para el mes anterior. */
function mesPasado(): Rango {
  const hoy = hoyAsuncion();
  const [y, m] = hoy.split("-").map(Number);
  const y0 = m === 1 ? y - 1 : y;
  const m0 = m === 1 ? 12 : m - 1;
  const primero = `${y0}-${String(m0).padStart(2, "0")}-01`;
  const ultimo = new Date(Date.UTC(y0, m0, 0)).toISOString().slice(0, 10);
  return { desde: primero, hasta: ultimo };
}

/** Atajos frecuentes; el cliente pidió explícitamente "lunes a domingo de la semana pasada". */
function presets(): Array<{ label: string; rango: () => Rango }> {
  return [
    { label: "Semana pasada", rango: () => semanaAsuncion(-1) },
    { label: "Esta semana", rango: () => semanaAsuncion(0) },
    { label: "Este mes", rango: mesActual },
    { label: "Mes pasado", rango: mesPasado },
    { label: "Últimos 7 días", rango: () => ({ desde: sumarDias(hoyAsuncion(), -6), hasta: hoyAsuncion() }) },
    { label: "Últimos 30 días", rango: () => ({ desde: sumarDias(hoyAsuncion(), -29), hasta: hoyAsuncion() }) },
  ];
}

/** Selector de rango de fechas con atajos. Valores `YYYY-MM-DD` (Asunción). */
export default function RangoFechasSelector({
  rango,
  onChange,
}: {
  rango: Rango;
  onChange: (r: Rango) => void;
}) {
  const input =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#0EA5E9]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets().map((p) => {
        const r = p.rango();
        const activo = r.desde === rango.desde && r.hasta === rango.hasta;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activo
                ? "bg-[#4FAEB2] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <label className="ml-1 text-xs text-slate-400">Desde</label>
      <input
        type="date"
        value={rango.desde}
        max={rango.hasta}
        onChange={(e) => e.target.value && onChange({ ...rango, desde: e.target.value })}
        className={input}
      />
      <label className="text-xs text-slate-400">Hasta</label>
      <input
        type="date"
        value={rango.hasta}
        min={rango.desde}
        onChange={(e) => e.target.value && onChange({ ...rango, hasta: e.target.value })}
        className={input}
      />
    </div>
  );
}
