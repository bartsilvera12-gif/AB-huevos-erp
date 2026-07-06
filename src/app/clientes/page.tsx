"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import { getClientes, clienteNombre } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import { etiquetaVisibleTipoServicio, type ClienteTipoServicioRow } from "@/lib/clientes/tipo-servicio-catalogo";
import { filasTiposDesdeSistemaEstatico, fetchTiposFormCliente } from "@/lib/clientes/fetch-tipos-servicio-form";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return ""; }
}

// ── Badges ────────────────────────────────────────────────────────────────────

function BadgeEstado({ estado }: { estado: Cliente["estado"] }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      estado === "activo"
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${estado === "activo" ? "bg-green-500" : "bg-gray-400"}`} />
      {estado === "activo" ? "Activo" : "Inactivo"}
    </span>
  );
}

function BadgeOrigen({ origen }: { origen: Cliente["origen"] }) {
  const cfg = {
    CRM:    "bg-violet-100 text-violet-700",
    VENTA:  "bg-blue-100 text-blue-700",
    MANUAL: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg[origen]}`}>
      {origen}
    </span>
  );
}

// ── Columnas configurables ────────────────────────────────────────────────────

const CLIENTES_COLUMNAS_STORAGE_KEY = "neura.erp.clientes.columnas.v1";

type ClienteColumnKey =
  | "codigo"
  | "empresa_nombre"
  | "contacto"
  | "telefono"
  | "plan_activo"
  | "origen"
  | "tipo_servicio"
  | "estado"
  | "desde"
  | "creado_por"
  | "ruc_documento"
  | "email"
  | "vendedor_responsable";

type ClienteColumnDef = {
  key: ClienteColumnKey;
  label: string;
  visibleDefault: boolean;
  required?: boolean;
  headerClassName?: string;
  className?: string;
  render: (cliente: Cliente) => ReactNode;
};

const DEFAULT_VISIBLE_COLUMN_KEYS: ClienteColumnKey[] = [
  "codigo",
  "empresa_nombre",
  "contacto",
  "telefono",
  "plan_activo",
  "origen",
  "tipo_servicio",
  "estado",
  "desde",
];

function normalizeVisibleColumnKeys(raw: unknown, columns: ClienteColumnDef[]): ClienteColumnKey[] {
  const validKeys = new Set(columns.map((c) => c.key));
  const requiredKeys = columns.filter((c) => c.required).map((c) => c.key);
  const source = Array.isArray(raw) ? raw : DEFAULT_VISIBLE_COLUMN_KEYS;
  const next = source.filter((k): k is ClienteColumnKey => typeof k === "string" && validKeys.has(k as ClienteColumnKey));

  for (const key of requiredKeys) {
    if (!next.includes(key)) next.push(key);
  }
  return next.length > 0 ? next : [...DEFAULT_VISIBLE_COLUMN_KEYS];
}

function documentoCliente(c: Cliente): string {
  return c.ruc?.trim() || c.documento?.trim() || "—";
}

function VendedorResponsableCell({ cliente }: { cliente: Cliente }) {
  const nombre = cliente.vendedor_usuario_nombre?.trim();
  const email = cliente.vendedor_usuario_email?.trim();
  const legacy = cliente.vendedor_asignado?.trim();

  if (cliente.vendedor_usuario_id) {
    return nombre || email || "Usuario ERP asignado";
  }

  if (legacy) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{legacy}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Texto libre
        </span>
      </span>
    );
  }

  return <span className="text-slate-400">Sin asignar</span>;
}

