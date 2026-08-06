"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Fragment } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ArrowLeft, ChevronRight, FileText, Printer, Download } from "lucide-react";

type FacturaRow = {
  id: string;
  numero_factura?: string | null;
  fecha?: string | null;
  fecha_emision?: string | null;
  cliente_display?: string | null;
  cliente_nombre?: string | null;
  monto?: number | string | null;
  total?: number | string | null;
  saldo?: number | string | null;
  estado?: string | null;
  tipo?: string | null;
  moneda?: string | null;
  factura_electronica?: { estado_sifen?: string | null } | null;
  estado_sifen?: string | null;
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmtGs(n: number | string | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  return "Gs. " + v.toLocaleString("es-PY");
}
function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}
function ymOf(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 7); // yyyy-mm
}
function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Math.max(1, Math.min(12, Number(m))) - 1;
  return `${MESES[idx]} ${y}`;
}

export default function FacturasHistorialPage() {
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/facturas", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) { setError(j?.error ?? "No se pudieron cargar las facturas."); setCargando(false); return; }
        // La respuesta viene como data directo (array) o dentro de data.
        const arr: FacturaRow[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        setFacturas(arr);
      } catch {
        setError("Error de red al cargar facturas.");
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtradas = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return facturas;
    return facturas.filter((f) => {
      const n = String(f.numero_factura ?? "").toLowerCase();
      const c = String(f.cliente_display ?? f.cliente_nombre ?? "").toLowerCase();
      return n.includes(query) || c.includes(query);
    });
  }, [facturas, q]);

  // Agrupar por mes.
  const grupos = useMemo(() => {
    const m = new Map<string, FacturaRow[]>();
    for (const f of filtradas) {
      const ym = ymOf(f.fecha ?? f.fecha_emision);
      if (!ym) continue;
      if (!m.has(ym)) m.set(ym, []);
      m.get(ym)!.push(f);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // más reciente primero
      .map(([ym, filas]) => {
        const totalMonto = filas.reduce((s, x) => s + (Number(x.monto ?? x.total) || 0), 0);
        return { ym, filas, count: filas.length, total: totalMonto };
      });
  }, [filtradas]);

  function toggle(ym: string) {
    const next = new Set(abiertos);
    if (next.has(ym)) next.delete(ym); else next.add(ym);
    setAbiertos(next);
  }

  // Exportar a CSV (Excel abre CSV con ; como separador en locales es).
  function descargarCsv(filas: FacturaRow[], nombreArchivo: string) {
    const headers = ["N° Factura", "Fecha", "Cliente", "SIFEN", "Monto", "Saldo", "Moneda", "Tipo"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      if (s.includes(";") || s.includes("\n") || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows = filas.map((f) => [
      f.numero_factura ?? "",
      fmtFecha(f.fecha ?? f.fecha_emision),
      f.cliente_display ?? f.cliente_nombre ?? "",
      estadoSifen(f) || "sin estado",
      Math.round(Number(f.monto ?? f.total) || 0),
      Math.round(Number(f.saldo) || 0),
      f.moneda ?? "GS",
      f.tipo ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\n");
    // BOM UTF-8 para que Excel reconozca acentos.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const estadoSifen = (f: FacturaRow): string => {
    return String(f.factura_electronica?.estado_sifen ?? f.estado_sifen ?? "").trim();
  };
  const puedeImprimirTicket = (f: FacturaRow) => {
    const s = estadoSifen(f);
    return s === "aprobado" || s === "enviado";
  };

  return (
    <div className="space-y-5">
      <Link href="/ventas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Volver a Caja
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-[#4FAEB2]" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Historial de facturas</h1>
            <p className="text-sm text-slate-500">Agrupado por mes. Cada factura se puede imprimir en ticket 80/58mm o A4 PDF.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => descargarCsv(filtradas, `facturas-todas-${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={filtradas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Descargar todas las facturas como CSV (Excel)"
          >
            <Download className="h-4 w-4" /> Descargar todo (CSV)
          </button>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número o cliente…"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm w-72"
          />
        </div>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {cargando ? (
        <div className="p-10 text-center text-sm text-slate-400">Cargando facturas…</div>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Sin facturas registradas.
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const abierto = abiertos.has(g.ym);
            return (
              <div key={g.ym} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggle(g.ym)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`} />
                    <span className="font-semibold text-slate-800">{ymLabel(g.ym)}</span>
                    <span className="text-xs text-slate-500">· {g.count} factura{g.count === 1 ? "" : "s"}</span>
                  </button>
                  <div className="flex items-center gap-3">
                    <a
                      href={`/api/facturas/mes/${g.ym}/pdf`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
                      title={`Descargar todas las facturas aprobadas de ${ymLabel(g.ym)} en un PDF único`}
                    >
                      <Download className="h-3 w-3" /> PDF único
                    </a>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); descargarCsv(g.filas, `facturas-${g.ym}.csv`); }}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      title={`Descargar CSV de ${ymLabel(g.ym)}`}
                    >
                      <Download className="h-3 w-3" /> CSV
                    </button>
                    <div className="text-right">
                      <span className="text-xs uppercase text-slate-400 mr-2">Total del mes</span>
                      <span className="font-bold tabular-nums text-slate-900">{fmtGs(g.total)}</span>
                    </div>
                  </div>
                </div>
                {abierto && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                        <tr>
                          <th className="py-2 px-4 text-left font-medium">N° Factura</th>
                          <th className="py-2 px-4 text-left font-medium">Fecha</th>
                          <th className="py-2 px-4 text-left font-medium">Cliente</th>
                          <th className="py-2 px-4 text-left font-medium">SIFEN</th>
                          <th className="py-2 px-4 text-right font-medium">Monto</th>
                          <th className="py-2 px-4 text-right font-medium">Imprimir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.filas.map((f) => {
                          const st = estadoSifen(f);
                          const stColor =
                            st === "aprobado" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : st === "enviado" ? "bg-amber-50 border-amber-200 text-amber-800"
                            : st === "rechazado" ? "bg-rose-50 border-rose-200 text-rose-800"
                            : "bg-slate-50 border-slate-200 text-slate-600";
                          return (
                            <tr key={f.id} className="hover:bg-slate-50/60">
                              <td className="py-2 px-4">
                                <Link href={`/facturas/${f.id}`} className="font-mono text-xs text-[#3F8E91] hover:underline">
                                  {f.numero_factura ?? "—"}
                                </Link>
                              </td>
                              <td className="py-2 px-4 text-slate-600 tabular-nums text-xs">{fmtFecha(f.fecha ?? f.fecha_emision)}</td>
                              <td className="py-2 px-4 text-slate-700">{f.cliente_display ?? f.cliente_nombre ?? "—"}</td>
                              <td className="py-2 px-4">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stColor}`}>
                                  {st || "sin estado"}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{fmtGs(f.monto ?? f.total)}</td>
                              <td className="py-2 px-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  {puedeImprimirTicket(f) && (
                                    <a
                                      href={`/api/facturas/${f.id}/ticket?w=80`}
                                      target="_blank"
                                      rel="noopener"
                                      className="inline-flex items-center gap-1 rounded-md border border-[#4FAEB2]/40 bg-[#4FAEB2]/[0.06] px-2.5 py-1 text-xs font-medium text-[#3F8E91] hover:bg-[#4FAEB2]/[0.12]"
                                      title="Ticket térmico 80mm"
                                    >
                                      <Printer className="h-3 w-3" /> 80mm
                                    </a>
                                  )}
                                  {puedeImprimirTicket(f) && (
                                    <a
                                      href={`/api/facturas/${f.id}/ticket?w=58`}
                                      target="_blank"
                                      rel="noopener"
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                      title="Ticket térmico 58mm"
                                    >
                                      58mm
                                    </a>
                                  )}
                                  <a
                                    href={`/api/facturas/${f.id}/sifen/kude`}
                                    target="_blank"
                                    rel="noopener"
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                    title="A4 PDF (KuDE)"
                                  >
                                    A4
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// evita "unused" lint por Fragment si Next tree-shakes.
void Fragment;
