"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Campo de fecha + hora con calendario propio.
 *
 * Renderizamos el popup con `position: fixed` en un portal a `document.body`,
 * así el calendario nunca queda atrapado dentro de un modal ni se lo puede
 * clipear un overflow del contenedor. El popup mide su tamaño real y decide
 * si abrir hacia abajo o hacia arriba según el espacio disponible.
 *
 * Valor de la API: `"YYYY-MM-DDTHH:mm"` (mismo shape que el input nativo
 * `datetime-local`) o cadena vacía cuando no hay fecha.
 */
export default function DateTimePickerField({
  value,
  onChange,
  placeholder = "dd/mm/aaaa hh:mm",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const parsed = useMemo(() => parseIso(value), [value]);
  const [viewMonth, setViewMonth] = useState<{ y: number; m: number }>(() => {
    const base = parsed ?? new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  // Al abrir, poner el calendario en el mes del valor actual (o "hoy").
  useEffect(() => {
    if (!open) return;
    const base = parseIso(value) ?? new Date();
    setViewMonth({ y: base.getFullYear(), m: base.getMonth() });
  }, [open, value]);

  // Posicionar el popup respecto al input, decidir arriba/abajo por espacio.
  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const popup = popupRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const popupH = popup?.height ?? 380;
      const popupW = popup?.width ?? 320;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const espacioAbajo = vh - anchor.bottom;
      const abrirArriba = espacioAbajo < popupH + 12 && anchor.top > popupH + 12;
      const top = abrirArriba ? anchor.top - popupH - 6 : anchor.bottom + 6;
      let left = anchor.left;
      if (left + popupW > vw - 8) left = Math.max(8, vw - popupW - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Cerrar con click afuera y con Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function seleccionarDia(y: number, m: number, d: number) {
    const [hh, mi] = parsed ? [parsed.getHours(), parsed.getMinutes()] : [0, 0];
    onChange(toIso(new Date(y, m, d, hh, mi)));
  }
  function cambiarHora(hh: number, mi: number) {
    const base = parsed ?? new Date();
    onChange(toIso(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mi)));
  }
  function ponerHoy() {
    onChange(toIso(new Date()));
  }
  function limpiar() {
    onChange("");
  }

  const label = parsed ? formatoLegible(parsed) : "";

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none hover:border-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
      >
        <span className={label ? "text-slate-800" : "text-slate-400"}>{label || placeholder}</span>
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popupRef}
          style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 200 }}
          className="w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-100"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Calendario
            viewMonth={viewMonth}
            setViewMonth={setViewMonth}
            selected={parsed}
            onSelect={seleccionarDia}
          />
          <SelectorHora parsed={parsed} onChange={cambiarHora} />
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <button type="button" onClick={limpiar} className="text-xs text-slate-500 hover:text-rose-600">
              Limpiar
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={ponerHoy}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
              >
                Listo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Grilla mensual con navegación mes/año. Lunes como primer día de semana. */
function Calendario({
  viewMonth,
  setViewMonth,
  selected,
  onSelect,
}: {
  viewMonth: { y: number; m: number };
  setViewMonth: (v: { y: number; m: number }) => void;
  selected: Date | null;
  onSelect: (y: number, m: number, d: number) => void;
}) {
  const { y, m } = viewMonth;
  const primeroSem = ((new Date(y, m, 1).getDay() + 6) % 7); // 0 = lunes
  const diasEnMes = new Date(y, m + 1, 0).getDate();

  const celdas: Array<{ y: number; m: number; d: number; ownMonth: boolean }> = [];
  // Días del mes anterior para completar la primera semana
  const diasMesAnt = new Date(y, m, 0).getDate();
  for (let i = primeroSem - 1; i >= 0; i--) {
    celdas.push({ y: m === 0 ? y - 1 : y, m: m === 0 ? 11 : m - 1, d: diasMesAnt - i, ownMonth: false });
  }
  for (let d = 1; d <= diasEnMes; d++) celdas.push({ y, m, d, ownMonth: true });
  while (celdas.length % 7 !== 0 || celdas.length < 42) {
    const ult = celdas[celdas.length - 1];
    const nd = ult.d + 1;
    const nm = ult.ownMonth ? (m === 11 ? 0 : m + 1) : ult.m;
    const ny = ult.ownMonth ? (m === 11 ? y + 1 : y) : ult.y;
    const diasEse = new Date(ny, nm + 1, 0).getDate();
    if (!ult.ownMonth && nd > diasEse) break;
    celdas.push({
      y: ult.ownMonth ? ny : ult.y,
      m: ult.ownMonth ? nm : ult.m,
      d: ult.ownMonth ? (nd > diasEse ? 1 : nd) : nd,
      ownMonth: false,
    });
    if (celdas.length >= 42) break;
  }

  function mover(delta: number) {
    let ny = y, nm = m + delta;
    while (nm < 0) { nm += 12; ny -= 1; }
    while (nm > 11) { nm -= 12; ny += 1; }
    setViewMonth({ y: ny, m: nm });
  }

  const hoy = new Date();
  const hoyKey = `${hoy.getFullYear()}-${hoy.getMonth()}-${hoy.getDate()}`;
  const selKey = selected ? `${selected.getFullYear()}-${selected.getMonth()}-${selected.getDate()}` : null;

  return (
    <div>
      <div className="flex items-center justify-between px-1 py-1">
        <button type="button" onClick={() => mover(-1)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Mes anterior">‹</button>
        <div className="flex items-center gap-2">
          <select
            value={m}
            onChange={(e) => setViewMonth({ y, m: Number(e.target.value) })}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-sky-500"
          >
            {MESES.map((mm, i) => <option key={i} value={i}>{mm}</option>)}
          </select>
          <input
            type="number"
            value={y}
            onChange={(e) => { const nv = Number(e.target.value); if (nv >= 1900 && nv <= 2100) setViewMonth({ y: nv, m }); }}
            className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 tabular-nums outline-none focus:border-sky-500"
          />
        </div>
        <button type="button" onClick={() => mover(1)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Mes siguiente">›</button>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {celdas.map((c, i) => {
          const key = `${c.y}-${c.m}-${c.d}`;
          const esHoy = key === hoyKey;
          const esSel = key === selKey;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(c.y, c.m, c.d)}
              className={[
                "rounded-md py-1.5 text-sm tabular-nums transition-colors",
                c.ownMonth ? "text-slate-700" : "text-slate-300",
                esSel ? "bg-sky-600 text-white hover:bg-sky-600"
                  : esHoy ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                  : "hover:bg-slate-100",
              ].join(" ")}
            >
              {c.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SelectorHora({ parsed, onChange }: { parsed: Date | null; onChange: (hh: number, mi: number) => void }) {
  const hh = parsed?.getHours() ?? 0;
  const mi = parsed?.getMinutes() ?? 0;
  return (
    <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-100 pt-3">
      <span className="text-xs text-slate-500">Hora</span>
      <input
        type="number"
        min={0}
        max={23}
        value={String(hh).padStart(2, "0")}
        onChange={(e) => {
          const v = Math.max(0, Math.min(23, Number(e.target.value) || 0));
          onChange(v, mi);
        }}
        className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-sky-500"
      />
      <span className="text-slate-400">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={String(mi).padStart(2, "0")}
        onChange={(e) => {
          const v = Math.max(0, Math.min(59, Number(e.target.value) || 0));
          onChange(hh, v);
        }}
        className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-sky-500"
      />
    </div>
  );
}

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parsea `YYYY-MM-DDTHH:mm` como fecha local (no UTC). */
function parseIso(v: string): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return isNaN(d.getTime()) ? null : d;
}

function formatoLegible(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
