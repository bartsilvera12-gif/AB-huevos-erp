"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, Send } from "lucide-react";
import {
  PRODUCTOS_DEMO,
  UBICACIONES_DEMO,
  getStock,
  crearNR,
  nombreUbicacion,
} from "@/lib/demo-multideposito/store";

function fmt(n: number) { return n.toLocaleString("es-PY"); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }

export default function EmitirNRPage() {
  const router = useRouter();
  const [stock, setStock] = useState<Record<string, Record<string, number>>>({});
  const [origen, setOrigen] = useState("central");
  const [destino, setDestino] = useState("abasto_norte");
  const [motivo, setMotivo] = useState<"traslado" | "venta" | "devolucion">("traslado");
  const [emisor, setEmisor] = useState("");
  const [obs, setObs] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [transportista, setTransportista] = useState("");
  const [rucTransp, setRucTransp] = useState("");
  const [conductor, setConductor] = useState("");
  const [ciConductor, setCiConductor] = useState("");
  const [chapa, setChapa] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<{ id: string; numero: string } | null>(null);

  useEffect(() => { setStock(getStock()); }, []);

  const total = useMemo(
    () => Object.values(cantidades).reduce((s, n) => s + (n || 0), 0),
    [cantidades]
  );

  function emitir() {
    setError(null);
    if (origen === destino) { setError("Origen y destino no pueden ser iguales."); return; }
    if (!emisor.trim()) { setError("Emisor obligatorio."); return; }
    const items = PRODUCTOS_DEMO
      .filter((p) => (cantidades[p.id] ?? 0) > 0)
      .map((p) => ({ producto_id: p.id, cantidad: cantidades[p.id] }));
    if (items.length === 0) { setError("Cargá al menos 1 producto con cantidad > 0."); return; }
    for (const it of items) {
      const disp = stock[origen]?.[it.producto_id] ?? 0;
      if (it.cantidad > disp) {
        const p = PRODUCTOS_DEMO.find((x) => x.id === it.producto_id);
        setError(`${nombreUbicacion(origen)} no tiene stock suficiente de ${p?.nombre}: hay ${disp}, se piden ${it.cantidad}.`);
        return;
      }
    }
    const nr = crearNR({
      emisor: emisor.trim(),
      origen,
      destino,
      motivo,
      items,
      observaciones: obs.trim() || undefined,
      transporte: {
        transportista: transportista.trim() || undefined,
        ruc_transportista: rucTransp.trim() || undefined,
        conductor: conductor.trim() || undefined,
        ci_conductor: ciConductor.trim() || undefined,
        chapa: chapa.trim() || undefined,
        fecha_inicio_traslado: fechaInicio || undefined,
        fecha_fin_traslado: fechaFin || undefined,
      },
    });
    setCreada({ id: nr.id, numero: nr.numero });
  }

  if (creada) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm text-emerald-900">
          <h2 className="text-lg font-semibold">✓ Nota de Remisión {creada.numero} emitida</h2>
          <p className="mt-2 text-sm">Queda en estado <strong>pendiente</strong> hasta que {nombreUbicacion(destino)} confirme la recepción.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`/notas-remision/${creada.id}/documento`}
              target="_blank"
              rel="noopener"
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              📄 Imprimir documento
            </a>
            <Link href="/notas-remision" className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">Ver historial</Link>
            <button
              type="button"
              onClick={() => { setCreada(null); setCantidades({}); setEmisor(""); setObs(""); }}
              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >Emitir otra</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-amber-50/40 to-amber-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-100/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-600" /> Nueva emisión
          </span>
        </div>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <span className="rounded-lg bg-white p-1.5 ring-1 ring-amber-300/40 shadow-sm">
            <Truck className="h-5 w-5 text-amber-700" />
          </span>
          Emitir Nota de Remisión
        </h1>
        <p className="mt-1 text-sm text-slate-500">Traslado de mercadería entre depósitos. Se genera un documento imprimible y queda pendiente hasta que el destino confirme.</p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* Datos generales */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Datos generales</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Depósito Origen *">
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
              {UBICACIONES_DEMO.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Field>
          <Field label="Depósito Destino *">
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
              {UBICACIONES_DEMO.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Field>
          <Field label="Motivo">
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="traslado">Traslado</option>
              <option value="venta">Venta</option>
              <option value="devolucion">Devolución</option>
            </select>
          </Field>
          <Field label="Emisor *">
            <input type="text" value={emisor} onChange={(e) => setEmisor(e.target.value)} placeholder="Ej: Marcial (Central)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>
      </div>

      {/* Transporte */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Transporte (opcional)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Transportista">
            <input type="text" value={transportista} onChange={(e) => setTransportista(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="RUC transportista">
            <input type="text" value={rucTransp} onChange={(e) => setRucTransp(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Conductor">
            <input type="text" value={conductor} onChange={(e) => setConductor(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="CI conductor">
            <input type="text" value={ciConductor} onChange={(e) => setCiConductor(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Chapa vehículo">
            <input type="text" value={chapa} onChange={(e) => setChapa(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Inicio traslado">
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Fin traslado">
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>
      </div>

      {/* Productos */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Productos a trasladar</h2>
          <p className="text-xs text-slate-500">Disponibles en <strong>{nombreUbicacion(origen)}</strong></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3 text-right">Disponible en origen</th>
                <th className="px-5 py-3 text-right w-40">Cantidad a enviar</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTOS_DEMO.map((p) => {
                const disp = stock[origen]?.[p.id] ?? 0;
                const cant = cantidades[p.id] ?? 0;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 font-semibold text-slate-700">{p.nombre}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{fmt(disp)}</td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        max={disp}
                        value={cant === 0 ? "" : cant}
                        placeholder="0"
                        onChange={(e) => setCantidades({ ...cantidades, [p.id]: Number(e.target.value) || 0 })}
                        className={`w-full rounded-md border px-2 py-1 text-right text-sm ${cant > disp ? "border-rose-400 bg-rose-50" : "border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"}`}
                      />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold text-slate-700">
                <td className="px-5 py-3">Total planchas</td>
                <td className="px-5 py-3"></td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="text-xs font-medium text-slate-600">Observaciones</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none" />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push("/notas-remision")} className="rounded-md border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={emitir} className="rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md inline-flex items-center gap-2">
          <Send className="h-4 w-4" />
          Emitir NR
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
