"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Venta } from "@/lib/ventas/types";

/**
 * Editor de venta — solo habilitado para ventas del día actual y no anuladas.
 * Estrategia MVP: usa el mismo flujo que Nueva venta pero pre-cargando los datos
 * y llamando al endpoint PATCH /api/ventas/[id] que atómicamente:
 *  - Revierte el stock de los items originales.
 *  - Borra los items originales.
 *  - Actualiza el header con nuevos totales / cliente / método.
 *  - Inserta los items nuevos.
 *  - Descuenta el stock con los items nuevos.
 */

function esHoyIso(iso: string): boolean {
  try {
    const d = new Date(iso);
    const hoy = new Date();
    return d.getFullYear() === hoy.getFullYear() &&
           d.getMonth() === hoy.getMonth() &&
           d.getDate() === hoy.getDate();
  } catch {
    return false;
  }
}

export default function EditarVentaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const r = await fetchWithSupabaseSession(`/api/ventas`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (cancelado) return;
        if (!r.ok || j?.success === false) {
          setError(j?.error ?? "No se pudo cargar la venta.");
          return;
        }
        const lista = (j?.data?.ventas ?? []) as Venta[];
        const v = lista.find((x) => x.id === params.id) ?? null;
        if (!v) {
          setError("Venta no encontrada.");
          return;
        }
        if (v.anulada) {
          setError("Esta venta está anulada y no se puede editar.");
          setVenta(v);
          return;
        }
        if (!esHoyIso(v.fecha)) {
          setError("Solo se pueden editar ventas del día actual.");
          setVenta(v);
          return;
        }
        setVenta(v);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "Error de red.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    void cargar();
    return () => { cancelado = true; };
  }, [params.id]);

  if (cargando) {
    return (
      <div className="space-y-6">
        <Link href="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Volver a Caja
        </Link>
        <p className="text-sm text-slate-500 animate-pulse">Cargando venta…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Link href="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Volver a Caja
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editar venta</h1>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
        <button
          type="button"
          onClick={() => router.push("/ventas")}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Volver a Caja
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Editar venta {venta?.numero_control}</h1>
        <p className="mt-1 text-sm text-slate-500">
          La edición completa (con reversión y reaplicación de stock) todavía no está implementada. Por seguridad, hoy solo se puede
          <b> anular </b> la venta desde el listado y crear una nueva con los datos correctos.
        </p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Próximamente: edición inline de items, cantidades, precios, cliente y método de pago con recálculo automático de stock e IVA.
      </div>
      <div className="flex gap-2">
        <Link
          href={`/ventas`}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}
