"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGasto, updateGasto } from "@/lib/gastos/actions";
import MontoInput from "@/components/ui/MontoInput";
import type { Gasto, GastoInput } from "@/lib/gastos/actions";
import { hoyAsuncionYmd } from "@/lib/fecha/asuncion";

const fLabel = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const fInput =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white";
const FRECUENCIAS_PREDEFINIDAS = ["DIARIA", "SEMANAL", "MENSUAL", "ANUAL"];

type Props = {
  gasto?: Gasto | null;
  onSuccess?: () => void;
};

export default function GastoForm({ gasto, onSuccess }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [frecModalOpen, setFrecModalOpen] = useState(false);
  const [frecModalValue, setFrecModalValue] = useState("");
  const [frecModalError, setFrecModalError] = useState<string | null>(null);
  const [form, setForm] = useState<GastoInput>({
    categoria: gasto?.categoria ?? "",
    descripcion: gasto?.descripcion ?? "",
    monto: gasto?.monto ?? 0,
    tipo: gasto?.tipo ?? "variable",
    recurrente: gasto?.recurrente ?? false,
    frecuencia: gasto?.frecuencia ?? "",
    fecha: gasto?.fecha ?? hoyAsuncionYmd(),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, recurrente: (e.target as HTMLInputElement).checked }));
    } else if (name !== "monto") {
      const normalized = ["categoria", "descripcion", "frecuencia"].includes(name) ? value.toUpperCase() : value;
      setForm((prev) => ({ ...prev, [name]: normalized }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.monto <= 0) {
      return setError("El monto debe ser mayor a 0.");
    }

    setGuardando(true);

    try {
      if (gasto) {
        await updateGasto(gasto.id, form);
      } else {
        await createGasto(form);
      }
      onSuccess?.();
      router.push("/gastos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5 pb-2 border-b border-slate-200">
          <span className="text-base">📋</span>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Datos del gasto
          </h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className={fLabel}>Categoría</label>
            <input
              type="text"
              name="categoria"
              value={form.categoria}
              onChange={handleChange}
              placeholder="Ej: Servicios, Alquiler, Salarios"
              className={fInput}
            />
          </div>
          <div>
            <label className={fLabel}>Descripción</label>
            <textarea
              name="descripcion"
              value={form.descripcion}
              onChange={handleChange}
              placeholder="Descripción del gasto"
              className={fInput}
              rows={2}
            />
          </div>
          <div>
            <label className={fLabel}>Monto (Gs.) *</label>
            <MontoInput
              value={form.monto}
              onChange={(n) => setForm((prev) => ({ ...prev, monto: n }))}
              placeholder="0"
              className={fInput}
              required
            />
          </div>
          <div>
            <label className={fLabel}>Tipo</label>
            <select
              name="tipo"
              value={form.tipo}
              onChange={handleChange}
              className={fInput}
            >
              <option value="variable">Variable</option>
              <option value="fijo">Fijo</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="recurrente"
              name="recurrente"
              checked={form.recurrente}
              onChange={handleChange}
              className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
            />
            <label htmlFor="recurrente" className="text-sm text-slate-700">
              Gasto recurrente
            </label>
          </div>
          {form.recurrente && (
            <div>
              <label className={fLabel}>Frecuencia</label>
              <div className="flex gap-2">
                <select
                  name="frecuencia"
                  value={FRECUENCIAS_PREDEFINIDAS.includes(form.frecuencia ?? "") ? (form.frecuencia ?? "") : (form.frecuencia ? "__custom__" : "")}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") return;
                    setForm((prev) => ({ ...prev, frecuencia: e.target.value }));
                  }}
                  className={fInput}
                >
                  <option value="">Elegí una frecuencia…</option>
                  <option value="DIARIA">Diaria</option>
                  <option value="SEMANAL">Semanal</option>
                  <option value="MENSUAL">Mensual</option>
                  <option value="ANUAL">Anual</option>
                  {form.frecuencia && !FRECUENCIAS_PREDEFINIDAS.includes(form.frecuencia) && (
                    <option value="__custom__">{form.frecuencia}</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => { setFrecModalError(null); setFrecModalValue(""); setFrecModalOpen(true); }}
                  className="shrink-0 rounded-md border border-sky-200 bg-white px-3 text-xs font-medium text-sky-700 hover:border-sky-300 hover:bg-sky-50 transition-colors"
                >
                  + Otra
                </button>
              </div>
            </div>
          )}
          <div>
            <label className={fLabel}>Fecha *</label>
            <input
              type="date"
              name="fecha"
              value={form.fecha}
              onChange={handleChange}
              className={fInput}
              required
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={guardando}
          className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? "Guardando…" : gasto ? "Guardar cambios" : "Crear gasto"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/gastos")}
          className="border border-slate-200 text-sm px-6 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>

      {frecModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() => setFrecModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Nueva frecuencia</h3>
            <p className="mt-1 text-sm text-slate-500">Definí una frecuencia personalizada para este gasto recurrente.</p>
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600">Nombre</label>
              <input
                type="text"
                autoFocus
                value={frecModalValue}
                onChange={(e) => setFrecModalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = frecModalValue.trim().toUpperCase();
                    if (!v) { setFrecModalError("Ingresá un nombre."); return; }
                    setForm((prev) => ({ ...prev, frecuencia: v }));
                    setFrecModalOpen(false);
                  }
                }}
                placeholder="Ej: QUINCENAL, TRIMESTRAL"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              {frecModalError && (
                <p className="mt-2 text-xs text-rose-600">{frecModalError}</p>
              )}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFrecModalOpen(false)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = frecModalValue.trim().toUpperCase();
                  if (!v) { setFrecModalError("Ingresá un nombre."); return; }
                  setForm((prev) => ({ ...prev, frecuencia: v }));
                  setFrecModalOpen(false);
                }}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
