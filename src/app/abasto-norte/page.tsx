"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Egg, Inbox } from "lucide-react";
import {
  PRODUCTOS_DEMO,
  getStock,
  getNRs,
} from "@/lib/demo-multideposito/store";

function fmt(n: number) { return n.toLocaleString("es-PY"); }

export default function AbastoNortePage() {
  const [stock, setStock] = useState<Record<string, number>>({});
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    setStock(getStock().abasto_norte ?? {});
    setPendientes(getNRs().filter((n) => n.destino === "abasto_norte" && n.estado === "pendiente").length);
  }, []);

  const totales = useMemo(() => {
    const total = Object.values(stock).reduce((s, n) => s + n, 0);
    const conStock = PRODUCTOS_DEMO.filter((p) => (stock[p.id] ?? 0) > 0).length;
    return { total, conStock };
  }, [stock]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-sky-50/40 to-sky-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/40 bg-sky-100/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-600" /> Depósito · Punto de venta
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
              <span className="rounded-lg bg-white p-1.5 ring-1 ring-sky-300/40 shadow-sm">
                <Building2 className="h-5 w-5 text-sky-700" />
              </span>
              Abasto Norte
            </h1>
            <p className="mt-1 text-sm text-slate-500">Punto de venta. El stock viene únicamente vía Notas de Remisión aprobadas desde Central.</p>
          </div>
          {pendientes > 0 && (
            <Link href="/notas-remision" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 inline-flex items-center gap-1.5">
              <Inbox className="h-4 w-4" />
              {pendientes} NR pendiente(s) de aprobar
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Productos con stock" value={String(totales.conStock)} tone="sky" />
        <Kpi label="Planchas disponibles" value={fmt(totales.total)} tone="emerald" />
        <Kpi label="Ubicación" value="Abasto Norte" tone="slate" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Stock en Abasto Norte</h2>
          <Link href="/ventas" className="text-xs font-medium text-sky-700 hover:underline">Ir a Caja (ventas) →</Link>
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
                const st = stock[p.id] ?? 0;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-sky-50/40 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800 flex items-center gap-2">
                      <Egg className="h-4 w-4 text-slate-400" />{p.nombre}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-medium ${st > 0 ? "text-slate-800" : "text-rose-500"}`}>
                      {st > 0 ? fmt(st) : "SIN STOCK"}
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-xs">{p.unidad}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 italic">
          Si un producto figura SIN STOCK, Central debe emitir una nueva Nota de Remisión y Abasto Norte aprobarla para reponer.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "sky" | "emerald" | "slate" }) {
  const tones = {
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    slate: "text-slate-800",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${tones[tone]}`}>{value}</p>
    </div>
  );
}
