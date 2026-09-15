import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { buildReciboPdfBuffer, type ReciboPdfRow } from "@/lib/recibos/server/recibo-pdf";
import { resolverNumeroFacturaRef } from "@/lib/recibos/server/recibos-pg";

/**
 * GET /api/recibos-dinero/[id]/pdf
 * Recibo de dinero A4 como PDF real (pdf-lib). Documento interno NO fiscal.
 *
 * Antes se servía HTML + window.print(): en celular "Guardar como PDF" no guarda
 * de forma confiable. Ahora devuelve application/pdf para que baje/abra como
 * archivo compartible (WhatsApp, etc.).
 *
 * `?dl=1` fuerza descarga (attachment); por defecto se sirve inline para que el
 * visor móvil ofrezca compartir/guardar.
 */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const dl = new URL(request.url).searchParams.get("dl") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });

  const rq = await ctx.supabase
    .from("recibos_dinero")
    .select("*")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  if (rq.error || !rq.data) return new NextResponse("Recibo no encontrado", { status: 404 });
  const r = rq.data as ReciboPdfRow & {
    numero_recibo?: unknown;
    origen?: unknown;
    venta_id?: unknown;
    cuenta_por_cobrar_id?: unknown;
  };

  // Recibos de cobro de cuenta corriente: mostrar el número REAL de factura asociada,
  // incluso si el recibo se generó antes de este cambio (cuando el concepto guardaba el
  // nº de venta). Solo ajusta el texto mostrado en el PDF; no modifica la base ni el cobro.
  if (String(r.origen ?? "") === "cobro_cxc") {
    let ventaId = r.venta_id ? String(r.venta_id) : "";
    if (!ventaId && r.cuenta_por_cobrar_id) {
      const ctaQ = await ctx.supabase
        .from("cuentas_por_cobrar")
        .select("venta_id")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("id", String(r.cuenta_por_cobrar_id))
        .maybeSingle();
      ventaId = (ctaQ.data as { venta_id?: string } | null)?.venta_id ?? "";
    }
    const legal = await resolverNumeroFacturaRef(ctx.supabase, ctx.auth.empresa_id, ventaId);
    if (legal) {
      // Solo reescribe el patrón auto-generado "... cuenta VTA-xxx" (no toca conceptos manuales).
      const m = String(r.concepto ?? "").match(/^(Cancelación de|Pago parcial de)\s+cuenta\b/);
      if (m) r.concepto = `${m[1]} Factura N° ${legal}`;
    }
  }

  const pdf = await buildReciboPdfBuffer(r);

  const numero = String(r.numero_recibo ?? id).replace(/[^\w.-]+/g, "_");
  const fname = `Recibo-${numero}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${fname}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
