import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, empresa_id, codigo, galpon_id, fecha, cantidad_huevos, bajas, responsable, clasificada, created_at, updated_at";

/** PATCH /api/granja/producciones/[id] — edición de producción. */
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
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.galpon_id !== undefined) {
      const galponId = String(body.galpon_id).trim();
      const galpQ = await supabase
        .from("granja_galpones")
        .select("id")
        .eq("empresa_id", auth.empresa_id)
        .eq("id", galponId)
        .maybeSingle();
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

    const { data, error } = await supabase
      .from("granja_producciones")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select(`${COLS}, granja_galpones!inner(id, nombre)`)
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const row = data as { id: string; codigo: number; galpon_id: string; fecha: string; cantidad_huevos: number; bajas: number; responsable: string; clasificada: boolean; granja_galpones?: { nombre: string } | { nombre: string }[] };
    const g = Array.isArray(row.granja_galpones) ? row.granja_galpones[0] : row.granja_galpones;
    return NextResponse.json(successResponse({
      produccion: {
        id: row.id, codigo: row.codigo, galpon_id: row.galpon_id,
        galpon: g?.nombre ?? "",
        fecha: row.fecha, cantidad_huevos: row.cantidad_huevos, bajas: row.bajas,
        responsable: row.responsable, clasificada: row.clasificada,
      },
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE /api/granja/producciones/[id] — borra el registro (si no fue clasificado). */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    // Bloquear borrado si ya fue clasificada
    const check = await supabase
      .from("granja_producciones")
      .select("clasificada")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (check.error) throw new Error(check.error.message);
    if (!check.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((check.data as { clasificada?: boolean }).clasificada) {
      return NextResponse.json(errorResponse("No se puede borrar: la producción ya fue clasificada."), { status: 409 });
    }

    const { error } = await supabase
      .from("granja_producciones")
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
