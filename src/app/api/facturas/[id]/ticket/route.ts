import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  parseKudeFromSignedRdeXml,
  kudeFallbackQrUrl,
} from "@/lib/sifen/parse-kude-from-signed-xml";
import { downloadSifenObject } from "@/lib/sifen/sifen-storage";
import { EMPRESA_DOC } from "@/lib/documentos/membrete";

/**
 * GET /api/facturas/[id]/ticket?w=58|80
 * Renderiza la factura electrónica como ticket térmico (58 o 80mm) con todos los datos
 * fiscales (RUC, timbrado, CDC, QR, ítems, IVA). Se abre en el browser con `window.print()`.
 */

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtGs(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("es-PY");
}

function fmtCdc(cdc: string): string {
  if (!cdc) return "";
  return cdc.match(/.{1,4}/g)?.join(" ") ?? cdc;
}

/** Para "documento generado" (hora servidor UTC → convertir a PY UTC-3). */
function fmtFechaHoraUTC(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const py = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    const dd = String(py.getUTCDate()).padStart(2, "0");
    const mm = String(py.getUTCMonth() + 1).padStart(2, "0");
    const yy = py.getUTCFullYear();
    const hh = String(py.getUTCHours()).padStart(2, "0");
    const mi = String(py.getUTCMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  } catch { return iso; }
}

/** Para dFeEmiDE (viene en hora local PY del XML SET). Formateo sin conversión. */
function fmtFechaHoraDE(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id: fid } = await ctxParams.params;
    const url = new URL(request.url);
    const wParam = url.searchParams.get("w");
    const widthMm = wParam === "58" ? 58 : 80;

    const { data: fac, error: errFac } = await supabase
      .from("facturas")
      .select("id, numero_factura, cliente_razon_social, cliente_ruc")
      .eq("id", fid)
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();
    if (errFac || !fac) return NextResponse.json(errorResponse("Factura no encontrada."), { status: 404 });

    const { data: fe, error: errFe } = await supabase
      .from("factura_electronica")
      .select("estado_sifen, xml_firmado_path, cdc")
      .eq("factura_id", fid)
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();
    if (errFe || !fe) return NextResponse.json(errorResponse("Sin documento electrónico."), { status: 404 });
    if (String(fe.estado_sifen) !== "aprobado") {
      return NextResponse.json(errorResponse("El ticket solo está disponible con SIFEN «aprobado»."), { status: 403 });
    }

    const xmlPath = String(fe.xml_firmado_path ?? "").trim();
    if (!xmlPath) return NextResponse.json(errorResponse("Sin XML firmado."), { status: 400 });

    const dl = await downloadSifenObject(supabase, xmlPath);
    if (!dl.ok) return NextResponse.json(errorResponse(`No se pudo descargar XML: ${dl.message}`), { status: 500 });

    const parsed = parseKudeFromSignedRdeXml(dl.data.toString("utf8"));
    const qrUrl = parsed.dCarQR ?? kudeFallbackQrUrl(parsed.cdc);
    const qrDataUri = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: widthMm === 58 ? 180 : 220,
    });

    const html = renderTicketHtml({ widthMm, parsed, qrDataUri, qrUrl, empresa: EMPRESA_DOC });
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[factura/ticket]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

type ParsedT = ReturnType<typeof parseKudeFromSignedRdeXml>;

