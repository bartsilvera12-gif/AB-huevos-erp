"use client";

import { hoyAsuncion, semanaAsuncion, sumarDias } from "@/lib/fechas/asuncion-bounds";

export type Rango = { desde: string; hasta: string };

/** Atajos frecuentes; el cliente pidió explícitamente "lunes a domingo de la semana pasada". */
function presets(): Array<{ label: string; rango: () => Rango }> {
  return [
    { label: "Semana pasada", rango: () => semanaAsuncion(-1) },
    { label: "Esta semana", rango: () => semanaAsuncion(0) },
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
