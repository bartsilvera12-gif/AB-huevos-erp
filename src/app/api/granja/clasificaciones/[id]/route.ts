import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const HUEVOS_POR_PLANCHA = 30;

type DetalleIn = { tipo_id: string; cantidad: number };

/**
 * PATCH /api/granja/clasificaciones/[id]
 * Body:
 *   - Metadata opcional (fecha_distribucion, resp_distribucion, responsable, bajas, cantidad_huevos)
 *   - `detalle`: array de líneas (tipo_id + cantidad). Reemplaza el detalle actual
 *     y actualiza el acumulador de sueltos (sumando los sobrantes de cada tipo).
 *     Devuelve los tipos que llegaron a 30 y "se armaron planchas".
 */
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
      cantidad_huevos?: number;
      bajas?: number;
      responsable?: string;
      fecha_distribucion?: string | null;
      resp_distribucion?: string;
      detalle?: DetalleIn[];
    };

    // Verificar que la clasificación pertenece a la empresa
    const head = await supabase
      .from("granja_clasificaciones")
      .select("id, empresa_id")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (head.error) throw new Error(head.error.message);
    if (!head.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    // 1) Actualizar cabecera (metadata)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
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

    // 2) Detalle: reemplazar y actualizar sueltos
    let planchasGeneradas: Array<{ tipo_id: string; planchas: number }> = [];
    if (Array.isArray(body.detalle)) {
      // Detalle anterior — vamos a revertir su contribución al acumulador
      const prev = await supabase
        .from("granja_clasificacion_detalle")
        .select("tipo_id, cantidad")
        .eq("clasificacion_id", id);
      if (prev.error) throw new Error(prev.error.message);

      const revertirSobrantes: Record<string, number> = {};
      for (const row of (prev.data ?? []) as Array<{ tipo_id: string; cantidad: number }>) {
        const sobrante = row.cantidad % HUEVOS_POR_PLANCHA;
        if (sobrante > 0) revertirSobrantes[row.tipo_id] = (revertirSobrantes[row.tipo_id] ?? 0) + sobrante;
      }

      // Borrar detalle anterior
      const del = await supabase
        .from("granja_clasificacion_detalle")
        .delete()
        .eq("clasificacion_id", id);
      if (del.error) throw new Error(del.error.message);

      // Validar tipos: deben pertenecer a la empresa
      const nuevoDetalle = body.detalle.filter((d) => d && d.tipo_id && Number(d.cantidad) > 0);
      if (nuevoDetalle.length > 0) {
        const tipoIds = Array.from(new Set(nuevoDetalle.map((d) => d.tipo_id)));
        const tiposQ = await supabase
          .from("granja_tipos_huevo")
          .select("id")
          .eq("empresa_id", auth.empresa_id)
          .in("id", tipoIds);
        if (tiposQ.error) throw new Error(tiposQ.error.message);
        const validos = new Set(((tiposQ.data ?? []) as Array<{ id: string }>).map((t) => t.id));
        for (const d of nuevoDetalle) {
          if (!validos.has(d.tipo_id)) {
            return NextResponse.json(errorResponse(`Tipo de huevo no válido: ${d.tipo_id}`), { status: 400 });
          }
        }

        // Insertar detalle nuevo
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

      // Recalcular sueltos por tipo: aplicar delta (nuevo sobrante - viejo sobrante)
      const sumarSobrantes: Record<string, number> = {};
      for (const d of nuevoDetalle) {
        const n = Math.max(0, Math.trunc(Number(d.cantidad)));
        const sobrante = n % HUEVOS_POR_PLANCHA;
        if (sobrante > 0) sumarSobrantes[d.tipo_id] = (sumarSobrantes[d.tipo_id] ?? 0) + sobrante;
      }

      const tiposAfectados = Array.from(new Set([...Object.keys(revertirSobrantes), ...Object.keys(sumarSobrantes)]));
      if (tiposAfectados.length > 0) {
        // Leer estado actual del acumulador
        const acumQ = await supabase
          .from("granja_sueltos_acumulados")
          .select("tipo_id, cantidad")
          .eq("empresa_id", auth.empresa_id)
          .in("tipo_id", tiposAfectados);
        if (acumQ.error) throw new Error(acumQ.error.message);
        const actual: Record<string, number> = {};
        for (const r of (acumQ.data ?? []) as Array<{ tipo_id: string; cantidad: number }>) {
          actual[r.tipo_id] = r.cantidad;
        }

        for (const tipoId of tiposAfectados) {
          const actualCant = actual[tipoId] ?? 0;
          const delta = (sumarSobrantes[tipoId] ?? 0) - (revertirSobrantes[tipoId] ?? 0);
          let nuevoAcum = Math.max(0, actualCant + delta);
          // Si supera 30, genera planchas y deja el resto
          if (nuevoAcum >= HUEVOS_POR_PLANCHA) {
            const planchas = Math.floor(nuevoAcum / HUEVOS_POR_PLANCHA);
            nuevoAcum = nuevoAcum % HUEVOS_POR_PLANCHA;
            planchasGeneradas.push({ tipo_id: tipoId, planchas });
          }
          const up = await supabase
            .from("granja_sueltos_acumulados")
            .upsert(
              { empresa_id: auth.empresa_id, tipo_id: tipoId, cantidad: nuevoAcum, updated_at: new Date().toISOString() },
              { onConflict: "empresa_id,tipo_id" }
            );
          if (up.error) throw new Error(up.error.message);
        }
      }
    }

    return NextResponse.json(successResponse({ ok: true, planchas_generadas: planchasGeneradas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE /api/granja/clasificaciones/[id] — borra cabecera y detalle. NO revierte inventario. */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

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