function renderTicketHtml(opts: {
  widthMm: 58 | 80;
  parsed: ParsedT;
  qrDataUri: string;
  qrUrl: string;
  empresa: typeof EMPRESA_DOC;
}): string {
  const { widthMm, parsed, qrDataUri, qrUrl, empresa } = opts;
  const p = parsed;
  const fs = widthMm === 58 ? 9 : 10;
  const rucCompleto = `${p.emisor.dRucEm}-${p.emisor.dDVEmi}`;
  const numDoc = `${p.timbrado.dEst}-${p.timbrado.dPunExp}-${p.timbrado.dNumDoc}`;

  const items = p.items.map((it) => `
    <tr class="itm">
      <td colspan="3" class="itmDesc">${esc(it.descripcion)}</td>
    </tr>
    <tr class="itm">
      <td class="qty">${esc(it.cantidad)}</td>
      <td class="qty">x ${fmtGs(it.precioUnit)}</td>
      <td class="amt">${fmtGs(it.totalLinea)}</td>
    </tr>
  `).join("");

  const alterno = widthMm === 80 ? 58 : 80;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Factura Electrónica ${esc(p.timbrado.dNumDoc)} — ${widthMm}mm</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eee; font-family: 'Courier New', monospace; }
  .paper {
    background: #fff; width: ${widthMm}mm;
    margin: 6mm auto; padding: 4mm 3mm 6mm;
    box-shadow: 0 1px 4px rgba(0,0,0,.1);
    font-size: ${fs}px; line-height: 1.35; color: #000;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .divider { border-top: 1px dashed #000; margin: 3px 0; }
  .logo { max-width: ${widthMm === 58 ? 52 : 72}mm; max-height: ${widthMm === 58 ? 28 : 40}mm; margin: 0 auto 4px; display: block; object-fit: contain; }
  .head { font-size: ${fs + 1}px; }
  .title { font-size: ${fs + 2}px; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  td.qty { width: 26%; }
  td.amt { text-align: right; }
  .itmDesc { padding-top: 2px; }
  .totals td { padding: 1px 0; }
  .totals .lbl { text-align: left; }
  .totals .val { text-align: right; }
  .cdc { font-family: monospace; word-break: break-all; font-size: ${fs - 1}px; }
  .qr { display: block; margin: 4px auto; width: ${widthMm === 58 ? 34 : 42}mm; height: auto; }
  .footer { text-align: center; font-size: ${fs - 1}px; margin-top: 6px; }
  .actions { max-width: ${widthMm}mm; margin: 6mm auto 0; text-align: center; }
  .actions button, .actions a { display: inline-block; padding: 6px 10px; border-radius: 4px; border: 1px solid #333; background: #fff; text-decoration: none; color: #000; font-size: 12px; margin: 0 2px; cursor: pointer; }
  @media print {
    body { background: #fff; }
    .paper { box-shadow: none; padding: 2mm; margin: 0; width: ${widthMm}mm; }
    .actions { display: none; }
    @page { margin: 0; size: ${widthMm}mm auto; }
  }
</style>
</head>
<body>

<div class="paper">
  <img src="${esc(empresa.logoUrl)}" alt="${esc(empresa.nombre)}" class="logo" />
  <div class="center bold head">${esc(empresa.nombre)}</div>
  <div class="center head">RUC: ${esc(rucCompleto)}</div>
  <div class="center">${esc(p.emisor.dDirEmi)}</div>
  ${empresa.telefono ? `<div class="center">Tel: ${esc(empresa.telefono)}</div>` : ""}
  ${empresa.email ? `<div class="center">${esc(empresa.email)}</div>` : ""}

  <div class="divider"></div>

  <div class="center bold title">FACTURA ELECTRÓNICA</div>
  <div class="center">Timbrado N° ${esc(p.timbrado.dNumTim)}</div>
  <div class="center">Inicio vigencia: ${esc(p.timbrado.dFeIniT)}</div>
  <div class="center bold" style="font-size: ${fs + 1}px;">N° ${esc(numDoc)}</div>

  <div class="divider"></div>

  <div><span class="bold">Fecha:</span> ${esc(fmtFechaHoraDE(p.dFeEmiDE))}</div>
  <div><span class="bold">Cond. venta:</span> ${esc(p.operacion.condicionVenta)}</div>

  <div class="divider"></div>

  <div class="bold">CLIENTE</div>
  <div>${esc(p.receptor.nombre)}</div>
  ${p.receptor.docValue ? `<div>${esc(p.receptor.docLabel)}: ${esc(p.receptor.docValue)}</div>` : ""}
  ${p.receptor.direccion ? `<div>${esc(p.receptor.direccion)}</div>` : ""}
  ${p.receptor.telefono ? `<div>Tel: ${esc(p.receptor.telefono)}</div>` : ""}

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th class="qty">Cant.</th>
        <th class="qty">P.Unit</th>
        <th class="amt">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items}
    </tbody>
  </table>

  <div class="divider"></div>

  <table class="totals">
    ${Number(p.totales.dSubExe) > 0 ? `<tr><td class="lbl">Subtotal exentas</td><td class="val">${fmtGs(p.totales.dSubExe)}</td></tr>` : ""}
    ${Number(p.totales.dSub5) > 0 ? `<tr><td class="lbl">Subtotal 5%</td><td class="val">${fmtGs(p.totales.dSub5)}</td></tr>` : ""}
    ${Number(p.totales.dSub10) > 0 ? `<tr><td class="lbl">Subtotal 10%</td><td class="val">${fmtGs(p.totales.dSub10)}</td></tr>` : ""}
    <tr><td class="lbl bold">TOTAL</td><td class="val bold" style="font-size: ${fs + 2}px;">${fmtGs(p.totales.dTotGralOpe)}</td></tr>
    ${Number(p.totales.dIVA5) > 0 ? `<tr><td class="lbl">IVA 5%</td><td class="val">${fmtGs(p.totales.dIVA5)}</td></tr>` : ""}
    ${Number(p.totales.dIVA10) > 0 ? `<tr><td class="lbl">IVA 10%</td><td class="val">${fmtGs(p.totales.dIVA10)}</td></tr>` : ""}
    ${Number(p.totales.dTotIVA) > 0 ? `<tr><td class="lbl">TOTAL IVA</td><td class="val bold">${fmtGs(p.totales.dTotIVA)}</td></tr>` : ""}
  </table>

  <div class="divider"></div>

  <div class="center bold">CONSULTA DE VALIDEZ (e-kuatia / SET)</div>
  <img src="${qrDataUri}" alt="QR" class="qr" />
  <div class="center" style="font-size: ${fs - 1}px;">Escanee o ingrese el CDC en set.gov.py</div>
  <div class="center bold" style="margin-top: 3px;">CDC:</div>
  <div class="cdc center">${esc(fmtCdc(p.cdc))}</div>

  <div class="footer">
    Documento electrónico aprobado por SET.<br/>
    Este ticket es equivalente al KuDE oficial.<br/>
    ${esc(fmtFechaHoraUTC(new Date().toISOString()))}
  </div>
</div>

<div class="actions">
  <button type="button" onclick="window.print()">🖨 Imprimir</button>
  <a href="?w=${alterno}">Cambiar a ${alterno}mm</a>
</div>

</body>
</html>`;
}
