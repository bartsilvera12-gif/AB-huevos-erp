"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Warehouse, Send, Egg } from "lucide-react";
import {
  PRODUCTOS_DEMO,
  getStock,
  crearNR,
  nombreUbicacion,
  type DemoProducto,
} from "@/lib/demo-multideposito/store";

function fmt(n: number) { return n.toLocaleString("es-PY"); }

export default function StockCentralPage() {
  const [stockCentral, setStockCentral] = useState<Record<string, number>>({});
  const [enviarOpen, setEnviarOpen] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [emisor, setEmisor] = useState("Marcial (Central)");
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [notaCreada, setNotaCreada] = useState<{ numero: string } | null>(null);

  useEffect(() => {
    const s = getStock();
    setStockCentral(s.central ?? {});
  }, []);

  const totales = useMemo(() => {
    const total = Object.values(stockCentral).reduce((s, n) => s + n, 0);
    const conStock = PRODUCTOS_DEMO.filter((p) => (stockCentral[p.id] ?? 0) > 0).length;
    return { total, conStock };
  }, [stockCentral]);

  function abrirEnviar() {
    const inicial: Record<string, number> = {};
    for (const p of PRODUCTOS_DEMO) inicial[p.id] = 0;
    setCantidades(inicial);
    setErrorEnvio(null);
    setNotaCreada(null);
    setEnviarOpen(true);
  }

  function emitir() {
    setErrorEnvio(null);
    const items = PRODUCTOS_DEMO
      .filter((p) => (cantidades[p.id] ?? 0) > 0)
      .map((p) => ({ producto_id: p.id, cantidad: cantidades[p.id] }));
    if (items.length === 0) { setErrorEnvio("Cargá al menos 1 producto con cantidad > 0."); return; }
    // Validar stock disponible en central
    for (const it of items) {
      const disp = stockCentral[it.producto_id] ?? 0;
      if (it.cantidad > disp) {
        const p = PRODUCTOS_DEMO.find((x) => x.id === it.producto_id);
        setErrorEnvio(`Stock insuficiente de ${p?.nombre}: hay ${disp}, se piden ${it.cantidad}.`);
        return;
      }
    }
    const nr = crearNR({
      emisor: emisor.trim() || "Central",
      origen: "central",
      destino: "abasto_norte",
      items,
    });
    setNotaCreada({ numero: nr.numero });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-emerald-50/40 to-emerald-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-100/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" /> Depósito · Central
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
              <span className="rounded-lg bg-white p-1.5 ring-1 ring-emerald-300/40 shadow-sm">
                <Warehouse className="h-5 w-5 text-emerald-700" />
              </span>
              Stock Central
            </h1>
            <p className="mt-1 text-sm text-slate-500">Depósito principal donde caen todas las clasificaciones. No se vende directo desde acá.</p>
          </div>
          <button
            type="button"
            onClick={abrirEnviar}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-500/30 hover:shadow-md active:scale-[.98] inline-flex items-center gap-1.5"
          >
            <Send className="h-4 w-4" />
            Enviar a Abasto Norte
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Productos con stock" value={String(totales.conStock)} tone="emerald" />
        <Kpi label="Planchas totales" value={fmt(totales.total)} tone="sky" />
        <Kpi label="Ubicación" value="Central" tone="slate" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Productos en Central</h2>
          <Link href="/notas-remision" className="text-xs font-medium text-emerald-700 hover:underline">Ver notas de remisión →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3 text-right">Stock (planchas)</th>
                <th className="px-5 py-3">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTOS_DEMO.map((p) => {
                const st = stockCentral[p.id] ?? 0;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800 flex items-center gap-2">
                      <Egg className="h-4 w-4 text-slate-400" />{p.nombre}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-medium ${st > 0 ? "text-slate-800" : "text-slate-400"}`}>
                      {fmt(st)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-xs">{p.unidad}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {enviarOpen && (
        <ModalEnviar
          productos={PRODUCTOS_DEMO}
          stockCentral={stockCentral}
          cantidades={cantidades}
          setCantidades={setCantidades}
          emisor={emisor}
          setEmisor={setEmisor}
          error={errorEnvio}
          notaCreada={notaCreada}
          onClose={() => setEnviarOpen(false)}
          onEmitir={emitir}
        />
      )}
    </div>
  );
}

function ModalEnviar({
  productos, stockCentral, cantidades, setCantidades,
  emisor, setEmisor, error, notaCreada, onClose, onEmitir,
}: {
  productos: DemoProducto[];
  stockCentral: Record<string, number>;
  cantidades: Record<string, number>;
  setCantidades: (v: Record<string, number>) => void;
  emisor: string;
  setEmisor: (v: string) => void;
  error: string | null;
  notaCreada: { numero: string } | null;
  onClose: () => void;
  onEmitir: () => void;
}) {
  const total = Object.values(cantidades).reduce((s, n) => s + (n || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Enviar productos a Abasto Norte</h3>
            <p className="mt-0.5 text-xs text-slate-500">Se genera una Nota de Remisión en estado <strong className="text-amber-700">pendiente de aprobación</strong>. El stock se mueve recién cuando Abasto Norte la confirma.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {notaCreada ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">✓ Nota de Remisión {notaCreada.numero} creada.</p>
            <p className="mt-1 text-xs">Está pendiente de aprobación por Abasto Norte. Podés verla en el módulo de Notas de remisión.</p>
            <div className="mt-3 flex gap-2">
              <Link href="/notas-remision" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Ver notas de remisión</Link>
              <button type="button" onClick={onClose} className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-600">Emisor (quien despacha)</label>
              <input
                type="text"
                value={emisor}
                onChange={(e) => setEmisor(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-4 py-2.5 text-right">Disponible</th>
                    <th className="px-4 py-2.5 text-right">A enviar</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => {
                    const disp = stockCentral[p.id] ?? 0;
                    const cant = cantidades[p.id] ?? 0;
                    return (
                      <tr key={p.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 font-semibold text-slate-700">{p.nombre}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{disp}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            max={disp}
                            value={cant === 0 ? "" : cant}
                            placeholder="0"
                            onChange={(e) => setCantidades({ ...cantidades, [p.id]: Number(e.target.value) || 0 })}
                            className={`w-full rounded-md border px-2 py-1 text-right text-sm outline-none ${cant > disp ? "border-rose-400 bg-rose-50" : "border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold text-slate-700">
                    <td className="px-4 py-2">Total planchas</td>
                    <td className="px-4 py-2"></td>
                    <td className="px-4 py-2 text-right tabular-nums">{total}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {error && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={onEmitir} className="rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-md">Emitir Nota de Remisión</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "emerald" | "sky" | "slate" }) {
  const tones = {
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    slate: "text-slate-800",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${tones[tone]}`}>{value}</p>
    </div>
  );
}
