"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, CheckCircle2, XCircle, Search } from "lucide-react";
import {
  PRODUCTOS_DEMO,
  UBICACIONES_DEMO,
  getNRs,
  getNRPorNumero,
  aprobarNR,
  rechazarNR,
  nombreUbicacion,
  type DemoNotaRemision,
} from "@/lib/demo-multideposito/store";

function fmt(n: number) { return n.toLocaleString("es-PY"); }
function fmtFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  } catch { return iso; }
}
function hoyISO() { return new Date().toISOString().slice(0, 10); }

export default function RecepcionNRPage() {
  const [numeroBuscar, setNumeroBuscar] = useState("");
  const [nr, setNr] = useState<DemoNotaRemision | null>(null);
  const [sucursalReceptora, setSucursalReceptora] = useState("abasto_norte");
  const [fechaRecepcion, setFechaRecepcion] = useState(hoyISO());
  const [aprobador, setAprobador] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<DemoNotaRemision[]>([]);

  useEffect(() => {
    setPendientes(getNRs().filter((n) => n.estado === "pendiente"));
  }, []);

  function buscar() {
    setFeedback(null);
    setMotivoRechazo(""); setModoRechazo(false);
    if (!numeroBuscar.trim()) { setFeedback("Ingresá un número de NR."); return; }
    const found = getNRPorNumero(numeroBuscar);
    if (!found) { setFeedback(`No se encontró la NR "${numeroBuscar}".`); setNr(null); return; }
    setNr(found);
    setSucursalReceptora(found.destino);
  }

  function tomarPendiente(id: string) {
    const found = getNRs().find((n) => n.id === id);
    if (!found) return;
    setNr(found);
    setSucursalReceptora(found.destino);
    setNumeroBuscar(found.numero);
    setFeedback(null);
    setMotivoRechazo(""); setModoRechazo(false);
    window.scrollTo({ top: 200, behavior: "smooth" });
  }

  function aprobar() {
    if (!nr) return;
    if (!aprobador.trim()) { setFeedback("Cargá quien recibe."); return; }
    const r = aprobarNR(nr.id, aprobador.trim());
    if (!r.ok) { setFeedback(r.error); return; }
    setFeedback(`✓ NR ${nr.numero} recibida. Stock transferido a ${nombreUbicacion(nr.destino)}.`);
    setNr(r.nr);
    setPendientes(getNRs().filter((n) => n.estado === "pendiente"));
  }

  function rechazar() {
    if (!nr) return;
    if (!motivoRechazo.trim()) { setFeedback("Motivo obligatorio."); return; }
    const r = rechazarNR(nr.id, motivoRechazo.trim());
    if (!r.ok) { setFeedback(r.error); return; }
    setFeedback(`NR ${nr.numero} rechazada.`);
    setNr(r.nr);
    setModoRechazo(false);
    setPendientes(getNRs().filter((n) => n.estado === "pendiente"));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-sky-50/40 to-sky-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/40 bg-sky-100/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-600" /> Recepción
          </span>
        </div>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <span className="rounded-lg bg-white p-1.5 ring-1 ring-sky-300/40 shadow-sm">
            <Inbox className="h-5 w-5 text-sky-700" />
          </span>
          Recepción de Nota de Remisión
        </h1>
        <p className="mt-1 text-sm text-slate-500">Buscá una NR pendiente por número o elegí una de la lista. Al aprobar, el stock se transfiere al depósito destino.</p>
      </div>

      {feedback && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Buscar NR</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Sucursal receptora</label>
            <select value={sucursalReceptora} onChange={(e) => setSucursalReceptora(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
              {UBICACIONES_DEMO.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Fecha Recepción</label>
            <input type="date" value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-600">Nro. documento NR</label>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                value={numeroBuscar}
                onChange={(e) => setNumeroBuscar(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
                placeholder="Ej: NR-000001"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button type="button" onClick={buscar} className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 inline-flex items-center gap-1.5">
                <Search className="h-4 w-4" /> Buscar
              </button>
            </div>
          </div>
        </div>

        {pendientes.length > 0 && !nr && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500 mb-2">O elegí una NR pendiente:</p>
            <div className="flex flex-wrap gap-1.5">
              {pendientes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => tomarPendiente(p.id)}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  {p.numero} — {nombreUbicacion(p.origen)} → {nombreUbicacion(p.destino)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {nr && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">NR {nr.numero}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {nombreUbicacion(nr.origen)} → <strong>{nombreUbicacion(nr.destino)}</strong> · Emitida {fmtFecha(nr.fecha)} · Motivo: {nr.motivo}
              </p>
            </div>
            <EstadoBadge estado={nr.estado} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 px-5 py-4 text-xs">
            <Info label="Emisor" value={nr.emisor} />
            <Info label="Transportista" value={nr.transporte.transportista} />
            <Info label="Conductor" value={nr.transporte.conductor} />
            <Info label="Chapa" value={nr.transporte.chapa} />
          </div>

          <div className="overflow-hidden rounded-xl mx-5 mb-5 border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {nr.items.map((it) => {
                  const p = PRODUCTOS_DEMO.find((x) => x.id === it.producto_id);
                  return (
                    <tr key={it.producto_id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 font-semibold text-slate-700">{p?.nombre ?? it.producto_id}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmt(it.cantidad)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-semibold text-slate-700">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(nr.items.reduce((s, i) => s + i.cantidad, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {nr.observaciones && (
            <p className="mx-5 mb-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <strong>Observaciones:</strong> {nr.observaciones}
            </p>
          )}

          {nr.estado === "pendiente" ? (
            <div className="border-t border-slate-100 bg-slate-50/60 p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Quien recibe *</label>
                <input type="text" value={aprobador} onChange={(e) => setAprobador(e.target.value)} placeholder="Ej: Gladis (Abasto Norte)" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              {modoRechazo && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Motivo del rechazo *</label>
                  <input type="text" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} placeholder="Ej: cantidades no coinciden" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <a href={`/notas-remision/${nr.id}/documento`} target="_blank" rel="noopener" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">📄 Ver documento</a>
                {!modoRechazo ? (
                  <>
                    <button type="button" onClick={() => setModoRechazo(true)} className="rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Rechazar</button>
                    <button type="button" onClick={aprobar} className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Aprobar recepción
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setModoRechazo(false)} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Volver</button>
                    <button type="button" onClick={rechazar} className="rounded-md bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 inline-flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" /> Confirmar rechazo
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-100 bg-slate-50/60 p-5">
              {nr.estado === "aprobada" && (
                <p className="text-xs text-emerald-700">✓ Recibida por <strong>{nr.aprobada_por}</strong> el {fmtFecha(nr.aprobada_at ?? "")}.</p>
              )}
              {nr.estado === "rechazada" && (
                <p className="text-xs text-rose-700">✕ Rechazada. Motivo: <strong>{nr.motivo_rechazo}</strong></p>
              )}
              <div className="mt-3 flex gap-2">
                <a href={`/notas-remision/${nr.id}/documento`} target="_blank" rel="noopener" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">📄 Ver documento</a>
                <Link href="/notas-remision" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ir al historial</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: DemoNotaRemision["estado"] }) {
  const map = {
    pendiente: "bg-amber-50 border-amber-200 text-amber-800",
    aprobada:  "bg-emerald-50 border-emerald-200 text-emerald-800",
    rechazada: "bg-rose-50 border-rose-200 text-rose-800",
  } as const;
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[estado]}`}>{estado}</span>;
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-700 font-medium">{value?.trim() || "—"}</p>
    </div>
  );
}
