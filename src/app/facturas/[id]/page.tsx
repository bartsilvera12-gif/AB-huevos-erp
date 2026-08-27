"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FacturaElectronicaPanel } from "@/components/sifen/FacturaElectronicaPanel";
import type { FacturaElectronicaDTO, SifenCancelacionPreviewDTO } from "@/lib/sifen/types";

type FacturaApiRow = {
  id: string;
  numero_factura: string;
  fecha: string;
  fecha_vencimiento: string;
  monto: number;
  saldo: number;
  estado: string;
  tipo: string;
  moneda: string;
  cliente_id: string;
  cliente_display?: string;
};

type SifenResumen = {
  sifen_config_exists: boolean;
  sifen_config_activa: boolean;
  sifen_ambiente: string | null;
  sifen_plazo_cancelacion_horas: number;
  factura_electronica: FacturaElectronicaDTO | null;
  cancelacion: SifenCancelacionPreviewDTO | null;
};

function formatFecha(str: string) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

function FacturaDetalleInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;

  const [factura, setFactura] = useState<FacturaApiRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [resumen, setResumen] = useState<SifenResumen | null>(null);
  const [loadingF, setLoadingF] = useState(true);
  const [loadingS, setLoadingS] = useState(true);

  const onResumenLoaded = useCallback((r: SifenResumen) => {
    setResumen(r);
  }, []);

  const reloadFacturaComercial = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchWithSupabaseSession(`/api/facturas/${id}`);
      const j = (await res.json()) as { success?: boolean; data?: FacturaApiRow; error?: string };
      if (res.ok && j.success && j.data) setFactura(j.data);
    } catch {
      /* ignorar */
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoadingF(true);
      setLoadErr(null);
      try {
        const res = await fetchWithSupabaseSession(`/api/facturas/${id}`);
        const j = (await res.json()) as { success?: boolean; data?: FacturaApiRow; error?: string };
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setFactura(null);
          return;
        }
        if (!res.ok || !j.success || !j.data) {
          setLoadErr(j.error ?? "No se pudo cargar la factura");
          setFactura(null);
          return;
        }
        setNotFound(false);
        setFactura(j.data);
      } catch {
        if (!cancelled) setLoadErr("Error de red");
      } finally {
        if (!cancelled) setLoadingF(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoadingS(true);
      try {
        const res = await fetchWithSupabaseSession(`/api/facturas/${id}/sifen/resumen`);
        const j = (await res.json()) as { success?: boolean; data?: SifenResumen };
        if (cancelled) return;
        if (res.ok && j.success && j.data) setResumen(j.data);
        else setResumen(null);
      } catch {
        if (!cancelled) setResumen(null);
      } finally {
        if (!cancelled) setLoadingS(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (searchParams?.get("print") === "1" && factura && !loadingF) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [searchParams, factura, loadingF]);

  if (!id) {
    return null;
  }

  if (loadingF) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center text-sm text-slate-400">Cargando factura…</div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center space-y-3">
        <p className="text-slate-600">Factura no encontrada.</p>
        <Link href="/facturas" className="text-[#0EA5E9] text-sm font-medium hover:underline">
          Volver a Historial
        </Link>
      </div>
    );
  }

  if (loadErr || !factura) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center space-y-3">
        <p className="text-red-600 text-sm">{loadErr ?? "Error"}</p>
        <Link href="/facturas" className="text-[#0EA5E9] text-sm font-medium hover:underline">
          Volver a Historial
        </Link>
      </div>
    );
  }

  const monedaLabel = factura.moneda === "USD" ? "USD" : "Gs.";

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6 px-4 sm:px-6 print:px-0 w-full">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link
            href="/facturas"
            className="text-xs font-medium text-[#0EA5E9] hover:underline"
          >
            ← Volver a Historial de facturas
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Factura {factura.numero_factura}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cliente:{" "}
            <Link href={`/clientes/${factura.cliente_id}`} className="text-[#0EA5E9] font-medium hover:underline">
              {factura.cliente_display ?? "Ver cliente"}
            </Link>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumen comercial</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-slate-400 text-xs">Emisión</dt>
            <dd className="font-medium text-slate-800">{formatFecha(factura.fecha)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Vencimiento</dt>
            <dd className="font-medium text-slate-800">{formatFecha(factura.fecha_vencimiento)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Tipo</dt>
            <dd className="font-medium text-slate-800 capitalize">{factura.tipo}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Monto</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {monedaLabel}{" "}
              {factura.monto.toLocaleString(factura.moneda === "USD" ? "en-US" : "es-PY")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Saldo</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {monedaLabel}{" "}
              {factura.saldo.toLocaleString(factura.moneda === "USD" ? "en-US" : "es-PY")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Estado</dt>
            <dd className="font-medium text-slate-800">{factura.estado}</dd>
          </div>
        </dl>
      </div>

      <FacturaElectronicaPanel
        facturaId={id}
        clienteId={factura.cliente_id}
        facturaComercial={{
          monto: factura.monto,
          saldo: factura.saldo,
          estado: factura.estado,
          moneda: factura.moneda,
          cliente_display: factura.cliente_display ?? "",
        }}
        resumen={resumen}
        loadingResumen={loadingS}
        onResumenLoaded={onResumenLoaded}
        onComercialUpdated={reloadFacturaComercial}
      />

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <a
          href={`/api/facturas/${factura.id}/ticket?w=80`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] px-5 py-3 text-sm font-semibold text-white shadow-md hover:shadow-lg active:scale-[.98]"
          title="Ticket térmico 80mm"
        >
          🧾 Factura ticket 80mm
        </a>
        <a
          href={`/api/facturas/${factura.id}/ticket?w=58`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#4FAEB2] px-5 py-3 text-sm font-semibold text-[#3F8E91] shadow-sm hover:shadow-md"
          title="Ticket térmico 58mm"
        >
          🧾 Factura ticket 58mm
        </a>
        <a
          href={`/api/facturas/${factura.id}/sifen/kude`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          title="KuDE oficial en formato A4 (PDF)"
        >
          📄 A4 PDF
        </a>
        {/*
          Antes solo se mostraba para facturas a crédito. Pero una factura
          contado también puede haberse quedado "Pendiente" (saldo > 0) porque
          el cobro no se cargó al emitirla, o el cliente quiere reimprimir el
          recibo del pago. Se muestra siempre.
        */}
        <ReciboPagoButton facturaId={factura.id} tieneSaldo={factura.saldo > 0} />

      </div>
    </div>
  );
}

/**
 * Botón para imprimir el recibo de la factura. Tres caminos:
 *
 * 1. Ya hay recibo generado → abre el PDF directo.
 * 2. Hay cobro registrado pero no recibo → GET /recibo lo genera y devuelve el id.
 * 3. No hay cobro (típico de facturas CONTADO que no cargaron el pago al
 *    emitirse) → abre un modal para registrar el pago y generar recibo en un
 *    solo paso, sin obligar al usuario a irse a /pagos.
 */
function ReciboPagoButton({ facturaId, tieneSaldo }: { facturaId: string; tieneSaldo: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  async function handleClick() {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/recibo`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.data?.recibo_id) {
        window.open(`/api/recibos-dinero/${j.data.recibo_id}/pdf?auto=1`, "_blank", "noopener");
        return;
      }
      // 404 = no hay cobro registrado. Abrimos modal para registrar en el momento.
      if (r.status === 404) {
        setModalOpen(true);
        return;
      }
      setErr(j?.error ?? "No se pudo abrir el recibo.");
    } catch {
      setErr("Error de red al abrir el recibo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 disabled:opacity-60"
        title={tieneSaldo ? "Registrar pago e imprimir recibo" : "Imprimir recibo del pago"}
      >
        🧾 {tieneSaldo ? "Registrar pago / Recibo" : "Recibo de pago"}
      </button>
      {err && <span className="text-xs text-rose-600 self-center">{err}</span>}
      {modalOpen && (
        <RegistrarPagoContadoModal
          facturaId={facturaId}
          onClose={() => setModalOpen(false)}
          onDone={(reciboId) => {
            setModalOpen(false);
            window.open(`/api/recibos-dinero/${reciboId}/pdf?auto=1`, "_blank", "noopener");
            // Refrescar la pantalla para reflejar saldo en 0.
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

/** Modal chico para cargar el pago de una factura y generar el recibo. */
function RegistrarPagoContadoModal({
  facturaId,
  onClose,
  onDone,
}: {
  facturaId: string;
  onClose: () => void;
  onDone: (reciboId: string) => void;
}) {
  const [metodo, setMetodo] = React.useState<"efectivo" | "transferencia" | "tarjeta" | "otro">("efectivo");
  const [referencia, setReferencia] = React.useState("");
  const [titular, setTitular] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function guardar() {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/registrar-pago-contado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo_pago: metodo,
          referencia: referencia.trim() || undefined,
          titular: titular.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.data?.recibo_id) {
        setErr(j?.error ?? "No se pudo registrar el pago.");
        setBusy(false);
        return;
      }
      onDone(j.data.recibo_id);
    } catch {
      setErr("Error de red al registrar el pago.");
      setBusy(false);
    }
  }

  const necesitaReferencia = metodo === "transferencia" || metodo === "tarjeta";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900">Registrar pago</h3>
        <p className="mt-1 text-xs text-slate-500">
          Cargá el cobro para esta factura y se genera el recibo al instante.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Método de pago</label>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as "efectivo" | "transferencia" | "tarjeta" | "otro")}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          {necesitaReferencia && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-600">Referencia / N° comprobante</label>
                <input
                  type="text"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Ej: 123456"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Titular (opcional)</label>
                <input
                  type="text"
                  value={titular}
                  onChange={(e) => setTitular(e.target.value)}
                  placeholder="Nombre del titular"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </>
          )}
          {err && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar e imprimir recibo"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FacturaDetallePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-slate-400">Cargando factura…</div>
      }
    >
      <FacturaDetalleInner />
    </Suspense>
  );
}
