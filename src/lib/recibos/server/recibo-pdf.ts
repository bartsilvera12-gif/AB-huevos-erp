/**
 * Recibo de dinero — PDF real (pdf-lib, Vercel-safe).
 *
 * Reemplaza al HTML + window.print(): en celular "Guardar como PDF" del diálogo
 * de impresión no guarda de forma confiable. Un PDF real baja/abre como archivo
 * y se puede compartir (WhatsApp, etc.).
 *
 * Documento interno NO fiscal. No reemplaza factura legal.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type RGB } from "pdf-lib";
import { EMPRESA_DOC } from "@/lib/documentos/membrete";

const A4_W = 595.28;
const A4_H = 841.89;
/** Turquesa del recibo (#4FAEB2). */
const TEAL: RGB = rgb(79 / 255, 174 / 255, 178 / 255);
const TEAL_FILL: RGB = rgb(0.93, 0.98, 0.98);
const BLACK: RGB = rgb(0.12, 0.16, 0.22);
const GRAY: RGB = rgb(0.42, 0.45, 0.5);

const METODO_LBL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
  otro: "Otro",
};

export type ReciboPdfRow = {
  numero_recibo?: unknown;
  fecha?: unknown;
  cliente_nombre?: unknown;
  cliente_documento?: unknown;
  monto?: unknown;
  moneda?: unknown;
  concepto?: unknown;
  metodo_pago?: unknown;
  referencia?: unknown;
  observaciones?: unknown;
  usuario_nombre?: unknown;
};

function fmtMonto(n: unknown, moneda: string): string {
  const v = Number(n) || 0;
  return (
    (moneda === "USD" ? "USD " : "Gs. ") +
    v.toLocaleString("es-PY", { maximumFractionDigits: moneda === "USD" ? 2 : 0 })
  );
}

