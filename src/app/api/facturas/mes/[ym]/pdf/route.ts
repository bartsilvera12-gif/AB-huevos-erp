import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { downloadSifenObject } from "@/lib/sifen/sifen-storage";
import { buildKudePdfBuffer, type KudeBranding } from "@/lib/sifen/kude-pdf";
import {
  kudeFallbackQrUrl,
  parseKudeFromSignedRdeXml,
} from "@/lib/sifen/parse-kude-from-signed-xml";
import type { SifenConsultaLoteUltimaPersistida } from "@/lib/sifen/types";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

async function loadKudeBranding(
  supabase: AppSupabaseClient,
  empresaId: string
): Promise<KudeBranding | null> {
  try {
    const { data, error } = await supabase
      .from("empresa_sifen_config")
      .select("kude_logo_path, kude_color_primario, kude_color_primario_fill")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      kude_logo_path?: string | null;
      kude_color_primario?: string | null;
      kude_color_primario_fill?: string | null;
    };
    const logoPath = row.kude_logo_path?.trim() ?? "";
    let logoBytes: Uint8Array | null = null;
    if (logoPath) {
      const dl = await downloadSifenObject(supabase, logoPath);
      if (dl.ok) logoBytes = new Uint8Array(dl.data);
    }
    return {
      logoBytes,
      colorPrimario: row.kude_color_primario?.trim() || null,
      colorPrimarioFill: row.kude_color_primario_fill?.trim() || null,
    };
  } catch {
    return null;
  }
}

function dProtAutFromConsulta(
  cdc: string,
  consulta: SifenConsultaLoteUltimaPersistida | Record<string, unknown> | null | undefined
): string | null {
  if (!consulta || typeof consulta !== "object") return null;
  const o = consulta as Record<string, unknown>;
  const raw = o.detallePorCdc ?? o.detalle_por_cdc;
  if (!Array.isArray(raw)) return null;
  const hit = (raw as { cdc: string; dProtAut: string | null }[]).find((d) => d.cdc === cdc);
  const v = hit?.dProtAut;
  return v != null && String(v).trim() !== "" ? String(v).trim() : null;
}

/**
 * GET /api/facturas/mes/[ym]/pdf
 * Devuelve un único PDF con todos los KuDE aprobados del mes (ym = yyyy-mm)
 * concatenados. Solo incluye facturas cuyo estado_sifen == "aprobado" y
 * que tengan XML firmado en storage.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ ym: string }> }
) {
  try {
    const { ym } = await ctxParams.params;
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      return NextResponse.json(errorResponse("Mes inválido (formato esperado yyyy-mm)."), { status: 400 });
    }
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    // Rango del mes.
    const [y, m] = ym.split("-").map((v) => Number(v));
    const desde = `${y}-${String(m).padStart(2, "0")}-01`;
    const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
    const hasta = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`;

    // 1) Facturas del mes.
    const fQ = await supabase
      .from("facturas")
      .select("id, numero_factura, fecha")
      .eq("empresa_id", auth.empresa_id)
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .order("fecha", { ascending: true });
    if (fQ.error) throw new Error(fQ.error.message);
    const facturas = (fQ.data ?? []) as Array<{ id: string; numero_factura: string; fecha: string }>;
    if (facturas.length === 0) {
      return NextResponse.json(errorResponse(`Sin facturas para ${ym}.`), { status: 404 });
    }
    const ids = facturas.map((f) => f.id);

    // 2) Estado SIFEN + XML paths + consulta lote.
    const feQ = await supabase
      .from("factura_electronica")
      .select("factura_id, estado_sifen, xml_firmado_path, cdc, sifen_ultima_respuesta_consulta_lote")
      .eq("empresa_id", auth.empresa_id)
      .in("factura_id", ids);
    if (feQ.error) throw new Error(feQ.error.message);
    const feByFactura = new Map<string, {
      estado_sifen?: string | null;
      xml_firmado_path?: string | null;
      cdc?: string | null;
      sifen_ultima_respuesta_consulta_lote?: unknown;
    }>();
    for (const r of (feQ.data ?? []) as Array<{
      factura_id: string;
      estado_sifen?: string | null;
      xml_firmado_path?: string | null;
      cdc?: string | null;
      sifen_ultima_respuesta_consulta_lote?: unknown;
    }>) {
      feByFactura.set(r.factura_id, r);
    }

    const branding = await loadKudeBranding(supabase, auth.empresa_id);

    // 3) Generar PDFs individuales y concatenar.
    const merged = await PDFDocument.create();
    const errores: string[] = [];
    let incluidas = 0;

    for (const f of facturas) {
      const fe = feByFactura.get(f.id);
      if (!fe) { errores.push(`${f.numero_factura}: sin doc electrónico`); continue; }
      if (String(fe.estado_sifen) !== "aprobado") {
        errores.push(`${f.numero_factura}: SIFEN ${fe.estado_sifen ?? "desconocido"}`);
        continue;
      }
      const xmlPath = String(fe.xml_firmado_path ?? "").trim();
      if (!xmlPath) { errores.push(`${f.numero_factura}: sin XML firmado`); continue; }

      const dl = await downloadSifenObject(supabase, xmlPath);
      if (!dl.ok) { errores.push(`${f.numero_factura}: XML no descargable`); continue; }

      let parsed;
      try { parsed = parseKudeFromSignedRdeXml(dl.data.toString("utf8")); }
      catch { errores.push(`${f.numero_factura}: XML inválido`); continue; }

      const dProtAut = dProtAutFromConsulta(parsed.cdc, fe.sifen_ultima_respuesta_consulta_lote as SifenConsultaLoteUltimaPersistida | Record<string, unknown> | null);
      const qrUrl = parsed.dCarQR ?? kudeFallbackQrUrl(parsed.cdc);

      let pdfBuf: Buffer;
      try {
        pdfBuf = await buildKudePdfBuffer({
          parsed,
          numeroFactura: f.numero_factura,
          dProtAut,
          qrUrl,
          branding,
        });
      } catch { errores.push(`${f.numero_factura}: fallo generación PDF`); continue; }

      try {
        const src = await PDFDocument.load(new Uint8Array(pdfBuf));
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        incluidas++;
      } catch { errores.push(`${f.numero_factura}: fallo merge`); continue; }
    }

    if (incluidas === 0) {
      return NextResponse.json(
        errorResponse(`No se pudo incluir ninguna factura del mes. Detalles: ${errores.slice(0, 5).join(" | ")}`),
        { status: 404 }
      );
    }

    const bytes = await merged.save();
    const fname = `facturas-${ym}-${incluidas}docs.pdf`;
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "private, no-store",
        "X-Facturas-Incluidas": String(incluidas),
        "X-Facturas-Excluidas": String(errores.length),
      },
    });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
