"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import ProductPickerModal, { type AgregarVentaPayload } from "@/components/inventario/ProductPickerModal";
import MontoInput from "@/components/ui/MontoInput";
import type { Venta, LineaVenta } from "@/lib/ventas/types";

type TipoIvaVenta = "EXENTA" | "5%" | "10%";
type TipoPrecioVenta = "minorista" | "mayorista" | "distribuidor";

/** IVA INCLUIDO: extrae el IVA desde adentro del total de línea. */
function calcIvaIncluido(tipo: TipoIvaVenta, total: number): number {
  if (tipo === "EXENTA") return 0;
  if (tipo === "5%") return total - total / 1.05;
  return total - total / 1.10;
}

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

function formatGs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

type ItemEditor = {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: TipoIvaVenta;
  tipo_precio: TipoPrecioVenta;
};

type ClienteLite = { id: string; label: string; ruc: string | null };

export default function EditarVentaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [venta, setVenta] = useState<Venta | null>(null);

  // Estado editable
  const [items, setItems] = useState<ItemEditor[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [tipoVenta, setTipoVenta] = useState<"CONTADO" | "CREDITO">("CONTADO");
  const [plazoDias, setPlazoDias] = useState<number>(30);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | "">("efectivo");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Cargar venta + items + clientes
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const [rVentas, rClientes] = await Promise.all([
          fetchWithSupabaseSession(`/api/ventas`, { cache: "no-store" }),
          fetch(`/api/clientes`, { credentials: "include", cache: "no-store" }),
        ]);
        const jVentas = await rVentas.json().catch(() => ({}));
        if (cancelado) return;
        if (!rVentas.ok || jVentas?.success === false) {
          setError(jVentas?.error ?? "No se pudo cargar la venta.");
          return;
        }
        const lista = (jVentas?.data?.ventas ?? []) as Venta[];
        const v = lista.find((x) => x.id === params.id) ?? null;
        if (!v) { setError("Venta no encontrada."); return; }
        if (v.anulada) { setError("Esta venta está anulada."); setVenta(v); return; }
        if (!esHoyIso(v.fecha)) { setError("Solo se pueden editar ventas del día actual."); setVenta(v); return; }
        setVenta(v);
        setClienteId(v.cliente_id ?? "");
        setTipoVenta(v.tipo_venta);
        setPlazoDias(v.plazo_dias ?? 30);
        setMetodoPago((v.metodo_pago as "efectivo"|"tarjeta"|"transferencia"|null|undefined) ?? "efectivo");
        // Mapear items
        const mapped: ItemEditor[] = (v.items ?? []).map((it: LineaVenta) => ({
          producto_id: it.producto_id,
          producto_nombre: it.producto_nombre,
          sku: it.sku,
          cantidad: Number(it.cantidad) || 0,
          precio_venta_original: Number(it.precio_venta_original ?? it.precio_venta) || 0,
          precio_venta: Number(it.precio_venta) || 0,
          tipo_iva: (it.tipo_iva as TipoIvaVenta) ?? "10%",
          tipo_precio: (it.tipo_precio as TipoPrecioVenta) ?? "minorista",
        }));
        setItems(mapped);

        // Clientes
        try {
          const jCli = await rClientes.json();
          if (!cancelado && jCli?.success && Array.isArray(jCli.data)) {
            const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
            const lite: ClienteLite[] = (jCli.data as Record<string, unknown>[]).map((r) => ({
              id: String(r.id),
              label: s(r.empresa) || s(r.nombre_contacto) || s(r.nombre) || "Cliente",
              ruc: s(r.ruc) || null,
            }));
            setClientes(lite);
          }
        } catch { /* opcional */ }
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "Error de red.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    void cargar();
    return () => { cancelado = true; };
  }, [params.id]);

  // Totales (IVA incluido)
  const totales = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0;
    for (const it of items) {
      const totalLinea = (it.cantidad || 0) * (it.precio_venta || 0);
      const ivaLinea = calcIvaIncluido(it.tipo_iva, totalLinea);
      subtotal += totalLinea - ivaLinea;
      iva += ivaLinea;
      total += totalLinea;
    }
    return { subtotal, iva, total };
  }, [items]);

  const clienteSel = clientes.find((c) => c.id === clienteId) ?? null;

  const clientesFiltrados = clienteQuery.trim() === ""
    ? clientes.slice(0, 20)
    : clientes.filter((c) =>
        c.label.toLowerCase().includes(clienteQuery.trim().toLowerCase()) ||
        (c.ruc?.toLowerCase() ?? "").includes(clienteQuery.trim().toLowerCase())
      ).slice(0, 20);

  const agregarProducto = useCallback((payload: AgregarVentaPayload) => {
    const { producto, cantidad, precio_input, iva, tipo_precio } = payload;
    const existente = items.findIndex((x) => x.producto_id === producto.id);
    if (existente >= 0) {
      const clon = [...items];
      clon[existente] = { ...clon[existente], cantidad: clon[existente].cantidad + cantidad };
      setItems(clon);
      return true;
    }
    const nuevo: ItemEditor = {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      sku: producto.sku,
      cantidad,
      precio_venta_original: precio_input,
      precio_venta: precio_input,
      tipo_iva: iva,
      tipo_precio,
    };
    setItems((prev) => [...prev, nuevo]);
    return true;
  }, [items]);

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function actualizarItem<K extends keyof ItemEditor>(idx: number, campo: K, valor: ItemEditor[K]) {
    setItems((prev) => {
      const clon = [...prev];
      clon[idx] = { ...clon[idx], [campo]: valor };
      return clon;
    });
  }

  async function guardar() {
    if (items.length === 0) {
      setError("Debe haber al menos un producto.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const payloadItems = items.map((it) => {
        const totalLinea = it.cantidad * it.precio_venta;
        const ivaMonto = calcIvaIncluido(it.tipo_iva, totalLinea);
        return {
          producto_id: it.producto_id,
          producto_nombre: it.producto_nombre,
          sku: it.sku,
          cantidad: it.cantidad,
          precio_venta: it.precio_venta,
          precio_venta_original: it.precio_venta_original,
          tipo_iva: it.tipo_iva,
          tipo_precio: it.tipo_precio,
          subtotal: totalLinea - ivaMonto,
          monto_iva: ivaMonto,
          total_linea: totalLinea,
        };
      });
      const r = await fetch(`/api/ventas/${encodeURIComponent(params.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cliente_id: clienteId || null,
          tipo_venta: tipoVenta,
          plazo_dias: tipoVenta === "CREDITO" ? plazoDias : null,
          metodo_pago: metodoPago || null,
          items: payloadItems,
          subtotal: totales.subtotal,
          monto_iva: totales.iva,
          total: totales.total,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        setError(j?.error ?? "No se pudo guardar la venta.");
        return;
      }
      router.push("/ventas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setGuardando(false);
    }
  }

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

  if (error && !venta) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Link href="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Volver a Caja
        </Link>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-2">
          <ArrowLeft className="h-4 w-4" /> Volver a Caja
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Editar venta {venta?.numero_control}</h1>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
          >
            + Agregar producto
          </button>
        </div>
        <p className="mt-1 text-xs text-amber-700">
          Al guardar, se revierte el stock original y se descuenta el stock nuevo. Solo se puede editar ventas del día actual.
        </p>
      </div>

      {/* Datos de la venta */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Datos de la venta</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente <span className="text-xs text-gray-400">(opcional)</span></label>
            <div className="flex gap-2">
              <input
                type="text"
                value={clienteSel ? clienteSel.label : clienteQuery}
                onChange={(e) => { setClienteId(""); setClienteQuery(e.target.value); }}
                placeholder="Buscar por nombre o RUC…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              />
              {clienteSel && (
                <button
                  type="button"
                  onClick={() => { setClienteId(""); setClienteQuery(""); }}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50"
                >
                  Quitar
                </button>
              )}
            </div>
            {!clienteSel && clienteQuery.trim() !== "" && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {clientesFiltrados.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Sin clientes que coincidan.</p>
                ) : clientesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setClienteId(c.id); setClienteQuery(""); }}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-gray-800">{c.label}</span>
                    {c.ruc && <span className="ml-2 text-xs text-gray-400">RUC {c.ruc}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Condición</label>
            <div className="grid grid-cols-2 gap-2">
              {(["CONTADO", "CREDITO"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoVenta(t)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tipoVenta === t ? "bg-[#4FAEB2] text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                >
                  {t === "CONTADO" ? "Contado" : "Crédito"}
                </button>
              ))}
            </div>
            {tipoVenta === "CREDITO" && (
              <div className="mt-2">
                <label className="block text-xs text-slate-500 mb-1">Plazo (días)</label>
                <input
                  type="number"
                  value={plazoDias}
                  onChange={(e) => setPlazoDias(Number(e.target.value) || 0)}
                  className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">Productos en esta venta</div>
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No hay productos. Usá "+ Agregar producto".</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2 text-right">Cant.</th>
                  <th className="px-4 py-2 text-right">Precio unit.</th>
                  <th className="px-4 py-2 text-center">IVA</th>
                  <th className="px-4 py-2 text-right">Total línea</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const totalLinea = it.cantidad * it.precio_venta;
                  return (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-800">{it.producto_nombre}</div>
                        <div className="text-xs text-slate-400 font-mono">{it.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          value={it.cantidad}
                          min={0}
                          step="0.01"
                          onChange={(e) => actualizarItem(idx, "cantidad", Number(e.target.value) || 0)}
                          className="w-20 border border-slate-200 rounded-md px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MontoInput
                          value={it.precio_venta}
                          onChange={(n) => actualizarItem(idx, "precio_venta", n)}
                          className="w-28 border border-slate-200 rounded-md px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={it.tipo_iva}
                          onChange={(e) => actualizarItem(idx, "tipo_iva", e.target.value as TipoIvaVenta)}
                          className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                        >
                          <option value="EXENTA">Exenta</option>
                          <option value="5%">5%</option>
                          <option value="10%">10%</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {formatGs(totalLinea)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarItem(idx)}
                          className="rounded-md border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                          aria-label="Quitar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Totales + método pago */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Cobro</div>
          <div className="grid grid-cols-3 gap-2">
            {(["efectivo", "transferencia", "tarjeta"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodoPago(m)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${metodoPago === m ? "bg-[#4FAEB2] text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {m === "efectivo" ? "Efectivo" : m === "transferencia" ? "Transferencia" : "Tarjeta/Débito"}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Totales</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums text-slate-700">{formatGs(totales.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">IVA (incluido)</span><span className="tabular-nums text-slate-700">{formatGs(totales.iva)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 mt-2 font-bold text-slate-900"><span>TOTAL</span><span className="tabular-nums text-lg">{formatGs(totales.total)}</span></div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/ventas")}
          disabled={guardando}
          className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || items.length === 0}
          className="rounded-lg bg-[#4FAEB2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAgregar={agregarProducto}
        excludeIds={[]}
      />
    </div>
  );
}
