import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/inventario/movimientos — lista movimientos via PostgREST (compat Hostinger sin pool PG).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    // Selección amplia primero (post multi-depósito); fallback a la vieja si el schema aún no tiene esas columnas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let movQ: any = await ctx.supabase
      .from("movimientos_inventario")
      .select(
        "id, empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, cantidad_descontada, costo_unitario, origen, referencia, fecha, created_at, updated_at, created_by, usuario_nombre, ubicacion_id, venta_id, produccion_id, nota_remision_id"
      )
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .limit(500);
    if (movQ.error) {
      movQ = await ctx.supabase
        .from("movimientos_inventario")
        .select(
          "id, empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, costo_unitario, origen, referencia, fecha, created_at, updated_at, created_by, usuario_nombre"
        )
        .eq("empresa_id", empresaId)
        .order("fecha", { ascending: false })
        .limit(500);
      if (movQ.error) throw new Error(movQ.error.message);
    }

    // Enriquecer con nombre de ubicación (una sola query bulk).
    const rows = (movQ.data ?? []) as Array<Record<string, unknown>>;
    const ubicIds = Array.from(new Set(
      rows.map((r) => r.ubicacion_id).filter((x): x is string => typeof x === "string" && x.length > 0)
    ));
    const nombrePorUbic = new Map<string, string>();
    if (ubicIds.length > 0) {
      const uQ = await ctx.supabase
        .from("inventario_ubicaciones")
        .select("id, nombre, codigo")
        .eq("empresa_id", empresaId)
        .in("id", ubicIds);
      if (!uQ.error) {
        for (const u of (uQ.data ?? []) as Array<{ id: string; nombre: string | null; codigo: string | null }>) {
          nombrePorUbic.set(u.id, u.nombre || u.codigo || "");
        }
      }
    }
    const movimientos = rows.map((r) => ({
      ...r,
      ubicacion_nombre: typeof r.ubicacion_id === "string" ? nombrePorUbic.get(r.ubicacion_id) ?? null : null,
    }));

    return NextResponse.json(successResponse({ movimientos }));
  } catch (err) {
    console.error("[/api/inventario/movimientos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}
