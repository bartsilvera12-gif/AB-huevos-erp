import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type MetodoPagoCobro = "efectivo" | "transferencia" | "tarjeta" | "otro";

export interface RegistrarCobroInput {
  cuenta_por_cobrar_id: string;
  monto: number;
  metodo_pago: MetodoPagoCobro;
  entidad_bancaria_id?: string | null;
  referencia?: string | null;
  titular?: string | null;
  observaciones?: string | null;
  fecha_pago?: string | null;
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  entidad_nombre_snapshot?: string | null;
}

export class CobroError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CobroError";
    this.status = status;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function metodoValido(m: unknown): MetodoPagoCobro {
  return m === "transferencia" || m === "tarjeta" || m === "otro" ? m : "efectivo";
}

/**
 * Registra un cobro contra una cuenta por cobrar: inserta en `cobros_clientes`,
 * descuenta el saldo y recalcula el estado (pendiente|parcial|pagado).
 * No permite cobrar más que el saldo. NO toca stock ni ventas.
 */
export async function registrarCobro(
  sb: AppSupabaseClient,
  empresaId: string,
  input: RegistrarCobroInput
): Promise<{ cobro_id: string; saldo_nuevo: number; estado: string }> {
  const monto = round2(Number(input.monto) || 0);
  if (!(monto > 0)) throw new CobroError("El monto del cobro debe ser mayor a cero.");
  if (!input.cuenta_por_cobrar_id) throw new CobroError("Falta la cuenta por cobrar.");

  const cq = await sb
    .from("cuentas_por_cobrar")
    .select("id, cliente_id, venta_id, total, saldo, estado")
    .eq("empresa_id", empresaId)
    .eq("id", input.cuenta_por_cobrar_id)
    .maybeSingle();
  if (cq.error) throw new CobroError(cq.error.message, 500);
  if (!cq.data) throw new CobroError("Cuenta por cobrar no encontrada.", 404);
  const cxc = cq.data as {
    id: string;
    cliente_id: string;
    venta_id: string;
    total: number | string;
    saldo: number | string;
    estado: string;
  };

  if (cxc.estado === "anulado") throw new CobroError("La cuenta está anulada; no admite cobros.", 409);
  if (cxc.estado === "pagado") throw new CobroError("La cuenta ya está pagada.", 409);

  const saldoActual = round2(Number(cxc.saldo) || 0);
  const total = round2(Number(cxc.total) || 0);
  if (monto > saldoActual + 0.001) {
    throw new CobroError(`El monto (${monto}) supera el saldo pendiente (${saldoActual}).`);
  }

  const fechaPago =
    typeof input.fecha_pago === "string" && input.fecha_pago.trim() ? input.fecha_pago : new Date().toISOString();

  // 1) Insertar el cobro.
  const ins = await sb
    .from("cobros_clientes")
    .insert({
      empresa_id: empresaId,
      cliente_id: cxc.cliente_id,
      cuenta_por_cobrar_id: cxc.id,
      venta_id: cxc.venta_id,
      fecha_pago: fechaPago,
      monto,
      metodo_pago: metodoValido(input.metodo_pago),
      entidad_bancaria_id: input.entidad_bancaria_id || null,
      entidad_nombre_snapshot: input.entidad_nombre_snapshot?.trim() || null,
      referencia: input.referencia?.trim() || null,
      titular: input.titular?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      usuario_id: input.usuario_id || null,
      usuario_nombre: input.usuario_nombre?.trim() || null,
    })
    .select("id")
    .single();
  if (ins.error) throw new CobroError(ins.error.message, 500);
  const cobroId = String((ins.data as { id: string }).id);

  // 2) Recalcular saldo + estado.
  const saldoNuevo = round2(saldoActual - monto);
  const estadoNuevo = saldoNuevo <= 0.001 ? "pagado" : saldoNuevo < total ? "parcial" : "pendiente";
  const upd = await sb
    .from("cuentas_por_cobrar")
    .update({ saldo: saldoNuevo < 0 ? 0 : saldoNuevo, estado: estadoNuevo, updated_at: new Date().toISOString() })
    .eq("empresa_id", empresaId)
    .eq("id", cxc.id);
  if (upd.error) {
    // Rollback best-effort del cobro para no descuadrar el saldo.
    try {
      await sb.from("cobros_clientes").delete().eq("id", cobroId).eq("empresa_id", empresaId);
    } catch {}
    throw new CobroError(upd.error.message, 500);
  }

  return { cobro_id: cobroId, saldo_nuevo: saldoNuevo < 0 ? 0 : saldoNuevo, estado: estadoNuevo };
}

