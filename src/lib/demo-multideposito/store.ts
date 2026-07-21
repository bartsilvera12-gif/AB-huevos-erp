"use client";

/**
 * Demo multi-depósito — estado hardcodeado en localStorage.
 * NO conecta a la DB. Solo para validar el flujo con el cliente.
 */

export type DemoUbicacion = { id: string; nombre: string; codigo: string };

export const UBICACIONES_DEMO: DemoUbicacion[] = [
  { id: "central",      nombre: "Casa Central", codigo: "CENTRAL" },
  { id: "abasto_norte", nombre: "Abasto Norte", codigo: "ABASTO-N" },
];

export type DemoProducto = {
  id: string;
  nombre: string;
  sku: string;
  unidad: string;
};

export const PRODUCTOS_DEMO: DemoProducto[] = [
  { id: "p-jumbo",   nombre: "Huevo Jumbo",   sku: "HJU-30", unidad: "plancha" },
  { id: "p-super",   nombre: "Huevo Super",   sku: "HSU-30", unidad: "plancha" },
  { id: "p-tipoa",   nombre: "Huevo Tipo A",  sku: "HTA-30", unidad: "plancha" },
  { id: "p-tipob",   nombre: "Huevo Tipo B",  sku: "HTB-30", unidad: "plancha" },
  { id: "p-tipoc",   nombre: "Huevo Tipo C",  sku: "HTC-30", unidad: "plancha" },
  { id: "p-picado",  nombre: "Huevo Picado",  sku: "HPI-30", unidad: "plancha" },
];

export type DemoStockPorUbicacion = Record<string, Record<string, number>>;

const STOCK_INICIAL: DemoStockPorUbicacion = {
  central: {
    "p-jumbo": 120, "p-super": 240, "p-tipoa": 180,
    "p-tipob": 160, "p-tipoc": 90, "p-picado": 30,
  },
  abasto_norte: {
    "p-jumbo": 0, "p-super": 0, "p-tipoa": 0,
    "p-tipob": 0, "p-tipoc": 0, "p-picado": 0,
  },
};

export type EstadoNR = "pendiente" | "aprobada" | "rechazada";

export type DemoTransporte = {
  transportista?: string;
  ruc_transportista?: string;
  conductor?: string;
  ci_conductor?: string;
  chapa?: string;
  fecha_inicio_traslado?: string;
  fecha_fin_traslado?: string;
};

export type DemoNotaRemision = {
  id: string;
  numero: string;
  fecha: string;
  emisor: string;
  origen: string;         // ubicacion.id
  destino: string;        // ubicacion.id
  motivo: "traslado" | "venta" | "devolucion";
  items: Array<{ producto_id: string; cantidad: number }>;
  transporte: DemoTransporte;
  observaciones?: string;
  estado: EstadoNR;
  motivo_rechazo?: string;
  aprobada_at?: string;
  aprobada_por?: string;
};

const KEY_STOCK = "demo_multideposito_stock_v2";
const KEY_NR = "demo_multideposito_nr_v2";
const KEY_ROL = "demo_multideposito_rol_v1";
const KEY_SEQ = "demo_multideposito_seq_v1";

export type DemoRol = "admin" | "central" | "abasto_norte";

export function getStock(): DemoStockPorUbicacion {
  if (typeof window === "undefined") return STOCK_INICIAL;
  try {
    const raw = window.localStorage.getItem(KEY_STOCK);
    if (!raw) return STOCK_INICIAL;
    return JSON.parse(raw) as DemoStockPorUbicacion;
  } catch { return STOCK_INICIAL; }
}
export function setStock(s: DemoStockPorUbicacion): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_STOCK, JSON.stringify(s));
}

export function getNRs(): DemoNotaRemision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_NR);
    if (!raw) return [];
    return JSON.parse(raw) as DemoNotaRemision[];
  } catch { return []; }
}
export function setNRs(list: DemoNotaRemision[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_NR, JSON.stringify(list));
}

