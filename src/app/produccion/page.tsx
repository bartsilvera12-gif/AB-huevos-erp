"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Egg, TrendingDown, Layers } from "lucide-react";
import GranjaStepper from "@/components/granja/GranjaStepper";

/**
 * DEMO estática del módulo Producción — sin conexión a la DB.
 * Registra la recolección diaria de huevos por galpón, que después alimenta Clasificación.
 */

type Produccion = {
  id: string;
  codigo: number;
  galpon: string;
  fecha: string;            // ISO datetime
  cantidad_huevos: number;
  bajas: number;
  responsable: string;
};

const GALPONES_OPCIONES = ["GALPON 1", "GALPON 2", "GALPON 3", "GALPON 4"];

const PRODUCCIONES_DEMO: Produccion[] = [
  { id: "p820", codigo: 820, galpon: "GALPON 4",        fecha: "2026-07-15T18:15:18", cantidad_huevos: 7590,  bajas: 0,   responsable: "espinola" },
  { id: "p819", codigo: 819, galpon: "GALPON 3",        fecha: "2026-07-15T18:14:23", cantidad_huevos: 13498, bajas: 1,   responsable: "espinola" },
  { id: "p818", codigo: 818, galpon: "GALPON 2",        fecha: "2026-07-15T18:12:31", cantidad_huevos: 4137,  bajas: 3,   responsable: "espinola" },
  { id: "p817", codigo: 817, galpon: "GALPON 1",        fecha: "2026-07-15T18:11:15", cantidad_huevos: 68,    bajas: 507, responsable: "espinola" },
  { id: "p816", codigo: 816, galpon: "GALPON 4",        fecha: "2026-07-14T18:06:14", cantidad_huevos: 7020,  bajas: 3,   responsable: "espinola" },
  { id: "p815", codigo: 815, galpon: "GALPON 3",        fecha: "2026-07-14T18:05:05", cantidad_huevos: 13517, bajas: 2,   responsable: "espinola" },
  { id: "p814", codigo: 814, galpon: "GALPON 2",        fecha: "2026-07-14T18:04:08", cantidad_huevos: 4330,  bajas: 2,   responsable: "espinola" },
  { id: "p813", codigo: 813, galpon: "GALPON 1",        fecha: "2026-07-14T18:03:01", cantidad_huevos: 96,    bajas: 431, responsable: "espinola" },
  { id: "p812", codigo: 812, galpon: "GALPON 4",        fecha: "2026-07-13T17:58:28", cantidad_huevos: 6030,  bajas: 1,   responsable: "espinola" },
  { id: "p811", codigo: 811, galpon: "GALPON 3",        fecha: "2026-07-13T17:56:31", cantidad_huevos: 14004, bajas: 2,   responsable: "espinola" },
];

function fmtNumero(n: number): string {
  return n.toLocaleString("es-PY");
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  } catch { return iso; }
}

/** ISO datetime del "ahora" para prellenar formularios. */
function ahoraIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function ProduccionPage() {
  const [producciones, setProducciones] = useState<Produccion[]>(PRODUCCIONES_DEMO);
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState<null | { modo: "nuevo" } | { modo: "editar"; p: Produccion }>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<Produccion | null>(null);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return producciones;
    return producciones.filter((p) =>
      p.galpon.toLowerCase().includes(q) ||
      p.responsable.toLowerCase().includes(q) ||
      p.fecha.includes(q)
    );
  }, [producciones, busqueda]);

  const totalHuevos = producciones.reduce((s, p) => s + p.cantidad_huevos, 0);
  const totalBajas = producciones.reduce((s, p) => s + p.bajas, 0);

  return (
    <div className="space-y-6">
      <GranjaStepper current="produccion" />

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-[#4FAEB2]/[0.02] to-[#4FAEB2]/[0.05] p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#3F8E91]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
            Zentra · Operaciones
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
              <span className="rounded-lg bg-white p-1.5 ring-1 ring-[#4FAEB2]/20 shadow-sm">
                <ClipboardList className="h-5 w-5 text-[#4FAEB2]" />
              </span>
              Producción
            </h1>
            <p className="mt-1 text-sm text-slate-500">Recolección diaria de huevos por galpón. Después se pasa a Clasificación.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen({ modo: "nuevo" })}
            className="rounded-lg bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/30 ring-1 ring-white/10 transition-all hover:shadow-md hover:from-[#3F8E91] hover:to-[#357577] active:scale-[.98]"
          >
            + Nueva producción
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Registros de producción" value={String(producciones.length)} icon={<Layers className="h-5 w-5" />} tone="slate" />
        <KpiCard label="Total huevos" value={fmtNumero(totalHuevos)} icon={<Egg className="h-5 w-5" />} tone="sky" />
        <KpiCard label="Total bajas" value={fmtNumero(totalBajas)} icon={<TrendingDown className="h-5 w-5" />} tone="rose" />
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por galpón, fecha o responsable…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9] sm:max-w-md"
          />
          <span className="ml-auto text-xs text-slate-500">{filtradas.length} de {producciones.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 w-14">ID</th>
                <th className="px-5 py-3">Galpón</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3 text-right">Cant. huevos</th>
                <th className="px-5 py-3 text-right">Bajas</th>
                <th className="px-5 py-3">Responsable</th>
                <th className="px-5 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    Sin registros que coincidan.
                  </td>
                </tr>
              ) : (
                filtradas.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">{p.codigo}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{p.galpon}</td>
                    <td className="px-5 py-4 text-slate-700 tabular-nums">{fmtFechaHora(p.fecha)}</td>
                    <td className="px-5 py-4 text-right tabular-nums font-medium text-slate-800">{fmtNumero(p.cantidad_huevos)}</td>
                    <td className={`px-5 py-4 text-right tabular-nums ${p.bajas > 0 ? "text-rose-700 font-medium" : "text-slate-500"}`}>{fmtNumero(p.bajas)}</td>
                    <td className="px-5 py-4 text-slate-700">{p.responsable}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModalOpen({ modo: "editar", p })}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrar(p)}
                          className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors"
                        >
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 italic">
        Demo visual — los cambios no se guardan (todavía no está conectado a la base de datos).
      </p>

      {/* Modal alta / edición */}
      {modalOpen && (
        <ModalProduccion
          modo={modalOpen.modo}
          produccion={modalOpen.modo === "editar" ? modalOpen.p : null}
          onClose={() => setModalOpen(null)}
          onGuardar={(p) => {
            if (modalOpen.modo === "editar") {
              setProducciones((prev) => prev.map((x) => (x.id === p.id ? p : x)));
            } else {
              const nextCodigo = producciones.length > 0 ? Math.max(...producciones.map((x) => x.codigo)) + 1 : 1;
              setProducciones((prev) => [{ ...p, id: crypto.randomUUID(), codigo: nextCodigo }, ...prev]);
            }
            setModalOpen(null);
          }}
        />
      )}

      {/* Confirmar borrar */}
      {confirmarBorrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm" onClick={() => setConfirmarBorrar(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">Borrar producción</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Vas a borrar el registro <span className="font-semibold text-slate-900">#{confirmarBorrar.codigo}</span> — {confirmarBorrar.galpon} · {fmtFechaHora(confirmarBorrar.fecha)}.
                </p>
                <p className="mt-2 text-[11px] italic text-slate-400">Demo: solo lo saca de la lista visible.</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmarBorrar(null)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setProducciones((prev) => prev.filter((x) => x.id !== confirmarBorrar.id));
                  setConfirmarBorrar(null);
                }}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
              >
                Borrar registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type KpiTone = "slate" | "sky" | "emerald" | "rose" | "amber";
