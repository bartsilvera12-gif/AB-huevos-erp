"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Truck, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  PRODUCTOS_DEMO,
  getNRs,
  aprobarNR,
  rechazarNR,
  getRol,
  nombreUbicacion,
  type DemoNotaRemision,
  type DemoRol,
} from "@/lib/demo-multideposito/store";

function fmt(n: number) { return n.toLocaleString("es-PY"); }
function fmtFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch { return iso; }
}

export default function NotasRemisionPage() {
  const [nrs, setNrs] = useState<DemoNotaRemision[]>([]);
  const [rol, setRol] = useState<DemoRol>("admin");
  const [detalle, setDetalle] = useState<DemoNotaRemision | null>(null);
  const [modoRechazo, setModoRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [aprobador, setAprobador] = useState("Gladis (Abasto Norte)");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setNrs(getNRs());
    setRol(getRol());
  }, []);

  function refrescar() {
    setNrs(getNRs());
  }

  function aprobar(nr: DemoNotaRemision) {
    const r = aprobarNR(nr.id, aprobador.trim() || "Abasto Norte");
    if (!r.ok) { setFeedback(r.error); return; }
    setFeedback(`✓ NR ${nr.numero} aprobada. Stock transferido a Abasto Norte.`);
    setDetalle(null);
    refrescar();
  }

  function rechazar(nr: DemoNotaRemision) {
    if (!motivoRechazo.trim()) { setFeedback("Motivo obligatorio para rechazar."); return; }
    const r = rechazarNR(nr.id, motivoRechazo.trim());
    if (!r.ok) { setFeedback(r.error); return; }
    setFeedback(`NR ${nr.numero} rechazada.`);
    setDetalle(null);
    setModoRechazo(false);
    setMotivoRechazo("");
    refrescar();
  }

  const pendientes = nrs.filter((n) => n.estado === "pendiente");
  const aprobadas = nrs.filter((n) => n.estado === "aprobada");
  const rechazadas = nrs.filter((n) => n.estado === "rechazada");

  const puedeAprobar = rol === "admin" || rol === "abasto_norte";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-amber-50/40 to-amber-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-100/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-600" /> Traspasos entre depósitos
          </span>
        </div>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <span className="rounded-lg bg-white p-1.5 ring-1 ring-amber-300/40 shadow-sm">
            <Truck className="h-5 w-5 text-amber-700" />
          </span>
          Notas de Remisión
        </h1>
        <p className="mt-1 text-sm text-slate-500">Central envía stock a Abasto Norte. La transferencia se ejecuta cuando Abasto Norte aprueba la recepción.</p>
      </div>

      {feedback && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Pendientes" value={String(pendientes.length)} icon={<Clock className="h-5 w-5" />} tone="amber" />
        <Kpi label="Aprobadas" value={String(aprobadas.length)} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        <Kpi label="Rechazadas" value={String(rechazadas.length)} icon={<XCircle className="h-5 w-5" />} tone="rose" />
      </div>

      <Seccion titulo="Pendientes de aprobación" nrs={pendientes} onVer={setDetalle} vacia="No hay NRs pendientes." />
      <Seccion titulo="Aprobadas" nrs={aprobadas} onVer={setDetalle} vacia="Sin aprobadas todavía." />
      {rechazadas.length > 0 && <Seccion titulo="Rechazadas" nrs={rechazadas} onVer={setDetalle} vacia="" />}

      {nrs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">Todavía no hay Notas de Remisión.</p>
          <Link href="/stock-central" className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline">Emitir una desde Stock Central →</Link>
        </div>
      )}

      {detalle && (
        <ModalDetalle
          nr={detalle}
          onClose={() => { setDetalle(null); setModoRechazo(false); setMotivoRechazo(""); }}
          onAprobar={() => aprobar(detalle)}
          onRechazar={() => rechazar(detalle)}
          modoRechazo={modoRechazo}
          setModoRechazo={setModoRechazo}
          motivoRechazo={motivoRechazo}
          setMotivoRechazo={setMotivoRechazo}
          aprobador={aprobador}
          setAprobador={setAprobador}
          puedeAprobar={puedeAprobar && detalle.estado === "pendiente"}
        />
      )}
    </div>
  );
}

