import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

const HUEVOS_POR_PLANCHA = 30;

type DetalleIn = { tipo_huevo_id: string; cantidad: number };

async function aplicarDeltaSueltos(
  supabase: SupabaseClient,
  empresaId: string,
  deltaPorTipo: Record<string, number>
): Promise<Array<{ tipo_huevo_id: string; planchas: number }>> {
  const tiposAfectados = Object.keys(deltaPorTipo);
  if (tiposAfectados.length === 0) return [];
  const acumQ = await supabase
    .from("granja_sueltos_acumulados")
    .select("id, tipo_huevo_id, cantidad")
    .eq("empresa_id", empresaId)
    .in("tipo_huevo_id", tiposAfectados);
  if (acumQ.error) throw new Error(acumQ.error.message);
  const actual = new Map<string, { id: string; cantidad: number }>();
  for (const r of (acumQ.data ?? []) as Array<{ id: string; tipo_huevo_id: string; cantidad: number }>) {
    actual.set(r.tipo_huevo_id, { id: r.id, cantidad: r.cantidad });
  }

  const planchas: Array<{ tipo_huevo_id: string; planchas: number }> = [];
  for (const tipoId of tiposAfectados) {
    const prev = actual.get(tipoId);
    const prevCant = prev?.cantidad ?? 0;
    let nuevoAcum = Math.max(0, prevCant + deltaPorTipo[tipoId]);
    if (nuevoAcum >= HUEVOS_POR_PLANCHA) {
      const p = Math.floor(nuevoAcum / HUEVOS_POR_PLANCHA);
      nuevoAcum = nuevoAcum % HUEVOS_POR_PLANCHA;
      planchas.push({ tipo_huevo_id: tipoId, planchas: p });
    }
    if (prev) {
      const up = await supabase
        .from("granja_sueltos_acumulados")
        .update({ cantidad: nuevoAcum, updated_at: new Date().toISOString() })
        .eq("id", prev.id);
      if (up.error) throw new Error(up.error.message);
    } else {
      const ins = await supabase
        .from("granja_sueltos_acumulados")
        .insert({ empresa_id: empresaId, tipo_huevo_id: tipoId, cantidad: nuevoAcum });
      if (ins.error) throw new Error(ins.error.message);
    }
  }
  return planchas;
}

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
  if (ins.error) console.warn(`[clasificacion] movimiento ${tipoMov} falló para ${tipoNombre}: ${ins.error.message}`);
  return true;
}

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
      fecha_distribucion?: string | null;
      resp_distribucion?: string;
      detalle?: DetalleIn[];
    };

    const headQ = await supabase
      .from("granja_clasificaciones")
      .select("id, empresa_id, produccion_id, stock_aplicado")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (headQ.error) throw new Error(headQ.error.message);
    if (!headQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const clas = headQ.data as { id: string; produccion_id: string; stock_aplicado?: boolean | null };

    // Metadata cabecera
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.fecha_distribucion !== undefined) patch.fecha_distribucion = body.fecha_distribucion || null;
    if (body.resp_distribucion !== undefined) patch.resp_distribucion = String(body.resp_distribucion).trim() || null;
    if (Object.keys(patch).length > 1) {
      const upd = await supabase
        .from("granja_clasificaciones")
        .update(patch)
        .eq("empresa_id", auth.empresa_id)
        .eq("id", id);
      if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    }

    // Detalle + inventario — soporta primera vez y re-edición (aplica delta)
    let planchasGeneradas: Array<{ tipo_huevo_id: string; planchas: number }> = [];
    if (Array.isArray(body.detalle)) {
      const nuevoDetalle = body.detalle.filter((d) => d && d.tipo_huevo_id && Number(d.cantidad) > 0);

      // Detalle anterior (para calcular delta si es re-edición)
      const oldDetQ = await supabase
        .from("granja_clasificacion_detalle")
        .select("tipo_huevo_id, cantidad")
        .eq("clasificacion_id", id);
      if (oldDetQ.error) throw new Error(oldDetQ.error.message);
      const oldDet = (oldDetQ.data ?? []) as Array<{ tipo_huevo_id: string; cantidad: number }>;
      const oldDirect: Record<string, number> = {};
      const oldSobrantes: Record<string, number> = {};
      for (const d of oldDet) {
        oldDirect[d.tipo_huevo_id] = (oldDirect[d.tipo_huevo_id] ?? 0) + Math.floor(d.cantidad / HUEVOS_POR_PLANCHA);
        oldSobrantes[d.tipo_huevo_id] = (oldSobrantes[d.tipo_huevo_id] ?? 0) + (d.cantidad % HUEVOS_POR_PLANCHA);
      }

      // Validar que el total clasificado no supere (cantidad_huevos - bajas) de la producción
      const prodInfo = await supabase
        .from("granja_producciones")
        .select("cantidad_huevos, bajas")
        .eq("id", clas.produccion_id)
        .maybeSingle();
      if (prodInfo.error) throw new Error(prodInfo.error.message);
      const prodData = prodInfo.data as { cantidad_huevos: number; bajas: number } | null;
      // Bajas son de gallinas (mortalidad), no de huevos — no restar
      const disponible = prodData ? prodData.cantidad_huevos : 0;
      const totalCant = nuevoDetalle.reduce((s, d) => s + Number(d.cantidad || 0), 0);
      if (totalCant > disponible) {
        return NextResponse.json(errorResponse(`El total clasificado (${totalCant}) supera los huevos disponibles (${disponible}) de la producción.`), { status: 400 });
      }

      const tipoIds = Array.from(new Set(nuevoDetalle.map((d) => d.tipo_huevo_id)));
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
        if (!tiposInfo.has(d.tipo_huevo_id)) {
          return NextResponse.json(errorResponse(`Tipo de huevo no válido: ${d.tipo_huevo_id}`), { status: 400 });
        }
      }

      const del = await supabase.from("granja_clasificacion_detalle").delete().eq("clasificacion_id", id);
      if (del.error) throw new Error(del.error.message);

      if (nuevoDetalle.length > 0) {
        const filas = nuevoDetalle.map((d) => {
          const n = Math.max(0, Math.trunc(Number(d.cantidad)));
          return {
            clasificacion_id: id,
            tipo_huevo_id: d.tipo_huevo_id,
            cantidad: n,
            planchas_generadas: Math.floor(n / HUEVOS_POR_PLANCHA),
            unidades_sobrantes: n % HUEVOS_POR_PLANCHA,
          };
        });
        const ins = await supabase.from("granja_clasificacion_detalle").insert(filas);
        if (ins.error) throw new Error(ins.error.message);
      }

      // Nuevos directs + sobrantes por tipo
      const newDirect: Record<string, number> = {};
      const newSobrantes: Record<string, number> = {};
      for (const d of nuevoDetalle) {
        const n = Math.max(0, Math.trunc(Number(d.cantidad)));
        newDirect[d.tipo_huevo_id] = (newDirect[d.tipo_huevo_id] ?? 0) + Math.floor(n / HUEVOS_POR_PLANCHA);
        newSobrantes[d.tipo_huevo_id] = (newSobrantes[d.tipo_huevo_id] ?? 0) + (n % HUEVOS_POR_PLANCHA);
      }

      // Delta sobrantes = new - old, aplicado al acumulador (puede generar overflow)
      const deltaSobrantes: Record<string, number> = {};
      const todosTipos = new Set([...Object.keys(newSobrantes), ...Object.keys(oldSobrantes)]);
      for (const tipoId of todosTipos) {
        const delta = (newSobrantes[tipoId] ?? 0) - (oldSobrantes[tipoId] ?? 0);
        if (delta !== 0) deltaSobrantes[tipoId] = delta;
      }
      planchasGeneradas = await aplicarDeltaSueltos(supabase, auth.empresa_id, deltaSobrantes);

      // Delta stock = (new_direct - old_direct) + overflow_planchas
      const stockDelta: Record<string, number> = {};
      const tiposStock = new Set([...Object.keys(newDirect), ...Object.keys(oldDirect)]);
      for (const tipoId of tiposStock) {
        stockDelta[tipoId] = (newDirect[tipoId] ?? 0) - (oldDirect[tipoId] ?? 0);
      }
      for (const p of planchasGeneradas) {
        stockDelta[p.tipo_huevo_id] = (stockDelta[p.tipo_huevo_id] ?? 0) + p.planchas;
      }

      // Necesitamos nombres de TODOS los tipos afectados (nuevos y viejos)
      const tiposParaMover = Array.from(new Set([...Object.keys(stockDelta), ...oldDet.map((d) => d.tipo_huevo_id)]));
      const faltantes = tiposParaMover.filter((t) => !tiposInfo.has(t));
      if (faltantes.length > 0) {
        const extraQ = await supabase
          .from("granja_tipos_huevo")
          .select("id, nombre, producto_id")
          .eq("empresa_id", auth.empresa_id)
          .in("id", faltantes);
        if (extraQ.error) throw new Error(extraQ.error.message);
        for (const t of (extraQ.data ?? []) as Array<{ id: string; nombre: string; producto_id: string | null }>) {
          tiposInfo.set(t.id, { nombre: t.nombre, producto_id: t.producto_id });
        }
      }

      const prodQ = await supabase
        .from("granja_producciones").select("codigo").eq("id", clas.produccion_id).maybeSingle();
      const codigo = (prodQ.data as { codigo?: number } | null)?.codigo ?? 0;
      const refBase = `CLAS-${codigo}`;
      for (const [tipoId, delta] of Object.entries(stockDelta)) {
        if (delta === 0) continue;
        const info = tiposInfo.get(tipoId);
        if (!info) continue;
        const abs = Math.abs(delta);
        const mov = delta > 0 ? "ENTRADA" : "SALIDA";
        const ref = delta > 0 ? refBase : `${refBase}-AJ`;
        await moverStockPorTipo(supabase, auth.empresa_id, tipoId, info.nombre, abs, mov, ref);
      }

      const marcar = await supabase
        .from("granja_clasificaciones")
        .update({ stock_aplicado: true })
        .eq("empresa_id", auth.empresa_id)
        .eq("id", id);
      if (marcar.error) throw new Error(marcar.error.message);

      // Marcar producción como clasificada
      await supabase
        .from("granja_producciones")
        .update({ clasificada: true })
        .eq("empresa_id", auth.empresa_id)
        .eq("id", clas.produccion_id);
    }

    return NextResponse.json(successResponse({ ok: true, planchas_generadas: planchasGeneradas }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

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
      .select("id, produccion_id, stock_aplicado")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (headQ.error) throw new Error(headQ.error.message);
    if (!headQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const clas = headQ.data as { id: string; produccion_id: string; stock_aplicado?: boolean | null };

    const detQ = await supabase
      .from("granja_clasificacion_detalle")
      .select("tipo_huevo_id, cantidad")
      .eq("clasificacion_id", id);
    if (detQ.error) throw new Error(detQ.error.message);
    const detalle = (detQ.data ?? []) as Array<{ tipo_huevo_id: string; cantidad: number }>;

    if (clas.stock_aplicado) {
      const tipoIds = Array.from(new Set(detalle.map((d) => d.tipo_huevo_id)));
      const tiposQ = tipoIds.length > 0 ? await supabase
        .from("granja_tipos_huevo").select("id, nombre").eq("empresa_id", auth.empresa_id).in("id", tipoIds)
        : { data: [], error: null };
      if (tiposQ.error) throw new Error(tiposQ.error.message);
      const nombres = new Map<string, string>();
      for (const t of (tiposQ.data ?? []) as Array<{ id: string; nombre: string }>) nombres.set(t.id, t.nombre);

      const revertir: Record<string, number> = {};
      for (const d of detalle) {
        const s = d.cantidad % HUEVOS_POR_PLANCHA;
        if (s > 0) revertir[d.tipo_huevo_id] = (revertir[d.tipo_huevo_id] ?? 0) - s;
      }
      await aplicarDeltaSueltos(supabase, auth.empresa_id, revertir);

      const prodQ = await supabase
        .from("granja_producciones").select("codigo").eq("id", clas.produccion_id).maybeSingle();
      const codigo = (prodQ.data as { codigo?: number } | null)?.codigo ?? 0;
      const referencia = `CLAS-${codigo}-REV`;
      for (const d of detalle) {
        const planchas = Math.floor(d.cantidad / HUEVOS_POR_PLANCHA);
        if (planchas > 0) {
          await moverStockPorTipo(
            supabase, auth.empresa_id, d.tipo_huevo_id,
            nombres.get(d.tipo_huevo_id) ?? d.tipo_huevo_id,
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

    // Reabrir la producción para poder re-clasificar
    await supabase
      .from("granja_producciones")
      .update({ clasificada: false })
      .eq("empresa_id", auth.empresa_id)
      .eq("id", clas.produccion_id);

    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
