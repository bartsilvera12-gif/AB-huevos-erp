import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/facturas/[id]/recibo
 * Devuelve el id del recibo de dinero asociado al último cobro de la factura.
 * 404 si aún no hay cobros registrados o no hay un recibo generado.
 *
 * Cadena: factura.origen_venta_id → cuentas_por_cobrar.venta_id → cobros_clientes.cuenta_por_cobrar_id
 *   → recibos_dinero.cobro_cliente_id.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: facturaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const facQ = await supabase
      .from("facturas")
      .select("id, origen_venta_id")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", facturaId)
      .maybeSingle();
    if (facQ.error) throw new Error(facQ.error.message);
    const ventaId = (facQ.data as { origen_venta_id?: string | null } | null)?.origen_venta_id ?? null;
    if (!ventaId) {
      return NextResponse.json(errorResponse("Factura sin venta asociada."), { status: 404 });
    }

    const cxcQ = await supabase
      .from("cuentas_por_cobrar")
      .select("id")
      .eq("empresa_id", auth.empresa_id)
      .eq("venta_id", ventaId);
    if (cxcQ.error) throw new Error(cxcQ.error.message);
    const cxcIds = ((cxcQ.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (cxcIds.length === 0) {
      return NextResponse.json(errorResponse("No hay cuentas por cobrar para esta factura."), { status: 404 });
    }

    const cobQ = await supabase
      .from("cobros_clientes")
      .select("id, fecha_pago")
      .eq("empresa_id", auth.empresa_id)
      .in("cuenta_por_cobrar_id", cxcIds)
      .order("fecha_pago", { ascending: false })
      .limit(1);
    if (cobQ.error) throw new Error(cobQ.error.message);
    const cobroId = ((cobQ.data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
    if (!cobroId) {
      return NextResponse.json(errorResponse("Aún no se registró ningún cobro para esta factura."), { status: 404 });
    }

    // Buscar recibo existente; si no hay, crear uno nuevo idempotente.
    const rdQ = await supabase
      .from("recibos_dinero")
      .select("id")
      .eq("empresa_id", auth.empresa_id)
      .eq("cobro_cliente_id", cobroId)
      .maybeSingle();
    if (rdQ.error) throw new Error(rdQ.error.message);
    let reciboId: string | null = (rdQ.data as { id?: string } | null)?.id ?? null;

    if (!reciboId) {
      // Generar el recibo llamando al endpoint interno de POST /api/recibos-dinero
      // (que ya conoce el mapeo cobro → recibo y hace la creación completa).
      const genRes = await fetch(new URL("/api/recibos-dinero", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Reenviar cookies para mantener la sesión.
          cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ origen: "cobro_cxc", cobro_cliente_id: cobroId }),
      });
      const genBody = await genRes.json().catch(() => ({}));
      reciboId = genBody?.data?.recibo?.id ?? null;
      if (!reciboId) {
        return NextResponse.json(errorResponse(genBody?.error ?? "No se pudo generar el recibo."), { status: 500 });
      }
    }

    return NextResponse.json(successResponse({ recibo_id: reciboId, cobro_id: cobroId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
