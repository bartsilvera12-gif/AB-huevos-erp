"use client";

import { useMemo, useState } from "react";
import { Egg, ListChecks, Package, Layers, Sparkles } from "lucide-react";

/**
 * DEMO estática del módulo Clasificación de huevos — sin conexión a la DB.
 * Solo para revisar diseño e interacción antes de conectar backend.
 */

type TipoHuevo = { id: string; codigo: number; nombre: string };

type LineaClasificacion = {
  tipo_id: string;
  cantidad: number;
  planchas: number;
  unidades: number;
};

/** Convención: 1 plancha = 30 huevos. Unidades = sobrantes que no llenan una plancha completa. */
const HUEVOS_POR_PLANCHA = 30;
function calcularPlanchasUnidades(cantidad: number): { planchas: number; unidades: number } {
  const n = Math.max(0, Math.trunc(cantidad));
  return { planchas: Math.floor(n / HUEVOS_POR_PLANCHA), unidades: n % HUEVOS_POR_PLANCHA };
}

type Clasificacion = {
  id: string;
  codigo: number;
  galpon: string;
  fecha: string;                 // ISO datetime
  cantidad_huevos: number;
  bajas: number;
  responsable: string;
  fecha_distribucion: string | null;
  resp_distribucion: string;
  detalle: LineaClasificacion[];
};

const TIPOS_DEMO: TipoHuevo[] = [
  { id: "t1", codigo: 1, nombre: "Jumbo" },
  { id: "t2", codigo: 2, nombre: "Super" },
  { id: "t3", codigo: 3, nombre: "Tipo A" },
  { id: "t4", codigo: 4, nombre: "Tipo B" },
  { id: "t5", codigo: 5, nombre: "Tipo C" },
  { id: "t6", codigo: 6, nombre: "Picado" },
  { id: "t7", codigo: 7, nombre: "Roto" },
  { id: "t8", codigo: 8, nombre: "Sucio" },
];

