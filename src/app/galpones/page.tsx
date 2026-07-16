"use client";

import { useMemo, useState } from "react";
import { Warehouse } from "lucide-react";

/**
 * DEMO estática del módulo Galpones — sin conexión a la DB.
 * Solo para revisar diseño e interacción antes de conectar backend.
 */

type Galpon = {
  id: string;
  codigo: number;
  nombre: string;
  inicial_gallinas: number;
  fecha_inicio: string | null; // YYYY-MM-DD
  fecha_fin: string | null;     // null = activo
};

const GALPONES_DEMO: Galpon[] = [
  { id: "1", codigo: 1, nombre: "GALPON 1", inicial_gallinas: 10082, fecha_inicio: "2025-02-01", fecha_fin: null },
  { id: "2", codigo: 2, nombre: "GALPON 2", inicial_gallinas: 12270, fecha_inicio: "2025-04-10", fecha_fin: null },
  { id: "3", codigo: 3, nombre: "GALPON 3", inicial_gallinas: 29100, fecha_inicio: "2025-02-01", fecha_fin: null },
  { id: "4", codigo: 4, nombre: "GALPON 4", inicial_gallinas: 16000, fecha_inicio: "2025-02-01", fecha_fin: "2026-01-15" },
];

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNumero(n: number): string {
  return n.toLocaleString("es-PY");
}

export default function GalponesPage() {
  const [galpones, setGalpones] = useState<Galpon[]>(GALPONES_DEMO);
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState<null | { modo: "nuevo" } | { modo: "editar"; g: Galpon }>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<Galpon | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return galpones;
    return galpones.filter((g) => g.nombre.toLowerCase().includes(q));
  }, [galpones, busqueda]);

  const totalActivos = galpones.filter((g) => !g.fecha_fin).length;
  const totalGallinas = galpones.reduce((s, g) => s + g.inicial_gallinas, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" style={{ boxShadow: "0 0 0 3px rgba(79,174,178,0.18)" }} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Operaciones</p>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Warehouse className="h-6 w-6 text-[#4FAEB2]" />
              Galpones
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">Gestión de lotes de gallinas ponedoras por galpón.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen({ modo: "nuevo" })}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nuevo galpón
          </button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total de galpones" value={String(galpones.length)} />
        <KpiCard label="Galpones activos" value={String(totalActivos)} accentColor="#22c55e" />
        <KpiCard label="Total gallinas iniciales" value={fmtNumero(totalGallinas)} />
      </div>

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
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    Sin galpones que coincidan.
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

      <p className="text-[11px] text-slate-400 italic">
        Demo visual — los cambios no se guardan (todavía no está conectado a la base de datos).
      </p>

      {/* Modal Nuevo / Editar */}
      {modalOpen && (
        <ModalFormulario
          modo={modalOpen.modo}
          galpon={modalOpen.modo === "editar" ? modalOpen.g : null}
          onClose={() => setModalOpen(null)}
          onGuardar={(g) => {
            if (modalOpen.modo === "editar") {
              setGalpones((prev) => prev.map((x) => (x.id === g.id ? g : x)));
            } else {
              const nextCodigo = galpones.length > 0 ? Math.max(...galpones.map((x) => x.codigo)) + 1 : 1;
              setGalpones((prev) => [...prev, { ...g, id: crypto.randomUUID(), codigo: nextCodigo }]);
            }
            setModalOpen(null);
          }}
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
                onClick={() => {
                  setGalpones((prev) => prev.filter((x) => x.id !== confirmarBorrar.id));
                  setConfirmarBorrar(null);
                }}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
              >
                Borrar galpón
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, accentColor }: { label: string; value: string; accentColor?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: accentColor ?? "#0f172a" }}>{value}</p>
    </div>
  );
}

function ModalFormulario({
  modo, galpon, onClose, onGuardar,
}: {
  modo: "nuevo" | "editar";
  galpon: Galpon | null;
  onClose: () => void;
  onGuardar: (g: Galpon) => void;
}) {
  const [nombre, setNombre] = useState(galpon?.nombre ?? "");
  const [gallinas, setGallinas] = useState(galpon?.inicial_gallinas != null ? String(galpon.inicial_gallinas) : "");
  const [fechaInicio, setFechaInicio] = useState(galpon?.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(galpon?.fecha_fin ?? "");
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const n = Number(gallinas);
    if (!Number.isFinite(n) || n < 0) { setError("La cantidad de gallinas debe ser un número positivo."); return; }
    onGuardar({
      id: galpon?.id ?? "",
      codigo: galpon?.codigo ?? 0,
      nombre: nombre.trim().toUpperCase(),
      inicial_gallinas: n,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
    });
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
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Fecha de fin</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
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
            {modo === "nuevo" ? "Crear galpón" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