export function getRol(): DemoRol {
  if (typeof window === "undefined") return "admin";
  const v = window.localStorage.getItem(KEY_ROL);
  return v === "central" || v === "abasto_norte" ? v : "admin";
}
export function setRol(r: DemoRol): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_ROL, r);
  window.dispatchEvent(new CustomEvent("demo-rol-changed", { detail: r }));
}

function nextSeq(): number {
  if (typeof window === "undefined") return 1;
  const cur = Number(window.localStorage.getItem(KEY_SEQ) ?? 0);
  const n = (Number.isFinite(cur) ? cur : 0) + 1;
  window.localStorage.setItem(KEY_SEQ, String(n));
  return n;
}

export function crearNR(input: Omit<DemoNotaRemision, "id" | "numero" | "fecha" | "estado">): DemoNotaRemision {
  const nr: DemoNotaRemision = {
    ...input,
    id: crypto.randomUUID(),
    numero: `NR-${String(nextSeq()).padStart(6, "0")}`,
    fecha: new Date().toISOString(),
    estado: "pendiente",
  };
  const all = getNRs();
  setNRs([nr, ...all]);
  return nr;
}

export function getNR(id: string): DemoNotaRemision | null {
  return getNRs().find((n) => n.id === id) ?? null;
}

export function getNRPorNumero(numero: string): DemoNotaRemision | null {
  const n = numero.trim().toUpperCase();
  return getNRs().find((x) => x.numero.toUpperCase() === n) ?? null;
}

export function aprobarNR(id: string, aprobador: string): { ok: true; nr: DemoNotaRemision } | { ok: false; error: string } {
  const all = getNRs();
  const nr = all.find((n) => n.id === id);
  if (!nr) return { ok: false, error: "NR no encontrada" };
  if (nr.estado !== "pendiente") return { ok: false, error: `NR ya está ${nr.estado}` };

  const stock = getStock();
  for (const it of nr.items) {
    const disp = stock[nr.origen]?.[it.producto_id] ?? 0;
    if (disp < it.cantidad) {
      const p = PRODUCTOS_DEMO.find((p) => p.id === it.producto_id);
      return { ok: false, error: `Stock insuficiente en ${nombreUbicacion(nr.origen)} de ${p?.nombre ?? it.producto_id}: hay ${disp}, se piden ${it.cantidad}.` };
    }
  }
  const nuevo = JSON.parse(JSON.stringify(stock)) as DemoStockPorUbicacion;
  if (!nuevo[nr.origen]) nuevo[nr.origen] = {};
  if (!nuevo[nr.destino]) nuevo[nr.destino] = {};
  for (const it of nr.items) {
    nuevo[nr.origen][it.producto_id] = (nuevo[nr.origen][it.producto_id] ?? 0) - it.cantidad;
    nuevo[nr.destino][it.producto_id] = (nuevo[nr.destino][it.producto_id] ?? 0) + it.cantidad;
  }
  setStock(nuevo);
  const actualizada: DemoNotaRemision = { ...nr, estado: "aprobada", aprobada_at: new Date().toISOString(), aprobada_por: aprobador };
  setNRs(all.map((n) => (n.id === id ? actualizada : n)));
  return { ok: true, nr: actualizada };
}

export function rechazarNR(id: string, motivo: string): { ok: true; nr: DemoNotaRemision } | { ok: false; error: string } {
  const all = getNRs();
  const nr = all.find((n) => n.id === id);
  if (!nr) return { ok: false, error: "NR no encontrada" };
  if (nr.estado !== "pendiente") return { ok: false, error: `NR ya está ${nr.estado}` };
  const actualizada: DemoNotaRemision = { ...nr, estado: "rechazada", motivo_rechazo: motivo };
  setNRs(all.map((n) => (n.id === id ? actualizada : n)));
  return { ok: true, nr: actualizada };
}

export function nombreUbicacion(id: string): string {
  return UBICACIONES_DEMO.find((u) => u.id === id)?.nombre ?? id;
}
