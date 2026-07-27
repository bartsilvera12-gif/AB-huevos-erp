"use client";

import { use, useEffect, useState } from "react";
import { fetchNR, type NotaRemision } from "@/lib/multideposito/client";
import { EMPRESA_DOC } from "@/lib/documentos/membrete";

function fmt(n: number) {
  return n.toLocaleString("es-PY");
}
function fmtFecha(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return String(iso);
  }
}
function fmtFechaHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${fmtFecha(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return String(iso);
  }
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
      if (!r.ok) {
        setError(r.error);
        setCargando(false);
        return;
      }
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
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
        }
        .doc-a4 {
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #1f2937;
          font-feature-settings: "tnum";
        }
        .doc-a4 h1, .doc-a4 h2, .doc-a4 h3 { font-family: inherit; }
      `}</style>

      <div className="doc-a4 mx-auto p-6 print:p-0" style={{ maxWidth: "210mm" }}>
        <div className="no-print mb-4 flex items-center justify-between">
          <a href="/notas-remision" className="text-sm text-slate-600 hover:underline">← Volver al historial</a>
          <button
            onClick={() => window.print()}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Imprimir
          </button>
        </div>

        <div
          className="bg-white ring-1 ring-slate-200 rounded-md p-10 print:ring-0 print:rounded-none print:p-0 print:shadow-none"
          style={{ minHeight: "270mm" }}
        >
          {/* Encabezado: logo + datos empresa | título doc + número */}
          <div className="flex items-start justify-between gap-8">
            <div className="flex items-start gap-4 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={EMPRESA_DOC.logoUrl}
                alt={EMPRESA_DOC.nombre}
                style={{ maxWidth: "150px", maxHeight: "80px", width: "auto", height: "auto", objectFit: "contain" }}
              />
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold tracking-tight text-slate-900 leading-tight">
                  {EMPRESA_DOC.nombre}
                </p>
                {EMPRESA_DOC.direccion.length > 0 && (
                  <p className="text-[11px] text-slate-600 leading-snug">{EMPRESA_DOC.direccion.join(" · ")}</p>
                )}
                <p className="text-[11px] text-slate-600 leading-snug">
                  {EMPRESA_DOC.telefono && <><strong>Tel:</strong> {EMPRESA_DOC.telefono}</>}
                  {EMPRESA_DOC.telefono && EMPRESA_DOC.email && <span className="mx-1">·</span>}
                  {EMPRESA_DOC.email && <><strong>Email:</strong> {EMPRESA_DOC.email}</>}
                </p>
              </div>
            </div>

            <div className="shrink-0 rounded-md border border-slate-300 px-4 py-3 text-right">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Documento no fiscal</p>
              <h1 className="mt-1 text-[15px] font-bold uppercase tracking-wide text-slate-900">Nota de Remisión</h1>
              <p className="mt-2 font-mono text-[18px] font-bold text-slate-900">{nr.numero}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                Estado: <strong className="uppercase text-slate-700">{nr.estado}</strong>
              </p>
            </div>
          </div>

          <div className="my-5 h-px bg-slate-300" />

          {/* Datos generales */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-[11px]">
            <Field label="Fecha de emisión" value={fmtFechaHora(nr.fecha)} />
            <Field label="Emisor" value={nr.emisor} />
            <Field label="Motivo" value={nr.motivo} />
          </div>

          {/* Origen / Destino */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-md border border-slate-300 px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Depósito de origen</p>
              <p className="mt-1 text-[13px] font-semibold text-slate-900">{origenNombre || "—"}</p>
            </div>
            <div className="rounded-md border border-slate-300 px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Depósito de destino</p>
              <p className="mt-1 text-[13px] font-semibold text-slate-900">{destinoNombre || "—"}</p>
            </div>
          </div>

          {/* Transporte (opcional) */}
          {(nr.transportista || nr.conductor || nr.chapa) && (
            <div className="mt-5 rounded-md border border-slate-300 px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500 mb-2">Datos del transporte</p>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-[11px]">
                <Field label="Transportista" value={nr.transportista ?? "—"} />
                <Field label="RUC transportista" value={nr.ruc_transportista ?? "—"} />
                <Field label="Chapa" value={nr.chapa ?? "—"} />
                <Field label="Conductor" value={nr.conductor ?? "—"} />
                <Field label="CI conductor" value={nr.ci_conductor ?? "—"} />
                <Field label="Traslado" value={`${fmtFecha(nr.fecha_inicio_traslado)} → ${fmtFecha(nr.fecha_fin_traslado)}`} />
              </div>
            </div>
          )}

          {/* Ítems */}
          <div className="mt-6">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-y-2 border-slate-800 text-slate-800">
                  <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Código</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Descripción</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {(nr.items ?? []).map((it, idx) => (
                  <tr key={it.producto_id} className={idx % 2 === 1 ? "bg-slate-50" : ""}>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-slate-600">{it.producto_sku ?? "—"}</td>
                    <td className="px-2 py-1.5 text-slate-800">{it.producto_nombre ?? it.producto_id}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{fmt(it.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800">
                  <td className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-700" colSpan={2}>
                    Total de unidades
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[13px] font-bold text-slate-900">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Observaciones */}
          {nr.observaciones?.trim() && (
            <div className="mt-5 rounded-md border border-slate-300 px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Observaciones</p>
              <p className="mt-1 text-[12px] text-slate-800 whitespace-pre-wrap">{nr.observaciones}</p>
            </div>
          )}

          {/* Estado de recepción */}
          {nr.estado === "aprobada" && (
            <div className="mt-4 rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-[11px] text-slate-700">
              Recepción confirmada por <strong>{nr.aprobada_por}</strong> el {fmtFechaHora(nr.aprobada_at)}.
            </div>
          )}
          {nr.estado === "rechazada" && (
            <div className="mt-4 rounded-md border border-slate-400 bg-slate-100 px-4 py-2 text-[11px] text-slate-700">
              Rechazada. Motivo: {nr.motivo_rechazo}
            </div>
          )}

          {/* Firmas */}
          <div className="mt-16 grid grid-cols-2 gap-16 text-[11px]">
            <div className="border-t border-slate-800 pt-1 text-center">
              <p className="uppercase tracking-wider text-slate-600">Firma y aclaración — Emisor</p>
            </div>
            <div className="border-t border-slate-800 pt-1 text-center">
              <p className="uppercase tracking-wider text-slate-600">Firma y aclaración — Receptor</p>
            </div>
          </div>

          {/* Pie */}
          <div className="mt-8 text-center text-[9px] text-slate-400">
            Documento no fiscal · válido únicamente como constancia interna de traslado de mercadería.
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[12px] font-medium text-slate-800">{value?.toString().trim() || "—"}</p>
    </div>
  );
}