function fmtFecha(iso: unknown): string {
  if (!iso) return "—";
  try {
    return new Date(String(iso)).toLocaleDateString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

/** WinAnsi (Helvetica) no cubre todo Unicode: normaliza lo que suele venir del ERP. */
function safe(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ");
}

function readAviagroLogo(): { bytes: Uint8Array; ext: "png" | "jpg" } | null {
  const candidates: Array<{ file: string; ext: "png" | "jpg" }> = [
    { file: "brand/aviagro-logo.jpeg", ext: "jpg" },
    { file: "logo-neura.png", ext: "png" },
  ];
  for (const c of candidates) {
    const p = path.join(process.cwd(), "public", c.file);
    try {
      if (fs.existsSync(p)) return { bytes: new Uint8Array(fs.readFileSync(p)), ext: c.ext };
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Parte texto por ancho real de fuente para no desbordar el ancho `maxW`. */
function wrapByWidth(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = safe(text).replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) <= maxW || !cur) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export async function buildReciboPdfBuffer(r: ReciboPdfRow): Promise<Buffer> {
  const moneda = String(r.moneda ?? "PYG");
  const metodo = METODO_LBL[String(r.metodo_pago ?? "")] ?? String(r.metodo_pago ?? "—");

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Recibo ${safe(r.numero_recibo)}`);
  pdfDoc.setAuthor("Neura ERP");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([A4_W, A4_H]);
  const H = page.getHeight();
  const margin = 48;
  const innerW = A4_W - margin * 2;
  const rightEdge = margin + innerW;

  const yTop = (fromTop: number) => H - fromTop;
  const text = (
    s: string,
    x: number,
    fromTop: number,
    size: number,
    f: PDFFont = font,
    color: RGB = BLACK
  ) => page.drawText(safe(s), { x, y: yTop(fromTop), size, font: f, color });
  const textRight = (
    s: string,
    xr: number,
    fromTop: number,
    size: number,
    f: PDFFont = font,
    color: RGB = BLACK
  ) => {
    const w = f.widthOfTextAtSize(safe(s), size);
    page.drawText(safe(s), { x: xr - w, y: yTop(fromTop), size, font: f, color });
  };

  let cur = margin;

  /* ── Membrete: logo izq + datos empresa der ── */
  const e = EMPRESA_DOC;
  const logo = readAviagroLogo();
  let logoImg: PDFImage | null = null;
  let logoW = 0;
  let logoH = 0;
  if (logo) {
    try {
      logoImg = logo.ext === "png" ? await pdfDoc.embedPng(logo.bytes) : await pdfDoc.embedJpg(logo.bytes);
      logoW = 150;
      const sc = logoW / logoImg.width;
      logoH = logoImg.height * sc;
      if (logoH > 78) {
        logoH = 78;
        logoW = logoImg.width * (logoH / logoImg.height);
      }
      page.drawImage(logoImg, { x: margin, y: yTop(cur + logoH), width: logoW, height: logoH });
    } catch {
      logoImg = null;
    }
  }

  let ry = cur + 4;
  textRight(e.nombre, rightEdge, ry, 13, fontBold);
  ry += 15;
  if (e.telefono) {
    textRight(`Tel: ${e.telefono}`, rightEdge, ry, 9, font, GRAY);
    ry += 12;
  }
  if (e.email) {
    textRight(e.email, rightEdge, ry, 9, font, GRAY);
    ry += 12;
  }
  if (e.direccion.length) {
    textRight(e.direccion.join(" · "), rightEdge, ry, 9, font, GRAY);
    ry += 12;
  }

  cur = Math.max(cur + logoH, ry) + 10;
  page.drawLine({
    start: { x: margin, y: yTop(cur) },
    end: { x: rightEdge, y: yTop(cur) },
    thickness: 2.5,
    color: TEAL,
  });
  cur += 22;

  /* ── Tag RECIBO DE DINERO (izq) + Nº y fecha (der) ── */
  const tagText = "RECIBO DE DINERO";
  const tagPadX = 10;
  const tagSize = 10;
  const tagW = fontBold.widthOfTextAtSize(tagText, tagSize) + tagPadX * 2;
  const tagH = 20;
  page.drawRectangle({
    x: margin,
    y: yTop(cur + tagH - 4),
    width: tagW,
    height: tagH,
    color: TEAL,
  });
  text(tagText, margin + tagPadX, cur + tagH - 10, tagSize, fontBold, rgb(1, 1, 1));

  textRight(String(r.numero_recibo ?? ""), rightEdge, cur + 2, 15, fontBold, TEAL);
  textRight(`Fecha: ${fmtFecha(r.fecha)}`, rightEdge, cur + 18, 10, font, GRAY);
  cur += tagH + 22;

  /* ── Recibí de ── */
  text("RECIBÍ DE", margin, cur, 8, fontBold, GRAY);
  cur += 15;
  const cli = String(r.cliente_nombre ?? "—") + (r.cliente_documento ? `  ·  ${r.cliente_documento}` : "");
  for (const ln of wrapByWidth(cli, fontBold, 13, innerW)) {
    text(ln, margin, cur, 13, fontBold);
    cur += 17;
  }
  cur += 8;

  /* ── Monto ── */
  const montoH = 46;
  page.drawRectangle({
    x: margin,
    y: yTop(cur + montoH),
    width: innerW,
    height: montoH,
    borderColor: TEAL,
    borderWidth: 2,
    color: TEAL_FILL,
  });
  text("MONTO RECIBIDO", margin + 16, cur + 18, 9, fontBold, GRAY);
  textRight(fmtMonto(r.monto, moneda), rightEdge - 16, cur + 31, 22, fontBold, BLACK);
  cur += montoH + 24;

  /* ── Detalle ── */
  const detalle: Array<[string, string]> = [];
  if (r.concepto) detalle.push(["Concepto", String(r.concepto)]);
  detalle.push(["Método de pago", metodo]);
  if (r.referencia) detalle.push(["Referencia", String(r.referencia)]);
  if (r.observaciones) detalle.push(["Observaciones", String(r.observaciones)]);

  const labelW = 110;
  for (const [label, value] of detalle) {
    text(`${label}:`, margin, cur, 10, fontBold, GRAY);
    const lines = wrapByWidth(value, font, 10, innerW - labelW);
    for (let i = 0; i < lines.length; i++) {
      text(lines[i]!, margin + labelW, cur, 10, font, BLACK);
      cur += 15;
    }
    cur += 3;
  }

  /* ── Firma ── */
  cur += 44;
  const firmaW = 240;
  const firmaX = rightEdge - firmaW;
  page.drawLine({
    start: { x: firmaX, y: yTop(cur) },
    end: { x: rightEdge, y: yTop(cur) },
    thickness: 0.75,
    color: rgb(0.6, 0.63, 0.68),
  });
  cur += 13;
  const firmaLbl = r.usuario_nombre ? `Recibido por: ${r.usuario_nombre}` : "Recibido por";
  textRight(firmaLbl, rightEdge, cur, 9, font, GRAY);
  cur += 30;

  /* ── Pie legal ── */
  const legal = "Documento interno no fiscal. No reemplaza factura legal.";
  page.drawLine({
    start: { x: margin, y: yTop(cur) },
    end: { x: rightEdge, y: yTop(cur) },
    thickness: 0.5,
    color: rgb(0.82, 0.84, 0.87),
  });
  cur += 14;
  const legalW = font.widthOfTextAtSize(legal, 8.5);
  text(legal, margin + (innerW - legalW) / 2, cur, 8.5, font, GRAY);

  return Buffer.from(await pdfDoc.save());
}
