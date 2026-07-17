import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

const HUEVOS_POR_PLANCHA = 30;

type DetalleIn = { tipo_id: string; cantidad: number };

/**
 * Actualiza el acumulador de sueltos: aplica un delta por tipo (sumar/restar).
 * Si el acumulador supera 30, arma planchas y devuelve el total generado.
 */
async function aplicarDeltaSueltos(
  supabase: SupabaseClient,
  empresaId: string,
  deltaPorTipo: Record<string, number>
): Promise<Array<{ tipo_id: string; planchas: number }>> {
  const tiposAfectados = Object.keys(deltaPorTipo);
  if (tiposAfectados.length === 0) return [];
  const acumQ = await supabase
    .from("granja_sueltos_acumulados")
    .select("tipo_id, cantidad")
    .eq("empresa_id", empresaId)
    .in("tipo_id", tiposAfectados);
  if (acumQ.error) throw new Error(acumQ.error.message);
  const actual: Record<string, number> = {};
  for (const r of (acumQ.data ?? []) as Array<{ tipo_id: string; cantidad: number }>) {
    actual[r.tipo_id] = r.cantidad;
  }

  const planchas: Array<{ tipo_id: string; planchas: number }> = [];
  for (const tipoId of tiposAfectados) {
    const actualCant = actual[tipoId] ?? 0;
    let nuevoAcum = Math.max(0, actualCant + deltaPorTipo[tipoId]);
    if (nuevoAcum >= HUEVOS_POR_PLANCHA) {
      const p = Math.floor(nuevoAcum / HUEVOS_POR_PLANCHA);
      nuevoAcum = nuevoAcum % HUEVOS_POR_PLANCHA;
      planchas.push({ tipo_id: tipoId, planchas: p });
    }
    const up = await supabase
      .from("granja_sueltos_acumulados")
      .upsert(
        { empresa_id: empresaId, tipo_id: tipoId, cantidad: nuevoAcum, updated_at: new Date().toISOString() },
        { onConflict: "empresa_id,tipo_id" }
      );
    if (up.error) throw new Error(up.error.message);
  }
  return planchas;
}

/**
 * Aplica un movimiento de stock (ENTRADA o SALIDA) para un tipo de huevo,
 * si tiene producto_id vinculado. Silencioso si el tipo no está vinculado.
 * Devuelve true si movió stock.
 */
async function moverStockPorTipo(
  supabase: SupabaseClient,
  empresaId: string,
  tipoId: string,
  tipoNombre: string,
  planchas: number,
  tipoMov: "ENTRADA" | "SALIDA",
  referencia: string
): Promise<boolean> {
  if (planchas <= 0) return false;

  const tipoQ = await supabase
    .from("granja_tipos_huevo")
    .select("producto_id")
    .eq("empresa_id", empresaId)
    .eq("id", tipoId)
    .maybeSingle();
  if (tipoQ.error) throw new Error(tipoQ.error.message);
  const productoId = (tipoQ.data as { producto_id?: string | null } | null)?.producto_id;
  if (!productoId) return false;

  const prodQ = await supabase
    .from("productos")
    .select("stock_actual, nombre, sku")
    .eq("empresa_id", empresaId)
    .eq("id", productoId)
    .maybeSingle();
  if (prodQ.error) throw new Error(prodQ.error.message);
  if (!prodQ.data) return false;

  const prod = prodQ.data as { stock_actual: number | string; nombre: string; sku: string | null };
  const actual = Number(prod.stock_actual) || 0;
  const delta = tipoMov === "ENTRADA" ? planchas : -planchas;
  const nuevo = Math.max(0, actual + delta);

  const upd = await supabase
    .from("productos")
    .update({ stock_actual: nuevo })
    .eq("empresa_id", empresaId)
    .eq("id", productoId);
  if (upd.error) throw new Error(upd.error.message);

  const ins = await supabase.from("movimientos_inventario").insert({
    empresa_id: empresaId,
    producto_id: productoId,
    producto_nombre: prod.nombre,
    producto_sku: prod.sku,
    tipo: tipoMov,
    cantidad: planchas,
    costo_unitario: 0,
    origen: tipoMov === "ENTRADA" ? "clasificacion" : "clasificacion_revertida",
    referencia,
    fecha: new Date().toISOString(),
  });
  if (ins.error) {
    // Si CHECK bloquea 'clasificacion', log y seguimos — el stock ya fue movido.
    console.warn(`[clasificacion] movimiento_inventario ${tipoMov} fallido para tipo ${tipoNombre}: ${ins.error.message}`);
  }
  return true;
}

