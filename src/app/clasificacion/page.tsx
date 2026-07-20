"use client";

import { useEffect, useMemo, useState } from "react";
import { Egg, ListChecks, Layers, Sparkles, PiggyBank, Tags } from "lucide-react";

type TipoHuevo = { id: string; codigo: number; nombre: string; producto_id?: string | null };
type ProduccionOpt = { id: string; codigo: number; galpon: string; fecha: string; cantidad_huevos: number; bajas: number; responsable: string };
type ProductoOpt = { id: string; nombre: string; sku: string | null };

type LineaClasificacion = {
  tipo_huevo_id: string;
  cantidad: number;
  planchas_generadas: number;
  unidades_sobrantes: number;
};

const HUEVOS_POR_PLANCHA = 30;
function calcularPlanchasUnidades(cantidad: number): { planchas: number; unidades: number } {
  const n = Math.max(0, Math.trunc(cantidad));
  return { planchas: Math.floor(n / HUEVOS_POR_PLANCHA), unidades: n % HUEVOS_POR_PLANCHA };
}

type Clasificacion = {
  id: string;
  produccion_id: string;
  codigo: number;
  galpon_id: string;
  galpon: string;
  fecha: string;
  cantidad_huevos: number;
  bajas: number;
  responsable: string;
  fecha_distribucion: string | null;
  resp_distribucion: string;
  stock_aplicado: boolean;
  detalle: LineaClasificacion[];
};

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
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch { return iso; }
}