function buildClienteColumns(mapNombreTipo: Record<string, string>): ClienteColumnDef[] {
  const th = "text-left text-xs font-semibold text-slate-600 px-5 py-3 whitespace-nowrap";
  const td = "px-5 py-3.5";
  return [
    {
      key: "codigo",
      label: "Código",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => (
        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {c.codigo_cliente}
        </span>
      ),
    },
    {
      key: "empresa_nombre",
      label: "Empresa / Nombre",
      visibleDefault: true,
      required: true,
      headerClassName: th,
      className: td,
      render: (c) => (
        <div className="flex items-center gap-2 min-w-56">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
            c.tipo_cliente === "empresa" ? "bg-blue-500" : "bg-violet-500"
          }`}>
            {c.tipo_cliente === "empresa" ? "E" : "P"}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">
                {clienteNombre(c)}
              </p>
              {c.perfil_tributario_activo && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Tributario
                </span>
              )}
            </div>
            {c.tipo_cliente === "empresa" && c.ruc && (
              <p className="text-xs text-gray-400">RUC: {c.ruc}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "contacto",
      label: "Contacto",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-sm text-gray-700 whitespace-nowrap`,
      render: (c) => (c.tipo_cliente === "empresa" ? c.nombre_contacto : (c.ciudad ?? "—")),
    },
    {
      key: "telefono",
      label: "Teléfono",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-sm text-gray-600 whitespace-nowrap`,
      render: (c) => c.telefono ?? "—",
    },
    {
      key: "plan_activo",
      label: "Plan activo",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => c.plan_activo ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
          {c.plan_activo}
        </span>
      ) : (
        <span className="text-xs text-gray-400 whitespace-nowrap">Sin suscripción</span>
      ),
    },
    {
      key: "origen",
      label: "Origen",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => <BadgeOrigen origen={c.origen} />,
    },
    {
      key: "tipo_servicio",
      label: "Tipo servicio",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-xs text-gray-600 whitespace-nowrap`,
      render: (c) => etiquetaVisibleTipoServicio(c.tipo_servicio_cliente ?? null, mapNombreTipo),
    },
    {
      key: "estado",
      label: "Estado",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => <BadgeEstado estado={c.estado} />,
    },
    {
      key: "desde",
      label: "Desde",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-xs text-gray-400 whitespace-nowrap`,
      render: (c) => formatFecha(c.created_at),
    },
    {
      key: "creado_por",
      label: "Creado por",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-gray-500 whitespace-nowrap`,
      render: (c) => c.created_by_nombre ?? "—",
    },
    {
      key: "ruc_documento",
      label: "RUC / documento",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-sm text-gray-600 whitespace-nowrap`,
      render: documentoCliente,
    },
    {
      key: "email",
      label: "Email",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-sm text-gray-600 whitespace-nowrap`,
      render: (c) => c.email ?? "—",
    },
    {
      key: "vendedor_responsable",
      label: "Vendedor responsable",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-gray-500 whitespace-nowrap`,
      render: (c) => <VendedorResponsableCell cliente={c} />,
    },
  ];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientesPage() {
  const searchParams = useSearchParams();
  const [clientes,    setClientes]    = useState<Cliente[]>([]);
  const [cargando,    setCargando]    = useState(true);
  const [busqueda,    setBusqueda]    = useState("");
  const [bajaOk,      setBajaOk]      = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"" | "activo" | "inactivo">("");
  const [filtroOrigen, setFiltroOrigen] = useState<"" | "CRM" | "VENTA" | "MANUAL">("");
  const [filtroTipo,   setFiltroTipo]   = useState<"" | "empresa" | "persona">("");
  const [filtroTipoServicio, setFiltroTipoServicio] = useState<"" | string>("");
  const [columnasOpen, setColumnasOpen] = useState(false);
  const [columnasInicializadas, setColumnasInicializadas] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<ClienteColumnKey[]>(DEFAULT_VISIBLE_COLUMN_KEYS);
  const [filasTipoCatalogo, setFilasTipoCatalogo] = useState<ClienteTipoServicioRow[]>(() => filasTiposDesdeSistemaEstatico());
  const [confirmarBorrar, setConfirmarBorrar] = useState<{ id: string; nombre: string } | null>(null);
  const [motivoBorrar, setMotivoBorrar] = useState("");
  const [cancelarSuscripciones, setCancelarSuscripciones] = useState(false);
  const [anularFacturas, setAnularFacturas] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  async function ejecutarBorradoCliente() {
    if (!confirmarBorrar) return;
    const motivo = motivoBorrar.trim();
    if (!motivo) {
      setErrorBorrar("El motivo de eliminación es obligatorio.");
      return;
    }
    setBorrando(true);
    setErrorBorrar(null);
    try {
      const r = await fetch(`/api/clientes/${encodeURIComponent(confirmarBorrar.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deletion_reason: motivo,
          cancelar_suscripciones: cancelarSuscripciones,
          anular_facturas_pendientes: anularFacturas,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        setErrorBorrar(j?.error ?? "No se pudo borrar el cliente.");
        return;
      }
      setClientes((prev) => prev.filter((c) => c.id !== confirmarBorrar.id));
      setConfirmarBorrar(null);
      setMotivoBorrar("");
      setCancelarSuscripciones(false);
      setAnularFacturas(false);
    } catch (e) {
      setErrorBorrar(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setBorrando(false);
    }
  }
  const mapNombreTipo = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of filasTipoCatalogo) m[t.slug] = t.nombre;
    return m;
  }, [filasTipoCatalogo]);
  const clienteColumns = useMemo(() => buildClienteColumns(mapNombreTipo), [mapNombreTipo]);
  const visibleColumnSet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys]);
  const visibleColumns = useMemo(
    () => clienteColumns.filter((col) => visibleColumnSet.has(col.key)),
    [clienteColumns, visibleColumnSet]
  );

  useEffect(() => {
    getClientes({ incluirPlanActivo: true }).then((data) => {
      setClientes(data);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    void fetchTiposFormCliente().then(setFilasTipoCatalogo);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLIENTES_COLUMNAS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setVisibleColumnKeys(normalizeVisibleColumnKeys(parsed, clienteColumns));
    } catch {
      setVisibleColumnKeys([...DEFAULT_VISIBLE_COLUMN_KEYS]);
    } finally {
      setColumnasInicializadas(true);
    }
  }, [clienteColumns]);

  useEffect(() => {
    if (!columnasInicializadas) return;
    try {
      window.localStorage.setItem(CLIENTES_COLUMNAS_STORAGE_KEY, JSON.stringify(visibleColumnKeys));
    } catch {
      /* localStorage puede fallar en modo privado; los defaults siguen funcionando. */
    }
  }, [visibleColumnKeys, columnasInicializadas]);

  const slugsExtraFiltro = useMemo(() => {
    const known = new Set(filasTipoCatalogo.map((f) => f.slug));
    const u = new Set<string>();
    for (const c of clientes) {
      const t = (c.tipo_servicio_cliente ?? "").trim();
      if (t && !known.has(t)) u.add(t);
    }
    return Array.from(u).sort();
  }, [clientes, filasTipoCatalogo]);

  useEffect(() => {
    if (searchParams?.get("baja_ok") === "1") {
      setBajaOk(true);
      window.history.replaceState({}, "", "/clientes");
      const t = setTimeout(() => setBajaOk(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const filtrados = clientes.filter((c) => {
    const nombre = clienteNombre(c).toLowerCase();
    const q      = busqueda.toLowerCase();
    if (q) {
      const match =
        nombre.includes(q) ||
        (c.codigo_cliente ?? "").toLowerCase().includes(q) ||
        (c.email          ?? "").toLowerCase().includes(q) ||
        (c.telefono       ?? "").toLowerCase().includes(q) ||
        (c.ruc            ?? "").toLowerCase().includes(q) ||
        (c.ciudad         ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filtroEstado       && c.estado              !== filtroEstado) return false;
    if (filtroOrigen       && c.origen              !== filtroOrigen) return false;
    if (filtroTipo         && c.tipo_cliente        !== filtroTipo) return false;
    if (filtroTipoServicio && c.tipo_servicio_cliente !== filtroTipoServicio) return false;
    return true;
  });

  const hayFiltros = busqueda || filtroEstado || filtroOrigen || filtroTipo || filtroTipoServicio;

  function toggleColumn(key: ClienteColumnKey) {
    const col = clienteColumns.find((c) => c.key === key);
    if (!col || col.required) return;
    setVisibleColumnKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }

  function resetColumnas() {
    setVisibleColumnKeys([...DEFAULT_VISIBLE_COLUMN_KEYS]);
  }

  return (
    <div className="space-y-6">

      {/* Mensaje de éxito baja operativa */}
      {bajaOk && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800">
          <span className="text-xl">✓</span>
          <p className="text-sm font-medium">Baja procesada correctamente</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Base
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Clientes</h1>
          <p className="mt-0.5 text-xs text-slate-500">Base de clientes activos de la empresa</p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nuevo cliente
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre, código, email, RUC..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none transition-all"
        />
        <FancySelect
          value={filtroEstado}
          onChange={(v) => setFiltroEstado(v as "" | "activo" | "inactivo")}
          ariaLabel="Filtrar por estado"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Todos los estados" },
            { value: "activo", label: "Activo" },
            { value: "inactivo", label: "Inactivo" },
          ]}
        />
        <FancySelect
          value={filtroTipo}
          onChange={(v) => setFiltroTipo(v as "" | "empresa" | "persona")}
          ariaLabel="Filtrar por tipo"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "empresa", label: "Empresa" },
            { value: "persona", label: "Persona" },
          ]}
        />
        <FancySelect
          value={filtroOrigen}
          onChange={(v) => setFiltroOrigen(v as "" | "CRM" | "VENTA" | "MANUAL")}
          ariaLabel="Filtrar por origen"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Todos los orígenes" },
            { value: "CRM", label: "CRM" },
            { value: "VENTA", label: "Venta" },
            { value: "MANUAL", label: "Manual" },
          ]}
        />
        <FancySelect
          value={filtroTipoServicio}
          onChange={(v) => setFiltroTipoServicio(v)}
          ariaLabel="Filtrar por tipo de servicio"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Tipo servicio" },
            ...filasTipoCatalogo.map((t) => ({ value: t.slug, label: t.nombre })),
            ...slugsExtraFiltro.map((slug) => ({
              value: slug,
              label: etiquetaVisibleTipoServicio(slug, mapNombreTipo),
            })),
          ]}
        />
        {hayFiltros && (
          <button
            onClick={() => { setBusqueda(""); setFiltroEstado(""); setFiltroOrigen(""); setFiltroTipo(""); setFiltroTipoServicio(""); }}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Contador */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{filtrados.length}</span> de{" "}
          <span className="font-semibold text-gray-800">{clientes.length}</span> clientes
        </p>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex gap-3 text-xs text-gray-400">
            <span>{clientes.filter((c) => c.estado === "activo").length} activos</span>
            <span>·</span>
            <span>{clientes.filter((c) => c.tipo_cliente === "empresa").length} empresas</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnasOpen((v) => !v)}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium shadow-sm transition-colors"
              aria-expanded={columnasOpen}
            >
              <span>Columnas</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {visibleColumns.length}/{clienteColumns.length}
              </span>
            </button>
            {columnasOpen && (
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="p-4 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800">Columnas</p>
                  <p className="text-xs text-slate-500 mt-1">Personalizá qué información querés ver en esta tabla.</p>
                </div>
                <div className="p-2 max-h-80 overflow-y-auto">
                  {clienteColumns.map((col) => {
                    const checked = visibleColumnSet.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          col.required ? "text-slate-500 bg-slate-50" : "text-slate-700 hover:bg-slate-50 cursor-pointer"
                        }`}
                      >
                        <span>{col.label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={col.required}
                          onChange={() => toggleColumn(col.key)}
                          className="h-4 w-4 rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3 p-3 border-t border-slate-100">
                  <p className="text-[11px] text-slate-400">Empresa / Nombre queda siempre visible.</p>
                  <button
                    type="button"
                    onClick={resetColumnas}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Restablecer columnas
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm ring-1 ring-[#4FAEB2]/15">
        {cargando ? (
          <div className="py-16 text-center text-gray-400 text-sm animate-pulse">Cargando clientes…</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium text-gray-600">
              {clientes.length === 0 ? "No hay clientes registrados" : "Sin resultados para los filtros aplicados"}
            </p>
            {clientes.length === 0 && (
              <Link href="/clientes/nuevo" className="mt-4 inline-block text-sm text-gray-500 underline hover:text-gray-800">
                Crear primer cliente
              </Link>
            )}
          </div>
        ) : /* tabla */ (
          <EdgeScrollArea>
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {visibleColumns.map((col) => (
                    <th key={col.key} className={col.headerClassName}>
                      {col.label}
                    </th>
                  ))}
                  <th className="py-3 pr-4 pl-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-200 hover:bg-[#4FAEB2]/[0.04] transition-colors cursor-pointer group"
                    onClick={() => window.location.href = `/clientes/${c.id}`}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={col.className}>
                        {col.render(c)}
                      </td>
                    ))}
                    <td className="py-4 pr-4 pl-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorBorrar(null);
                          setMotivoBorrar("");
                          setCancelarSuscripciones(false);
                          setAnularFacturas(false);
                          setConfirmarBorrar({ id: c.id, nombre: clienteNombre(c) });
                        }}
                        className="inline-flex items-center rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EdgeScrollArea>
        )}
      </div>

      <MobileFab href="/clientes/nuevo" label="Nuevo cliente" />

      {confirmarBorrar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() => !borrando && setConfirmarBorrar(null)}
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
                <h3 className="text-base font-semibold text-slate-900">Borrar cliente</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Vas a borrar <span className="font-semibold text-slate-900">&quot;{confirmarBorrar.nombre}&quot;</span>. Esta acción no se puede deshacer.
                </p>
                <label className="mt-3 block text-xs font-medium text-slate-600">Motivo <span className="text-rose-600">*</span></label>
                <textarea
                  value={motivoBorrar}
                  onChange={(e) => setMotivoBorrar(e.target.value)}
                  disabled={borrando}
                  rows={2}
                  placeholder="Ej: duplicado, dato erróneo, baja definitiva"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />

                <div className="mt-3 space-y-1.5">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={cancelarSuscripciones}
                      onChange={(e) => setCancelarSuscripciones(e.target.checked)}
                      disabled={borrando}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    Cancelar suscripciones activas del cliente
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={anularFacturas}
                      onChange={(e) => setAnularFacturas(e.target.checked)}
                      disabled={borrando}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    Anular facturas pendientes de cobro
                  </label>
                </div>

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
                disabled={borrando}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarBorradoCliente}
                disabled={borrando}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {borrando ? "Borrando…" : "Borrar cliente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
