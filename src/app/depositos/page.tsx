"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PackageOpen, Truck, Egg } from "lucide-react";
import {
  PRODUCTOS_DEMO,
  UBICACIONES_DEMO,
  getStock,
} from "@/lib/demo-multideposito/store";

function fmt(n: number) { return n.toLocaleString("es-PY"); }

export default function DepositosPage() {
  const [stock, setStock] = useState<Record<string, Record<string, number>>>({});
  const [ubicacionActiva, setUbicacionActiva] = useState<string>("todos");

  useEffect(() => { setStock(getStock()); }, []);

  const totalPorUbicacion = UBICACIONES_DEMO.map((u) => ({
    ...u,
    total: Object.values(stock[u.id] ?? {}).reduce((s, n) => s + n, 0),
    conStock: PRODUCTOS_DEMO.filter((p) => (stock[u.id]?.[p.id] ?? 0) > 0).length,
  }));

  const ubicacionesVisibles = ubicacionActiva === "todos"
    ? UBICACIONES_DEMO
    : UBICACIONES_DEMO.filter((u) => u.id === ubicacionActiva);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-emerald-50/40 to-emerald-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-100/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" /> Inventario · Multi-depósito
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
              <span className="rounded-lg bg-white p-1.5 ring-1 ring-emerald-300/40 shadow-sm">
                <PackageOpen className="h-5 w-5 text-emerald-700" />
              </span>
              Depósitos
            </h1>
            <p className="mt-1 text-sm text-slate-500">Stock por ubicación. Las transferencias entre depósitos se hacen con Notas de Remisión.</p>
          </div>
          <Link
            href="/notas-remision/nueva"
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-500/30 hover:shadow-md inline-flex items-center gap-1.5"
          >
            <Truck className="h-4 w-4" />
            Emitir Nota de Remisión
          </Link>
        </div>
      </div>

      {/* Selector de vista */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 mr-2">Ver depósito:</span>
          <button
            type="button"
            onClick={() => setUbicacionActiva("todos")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${ubicacionActiva === "todos" ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            Todos ({UBICACIONES_DEMO.length})
          </button>
          {UBICACIONES_DEMO.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setUbicacionActiva(u.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${ubicacionActiva === u.id ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {u.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-${ubicacionesVisibles.length}`}>
        {totalPorUbicacion.filter((u) => ubicacionActiva === "todos" || u.id === ubicacionActiva).map((u) => (
          <div key={u.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{u.nombre}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-emerald-700">{fmt(u.total)}</p>
            <p className="mt-1 text-[11px] text-slate-500">{u.conStock} de {PRODUCTOS_DEMO.length} productos con stock</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Stock consolidado por producto</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Producto</th>
                {ubicacionesVisibles.map((u) => (
                  <th key={u.id} className="px-5 py-3 text-right">{u.nombre}</th>
                ))}
                {ubicacionActiva === "todos" && <th className="px-5 py-3 text-right">Total</th>}
              </tr>
            </thead>
            <tbody>
              {PRODUCTOS_DEMO.map((p) => {
                const cantPorU = ubicacionesVisibles.map((u) => stock[u.id]?.[p.id] ?? 0);
                const total = cantPorU.reduce((s, n) => s + n, 0);
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800 flex items-center gap-2">
                      <Egg className="h-4 w-4 text-slate-400" />{p.nombre}
                    </td>
                    {cantPorU.map((n, i) => (
                      <td key={ubicacionesVisibles[i].id} className={`px-5 py-3 text-right tabular-nums ${n > 0 ? "text-slate-800 font-medium" : "text-slate-400"}`}>
                        {fmt(n)}
                      </td>
                    ))}
                    {ubicacionActiva === "todos" && (
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{fmt(total)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 italic">
          La clasificación de huevos ingresa siempre a <strong>Casa Central</strong>. Para llevar stock a Abasto Norte se emite una NR y Abasto Norte debe aprobarla.
        </p>
      </div>
    </div>
  );
}