function Seccion({ titulo, nrs, onVer, vacia }: { titulo: string; nrs: DemoNotaRemision[]; onVer: (n: DemoNotaRemision) => void; vacia: string }) {
  if (nrs.length === 0 && !vacia) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">{titulo} <span className="ml-2 text-xs font-normal text-slate-500">({nrs.length})</span></h2>
      </div>
      {nrs.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-400 italic">{vacia}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Número</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Origen → Destino</th>
                <th className="px-5 py-3">Emisor</th>
                <th className="px-5 py-3 text-right">Ítems</th>
                <th className="px-5 py-3 text-right">Total planchas</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {nrs.map((nr) => {
                const totalItems = nr.items.reduce((s, i) => s + i.cantidad, 0);
                return (
                  <tr key={nr.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{nr.numero}</td>
                    <td className="px-5 py-3 text-xs tabular-nums text-slate-600">{fmtFecha(nr.fecha)}</td>
                    <td className="px-5 py-3 text-xs text-slate-700">
                      {nombreUbicacion(nr.origen)} <span className="text-slate-400">→</span> <strong>{nombreUbicacion(nr.destino)}</strong>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-700">{nr.emisor}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-xs">{nr.items.length}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-800">{fmt(totalItems)}</td>
                    <td className="px-5 py-3"><EstadoBadge estado={nr.estado} /></td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onVer(nr)}
                        className="inline-flex rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >Ver</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: DemoNotaRemision["estado"] }) {
  const map = {
    pendiente: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", label: "Pendiente" },
    aprobada:  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", label: "Aprobada" },
    rechazada: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-800", label: "Rechazada" },
  } as const;
  const s = map[estado];
  return <span className={`inline-flex rounded-full border ${s.border} ${s.bg} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.text}`}>{s.label}</span>;
}

function ModalDetalle({
  nr, onClose, onAprobar, onRechazar, modoRechazo, setModoRechazo, motivoRechazo, setMotivoRechazo, aprobador, setAprobador, puedeAprobar,
}: {
  nr: DemoNotaRemision;
  onClose: () => void;
  onAprobar: () => void;
  onRechazar: () => void;
  modoRechazo: boolean;
  setModoRechazo: (v: boolean) => void;
  motivoRechazo: string;
  setMotivoRechazo: (v: string) => void;
  aprobador: string;
  setAprobador: (v: string) => void;
  puedeAprobar: boolean;
}) {
  const total = nr.items.reduce((s, i) => s + i.cantidad, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Nota de Remisión {nr.numero}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {nombreUbicacion(nr.origen)} → <strong>{nombreUbicacion(nr.destino)}</strong> · Emitida por {nr.emisor} · {fmtFecha(nr.fecha)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mb-4"><EstadoBadge estado={nr.estado} />
          {nr.estado === "aprobada" && (
            <p className="mt-2 text-xs text-slate-500">Aprobada por {nr.aprobada_por} el {fmtFecha(nr.aprobada_at ?? "")}.</p>
          )}
          {nr.estado === "rechazada" && nr.motivo_rechazo && (
            <p className="mt-2 text-xs text-rose-700">Motivo del rechazo: {nr.motivo_rechazo}</p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
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
                <td className="px-4 py-2">Total planchas</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {puedeAprobar && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-xs font-medium text-slate-600">Quien aprueba/rechaza (Abasto Norte)</label>
            <input
              type="text"
              value={aprobador}
              onChange={(e) => setAprobador(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            {modoRechazo && (
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-600">Motivo del rechazo</label>
                <input
                  type="text"
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Ej: cantidades no coinciden con lo pedido"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>
            )}
            <div className="mt-4 flex gap-2 justify-end">
              {!modoRechazo ? (
                <>
                  <button type="button" onClick={() => setModoRechazo(true)} className="rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Rechazar</button>
                  <button type="button" onClick={onAprobar} className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Aprobar y transferir stock
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setModoRechazo(false)} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                  <button type="button" onClick={onRechazar} className="rounded-md bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700">Confirmar rechazo</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "amber" | "emerald" | "rose" }) {
  const tones = {
    amber:   { bg: "bg-amber-100",   icon: "text-amber-700",   value: "text-amber-800" },
    emerald: { bg: "bg-emerald-100", icon: "text-emerald-600", value: "text-emerald-700" },
    rose:    { bg: "bg-rose-100",    icon: "text-rose-600",    value: "text-rose-700" },
  } as const;
  const t = tones[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${t.value}`}>{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.bg} ${t.icon}`}>{icon}</div>
      </div>
    </div>
  );
}