/** PATCH /api/granja/clasificaciones/[id] */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as {
      galpon_id?: string;
      fecha?: string;
      cantidad_huevos?: number;
      bajas?: number;
      responsable?: string;
      fecha_distribucion?: string | null;
      resp_distribucion?: string;
      detalle?: DetalleIn[];
    };

    // Verificar que la clasificación pertenece a la empresa
    const headQ = await supabase
      .from("granja_clasificaciones")
      .select("id, empresa_id, codigo, stock_aplicado")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (headQ.error) throw new Error(headQ.error.message);
    if (!headQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const clas = headQ.data as { id: string; codigo: number; stock_aplicado?: boolean | null };

    // 1) Cabecera
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.galpon_id !== undefined) {
      const galponId = String(body.galpon_id).trim();
      const galpQ = await supabase
        .from("granja_galpones").select("id")
        .eq("empresa_id", auth.empresa_id).eq("id", galponId).maybeSingle();
      if (galpQ.error) throw new Error(galpQ.error.message);
      if (!galpQ.data) return NextResponse.json(errorResponse("El galpón no existe."), { status: 400 });
      patch.galpon_id = galponId;
    }
    if (body.fecha !== undefined) patch.fecha = body.fecha;
    if (body.cantidad_huevos !== undefined) {
      const n = Number(body.cantidad_huevos);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json(errorResponse("Cantidad inválida."), { status: 400 });
      patch.cantidad_huevos = n;
    }
    if (body.bajas !== undefined) {
      const n = Number(body.bajas);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json(errorResponse("Bajas inválidas."), { status: 400 });
      patch.bajas = n;
    }
    if (body.responsable !== undefined) patch.responsable = String(body.responsable).trim();
    if (body.fecha_distribucion !== undefined) patch.fecha_distribucion = body.fecha_distribucion || null;
    if (body.resp_distribucion !== undefined) patch.resp_distribucion = String(body.resp_distribucion).trim();

    if (Object.keys(patch).length > 1) {
      const upd = await supabase
        .from("granja_clasificaciones")
        .update(patch)
        .eq("empresa_id", auth.empresa_id)
        .eq("id", id);
      if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    }

    // 2) Detalle + inventario
    let planchasGeneradas: Array<{ tipo_id: string; planchas: number }> = [];
    if (Array.isArray(body.detalle)) {
      if (clas.stock_aplicado) {
        return NextResponse.json(errorResponse(
          "Esta clasificación ya fue aplicada al inventario. No se puede modificar el detalle."
        ), { status: 409 });
      }

      const nuevoDetalle = body.detalle.filter((d) => d && d.tipo_id && Number(d.cantidad) > 0);

      // Validar y traer tipos con producto vinculado
      const tipoIds = Array.from(new Set(nuevoDetalle.map((d) => d.tipo_id)));
      const tiposQ = tipoIds.length > 0 ? await supabase
        .from("granja_tipos_huevo")
        .select("id, nombre, producto_id")
        .eq("empresa_id", auth.empresa_id)
        .in("id", tipoIds) : { data: [], error: null };
      if (tiposQ.error) throw new Error(tiposQ.error.message);
      const tiposInfo = new Map<string, { nombre: string; producto_id: string | null }>();
      for (const t of (tiposQ.data ?? []) as Array<{ id: string; nombre: string; producto_id: string | null }>) {
        tiposInfo.set(t.id, { nombre: t.nombre, producto_id: t.producto_id });
      }
      for (const d of nuevoDetalle) {
        if (!tiposInfo.has(d.tipo_id)) {
          return NextResponse.json(errorResponse(`Tipo de huevo no válido: ${d.tipo_id}`), { status: 400 });
        }
      }

      // Borrar detalle anterior (por si acaso, aunque stock_aplicado=false lo hace idempotente)
      const del = await supabase.from("granja_clasificacion_detalle").delete().eq("clasificacion_id", id);
      if (del.error) throw new Error(del.error.message);

      // Insertar detalle nuevo
      if (nuevoDetalle.length > 0) {
        const filas = nuevoDetalle.map((d) => {
          const n = Math.max(0, Math.trunc(Number(d.cantidad)));
          return {
            clasificacion_id: id,
            tipo_id: d.tipo_id,
            cantidad: n,
            planchas: Math.floor(n / HUEVOS_POR_PLANCHA),
            unidades: n % HUEVOS_POR_PLANCHA,
          };
        });
        const ins = await supabase.from("granja_clasificacion_detalle").insert(filas);
        if (ins.error) throw new Error(ins.error.message);
      }

      // Aplicar sobrantes al acumulador → puede generar planchas por overflow
      const sumarSobrantes: Record<string, number> = {};
      for (const d of nuevoDetalle) {
        const n = Math.max(0, Math.trunc(Number(d.cantidad)));
        const s = n % HUEVOS_POR_PLANCHA;
        if (s > 0) sumarSobrantes[d.tipo_id] = (sumarSobrantes[d.tipo_id] ?? 0) + s;
      }
      planchasGeneradas = await aplicarDeltaSueltos(supabase, auth.empresa_id, sumarSobrantes);

      // Sumar planchas directas + overflow por tipo → mover stock si el tipo tiene producto_id
      const totalPorTipo: Record<string, number> = {};
      for (const d of nuevoDetalle) {
        const n = Math.max(0, Math.trunc(Number(d.cantidad)));
        totalPorTipo[d.tipo_id] = (totalPorTipo[d.tipo_id] ?? 0) + Math.floor(n / HUEVOS_POR_PLANCHA);
      }
      for (const p of planchasGeneradas) {
        totalPorTipo[p.tipo_id] = (totalPorTipo[p.tipo_id] ?? 0) + p.planchas;
      }
      const referencia = `CLAS-${clas.codigo}`;
      for (const [tipoId, planchas] of Object.entries(totalPorTipo)) {
        const info = tiposInfo.get(tipoId);
        if (!info) continue;
        await moverStockPorTipo(supabase, auth.empresa_id, tipoId, info.nombre, planchas, "ENTRADA", referencia);
      }

      // Marcar como aplicada al inventario
      const marcar = await supabase
        .from("granja_clasificaciones")
        .update({ stock_aplicado: true })
        .eq("empresa_id", auth.empresa_id)
        .eq("id", id);
      if (marcar.error) throw new Error(marcar.error.message);
    }

    return NextResponse.json(successResponse({ ok: true, planchas_generadas: planchasGeneradas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE — revierte acumulador y stock (si estaba aplicada) antes de borrar. */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const headQ = await supabase
      .from("granja_clasificaciones")
      .select("id, codigo, stock_aplicado")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (headQ.error) throw new Error(headQ.error.message);
    if (!headQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const clas = headQ.data as { id: string; codigo: number; stock_aplicado?: boolean | null };

    const detQ = await supabase
      .from("granja_clasificacion_detalle")
      .select("tipo_id, cantidad")
      .eq("clasificacion_id", id);
    if (detQ.error) throw new Error(detQ.error.message);
    const detalle = (detQ.data ?? []) as Array<{ tipo_id: string; cantidad: number }>;

    if (clas.stock_aplicado) {
      // Nombres para movimientos
      const tipoIds = Array.from(new Set(detalle.map((d) => d.tipo_id)));
      const tiposQ = tipoIds.length > 0 ? await supabase
        .from("granja_tipos_huevo").select("id, nombre").eq("empresa_id", auth.empresa_id).in("id", tipoIds)
        : { data: [], error: null };
      if (tiposQ.error) throw new Error(tiposQ.error.message);
      const nombres = new Map<string, string>();
      for (const t of (tiposQ.data ?? []) as Array<{ id: string; nombre: string }>) nombres.set(t.id, t.nombre);

      // Revertir sobrantes en acumulador
      const revertir: Record<string, number> = {};
      for (const d of detalle) {
        const s = d.cantidad % HUEVOS_POR_PLANCHA;
        if (s > 0) revertir[d.tipo_id] = (revertir[d.tipo_id] ?? 0) - s;
      }
      await aplicarDeltaSueltos(supabase, auth.empresa_id, revertir);

      // Revertir planchas directas del stock (no revertimos las de overflow — quedan en acumulador)
      const referencia = `CLAS-${clas.codigo}-REV`;
      for (const d of detalle) {
        const planchas = Math.floor(d.cantidad / HUEVOS_POR_PLANCHA);
        if (planchas > 0) {
          await moverStockPorTipo(
            supabase, auth.empresa_id, d.tipo_id,
            nombres.get(d.tipo_id) ?? d.tipo_id,
            planchas, "SALIDA", referencia
          );
        }
      }
    }

    await supabase.from("granja_clasificacion_detalle").delete().eq("clasificacion_id", id);
    const { error } = await supabase
      .from("granja_clasificaciones")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