/**
 * Edita un cobro existente. Si cambia el monto, recalcula el saldo y estado
 * de la cuenta por cobrar (revierte el monto original + aplica el nuevo).
 * Rechaza si el nuevo monto haría el saldo negativo (supera lo cobrable).
 */
export async function actualizarCobro(
  sb: AppSupabaseClient,
  empresaId: string,
  cobroId: string,
  patch: Partial<RegistrarCobroInput>
): Promise<{ cobro_id: string; saldo_nuevo: number; estado: string }> {
  if (!cobroId) throw new CobroError("Falta el id del cobro.");

  const cbQ = await sb
    .from("cobros_clientes")
    .select("id, cuenta_por_cobrar_id, monto")
    .eq("empresa_id", empresaId)
    .eq("id", cobroId)
    .maybeSingle();
  if (cbQ.error) throw new CobroError(cbQ.error.message, 500);
  if (!cbQ.data) throw new CobroError("Cobro no encontrado.", 404);
  const cobro = cbQ.data as { id: string; cuenta_por_cobrar_id: string; monto: number | string };
  const montoAnterior = round2(Number(cobro.monto) || 0);

  const cxcQ = await sb
    .from("cuentas_por_cobrar")
    .select("id, total, saldo, estado")
    .eq("empresa_id", empresaId)
    .eq("id", cobro.cuenta_por_cobrar_id)
    .maybeSingle();
  if (cxcQ.error) throw new CobroError(cxcQ.error.message, 500);
  if (!cxcQ.data) throw new CobroError("Cuenta por cobrar no encontrada.", 404);
  const cxc = cxcQ.data as { id: string; total: number | string; saldo: number | string; estado: string };
  const total = round2(Number(cxc.total) || 0);
  const saldoActual = round2(Number(cxc.saldo) || 0);

  // Reponer virtualmente el monto anterior para saber cuánto queda cobrable.
  const saldoSinCobro = round2(saldoActual + montoAnterior);
  const montoNuevo = patch.monto != null ? round2(Number(patch.monto) || 0) : montoAnterior;
  if (!(montoNuevo > 0)) throw new CobroError("El monto debe ser mayor a cero.");
  if (montoNuevo > saldoSinCobro + 0.001) {
    throw new CobroError(`El monto (${montoNuevo}) supera el saldo cobrable (${saldoSinCobro}).`);
  }

  // Aplicar cambios al cobro (sólo los campos presentes en patch).
  const updRow: Record<string, unknown> = {};
  if (patch.monto != null) updRow.monto = montoNuevo;
  if (patch.metodo_pago !== undefined) updRow.metodo_pago = metodoValido(patch.metodo_pago);
  if (patch.entidad_bancaria_id !== undefined) updRow.entidad_bancaria_id = patch.entidad_bancaria_id || null;
  if (patch.entidad_nombre_snapshot !== undefined) updRow.entidad_nombre_snapshot = patch.entidad_nombre_snapshot?.trim() || null;
  if (patch.referencia !== undefined) updRow.referencia = patch.referencia?.trim() || null;
  if (patch.titular !== undefined) updRow.titular = patch.titular?.trim() || null;
  if (patch.observaciones !== undefined) updRow.observaciones = patch.observaciones?.trim() || null;
  if (patch.fecha_pago !== undefined && typeof patch.fecha_pago === "string" && patch.fecha_pago.trim()) {
    updRow.fecha_pago = patch.fecha_pago;
  }
  if (Object.keys(updRow).length > 0) {
    const upd = await sb.from("cobros_clientes").update(updRow).eq("empresa_id", empresaId).eq("id", cobroId);
    if (upd.error) throw new CobroError(upd.error.message, 500);
  }

  // Recalcular saldo/estado de la CxC (saldoSinCobro − montoNuevo).
  const saldoNuevo = round2(saldoSinCobro - montoNuevo);
  const estadoNuevo = saldoNuevo <= 0.001 ? "pagado" : saldoNuevo < total ? "parcial" : "pendiente";
  const updCxc = await sb
    .from("cuentas_por_cobrar")
    .update({ saldo: saldoNuevo < 0 ? 0 : saldoNuevo, estado: estadoNuevo, updated_at: new Date().toISOString() })
    .eq("empresa_id", empresaId)
    .eq("id", cxc.id);
  if (updCxc.error) throw new CobroError(updCxc.error.message, 500);

  return { cobro_id: cobroId, saldo_nuevo: saldoNuevo < 0 ? 0 : saldoNuevo, estado: estadoNuevo };
}