const CLASIFICACIONES_DEMO: Clasificacion[] = [
  {
    id: "c1", codigo: 11, galpon: "GALPON 3", fecha: "2025-03-21T06:03:25",
    cantidad_huevos: 9840, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-21T18:19:54", resp_distribucion: "luzovelar",
    detalle: [
      { tipo_id: "t1", cantidad: 30,   planchas: 1,   unidades: 0 },
      { tipo_id: "t2", cantidad: 2190, planchas: 73,  unidades: 0 },
      { tipo_id: "t3", cantidad: 5040, planchas: 168, unidades: 0 },
      { tipo_id: "t4", cantidad: 990,  planchas: 33,  unidades: 0 },
      { tipo_id: "t5", cantidad: 30,   planchas: 1,   unidades: 0 },
      { tipo_id: "t6", cantidad: 93,   planchas: 3,   unidades: 3 },
      { tipo_id: "t7", cantidad: 630,  planchas: 21,  unidades: 0 },
      { tipo_id: "t8", cantidad: 780,  planchas: 26,  unidades: 0 },
    ],
  },
  {
    id: "c2", codigo: 10, galpon: "GALPON 3", fecha: "2025-03-20T06:03:24",
    cantidad_huevos: 9720, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-20T18:07:57", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c3", codigo: 9, galpon: "GALPON 1", fecha: "2025-03-19T05:03:01",
    cantidad_huevos: 15180, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-20T17:28:12", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c4", codigo: 8, galpon: "GALPON 4", fecha: "2025-03-19T09:03:30",
    cantidad_huevos: 13080, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-20T09:10:02", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c5", codigo: 7, galpon: "GALPON 3", fecha: "2025-03-19T05:03:39",
    cantidad_huevos: 9780, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-19T17:47:25", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c6", codigo: 6, galpon: "GALPON 4", fecha: "2025-03-18T09:03:55",
    cantidad_huevos: 13050, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-19T09:06:22", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c7", codigo: 5, galpon: "GALPON 3", fecha: "2025-03-18T06:03:37",
    cantidad_huevos: 9570, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-18T18:02:03", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c8", codigo: 4, galpon: "GALPON 1", fecha: "2025-03-17T05:03:13",
    cantidad_huevos: 15180, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-18T17:09:44", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c9", codigo: 3, galpon: "GALPON 4", fecha: "2025-03-17T05:03:08",
    cantidad_huevos: 13200, bajas: 0, responsable: "luzovelar",
    fecha_distribucion: "2025-03-18T17:07:37", resp_distribucion: "luzovelar", detalle: [],
  },
  {
    id: "c10", codigo: 1, galpon: "GALPON 1", fecha: "2025-03-17T11:03:01",
    cantidad_huevos: 47370, bajas: 0, responsable: "juliorock",
    fecha_distribucion: "2025-03-21T10:11:37", resp_distribucion: "juliorock", detalle: [],
  },
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

export default function ClasificacionPage() {
  const [clasificaciones, setClasificaciones] = useState<Clasificacion[]>(CLASIFICACIONES_DEMO);
  const [tipos, setTipos] = useState<TipoHuevo[]>(TIPOS_DEMO);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Clasificacion | null>(null);
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [tiposModalOpen, setTiposModalOpen] = useState(false);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clasificaciones;
    return clasificaciones.filter((c) =>
      c.galpon.toLowerCase().includes(q) ||
      c.responsable.toLowerCase().includes(q) ||
      c.fecha.includes(q)
    );
  }, [clasificaciones, busqueda]);

  const totalHuevos = clasificaciones.reduce((s, c) => s + c.cantidad_huevos, 0);

  return (
    <div className="space-y-6">
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
                <Egg className="h-5 w-5 text-[#4FAEB2]" />
              </span>
              Clasificación de huevos
            </h1>
            <p className="mt-1 text-sm text-slate-500">Registro de producción diaria y clasificación por tipo.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTiposModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow"
            >
              <ListChecks className="h-4 w-4" />
              Tipos de huevos
            </button>
            <button
              type="button"
              onClick={() => setNuevaOpen(true)}
              className="rounded-lg bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/30 ring-1 ring-white/10 transition-all hover:shadow-md hover:from-[#3F8E91] hover:to-[#357577] active:scale-[.98]"
            >
              + Nueva clasificación
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Registros de producción" value={String(clasificaciones.length)} icon={<Layers className="h-5 w-5" />} tone="slate" />
        <KpiCard label="Total de huevos" value={fmtNumero(totalHuevos)} icon={<Egg className="h-5 w-5" />} tone="sky" />
        <KpiCard label="Tipos de huevo definidos" value={String(tipos.length)} icon={<Sparkles className="h-5 w-5" />} tone="emerald" />
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
          <span className="ml-auto text-xs text-slate-500">{filtradas.length} de {clasificaciones.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 w-14">ID</th>
                <th className="px-5 py-3">Galpón</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3 text-right">Cant. huevos</th>
                <th className="px-5 py-3 text-right">Bajas</th>
                <th className="px-5 py-3">Responsable</th>
                <th className="px-5 py-3">Fec. distribución</th>
                <th className="px-5 py-3">Resp. distribución</th>
                <th className="px-5 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-400">Sin registros que coincidan.</td>
                </tr>
              ) : (
                filtradas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">{c.codigo}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{c.galpon}</td>
                    <td className="px-5 py-4 text-slate-700 tabular-nums">{fmtFechaHora(c.fecha)}</td>
                    <td className="px-5 py-4 text-right tabular-nums font-medium text-slate-800">{fmtNumero(c.cantidad_huevos)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700">{c.bajas}</td>
                    <td className="px-5 py-4 text-slate-700">{c.responsable}</td>
                    <td className="px-5 py-4 text-slate-700 tabular-nums text-xs">{fmtFechaHora(c.fecha_distribucion)}</td>
                    <td className="px-5 py-4 text-slate-700">{c.resp_distribucion}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditando(c)}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          Editar
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

      <p className="text-[11px] text-slate-400 italic">Demo visual — los cambios no se guardan (todavía no está conectado a la base de datos).</p>

      {/* Modal editar clasificación */}
      {editando && (
        <ModalClasificacion
          clasificacion={editando}
          tipos={tipos}
          onClose={() => setEditando(null)}
          onGuardar={(c) => {
            setClasificaciones((prev) => prev.map((x) => (x.id === c.id ? c : x)));
            setEditando(null);
          }}
        />
      )}

      {/* Modal nueva clasificación */}
      {nuevaOpen && (
        <ModalNueva
          onClose={() => setNuevaOpen(false)}
          onCrear={(base) => {
            const nextCodigo = clasificaciones.length > 0 ? Math.max(...clasificaciones.map((c) => c.codigo)) + 1 : 1;
            const nueva: Clasificacion = {
              ...base,
              id: crypto.randomUUID(),
              codigo: nextCodigo,
              detalle: [],
            };
            setClasificaciones((prev) => [nueva, ...prev]);
            setNuevaOpen(false);
            // Abrimos directamente el modal de clasificación para completar el desglose.
            setEditando(nueva);
          }}
        />
      )}

      {/* Modal catálogo tipos */}
      {tiposModalOpen && (
        <ModalTipos
          tipos={tipos}
          setTipos={setTipos}
          onClose={() => setTiposModalOpen(false)}
        />
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

/* ─── MODAL: editar clasificación ────────────────────────────────────────── */

function ModalClasificacion({
  clasificacion, tipos, onClose, onGuardar,
}: {
  clasificacion: Clasificacion;
  tipos: TipoHuevo[];
  onClose: () => void;
  onGuardar: (c: Clasificacion) => void;
}) {
  const [cantidades, setCantidades] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {};
    for (const t of tipos) {
      const existente = clasificacion.detalle.find((d) => d.tipo_id === t.id);
      base[t.id] = existente?.cantidad ?? 0;
    }
    return base;
  });

  const totalClasificado = Object.values(cantidades).reduce((s, n) => s + (n || 0), 0);
  const porClasificar = clasificacion.cantidad_huevos - clasificacion.bajas - totalClasificado;

  function guardar() {
    const detalleArr: LineaClasificacion[] = tipos.map((t) => {
      const cant = cantidades[t.id] ?? 0;
      const { planchas, unidades } = calcularPlanchasUnidades(cant);
      return { tipo_id: t.id, cantidad: cant, planchas, unidades };
    }).filter((d) => d.cantidad > 0);
    onGuardar({ ...clasificacion, detalle: detalleArr });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Registro de clasificación</h3>
            <p className="mt-0.5 text-xs text-slate-500">Editando registro #{clasificacion.codigo} — {clasificacion.galpon}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {/* Header estilo del PHP */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <ReadonlyField label="Galpón" value={clasificacion.galpon} />
          <ReadonlyField label="Fecha" value={fmtFechaHora(clasificacion.fecha)} />
          <ReadonlyField label="Cantidad huevos" value={fmtNumero(clasificacion.cantidad_huevos)} align="right" />
          <ReadonlyField label="Cantidad bajas" value={String(clasificacion.bajas)} align="right" />
          <ReadonlyField
            label="Por clasificar"
            value={fmtNumero(porClasificar)}
            align="right"
            highlight={porClasificar < 0 ? "rojo" : porClasificar === 0 ? "verde" : undefined}
          />
        </div>

        {/* Tabla clasificación */}
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Tipo huevo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Planchas</th>
                <th className="px-4 py-3 text-right">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => {
                const cant = cantidades[t.id] ?? 0;
                const { planchas, unidades } = calcularPlanchasUnidades(cant);
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{t.nombre}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        value={cant}
                        onChange={(e) => setCantidades((prev) => ({ ...prev, [t.id]: Number(e.target.value) || 0 }))}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{planchas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{unidades}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold text-slate-700">
                <td className="px-4 py-2.5">Total clasificado</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtNumero(totalClasificado)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{Math.floor(totalClasificado / HUEVOS_POR_PLANCHA)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{totalClasificado % HUEVOS_POR_PLANCHA}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          1 plancha = {HUEVOS_POR_PLANCHA} huevos · las unidades son los sobrantes que no llenan una plancha completa.
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button
            type="button"
            onClick={guardar}
            className="rounded-md bg-[#22c55e] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#16a34a]"
          >
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadonlyField({
  label, value, align, highlight,
}: {
  label: string; value: string; align?: "right"; highlight?: "verde" | "rojo";
}) {
  const cls =
    highlight === "verde" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : highlight === "rojo" ? "text-rose-700 bg-rose-50 border-rose-200"
    : "text-slate-700 bg-slate-50 border-slate-200";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <div className={`rounded-md border px-3 py-2 text-sm font-medium tabular-nums ${cls} ${align === "right" ? "text-right" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/* ─── MODAL: catálogo de tipos de huevo ──────────────────────────────────── */

function ModalTipos({
  tipos, setTipos, onClose,
}: {
  tipos: TipoHuevo[];
  setTipos: React.Dispatch<React.SetStateAction<TipoHuevo[]>>;
  onClose: () => void;
}) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState("");

  function agregar() {
    const n = nuevoNombre.trim();
    if (!n) return;
    const nextCodigo = tipos.length > 0 ? Math.max(...tipos.map((t) => t.codigo)) + 1 : 1;
    setTipos((prev) => [...prev, { id: crypto.randomUUID(), codigo: nextCodigo, nombre: n }]);
    setNuevoNombre("");
  }

  function guardarEdit() {
    if (!editandoId) return;
    const n = editandoNombre.trim();
    if (!n) return;
    setTipos((prev) => prev.map((t) => (t.id === editandoId ? { ...t, nombre: n } : t)));
    setEditandoId(null);
    setEditandoNombre("");
  }

  function borrar(id: string) {
    setTipos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Tipos de huevos</h3>
            <p className="mt-0.5 text-xs text-slate-500">Catálogo de tamaños/tipos usados en la clasificación.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {/* Formulario alta */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nuevoNombre.trim()) agregar(); }}
            placeholder="Nombre del tipo (ej: Doble yema)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={agregar}
            className="rounded-md bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16a34a]"
          >
            + Agregar
          </button>
        </div>

        {/* Tabla catálogo */}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 w-16">Cod.</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {tipos.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-sm">Sin tipos definidos.</td></tr>
              ) : tipos.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{t.codigo}</td>
                  <td className="px-4 py-2">
                    {editandoId === t.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editandoNombre}
                        onChange={(e) => setEditandoNombre(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") guardarEdit(); if (e.key === "Escape") { setEditandoId(null); setEditandoNombre(""); } }}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{t.nombre}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {editandoId === t.id ? (
                        <>
                          <button type="button" onClick={guardarEdit} className="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Guardar</button>
                          <button type="button" onClick={() => { setEditandoId(null); setEditandoNombre(""); }} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => { setEditandoId(t.id); setEditandoNombre(t.nombre); }} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Editar</button>
                          <button type="button" onClick={() => borrar(t.id)} className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">Borrar</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── MODAL: nueva clasificación (paso 1: cabecera) ──────────────────────── */

const GALPONES_OPCIONES_CLAS = ["GALPON 1", "GALPON 2", "GALPON 3", "GALPON 4"];

function ahoraIsoLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ModalNueva({
  onClose, onCrear,
}: {
  onClose: () => void;
  onCrear: (base: Omit<Clasificacion, "id" | "codigo" | "detalle">) => void;
}) {
  const [galpon, setGalpon] = useState(GALPONES_OPCIONES_CLAS[0]);
  const [fecha, setFecha] = useState(ahoraIsoLocal());
  const [cantidad, setCantidad] = useState("");
  const [bajas, setBajas] = useState("0");
  const [responsable, setResponsable] = useState("");
  const [fechaDist, setFechaDist] = useState("");
  const [respDist, setRespDist] = useState("");
  const [error, setError] = useState<string | null>(null);

  function crear() {
    if (!galpon) { setError("Seleccioná un galpón."); return; }
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c <= 0) { setError("La cantidad de huevos debe ser mayor a 0."); return; }
    const b = Number(bajas);
    if (!Number.isFinite(b) || b < 0) { setError("Las bajas deben ser un número positivo o cero."); return; }
    if (!responsable.trim()) { setError("El responsable es obligatorio."); return; }
    onCrear({
      galpon,
      fecha: fecha || ahoraIsoLocal(),
      cantidad_huevos: c,
      bajas: b,
      responsable: responsable.trim(),
      fecha_distribucion: fechaDist || null,
      resp_distribucion: respDist.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Nueva clasificación</h3>
            <p className="mt-0.5 text-xs text-slate-500">Paso 1 — cargá los datos base. Después vas a clasificar por tipo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Galpón *</label>
              <select
                value={galpon}
                onChange={(e) => setGalpon(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                {GALPONES_OPCIONES_CLAS.map((g) => <option key={g} value={g}>{g}</option>)}
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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Cantidad huevos *</label>
              <input
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Ej: 9780"
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
              placeholder="Ej: luzovelar"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Distribución (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Fecha distribución</label>
                <input
                  type="datetime-local"
                  step={1}
                  value={fechaDist}
                  onChange={(e) => setFechaDist(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Resp. distribución</label>
                <input
                  type="text"
                  value={respDist}
                  onChange={(e) => setRespDist(e.target.value)}
                  placeholder="Ej: luzovelar"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
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
            onClick={crear}
            className="rounded-md bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md active:scale-[.98]"
          >
            Continuar a clasificar →
          </button>
        </div>
      </div>
    </div>
  );
}

