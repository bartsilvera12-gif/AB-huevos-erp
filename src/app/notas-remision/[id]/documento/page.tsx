"use client";

import { use, useEffect, useState } from "react";
import { fetchNR, type NotaRemision } from "@/lib/multideposito/client";

function fmt(n: number) { return n.toLocaleString("es-PY"); }
function fmtFecha(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  } catch { return String(iso); }
}
function fmtFechaHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${fmtFecha(iso)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  } catch { return String(iso); }
}

export default function DocumentoNRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [nr, setNr] = useState<NotaRemision | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const r = await fetchNR(id);
      if (!r.ok) { setError(r.error); setCargando(false); return; }
      setNr(r.data.nota_remision);
      setCargando(false);
    })();
  }, [id]);

  if (cargando) return <div className="p-8 text-sm text-slate-500">Cargando…</div>;
  if (error) return <div className="p-8 text-sm text-rose-700">{error}</div>;
  if (!nr) return <div className="p-8 text-sm text-slate-500">NR no encontrada.</div>;

  const total = (nr.items ?? []).reduce((s, i) => s + i.cantidad, 0);
  const origenNombre = nr.origen?.nombre ?? "";
  const destinoNombre = nr.destino?.nombre ?? "";

  return (
    <div className="max-w-3xl mx-auto p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href="/notas-remision" className="text-sm text-slate-600 hover:underline">← Volver al historial</a>
        <button onClick={() => window.print()} className="rounded-md bg-slate-800 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-900">🖨️ Imprimir</button>
      </div>

      <div className="bg-white border border-slate-300 rounded-lg p-8 print:border-0 print:rounded-none print:p-4">
        <div className="flex items-start justify-between border-b-2 border-emerald-700 pb-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Aviagro E.A.S.</p>
            <h1 className="text-xl font-bold text-slate-900">Nota de Remisión</h1>
            <p className="text-xs text-slate-500 mt-0.5">Documento no fiscal — Traspaso interno de mercadería</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Número</p>
            <p className="font-mono text-lg font-bold text-emerald-700">{nr.numero}</p>
            <p className="text-[10px] text-slate-500 mt-1">Estado: <strong className="uppercase">{nr.estado}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs mb-4">
          <Info label="Fecha emisión" value={fmtFechaHora(nr.fecha)} />
          <Info label="Motivo" value={nr.motivo} />
          <Info label="Emisor" value={nr.emisor} />
          <Info label="Observaciones" value={nr.observaciones ?? "—"} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 border-t border-slate-100 pt-4">
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Depósito Origen</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{origenNombre || "—"}</p>
          </div>
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold">Depósito Destino</p>
            <p className="mt-1 text-sm font-bold text-emerald-900">{destinoNombre || "—"}</p>
          </div>
        </div>

        {(nr.transportista || nr.conductor || nr.chapa) && (
          <div className="mb-4 rounded-md border border-slate-200 p-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Transporte</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Transportista" value={nr.transportista ?? "—"} />
              <Info label="RUC transportista" value={nr.ruc_transportista ?? "—"} />
              <Info label="Conductor" value={nr.conductor ?? "—"} />
              <Info label="CI conductor" value={nr.ci_conductor ?? "—"} />
              <Info label="Chapa" value={nr.chapa ?? "—"} />
              <Info label="Inicio → Fin traslado" value={`${fmtFecha(nr.fecha_inicio_traslado)} → ${fmtFecha(nr.fecha_fin_traslado)}`} />
            </div>
          </div>
        )}

        <table className="w-full text-sm border border-slate-200 rounded overflow-hidden">
          <thead>
            <tr className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2 border-b border-slate-200">Código</th>
              <th className="px-3 py-2 border-b border-slate-200">Descripción</th>
              <th className="px-3 py-2 border-b border-slate-200 text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {(nr.items ?? []).map((it) => (
              <tr key={it.producto_id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{it.producto_sku ?? "—"}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">{it.producto_nombre ?? it.producto_id}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(it.cantidad)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold text-slate-700">
              <td colSpan={2} className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total)}</td>
            </tr>
          </tbody>
        </table>

        {nr.estado === "aprobada" && (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">
            ✓ Recepción confirmada por <strong>{nr.aprobada_por}</strong> el {fmtFechaHora(nr.aprobada_at)}.
          </div>
        )}
        {nr.estado === "rechazada" && (
          <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
            ✕ Rechazada. Motivo: {nr.motivo_rechazo}
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
          <div className="text-center border-t border-slate-400 pt-2">
            <p className="text-slate-500">Firma emisor</p>
          </div>
          <div className="text-center border-t border-slate-400 pt-2">
            <p className="text-slate-500">Firma receptor</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-800 font-medium">{value?.trim() || "—"}</p>
    </div>
  );
}
