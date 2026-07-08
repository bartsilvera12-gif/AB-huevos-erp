"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto, MetodoValuacion } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import StatCard from "@/components/ui/StatCard";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

const metodoBadge: Record<MetodoValuacion, string> = {
  CPP: "bg-blue-100 text-blue-700",
  FIFO: "bg-green-100 text-green-700",
  LIFO: "bg-purple-100 text-purple-700",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

/** Cantidad de stock con hasta 3 decimales (los insumos pueden quedar fraccionados). */
function formatStock(valor: number) {
  return valor.toLocaleString("es-PY", { maximumFractionDigits: 3 });
}

function foldText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

interface UbicacionMin { id: string; nombre: string; tipo: string }

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>(""); // "", "__sin__" o id
  const [refreshKey, setRefreshKey] = useState(0);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<{ id: string; nombre: string } | null>(null);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  // Filtros por columna
  const [filtroPorNombre,  setFiltroPorNombre]  = useState("");
  const [filtroPorSku,     setFiltroPorSku]     = useState("");
  const [filtroPorCosto,   setFiltroPorCosto]   = useState("");
  const [filtroPorPrecio,  setFiltroPorPrecio]  = useState("");
  const [filtroValuacion,  setFiltroValuacion]  = useState<MetodoValuacion | "">("");
  const [filtroUbicacion,  setFiltroUbicacion]  = useState<string>(""); // "", "__sin__" o id
  const [filtroTipo,       setFiltroTipo]       = useState<"todos" | "vendibles" | "insumos" | "mixtos">("todos");
  const [tab,              setTab]               = useState<"reventa" | "menu" | "materia">("reventa");
  const [cargandoLista,    setCargandoLista]     = useState(true);
  const [soloStockBajo,    setSoloStockBajo]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCargandoLista(true);
    getProductos()
      .then((data) => {
        if (!cancelled) setTodos(data);
      })
      .finally(() => {
        if (!cancelled) setCargandoLista(false);
      });
    // Ubicaciones para el filtro
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    // Categorías para el filtro
    fetch("/api/inventario/categorias", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const rows = (j.data?.categorias ?? []) as { id: string; nombre: string }[];
        setCategorias(rows.map((c) => ({ id: c.id, nombre: c.nombre })));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);

  function abrirConfirmarBorrar(id: string, nombre: string) {
    if (borrandoId) return;
    setErrorBorrar(null);
    setConfirmarBorrar({ id, nombre });
  }

  async function ejecutarBorrado() {
    if (!confirmarBorrar) return;
    const { id } = confirmarBorrar;
    setBorrandoId(id);
    setErrorBorrar(null);
    try {
      const r = await fetch(`/api/productos/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        setErrorBorrar(j?.error ?? "No se pudo borrar el producto.");
        return;
      }
      setTodos((prev) => prev.filter((p) => p.id !== id));
      setConfirmarBorrar(null);
    } catch (e) {
      setErrorBorrar(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setBorrandoId(null);
    }
  }

  // Map se reconstruia en cada render del componente (cualquier setState de
  // filtro): O(N) basura por keystroke. useMemo lo cachea hasta que cambia ubicaciones.
  const ubicacionById = useMemo(
    () => new Map(ubicaciones.map((u) => [u.id, u])),
    [ubicaciones],
  );

  // Lista filtrada: el filter recorre `todos` en cada keystroke de los filtros.
  // Con catalogos de 500-5000 productos esto era visible (lag al tipear).
  // useMemo solo recalcula cuando cambian las dependencias relevantes.
  const productos = useMemo(() => todos.filter((p) => {
    // Nombre — fold accents/diacritics ("atun" matchea "ATÚN")
    if (filtroPorNombre.trim() !== "" &&
        !foldText(p.nombre).includes(foldText(filtroPorNombre.trim())))
      return false;

    // SKU
    if (filtroPorSku.trim() !== "" &&
        !foldText(p.sku).includes(foldText(filtroPorSku.trim())))
      return false;

    // Costo promedio — acepta "35000" o "35.000"
    if (filtroPorCosto.trim() !== "") {
      const t = filtroPorCosto.trim();
      const coincide =
        String(p.costo_promedio).includes(t) ||
        p.costo_promedio.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Precio venta — acepta "75000" o "75.000"
    if (filtroPorPrecio.trim() !== "") {
      const t = filtroPorPrecio.trim();
      const coincide =
        String(p.precio_venta).includes(t) ||
        p.precio_venta.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Valuación
    if (filtroValuacion !== "" && p.metodo_valuacion !== filtroValuacion) return false;

    // Ubicación
    if (filtroUbicacion === "__sin__") {
      if (p.ubicacion_principal_id) return false;
    } else if (filtroUbicacion !== "") {
      if (p.ubicacion_principal_id !== filtroUbicacion) return false;
    }

    // Categoría principal
    if (filtroCategoria === "__sin__") {
      if (p.categoria_principal_id) return false;
    } else if (filtroCategoria !== "") {
      if (p.categoria_principal_id !== filtroCategoria) return false;
    }

    // Solo stock bajo
    if (soloStockBajo && p.stock_actual > p.stock_minimo) return false;

    // Tipo gastronómico (vendible/insumo/mixto)
    if (filtroTipo !== "todos") {
      const v = p.es_vendible !== false; // default true si null/undef
      const i = p.es_insumo === true;
      if (filtroTipo === "mixtos" && !(v && i)) return false;
      if (filtroTipo === "vendibles" && !(v && !i)) return false;
      if (filtroTipo === "insumos" && !(i && !v)) return false;
    }

    // Filtro por tab (Reventa | Menú | Materia prima)
    const esVendible    = p.es_vendible !== false;
    const esInsumo      = p.es_insumo === true;
    const controlaStock = p.controla_stock !== false; // default true
    if (tab === "reventa") {
      // vendibles que mueven stock real (gaseosas, postres comprados, etc.)
      if (!esVendible || !controlaStock || esInsumo) return false;
    } else if (tab === "menu") {
      // productos preparados (pizzas, lomitos, combos): vendibles SIN stock
      if (!esVendible || controlaStock || esInsumo) return false;
    } else {
      // materia prima / insumos
      if (!esInsumo) return false;
    }

    return true;
  }), [
    todos,
    filtroPorNombre,
    filtroPorSku,
    filtroPorCosto,
    filtroPorPrecio,
    filtroValuacion,
    filtroUbicacion,
    filtroCategoria,
    soloStockBajo,
    filtroTipo,
    tab,
  ]);

  // Resumen del listado visible (por pestaña). Solo productos que controlan stock
  // entran en valorizado / bajo / disponibles; el resto (Menú sin control) se cuenta
  // únicamente en "Total productos".
  const resumen = useMemo(() => {
    // Tienen stock real: Reventa (controla_stock) y Materia prima (insumos, que se
    // mueven por compras/recetas). Solo el Menú "sin control" queda fuera.
    // produccion_previa (Menú fabricado y stockeado) sí maneja stock real del terminado.
    const conStock = productos.filter(
      (p) => !(p.controla_stock === false && p.es_insumo !== true && p.modo_receta !== "produccion_previa")
    );
    const stockValorizado = conStock.reduce((s, p) => s + p.stock_actual * p.costo_promedio, 0);
    const bajo = conStock.filter((p) => p.stock_actual <= p.stock_minimo).length;
    const disponibles = conStock.filter((p) => p.stock_actual > 0).length;
    return { total: productos.length, stockValorizado, bajo, disponibles, conStock: conStock.length };
  }, [productos]);

  const hayFiltrosActivos =
    filtroPorNombre || filtroPorSku || filtroPorCosto ||
    filtroPorPrecio || filtroValuacion || filtroUbicacion || soloStockBajo ||
    filtroTipo !== "todos";

  function limpiarFiltros() {
    setFiltroPorNombre("");
    setFiltroPorSku("");
    setFiltroPorCosto("");
    setFiltroPorPrecio("");
    setFiltroValuacion("");
    setFiltroUbicacion("");
    setSoloStockBajo(false);
    setFiltroTipo("todos");
  }

  return (
    <div className="space-y-8">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Stock
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gestión de productos y control de stock</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ExportExcelButton url="/api/inventario/productos/export" />
          <ImportExcelButton
            entidad="Productos"
            previewUrl="/api/inventario/productos/import/preview"
            commitUrl="/api/inventario/productos/import/commit"
            templateUrl="/api/inventario/productos/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      {/* Tabs gastronómicos (filtran por tipo de producto) */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
          {([
            { id: "reventa", label: "Reventa", subtitle: "Productos comprados y revendidos" },
            { id: "menu",    label: "Menú",    subtitle: "Productos preparados por el local" },
            { id: "materia", label: "Materia prima", subtitle: "Insumos para costeo/recetas" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
              title={t.subtitle}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Resumen por pestaña */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard compact label="Total productos" value={String(resumen.total)} accent
          hint={tab === "reventa" ? "Reventa" : tab === "menu" ? "Menú" : "Materia prima"} />
        <StatCard compact label="Stock valorizado" value={formatGs(Math.round(resumen.stockValorizado))}
          hint="stock × costo prom." />
        <StatCard compact label="Stock bajo" value={String(resumen.bajo)}
          hint="≤ stock mínimo" />
        <StatCard compact
          label={tab === "materia" ? "Materias disponibles" : "Con stock disponible"}
          value={String(resumen.disponibles)} hint="stock > 0" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 sm:p-5 lg:p-6">

        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">Productos</h2>
            <Link
              href="/inventario/nuevo"
              className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
            >
              Nuevo producto
            </Link>
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={filtroPorNombre}
              onChange={(e) => setFiltroPorNombre(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none sm:w-64 sm:flex-none"
            />
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              title="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              <option value="__sin__">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtros por columna — fila 1 (SKU/Costo/Precio) oculta para UX simplificada */}
        <div className="hidden space-y-3 mb-5 pb-5 border-b border-gray-100">

          {/* Fila 1: filtros de texto por columna */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre</label>
              <input
                type="text"
                placeholder="Buscar nombre..."
                value={filtroPorNombre}
                onChange={(e) => setFiltroPorNombre(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SKU</label>
              <input
                type="text"
                placeholder="Buscar SKU..."
                value={filtroPorSku}
                onChange={(e) => setFiltroPorSku(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Costo promedio</label>
              <input
                type="text"
                placeholder="Ej: 35000"
                value={filtroPorCosto}
                onChange={(e) => setFiltroPorCosto(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Precio venta</label>
              <input
                type="text"
                placeholder="Ej: 75000"
                value={filtroPorPrecio}
                onChange={(e) => setFiltroPorPrecio(e.target.value)}
                className={inputFilterClass}
              />
            </div>
          </div>

          {/* Fila 2: valuación, ubicación, stock bajo, limpiar y contador
              Ocultada para instancia En lo de Mari — la lógica de filtros sigue activa pero sin UI. */}
          <div className="hidden flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valuación</label>
              <select
                value={filtroValuacion}
                onChange={(e) => setFiltroValuacion(e.target.value as MetodoValuacion | "")}
                className={inputFilterClass}
              >
                <option value="">Todos los métodos</option>
                <option value="CPP">CPP</option>
                <option value="FIFO">FIFO</option>
                <option value="LIFO">LIFO</option>
              </select>
            </div>
            <div className="min-w-[14rem]">
              <label className="block text-xs text-gray-400 mb-1">Depósito / Ubicación</label>
              <select
                value={filtroUbicacion}
                onChange={(e) => setFiltroUbicacion(e.target.value)}
                className={`${inputFilterClass} w-full`}
              >
                <option value="">Todas las ubicaciones</option>
                <option value="__sin__">Sin ubicación asignada</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} — {u.tipo}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none mt-4">
              <input
                type="checkbox"
                checked={soloStockBajo}
                onChange={(e) => setSoloStockBajo(e.target.checked)}
                className="rounded"
              />
              Solo stock bajo
            </label>
            <div className="mt-4 flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5">
              {(["todos","vendibles","insumos","mixtos"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFiltroTipo(opt)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                    filtroTipo === opt
                      ? "bg-white text-amber-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt === "todos" ? "Todos" : opt[0].toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
              >
                Limpiar filtros
              </button>
            )}
            <span className="ml-auto text-sm text-gray-400 self-end mb-0.5">
              {productos.length} de {todos.length} productos
            </span>
          </div>

        </div>

        <EdgeScrollArea>
          {/* min-w-[1100px] fuerza scroll horizontal real en mobile; en >=lg
              vuelve a comportarse natural. Columnas no críticas (SKU, Unidad,
              Ubicacion, Valuacion, Margen) se ocultan progresivamente. */}
          <table className="w-full min-w-[780px] lg:min-w-0 text-left text-sm">

            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="hidden py-3 pr-4 font-medium lg:table-cell">SKU</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                {tab !== "materia" && <th className="py-3 pr-4 font-medium">Precio Venta</th>}
                <th className="py-3 pr-4 font-medium text-center">Stock actual</th>
                <th className="py-3 pr-4 text-center font-medium hidden lg:table-cell">Stock Mín.</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">Ubicación</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">Valuación</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">IVA</th>
                {tab !== "materia" && (
                  <th className="hidden py-3 pr-6 text-right font-medium lg:table-cell">
                    <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                  </th>
                )}
                <th className="py-3 pl-4 font-medium text-center w-28">Acción</th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                // "Sin control" SOLO para Menú (vendible sin stock). Los insumos
                // (Materia prima) sí tienen stock real aunque controla_stock=false.
                const sinControl =
                  p.controla_stock === false && p.es_insumo !== true && p.modo_receta !== "produccion_previa";
                return (
                  <tr key={p.id} className="border-b border-slate-200 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="py-4 pr-4 font-medium text-gray-800">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{p.nombre}</span>
                        {(() => {
                          const v = p.es_vendible !== false;
                          const i = p.es_insumo === true;
                          // Mixto/Insumo se siguen mostrando; Vendible queda oculto (redundante: ya hay tab).
                          if (v && i) return <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5">Mixto</span>;
                          if (i) return <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium px-2 py-0.5">Insumo</span>;
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="hidden py-4 pr-4 font-mono text-gray-500 lg:table-cell">{p.sku}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    {tab !== "materia" && <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>}
                    <td className="py-4 pr-4 text-center">
                      {sinControl ? (
                        <span className="text-xs text-gray-400">— sin control</span>
                      ) : (
                        <span className={`font-semibold tabular-nums ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                          {formatStock(p.stock_actual)}{" "}
                          <span className={`text-xs font-normal ${stockBajo ? "text-red-400" : "text-gray-400"}`}>{p.unidad_medida}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500 hidden lg:table-cell">
                      {sinControl ? "—" : <span className="tabular-nums">{formatStock(p.stock_minimo)}</span>}
                    </td>
                    <td className="py-4 pr-4 text-gray-600 text-xs hidden lg:table-cell">
                      {p.ubicacion_principal_id
                        ? (() => {
                            const u = ubicacionById.get(p.ubicacion_principal_id);
                            return u ? (
                              <span>
                                <span className="font-medium text-gray-700">{u.nombre}</span>
                                <span className="text-gray-400"> — {u.tipo}</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            );
                          })()
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-4 pr-4 hidden lg:table-cell">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${metodoBadge[p.metodo_valuacion]}`}>
                        {p.metodo_valuacion}
                      </span>
                    </td>
                    <td className="py-4 pr-4 hidden lg:table-cell">
                      {(() => {
                        const iv = (p as { tipo_iva?: string }).tipo_iva;
                        const label = iv === "EXENTA" ? "Exenta" : (iv ?? "—");
                        const cls =
                          iv === "10%" ? "bg-sky-100 text-sky-800"
                          : iv === "5%" ? "bg-emerald-100 text-emerald-800"
                          : iv === "EXENTA" ? "bg-slate-100 text-slate-700"
                          : "bg-slate-50 text-slate-400";
                        return (
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
                        );
                      })()}
                    </td>
                    {tab !== "materia" && (
                      <td className={`hidden py-4 pr-6 text-right font-semibold tabular-nums lg:table-cell ${margenColor(margen)}`}>
                        {margen.toFixed(2)}%
                      </td>
                    )}
                    <td className="py-4 pl-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/inventario/${p.id}/editar`}
                          className="inline-flex items-center justify-center min-h-[40px] rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => abrirConfirmarBorrar(p.id, p.nombre)}
                          disabled={borrandoId === p.id}
                          className="inline-flex items-center justify-center min-h-[40px] rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors disabled:opacity-50"
                        >
                          {borrandoId === p.id ? "…" : "Borrar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </EdgeScrollArea>

      </div>

      {confirmarBorrar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() => !borrandoId && setConfirmarBorrar(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">Borrar producto</h3>
                <p className="mt-1 text-sm text-slate-600">
                  ¿Seguro que querés borrar <span className="font-semibold text-slate-900">&quot;{confirmarBorrar.nombre}&quot;</span>?
                </p>
                <p className="mt-1 text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                {errorBorrar && (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {errorBorrar}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmarBorrar(null)}
                disabled={!!borrandoId}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarBorrado}
                disabled={!!borrandoId}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {borrandoId ? "Borrando…" : "Borrar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