export default function ClasificacionPage() {
  const [clasificaciones, setClasificaciones] = useState<Clasificacion[]>([]);
  const [tipos, setTipos] = useState<TipoHuevo[]>([]);
  const [produccionesSinClasificar, setProduccionesSinClasificar] = useState<ProduccionOpt[]>([]);
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [acumulador, setAcumulador] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Clasificacion | null>(null);
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [tiposModalOpen, setTiposModalOpen] = useState(false);
  const [toastMensaje, setToastMensaje] = useState<string | null>(null);

  async function cargarTodo() {
    setCargando(true);
    setErrorGeneral(null);
    try {
      const [rC, rT, rPr, rS, rP] = await Promise.all([
        fetch("/api/granja/clasificaciones", { cache: "no-store" }),
        fetch("/api/granja/tipos-huevo", { cache: "no-store" }),
        fetch("/api/granja/producciones", { cache: "no-store" }),
        fetch("/api/granja/sueltos", { cache: "no-store" }),
        fetch("/api/productos", { cache: "no-store" }),
      ]);
      const [jC, jT, jPr, jS, jP] = await Promise.all([rC.json(), rT.json(), rPr.json(), rS.json(), rP.json()]);
      if (!rC.ok) throw new Error(jC?.error?.message ?? jC?.error ?? "Error cargando clasificaciones");
      if (!rT.ok) throw new Error(jT?.error?.message ?? jT?.error ?? "Error cargando tipos");
      if (!rPr.ok) throw new Error(jPr?.error?.message ?? jPr?.error ?? "Error cargando producciones");
      if (!rS.ok) throw new Error(jS?.error?.message ?? jS?.error ?? "Error cargando sueltos");
      setClasificaciones(jC.data?.clasificaciones ?? []);
      setTipos(jT.data?.tipos ?? []);
      const producciones = (jPr.data?.producciones ?? []) as Array<{ id: string; codigo: number; galpon: string; fecha: string; cantidad_huevos: number; bajas: number; responsable: string; clasificada?: boolean }>;
      setProduccionesSinClasificar(producciones.filter((p) => !p.clasificada));
      setAcumulador(jS.data?.acumulador ?? {});
      if (rP.ok) {
        setProductos((jP.data?.productos ?? []).map((p: { id: string; nombre: string; sku: string | null }) => ({ id: p.id, nombre: p.nombre, sku: p.sku })));
      }
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarTodo(); }, []);

  async function crearCabecera(produccion_id: string, resp_distribucion: string, fecha_distribucion: string | null): Promise<{ ok: boolean; error?: string; clasificacion?: Clasificacion }> {
    try {
      const r = await fetch("/api/granja/clasificaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ produccion_id, resp_distribucion, fecha_distribucion }),
      });
      const j = await r.json();
      if (!r.ok) return { ok: false, error: j?.error?.message ?? j?.error ?? "Error al crear" };
      const c = j.data?.clasificacion as Clasificacion;
      setClasificaciones((prev) => [c, ...prev]);
      setProduccionesSinClasificar((prev) => prev.filter((p) => p.id !== produccion_id));
      return { ok: true, clasificacion: c };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error" };
    }
  }

  async function guardarDetalle(clasId: string, detalle: LineaClasificacion[]): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await fetch(`/api/granja/clasificaciones/${clasId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          detalle: detalle.map((d) => ({ tipo_huevo_id: d.tipo_huevo_id, cantidad: d.cantidad })),
        }),
      });
      const j = await r.json();
      if (!r.ok) return { ok: false, error: j?.error?.message ?? j?.error ?? "Error al guardar" };
      const planchas = (j.data?.planchas_generadas ?? []) as Array<{ tipo_huevo_id: string; planchas: number }>;
      if (planchas.length > 0) {
        const detTxt = planchas.map((p) => {
          const nombre = tipos.find((t) => t.id === p.tipo_huevo_id)?.nombre ?? p.tipo_huevo_id;
          return `${p.planchas} de ${nombre}`;
        }).join(" · ");
        setToastMensaje(detTxt);
        setTimeout(() => setToastMensaje(null), 6000);
      }
      await cargarTodo();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error" };
    }
  }

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
              disabled={produccionesSinClasificar.length === 0}
              className="rounded-lg bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/30 ring-1 ring-white/10 transition-all hover:shadow-md hover:from-[#3F8E91] hover:to-[#357577] active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed"
              title={produccionesSinClasificar.length === 0 ? "No hay producciones sin clasificar" : ""}
            >
              + Nueva clasificación
            </button>
          </div>
        </div>
      </div>

      {errorGeneral && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorGeneral}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Registros de producción" value={String(clasificaciones.length)} icon={<Layers className="h-5 w-5" />} tone="slate" />
        <KpiCard label="Total de huevos" value={fmtNumero(totalHuevos)} icon={<Egg className="h-5 w-5" />} tone="sky" />
        <KpiCard label="Tipos de huevo definidos" value={String(tipos.length)} icon={<Tags className="h-5 w-5" />} tone="emerald" />
      </div>

      <SueltosPanel tipos={tipos} acumulador={acumulador} />

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
              {cargando ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-400">Cargando clasificaciones…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-400">Sin registros que coincidan.</td></tr>
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
                    <td className="px-5 py-4 text-slate-700">{c.resp_distribucion || "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {c.stock_aplicado && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Aplicada</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditando(c)}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          {c.stock_aplicado ? "Editar" : "Clasificar"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const msg = c.stock_aplicado
                              ? `¿Borrar la clasificación #${c.codigo}? Esto REVIERTE el stock: se van a restar las planchas del inventario.`
                              : `¿Borrar la clasificación #${c.codigo}?`;
                            if (!confirm(msg)) return;
                            try {
                              const r = await fetch(`/api/granja/clasificaciones/${c.id}`, { method: "DELETE" });
                              const j = await r.json();
                              if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? "Error al borrar");
                              await cargarTodo();
                            } catch (e) {
                              alert(e instanceof Error ? e.message : "Error");
                            }
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
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

      {editando && (
        <ModalClasificacion
          clasificacion={editando}
          tipos={tipos}
          onClose={() => setEditando(null)}
          onGuardar={async (detalle) => {
            const r = await guardarDetalle(editando.id, detalle);
            if (r.ok) setEditando(null);
            return r;
          }}
        />
      )}

      {nuevaOpen && (
        <ModalNueva
          producciones={produccionesSinClasificar}
          onClose={() => setNuevaOpen(false)}
          onCrear={async (produccionId, respDist, fechaDist) => {
            const r = await crearCabecera(produccionId, respDist, fechaDist);
            if (r.ok && r.clasificacion) {
              setNuevaOpen(false);
              setEditando(r.clasificacion);
            }
            return r;
          }}
        />
      )}

      {tiposModalOpen && (
        <ModalTipos
          tipos={tipos}
          productos={productos}
          onClose={() => setTiposModalOpen(false)}
          onChange={cargarTodo}
        />
      )}

      {toastMensaje && (
        <div className="fixed bottom-6 right-6 z-[60] max-w-sm animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-2xl ring-1 ring-emerald-200/50">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-900">Planchas armadas automáticamente</p>
                <p className="mt-0.5 text-xs text-emerald-800">{toastMensaje}</p>
              </div>
              <button type="button" onClick={() => setToastMensaje(null)} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-100" aria-label="Cerrar">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SueltosPanel({ tipos, acumulador }: { tipos: TipoHuevo[]; acumulador: Record<string, number> }) {
  const totalSueltos = Object.values(acumulador).reduce((s, n) => s + (n || 0), 0);
  const paletas: Record<string, { grad: string; text: string; bar: string; border: string }> = {
    "0": { grad: "from-amber-100 to-amber-50",     text: "text-amber-800",    bar: "bg-amber-500",    border: "border-amber-200" },
    "1": { grad: "from-sky-100 to-sky-50",         text: "text-sky-800",      bar: "bg-sky-500",      border: "border-sky-200" },
    "2": { grad: "from-emerald-100 to-emerald-50", text: "text-emerald-800",  bar: "bg-emerald-500",  border: "border-emerald-200" },
    "3": { grad: "from-indigo-100 to-indigo-50",   text: "text-indigo-800",   bar: "bg-indigo-500",   border: "border-indigo-200" },
    "4": { grad: "from-purple-100 to-purple-50",   text: "text-purple-800",   bar: "bg-purple-500",   border: "border-purple-200" },
    "5": { grad: "from-orange-100 to-orange-50",   text: "text-orange-800",   bar: "bg-orange-500",   border: "border-orange-200" },
    "6": { grad: "from-rose-100 to-rose-50",       text: "text-rose-800",     bar: "bg-rose-500",     border: "border-rose-200" },
    "7": { grad: "from-teal-100 to-teal-50",       text: "text-teal-800",     bar: "bg-teal-500",     border: "border-teal-200" },
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 ring-1 ring-amber-200/60">
              <PiggyBank className="h-3.5 w-3.5" />
            </span>
            Huevos sueltos acumulados
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Los sobrantes de cada clasificación se acumulan por tipo. Al llegar a 30, se arma una plancha automáticamente y va al inventario.
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
          {totalSueltos} sueltos en total
        </span>
      </div>

      {tipos.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Todavía no hay tipos de huevo definidos. Cargalos desde el botón "Tipos de huevos".</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tipos.map((t, idx) => {
            const cant = acumulador[t.id] ?? 0;
            const porcentaje = Math.min(100, (cant / HUEVOS_POR_PLANCHA) * 100);
            const restan = Math.max(0, HUEVOS_POR_PLANCHA - cant);
            const casiLleno = cant >= HUEVOS_POR_PLANCHA - 3 && cant > 0;
            const p = paletas[String(idx % 8)];
            return (
              <div key={t.id} className={`rounded-xl border bg-gradient-to-br ${p.grad} ${p.border} p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-bold uppercase tracking-wide ${p.text}`}>{t.nombre}</p>
                  {casiLleno && (
                    <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800 ring-1 ring-amber-300/50 animate-pulse">
                      ¡Casi!
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <p className={`text-2xl font-bold tabular-nums leading-none ${p.text}`}>{cant}</p>
                  <p className={`text-[10px] font-medium ${p.text} opacity-70`}>/ 30 huevos</p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                  <div className={`h-full ${p.bar} transition-all duration-500 ease-out`} style={{ width: `${porcentaje}%` }} />
                </div>
                <p className={`mt-1 text-[10px] ${p.text} opacity-80`}>
                  {cant === 0 ? "Sin sueltos" : cant >= HUEVOS_POR_PLANCHA ? "¡Plancha lista!" : `Faltan ${restan} para plancha`}
                </p>
              </div>
            );
          })}
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

/* ─── MODAL: clasificar detalle ───────────────────────────────────────────── */

function ModalClasificacion({
  clasificacion, tipos, onClose, onGuardar,
}: {
  clasificacion: Clasificacion;
  tipos: TipoHuevo[];
  onClose: () => void;
  onGuardar: (detalle: LineaClasificacion[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [cantidades, setCantidades] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {};
    for (const t of tipos) {
      const existente = clasificacion.detalle.find((d) => d.tipo_huevo_id === t.id);
      base[t.id] = existente?.cantidad ?? 0;
    }
    return base;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalClasificado = Object.values(cantidades).reduce((s, n) => s + (n || 0), 0);
  const porClasificar = clasificacion.cantidad_huevos - totalClasificado;

  async function guardar() {
    setError(null);
    if (porClasificar < 0) {
      setError(`Clasificaste ${Math.abs(porClasificar)} huevos de más. Ajustá las cantidades.`);
      return;
    }
    if (porClasificar > 0) {
      if (!confirm(`Todavía quedan ${porClasificar} huevos sin clasificar. ¿Registrar igual?`)) return;
    }
    setGuardando(true);
    const detalleArr: LineaClasificacion[] = tipos.map((t) => {
      const cant = cantidades[t.id] ?? 0;
      const { planchas, unidades } = calcularPlanchasUnidades(cant);
      return { tipo_huevo_id: t.id, cantidad: cant, planchas_generadas: planchas, unidades_sobrantes: unidades };
    }).filter((d) => d.cantidad > 0);
    const r = await onGuardar(detalleArr);
    setGuardando(false);
    if (!r.ok) setError(r.error ?? "Error al guardar");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Registro de clasificación</h3>
            <p className="mt-0.5 text-xs text-slate-500">Producción #{clasificacion.codigo} — {clasificacion.galpon}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ReadonlyField label="Galpón" value={clasificacion.galpon} />
          <ReadonlyField label="Fecha" value={fmtFechaHora(clasificacion.fecha)} />
          <ReadonlyField
            label="Huevos a clasificar"
            value={fmtNumero(clasificacion.cantidad_huevos)}
            align="right"
          />
          <ReadonlyField
            label="Por clasificar"
            value={fmtNumero(porClasificar)}
            align="right"
            highlight={porClasificar < 0 ? "rojo" : porClasificar === 0 ? "verde" : undefined}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Se recolectaron <strong>{fmtNumero(clasificacion.cantidad_huevos)}</strong> huevos para clasificar por tipo.
          {clasificacion.bajas > 0 && <> Ese día también hubo <strong>{clasificacion.bajas}</strong> baja(s) de gallinas (no afecta la cuenta de huevos).</>}
          {" "}<strong>Por clasificar</strong> tiene que llegar a 0 para registrar.
        </p>

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
              {tipos.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">Sin tipos de huevo cargados. Definilos primero desde "Tipos de huevos".</td></tr>
              ) : tipos.map((t) => {
                const cant = cantidades[t.id] ?? 0;
                const { planchas, unidades } = calcularPlanchasUnidades(cant);
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{t.nombre}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        value={cant === 0 ? "" : cant}
                        placeholder="0"
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

        {clasificacion.stock_aplicado && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta clasificación ya fue aplicada al inventario. Si guardás cambios, el stock se ajusta automáticamente (delta entre el detalle anterior y el nuevo).
          </div>
        )}
        {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || tipos.length === 0}
            className="rounded-md bg-[#22c55e] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#16a34a] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : clasificacion.stock_aplicado ? "Guardar cambios y ajustar inventario" : "Registrar y aplicar a inventario"}
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

/* ─── MODAL: catálogo de tipos de huevo ─────────────────────────────────── */

function ModalTipos({
  tipos, productos, onClose, onChange,
}: {
  tipos: TipoHuevo[];
  productos: ProductoOpt[];
  onClose: () => void;
  onChange: () => Promise<void> | void;
}) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function agregar() {
    const n = nuevoNombre.trim();
    if (!n) return;
    setPendiente(true); setError(null);
    try {
      const r = await fetch("/api/granja/tipos-huevo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: n }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? "Error");
      setNuevoNombre("");
      await onChange();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setPendiente(false); }
  }

  async function guardarEdit() {
    if (!editandoId) return;
    const n = editandoNombre.trim();
    if (!n) return;
    setPendiente(true); setError(null);
    try {
      const r = await fetch(`/api/granja/tipos-huevo/${editandoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: n }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? "Error");
      setEditandoId(null); setEditandoNombre("");
      await onChange();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setPendiente(false); }
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar este tipo de huevo?")) return;
    setPendiente(true); setError(null);
    try {
      const r = await fetch(`/api/granja/tipos-huevo/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? "Error");
      await onChange();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setPendiente(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Tipos de huevos</h3>
            <p className="mt-0.5 text-xs text-slate-500">Catálogo de tamaños/tipos usados en la clasificación.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nuevoNombre.trim()) agregar(); }}
            placeholder="Nombre del tipo (ej: Doble yema)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <button type="button" onClick={agregar} disabled={pendiente} className="rounded-md bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16a34a] disabled:opacity-60">+ Agregar</button>
        </div>

        {error && <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        <p className="mt-4 text-[11px] text-slate-500">
          Vinculá cada tipo con un producto del inventario. Al aplicar una clasificación, las planchas suman stock al producto vinculado.
        </p>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 w-14">Cod.</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Producto inventario</th>
                <th className="px-4 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {tipos.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">Sin tipos definidos.</td></tr>
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
                  <td className="px-4 py-2">
                    <select
                      value={t.producto_id ?? ""}
                      onChange={async (e) => {
                        setPendiente(true); setError(null);
                        try {
                          const r = await fetch(`/api/granja/tipos-huevo/${t.id}`, {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ producto_id: e.target.value || null }),
                          });
                          const j = await r.json();
                          if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? "Error");
                          await onChange();
                        } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
                        finally { setPendiente(false); }
                      }}
                      className="w-full max-w-[220px] rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">— sin vincular —</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` (${p.sku})` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {editandoId === t.id ? (
                        <>
                          <button type="button" onClick={guardarEdit} disabled={pendiente} className="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">Guardar</button>
                          <button type="button" onClick={() => { setEditandoId(null); setEditandoNombre(""); }} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => { setEditandoId(t.id); setEditandoNombre(t.nombre); }} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Editar</button>
                          <button type="button" onClick={() => borrar(t.id)} disabled={pendiente} className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60">Borrar</button>
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

/* ─── MODAL: nueva clasificación (elegir producción a clasificar) ────────── */

function ModalNueva({
  producciones, onClose, onCrear,
}: {
  producciones: ProduccionOpt[];
  onClose: () => void;
  onCrear: (produccion_id: string, resp_distribucion: string, fecha_distribucion: string | null) => Promise<{ ok: boolean; error?: string; clasificacion?: Clasificacion }>;
}) {
  const [produccionId, setProduccionId] = useState(producciones[0]?.id ?? "");
  const [respDist, setRespDist] = useState("");
  const [fechaDist, setFechaDist] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    if (!produccionId && producciones[0]) setProduccionId(producciones[0].id);
  }, [producciones, produccionId]);

  const seleccionada = producciones.find((p) => p.id === produccionId);

  async function crear() {
    if (!produccionId) { setError("Seleccioná una producción."); return; }
    setPendiente(true); setError(null);
    const r = await onCrear(
      produccionId,
      respDist.trim(),
      fechaDist ? new Date(fechaDist).toISOString() : null
    );
    setPendiente(false);
    if (!r.ok) setError(r.error ?? "Error al crear");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Nueva clasificación</h3>
            <p className="mt-0.5 text-xs text-slate-500">Elegí una producción sin clasificar para procesar.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Producción a clasificar *</label>
            {producciones.length === 0 ? (
              <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No hay producciones sin clasificar. Creá una en /produccion primero.
              </p>
            ) : (
              <select
                value={produccionId}
                onChange={(e) => setProduccionId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                {producciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.codigo} — {p.galpon} — {fmtFechaHora(p.fecha)} — {fmtNumero(p.cantidad_huevos)} huevos
                  </option>
                ))}
              </select>
            )}
          </div>

          {seleccionada && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Datos heredados</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Galpón:</span> <span className="font-medium text-slate-800">{seleccionada.galpon}</span></div>
                <div><span className="text-slate-500">Responsable:</span> <span className="font-medium text-slate-800">{seleccionada.responsable}</span></div>
                <div><span className="text-slate-500">Huevos:</span> <span className="font-medium text-slate-800 tabular-nums">{fmtNumero(seleccionada.cantidad_huevos)}</span></div>
                <div><span className="text-slate-500">Bajas:</span> <span className="font-medium text-slate-800 tabular-nums">{seleccionada.bajas}</span></div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Distribución (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Fecha distribución</label>
                <div className="mt-1 flex gap-1">
                  <input
                    type="datetime-local"
                    value={fechaDist}
                    onChange={(e) => setFechaDist(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      const pad = (n: number) => String(n).padStart(2, "0");
                      setFechaDist(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                    }}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    title="Ahora"
                  >
                    Hoy
                  </button>
                </div>
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
          <button type="button" onClick={onClose} disabled={pendiente} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancelar</button>
          <button
            type="button"
            onClick={crear}
            disabled={pendiente || producciones.length === 0}
            className="rounded-md bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md active:scale-[.98] disabled:opacity-60"
          >
            {pendiente ? "Creando…" : "Continuar a clasificar →"}
          </button>
        </div>
      </div>
    </div>
  );
}
