"use client";

import { useEffect, useMemo, useState } from "react";
import { Warehouse, Home, CheckCircle2, Users } from "lucide-react";
import GranjaStepper from "@/components/granja/GranjaStepper";

/**
 * Módulo Galpones — conectado a la base de datos (abhuevos.granja_galpones).
 */

type Galpon = {
  id: string;
  codigo: number;
  nombre: string;
  inicial_gallinas: number;
  fecha_inicio: string | null; // YYYY-MM-DD
  fecha_fin: string | null;     // null = activo
};

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNumero(n: number): string {
  return n.toLocaleString("es-PY");
}

export default function GalponesPage() {
  const [galpones, setGalpones] = useState<Galpon[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState<null | { modo: "nuevo" } | { modo: "editar"; g: Galpon }>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<Galpon | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/granja/galpones", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (cancelado) return;
        if (!r.ok || j?.success === false) {
          setErrorCarga(j?.error ?? "No se pudieron cargar los galpones.");
          return;
        }
        setGalpones((j?.data?.galpones ?? []) as Galpon[]);
      } catch (e) {
        if (!cancelado) setErrorCarga(e instanceof Error ? e.message : "Error de red.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  async function crearOEditar(input: { modo: "nuevo" | "editar"; g: Galpon }): Promise<{ ok: boolean; error?: string }> {
    setGuardando(true);
    try {
      const url = input.modo === "nuevo" ? "/api/granja/galpones" : `/api/granja/galpones/${encodeURIComponent(input.g.id)}`;
      const method = input.modo === "nuevo" ? "POST" : "PATCH";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: input.g.nombre,
          inicial_gallinas: input.g.inicial_gallinas,
          fecha_inicio: input.g.fecha_inicio,
          fecha_fin: input.g.fecha_fin,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        return { ok: false, error: j?.error ?? "No se pudo guardar." };
      }
      const nuevo = j?.data?.galpon as Galpon;
      if (input.modo === "nuevo") {
        setGalpones((prev) => [...prev, nuevo].sort((a, b) => a.codigo - b.codigo));
      } else {
        setGalpones((prev) => prev.map((x) => (x.id === nuevo.id ? nuevo : x)));
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(g: Galpon): Promise<{ ok: boolean; error?: string }> {
    setGuardando(true);
    try {
      const r = await fetch(`/api/granja/galpones/${encodeURIComponent(g.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        return { ok: false, error: j?.error ?? "No se pudo borrar." };
      }
      setGalpones((prev) => prev.filter((x) => x.id !== g.id));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
    } finally {
      setGuardando(false);
    }
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return galpones;
    return galpones.filter((g) => g.nombre.toLowerCase().includes(q));
  }, [galpones, busqueda]);

  const totalActivos = galpones.filter((g) => !g.fecha_fin).length;
  const totalGallinas = galpones.reduce((s, g) => s + g.inicial_gallinas, 0);

  return (
    <div className="space-y-6">
      <GranjaStepper current="galpones" />

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
                <Warehouse className="h-5 w-5 text-[#4FAEB2]" />
              </span>
              Galpones
            </h1>
            <p className="mt-1 text-sm text-slate-500">Gestión de lotes de gallinas ponedoras por galpón.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen({ modo: "nuevo" })}
            className="rounded-lg bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/30 ring-1 ring-white/10 transition-all hover:shadow-md hover:from-[#3F8E91] hover:to-[#357577] active:scale-[.98]"
          >
            + Nuevo galpón
          </button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total de galpones" value={String(galpones.length)} icon={<Home className="h-5 w-5" />} tone="slate" />
        <KpiCard label="Galpones activos" value={String(totalActivos)} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        <KpiCard label="Total gallinas iniciales" value={fmtNumero(totalGallinas)} icon={<Users className="h-5 w-5" />} tone="sky" />
      </div>

      {errorCarga && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorCarga}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9] sm:max-w-md"
          />
          <span className="ml-auto text-xs text-slate-500">{filtrados.length} de {galpones.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 w-14">Cod.</th>
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3 text-right">Gallinas iniciales</th>
                <th className="px-5 py-3">Fec. inicio</th>
                <th className="px-5 py-3">Fec. fin</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400 animate-pulse">
                    Cargando galpones…
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    {galpones.length === 0 ? "Todavía no hay galpones registrados." : "Sin galpones que coincidan."}
                  </td>
                </tr>
              ) : (
                filtrados.map((g) => (
                  <tr key={g.id} className="border-b border-slate-100 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">{g.codigo}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{g.nombre}</td>
                    <td className="px-5 py-4 text-right tabular-nums font-medium text-slate-700">{fmtNumero(g.inicial_gallinas)}</td>
                    <td className="px-5 py-4 text-slate-700 tabular-nums">{fmtFecha(g.fecha_inicio)}</td>
                    <td className="px-5 py-4 text-slate-700 tabular-nums">{fmtFecha(g.fecha_fin)}</td>
                    <td className="px-5 py-4">
                      {g.fecha_fin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Cerrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Activo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModalOpen({ modo: "editar", g })}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrar(g)}
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


      {/* Modal Nuevo / Editar */}
      {modalOpen && (
        <ModalFormulario
          modo={modalOpen.modo}
          galpon={modalOpen.modo === "editar" ? modalOpen.g : null}
          guardando={guardando}
          onClose={() => setModalOpen(null)}
          onGuardar={async (g) => {
            const res = await crearOEditar({ modo: modalOpen.modo, g });
            return res;
          }}
          onSuccess={() => setModalOpen(null)}
        />
      )}

      {/* Modal borrar */}
      {confirmarBorrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm" onClick={() => setConfirmarBorrar(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">Borrar galpón</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Vas a borrar <span className="font-semibold text-slate-900">&quot;{confirmarBorrar.nombre}&quot;</span>. Esta acción no se puede deshacer.
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
                disabled={guardando}
                onClick={async () => {
                  const res = await borrar(confirmarBorrar);
                  if (res.ok) setConfirmarBorrar(null);
                  else alert(res.error);
                }}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
              >
                {guardando ? "Borrando…" : "Borrar galpón"}
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

function ModalFormulario({
  modo, galpon, guardando, onClose, onGuardar, onSuccess,
}: {
  modo: "nuevo" | "editar";
  galpon: Galpon | null;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (g: Galpon) => Promise<{ ok: boolean; error?: string }>;
  onSuccess: () => void;
}) {
  const [nombre, setNombre] = useState(galpon?.nombre ?? "");
  const [gallinas, setGallinas] = useState(galpon?.inicial_gallinas != null ? String(galpon.inicial_gallinas) : "");
  const [fechaInicio, setFechaInicio] = useState(galpon?.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(galpon?.fecha_fin ?? "");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const n = Number(gallinas);
    if (!Number.isFinite(n) || n < 0) { setError("La cantidad de gallinas debe ser un número positivo."); return; }
    setError(null);
    const res = await onGuardar({
      id: galpon?.id ?? "",
      codigo: galpon?.codigo ?? 0,
      nombre: nombre.trim().toUpperCase(),
      inicial_gallinas: n,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
    });
    if (!res.ok) setError(res.error ?? "No se pudo guardar.");
    else onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{modo === "nuevo" ? "Nuevo galpón" : "Editar galpón"}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {modo === "nuevo"
                ? "Registrar un nuevo galpón / lote de gallinas."
                : `Editando ${galpon?.nombre}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Nombre *</label>
            <input
              type="text"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: GALPON 5 o G3 Lote 21.10.25"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Gallinas iniciales *</label>
            <input
              type="number"
              min={0}
              value={gallinas}
              onChange={(e) => setGallinas(e.target.value)}
              placeholder="Ej: 10000"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Fecha de inicio</label>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                {fechaInicio && (
                  <button
                    type="button"
                    onClick={() => setFechaInicio("")}
                    title="Borrar fecha"
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Fecha de fin</label>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                {fechaFin && (
                  <button
                    type="button"
                    onClick={() => setFechaFin("")}
                    title="Borrar fecha"
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Vacío = lote activo</p>
            </div>
          </div>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={guardar}
            className="rounded-md bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : (modo === "nuevo" ? "Crear galpón" : "Guardar cambios")}
          </button>
        </div>
      </div>
    </div>
  );
}
