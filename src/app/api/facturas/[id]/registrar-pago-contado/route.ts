import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { registrarCobro } from "@/lib/cobros/server/cobros-pg";

/**
 * POST /api/facturas/[id]/registrar-pago-contado
 *
 * Cierra el circuito de cobro para facturas CONTADO que quedaron sin CxC (el
 * flujo normal solo crea CxC en crédito). Crea la CxC on-the-fly, registra
 * el cobro por el total, genera el recibo y devuelve su id para imprimir.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: facturaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const body = (await request.json().catch(() => ({}))) as {
      metodo_pago?: string;
      fecha_pago?: string;
      referencia?: string;
      titular?: string;
      entidad_bancaria_id?: string;
      entidad_nombre_snapshot?: string;
    };

    // La columna en `facturas` se llama `monto`, no `total`. `total` era el
    // supuesto que rompía la query con "column facturas.total does not exist".
    const facQ = await supabase
      .from("facturas")
      .select("id, origen_venta_id, cliente_id, monto, tipo, saldo, numero_factura")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", facturaId)
      .maybeSingle();
    if (facQ.error) throw new Error(facQ.error.message);
    const fac = facQ.data as {
      id: string;
      origen_venta_id: string | null;
      cliente_id: string | null;
      monto: number | string;
      tipo: string;
      saldo: number | string;
      numero_factura: string;
    } | null;
    if (!fac) return NextResponse.json(errorResponse("Factura no encontrada."), { status: 404 });
    if (!fac.origen_venta_id) {
      return NextResponse.json(errorResponse("La factura no tiene venta asociada."), { status: 400 });
    }
    if (!fac.cliente_id) {
      return NextResponse.json(errorResponse("La factura no tiene cliente asociado."), { status: 400 });
    }
    const total = Number(fac.monto) || 0;
    if (!(total > 0)) {
      return NextResponse.json(errorResponse("El monto de la factura debe ser mayor a cero."), { status: 400 });
    }

    // Buscar CxC existente (por si ya se creó en algún flujo).
    const cxcExistQ = await supabase
      .from("cuentas_por_cobrar")
      .select("id, saldo, estado")
      .eq("empresa_id", auth.empresa_id)
      .eq("venta_id", fac.origen_venta_id)
      .maybeSingle();
    if (cxcExistQ.error) throw new Error(cxcExistQ.error.message);

    let cxcId: string;
    if (cxcExistQ.data) {
      const cxc = cxcExistQ.data as { id: string; saldo: number | string; estado: string };
      if (cxc.estado === "pagado" || Number(cxc.saldo) <= 0) {
        return NextResponse.json(errorResponse("Esta factura ya está pagada."), { status: 409 });
      }
      cxcId = cxc.id;
    } else {
      // Crear CxC on-the-fly con saldo = total, estado pendiente.
      const hoy = new Date().toISOString().slice(0, 10);
      const insCxc = await supabase
        .from("cuentas_por_cobrar")
        .insert({
          empresa_id: auth.empresa_id,
          cliente_id: fac.cliente_id,
          venta_id: fac.origen_venta_id,
          numero_venta: fac.numero_factura,
          fecha_emision: hoy,
          fecha_vencimiento: null,
          moneda: "PYG",
          total,
          saldo: total,
          estado: "pendiente",
        })
        .select("id")
        .single();
      if (insCxc.error) throw new Error(insCxc.error.message);
      cxcId = String((insCxc.data as { id: string }).id);
    }

    // Registrar el cobro por el total (paga completo).
    const cobro = await registrarCobro(supabase, auth.empresa_id, {
      cuenta_por_cobrar_id: cxcId,
      monto: total,
      metodo_pago: (body.metodo_pago ?? "efectivo") as "efectivo" | "transferencia" | "tarjeta" | "otro",
      fecha_pago: body.fecha_pago,
      referencia: body.referencia,
      titular: body.titular,
      entidad_bancaria_id: body.entidad_bancaria_id,
      entidad_nombre_snapshot: body.entidad_nombre_snapshot,
      usuario_id: ctx.auth.usuarioCatalogId ?? null,
      usuario_nombre: ctx.auth.user?.email ?? null,
    });

    // Generar el recibo (reutiliza el endpoint interno que ya conoce el mapeo).
    const genRes = await fetch(new URL("/api/recibos-dinero", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ origen: "cobro_cxc", cobro_cliente_id: cobro.cobro_id }),
    });
    const genBody = await genRes.json().catch(() => ({}));
    const reciboId: string | null = genBody?.data?.recibo?.id ?? null;
    if (!reciboId) {
      return NextResponse.json(errorResponse(genBody?.error ?? "Cobro registrado pero no se pudo generar el recibo."), { status: 500 });
    }

    return NextResponse.json(successResponse({ recibo_id: reciboId, cobro_id: cobro.cobro_id }));
  } catch (err) {
    console.error("[/api/facturas/[id]/registrar-pago-contado]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