const KPI_TONES: Record<KpiTone, { bg: string; icon: string; value: string; ring: string }> = {
  slate:   { bg: "bg-slate-100",   icon: "text-slate-600",   value: "text-slate-900",  ring: "ring-slate-200/60" },
  sky:     { bg: "bg-sky-100",     icon: "text-sky-600",     value: "text-sky-700",    ring: "ring-sky-200/60"   },
  emerald: { bg: "bg-emerald-100", icon: "text-emerald-600", value: "text-emerald-700",ring: "ring-emerald-200/60" },
  rose:    { bg: "bg-rose-100",    icon: "text-rose-600",    value: "text-rose-700",   ring: "ring-rose-200/60"  },
  amber:   { bg: "bg-amber-100",   icon: "text-amber-700",   value: "text-amber-800",  ring: "ring-amber-200/60" },
};

function KpiCard({ label, value, icon, tone = "slate" }: { label: string; value: string; icon?: React.ReactNode; tone?: KpiTone }) {
  const t = KPI_TONES[tone];
  return (
    <div className={`group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 transition-all hover:shadow-md hover:-translate-y-0.5 ${t.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${t.value}`}>{value}</p>
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.bg} ${t.icon} transition-transform group-hover:scale-110`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalProduccion({
  modo, produccion, onClose, onGuardar,
}: {
  modo: "nuevo" | "editar";
  produccion: Produccion | null;
  onClose: () => void;
  onGuardar: (p: Produccion) => void;
}) {
  const [galpon, setGalpon] = useState(produccion?.galpon ?? GALPONES_OPCIONES[0]);
  const [fecha, setFecha] = useState(produccion?.fecha ?? ahoraIso());
  const [cantidad, setCantidad] = useState(produccion?.cantidad_huevos != null ? String(produccion.cantidad_huevos) : "");
  const [bajas, setBajas] = useState(produccion?.bajas != null ? String(produccion.bajas) : "0");
  const [responsable, setResponsable] = useState(produccion?.responsable ?? "");
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    if (!galpon) { setError("Seleccioná un galpón."); return; }
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c < 0) { setError("La cantidad de huevos debe ser un número positivo."); return; }
    const b = Number(bajas);
    if (!Number.isFinite(b) || b < 0) { setError("Las bajas deben ser un número positivo o cero."); return; }
    if (!responsable.trim()) { setError("El responsable es obligatorio."); return; }
    onGuardar({
      id: produccion?.id ?? "",
      codigo: produccion?.codigo ?? 0,
      galpon,
      fecha: fecha || ahoraIso(),
      cantidad_huevos: c,
      bajas: b,
      responsable: responsable.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{modo === "nuevo" ? "Nueva producción" : "Editar producción"}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {modo === "nuevo" ? "Registrar recolección diaria por galpón." : `Editando registro #${produccion?.codigo}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Galpón *</label>
            <select
              value={galpon}
              onChange={(e) => setGalpon(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              {GALPONES_OPCIONES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Fecha y hora *</label>
            <input
              type="datetime-local"
              step={1}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            <p className="mt-1 text-[10px] text-slate-400">Por defecto: ahora.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Cantidad de huevos *</label>
              <input
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Ej: 7590"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Bajas</label>
              <input
                type="number"
                min={0}
                value={bajas}
                onChange={(e) => setBajas(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Responsable *</label>
            <input
              type="text"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              placeholder="Ej: espinola"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            className="rounded-md bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
          >
            {modo === "nuevo" ? "Registrar producción" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
