import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { convertirCantidad } from "@/lib/unidades/convert";
import { obtenerSiguienteNumeroFacturaEmpresa } from "@/lib/facturacion/factura-suscripcion-servidor";
import { getUbicacionIdByCodigo, ajustarStockUbicacion } from "@/lib/multideposito/server";

/** Un faltante de stock detectado al validar la venta. */
export interface FaltanteStock {
  tipo: "producto" | "insumo";
  producto_id: string;
  nombre: string;
  sku: string;
  stock_actual: number;
  solicitado: number;
  faltante: number;
}

/**
 * Se lanza cuando falta stock y NO se autorizó la venta sin stock
 * (`permitir_sin_stock` ausente/false). Lleva el detalle para que la UI
 * muestre el modal de confirmación y reintente con el flag.
 */
export class StockInsuficienteError extends Error {
  faltantes: FaltanteStock[];
  constructor(faltantes: FaltanteStock[]) {
    super("Stock insuficiente para uno o más productos/insumos.");
    this.name = "StockInsuficienteError";
    this.faltantes = faltantes;
  }
}

export interface CreateVentaItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
  tipo_precio: "minorista" | "mayorista" | "distribuidor" | "costo";
  subtotal: number;
  monto_iva: number;
  total_linea: number;
}

export interface CreateVentaPedidoCocinaInput {
  modalidad: "local" | "delivery" | "carry_out";
  mesa: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  direccion_entrega: string | null;
  observacion: string | null;
}

export interface CreateVentaPgParams {
  schema: string;
  empresaId: string;
  clienteId: string | null;
  observaciones: string | null;
  moneda: "GS" | "USD";
  tipoCambio: number;
  tipoVenta: "CONTADO" | "CREDITO";
  plazoDias: number | null;
  /** Fecha de vencimiento explícita (YYYY-MM-DD) para crédito. Si falta, se calcula con plazoDias. */
  fechaVencimiento?: string | null;
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | null;
  items: CreateVentaItemInput[];
  subtotalDeclarado: number;
  montoIvaDeclarado: number;
  totalDeclarado: number;
  pedidoCocina?: CreateVentaPedidoCocinaInput | null;
  /** Si true, autoriza vender aunque falte stock de productos o insumos (stock puede quedar negativo). */
  permitirSinStock?: boolean;
  /** Si true y hay cliente, la venta emite nota de remisión (documento NO fiscal) con número NR-XXXXXX. */
  generaNotaRemision?: boolean;
  /** Tipo de documento fiscal: 'ticket' (default) o 'factura' (electrónica, requiere cliente). */
  tipoDocumento?: "ticket" | "factura";
}

function recalcTotals(items: CreateVentaItemInput[]) {
  let subtotal = 0;
  let montoIva = 0;
  let total = 0;
  for (const it of items) {
    subtotal += it.subtotal;
    montoIva += it.monto_iva;
    total += it.total_linea;
  }
  return { subtotal, montoIva, total };
}

const TOL = 2;

/**
 * Crea venta + ítems + movimientos + descuenta stock vía PostgREST/service-role.
 * Sin pool PG directo → compatible con Hostinger Node.js App.
 *
 * Atomicidad: PostgREST no expone transacciones multi-statement. Se hace best-effort:
 * si algún paso post-venta falla, se intenta rollback eliminando venta+items creados.
 * Para una instancia gastronómica de bajo volumen es aceptable.
 *
 * Regla `controla_stock` / recetas:
 *  - Producto con receta activa (Menú elaborado): NO descuenta su propio stock; explota la
 *    receta y descuenta cada insumo/materia prima (consumo = cantidad·(1+merma_pct)/rendimiento,
 *    consistente con fn_receta_costeo), generando un movimiento SALIDA (origen 'venta', ligado por
 *    venta_id) por insumo. Valida disponibilidad de insumos.
 *  - `controla_stock=true` (Reventa, sin receta): valida stock, descuenta stock, genera movimiento.
 *  - `controla_stock=false` (Menú sin receta / servicio): se inserta en ventas_items, NO descuenta.
 */
export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams
): Promise<{ ventaId: string; numeroControl: string; fechaIso: string; notaRemisionNumero: string | null; cuentaPorCobrarId?: string | null; facturaId?: string | null; numeroFactura?: string | null; facturaError?: string | null }> {
  const items = params.items;
  if (!items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }

  const calc = recalcTotals(items);
  if (
    Math.abs(calc.subtotal - params.subtotalDeclarado) > TOL ||
    Math.abs(calc.montoIva - params.montoIvaDeclarado) > TOL ||
    Math.abs(calc.total - params.totalDeclarado) > TOL
  ) {
    throw new Error("Los totales no coinciden con los ítems; revisá el carrito.");
  }

  const qtyByProduct = new Map<string, number>();
  for (const it of items) {
    qtyByProduct.set(it.producto_id, (qtyByProduct.get(it.producto_id) ?? 0) + it.cantidad);
  }

  const sb = createServiceRoleClientWithDbSchema(params.schema);

  // 1) Cliente
  if (params.clienteId) {
    const ck = await sb.from("clientes").select("id").eq("id", params.clienteId).eq("empresa_id", params.empresaId).maybeSingle();
    if (ck.error) throw new Error(ck.error.message);
    if (!ck.data) throw new Error("Cliente no encontrado en esta empresa.");
  }

  // 2) Cargar productos del carrito — TODOS los que existan y pertenezcan a la empresa, sin filtrar controla_stock ni stock>0.
  const ids = [...qtyByProduct.keys()];
  const prodQ = await sb
    .from("productos")
    .select("id, stock_actual, costo_promedio, nombre, sku, controla_stock, modo_receta")
    .eq("empresa_id", params.empresaId)
    .in("id", ids);
  if (prodQ.error) throw new Error(prodQ.error.message);
  const prodRows = (prodQ.data ?? []) as unknown as Array<{
    id: string;
    stock_actual: number | string;
    costo_promedio: number | string;
    nombre: string;
    sku: string;
    controla_stock: boolean | null;
    modo_receta: string | null;
  }>;

  if (prodRows.length !== ids.length) {
    const found = new Set(prodRows.map((r) => r.id));
    const faltantes = ids.filter((id) => !found.has(id));
    throw new Error(
      `Uno o más productos no existen o no pertenecen a esta empresa. IDs no encontrados: ${faltantes.join(", ")}`
    );
  }

  // Multi-depósito: la validación de stock se hace contra Abasto Norte (único punto de venta).
  // Si Abasto Norte tiene 0, el sistema exige emitir NR desde Central antes de vender.
  const ubicacionVentaIdValid = await getUbicacionIdByCodigo(sb, params.empresaId, "ABASTO-N");
  const stockPorUbicacion = new Map<string, number>();
  if (ubicacionVentaIdValid) {
    const psuQ = await sb
      .from("productos_stock_ubicacion")
      .select("producto_id, stock")
      .eq("empresa_id", params.empresaId)
      .eq("ubicacion_id", ubicacionVentaIdValid)
      .in("producto_id", ids);
    if (psuQ.error) throw new Error(psuQ.error.message);
    for (const r of (psuQ.data ?? []) as Array<{ producto_id: string; stock: number }>) {
      stockPorUbicacion.set(r.producto_id, Number(r.stock) || 0);
    }
  }

  type ProdMeta = { stock: number; costo: number; nombre: string; sku: string; controlaStock: boolean; modo: string };
  const stockMap = new Map<string, ProdMeta>();
  for (const r of prodRows) {
    // Si no hay fila en productos_stock_ubicacion para Abasto Norte → stock 0 (nada disponible para vender).
    const stockAbasto = stockPorUbicacion.get(r.id) ?? 0;
    stockMap.set(r.id, {
      stock: stockAbasto,
      costo: Number(r.costo_promedio),
      nombre: r.nombre,
      sku: r.sku,
      controlaStock: r.controla_stock !== false,
      modo: r.modo_receta ?? "preparado_al_vender",
    });
  }

  // 2b) Recetas: para cada producto vendido con receta activa, calcular el consumo de
  //     materia prima (insumos). Consistente con el costeo (fn_receta_costeo):
  //     consumo por unidad vendida = cantidad * (1 + merma_pct) / rendimiento.
  const recetasQ = await sb
    .from("recetas")
    .select("id, producto_id, rendimiento_cantidad")
    .eq("empresa_id", params.empresaId)
    .eq("activa", true)
    .in("producto_id", ids);
  if (recetasQ.error) throw new Error(recetasQ.error.message);
  const recetaRows = (recetasQ.data ?? []) as unknown as Array<{
    id: string;
    producto_id: string;
    rendimiento_cantidad: number | string | null;
  }>;
  // Solo se explota la receta (descuento de materia prima al vender) para productos en modo
  // 'preparado_al_vender'. Los productos 'produccion_previa' descuentan su PROPIO stock del
  // terminado (la materia prima ya se descontó al fabricar) → NO se agregan acá, así caen en
  // la rama de descuento de stock propio (pasos 3a/7). Evita el doble descuento.
  const recetaByProducto = new Map<string, { id: string; rendimiento: number }>();
  for (const r of recetaRows) {
    const modo = stockMap.get(r.producto_id)?.modo ?? "preparado_al_vender";
    if (modo === "produccion_previa") continue;
    const rend = Number(r.rendimiento_cantidad);
    recetaByProducto.set(r.producto_id, { id: r.id, rendimiento: rend > 0 ? rend : 1 });
  }

  // insumo_producto_id -> cantidad total a descontar en esta venta (EN LA UNIDAD DEL INSUMO).
  const insumoNeed = new Map<string, number>();
  // Metadata de insumos (stock/costo/nombre/sku/unidad) para validar y registrar movimientos.
  type InsumoMeta = { stock: number; costo: number; nombre: string; sku: string; unidad: string | null };
  const insumoMeta = new Map<string, InsumoMeta>();
  // Ítems cuya unidad es incompatible con la del insumo (no se convierten ni descuentan).
  const insumosIncompatibles: string[] = [];

  if (recetaRows.length) {
    const recetaIds = recetaRows.map((r) => r.id);
    const itemsQ = await sb
      .from("receta_items")
      .select("receta_id, insumo_producto_id, cantidad, unidad_medida, merma_pct")
      .in("receta_id", recetaIds);
    if (itemsQ.error) throw new Error(itemsQ.error.message);
    const itemsByReceta = new Map<string, Array<{ insumo_producto_id: string; cantidad: number; unidad_item: string | null; merma_pct: number }>>();
    const insumoIdsSet = new Set<string>();
    for (const it of (itemsQ.data ?? []) as unknown as Array<{
      receta_id: string;
      insumo_producto_id: string;
      cantidad: number | string;
      unidad_medida: string | null;
      merma_pct: number | string | null;
    }>) {
      const arr = itemsByReceta.get(it.receta_id) ?? [];
      arr.push({
        insumo_producto_id: it.insumo_producto_id,
        cantidad: Number(it.cantidad),
        unidad_item: it.unidad_medida ?? null,
        merma_pct: Number(it.merma_pct ?? 0),
      });
      itemsByReceta.set(it.receta_id, arr);
      insumoIdsSet.add(it.insumo_producto_id);
    }

    // Cargar meta de insumos (incluida su unidad) ANTES de agregar, para poder convertir.
    const insumoIds = [...insumoIdsSet];
    if (insumoIds.length) {
      const insQ = await sb
        .from("productos")
        .select("id, stock_actual, costo_promedio, nombre, sku, unidad_medida")
        .eq("empresa_id", params.empresaId)
        .in("id", insumoIds);
      if (insQ.error) throw new Error(insQ.error.message);
      const insRows = (insQ.data ?? []) as unknown as Array<{
        id: string;
        stock_actual: number | string;
        costo_promedio: number | string;
        nombre: string;
        sku: string;
        unidad_medida: string | null;
      }>;
      if (insRows.length !== insumoIds.length) {
        const found = new Set(insRows.map((r) => r.id));
        const faltan = insumoIds.filter((i) => !found.has(i));
        throw new Error(`La receta referencia insumos inexistentes en esta empresa: ${faltan.join(", ")}`);
      }
      // Multi-depósito: para insumos también validar contra Abasto Norte.
      const insumoStockAbasto = new Map<string, number>();
      if (ubicacionVentaIdValid) {
        const iQ = await sb
          .from("productos_stock_ubicacion")
          .select("producto_id, stock")
          .eq("empresa_id", params.empresaId)
          .eq("ubicacion_id", ubicacionVentaIdValid)
          .in("producto_id", insumoIds);
        if (iQ.error) throw new Error(iQ.error.message);
        for (const r of (iQ.data ?? []) as Array<{ producto_id: string; stock: number }>) {
          insumoStockAbasto.set(r.producto_id, Number(r.stock) || 0);
        }
      }
      for (const r of insRows) {
        insumoMeta.set(r.id, {
          stock: insumoStockAbasto.get(r.id) ?? 0,
          costo: Number(r.costo_promedio),
          nombre: r.nombre,
          sku: r.sku,
          unidad: r.unidad_medida ?? null,
        });
      }
    }

    // Agregar consumo CONVIRTIENDO la cantidad del ítem a la unidad del insumo.
    for (const [pid, qtySold] of qtyByProduct) {
      const rec = recetaByProducto.get(pid);
      if (!rec) continue;
      for (const ri of itemsByReceta.get(rec.id) ?? []) {
        const meta = insumoMeta.get(ri.insumo_producto_id);
        const unidadInsumo = meta?.unidad ?? null;
        // Sin unidad declarada en el ítem o en el insumo → se asume misma unidad (sin conversión).
        const cantConv = (ri.unidad_item == null || unidadInsumo == null)
          ? ri.cantidad
          : convertirCantidad(ri.cantidad, ri.unidad_item, unidadInsumo);
        if (cantConv == null) {
          // Unidad incompatible (familias distintas): no se descuenta para no corromper el stock.
          const nombre = meta?.nombre ?? ri.insumo_producto_id;
          if (!insumosIncompatibles.includes(nombre)) insumosIncompatibles.push(nombre);
          continue;
        }
        const consumo = (qtySold * cantConv * (1 + ri.merma_pct)) / rec.rendimiento;
        if (!(consumo > 0)) continue;
        insumoNeed.set(ri.insumo_producto_id, (insumoNeed.get(ri.insumo_producto_id) ?? 0) + consumo);
      }
    }
  }
  // Redondeo a 6 decimales para evitar ruido de coma flotante (la columna es numeric sin escala).
  for (const [k, v] of insumoNeed) insumoNeed.set(k, Math.round(v * 1e6) / 1e6);
  if (insumosIncompatibles.length > 0) {
    console.warn("[create-venta-pg] receta con unidades incompatibles (no se descuentan):", insumosIncompatibles.join(", "));
  }

  // 3) Validar stock. Se recolectan TODOS los faltantes (productos de reventa con receta
  //    consumen insumos, no su propio stock). Si hay faltantes y NO se autorizó la venta sin
  //    stock, se lanza StockInsuficienteError con el detalle (la UI muestra el modal y reintenta
  //    con permitir_sin_stock=true). Si se autorizó, se continúa y el stock puede quedar negativo.
  const faltantes: FaltanteStock[] = [];

  // 3a) Productos de reventa (controla_stock=true, sin receta).
  for (const [pid, need] of qtyByProduct) {
    const p = stockMap.get(pid)!;
    if (recetaByProducto.has(pid)) continue;
    // produccion_previa: descuenta su propio stock del terminado aunque controla_stock=false.
    if (!p.controlaStock && p.modo !== "produccion_previa") continue;
    if (p.stock < need) {
      faltantes.push({
        tipo: "producto", producto_id: pid, nombre: p.nombre, sku: p.sku,
        stock_actual: p.stock, solicitado: need, faltante: Math.round((need - p.stock) * 1e6) / 1e6,
      });
    }
  }

  // 3b) Materia prima (insumos) requerida por las recetas.
  for (const [insId, need] of insumoNeed) {
    const m = insumoMeta.get(insId)!;
    if (m.stock < need) {
      faltantes.push({
        tipo: "insumo", producto_id: insId, nombre: m.nombre, sku: m.sku,
        stock_actual: m.stock, solicitado: need, faltante: Math.round((need - m.stock) * 1e6) / 1e6,
      });
    }
  }

  if (faltantes.length > 0 && !params.permitirSinStock) {
    throw new StockInsuficienteError(faltantes);
  }

  // Auditoría: si se autorizó vender sin stock y hubo faltantes, dejar constancia en la venta.
  let observacionesFinal = params.observaciones;
  if (faltantes.length > 0 && params.permitirSinStock) {
    const detalle = faltantes
      .map((f) => `${f.nombre} (stock ${f.stock_actual}, pedido ${f.solicitado}, falta ${f.faltante})`)
      .join("; ");
    const nota = `Venta con stock insuficiente autorizada: ${detalle}`;
    observacionesFinal = (observacionesFinal ? `${observacionesFinal} | ${nota}` : nota).slice(0, 4000);
  }

  // 4) Numero control VTA-XXXXXX (best-effort: race posible en entorno multi-usuario).
  const maxQ = await sb
    .from("ventas")
    .select("numero_control")
    .eq("empresa_id", params.empresaId)
    .like("numero_control", "VTA-%")
    .order("numero_control", { ascending: false })
    .limit(1);
  if (maxQ.error) throw new Error(maxQ.error.message);
  let nextNum = 1;
  const lastNum = (maxQ.data?.[0] as { numero_control?: string } | undefined)?.numero_control;
  if (lastNum) {
    const m = lastNum.match(/^VTA-(\d+)$/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  const numeroControl = `VTA-${String(nextNum).padStart(6, "0")}`;
  const fechaIso = new Date().toISOString();

  // 4b) Nota de remisión (solo si se solicita Y hay cliente). Numeración simple por
  //     empresa: NR-XXXXXX. Documento NO fiscal — no toca SIFEN/timbrado.
  const generaNota = params.generaNotaRemision === true && !!params.clienteId;
  let notaRemisionNumero: string | null = null;
  if (generaNota) {
    const nrQ = await sb
      .from("ventas")
      .select("nota_remision_numero")
      .eq("empresa_id", params.empresaId)
      .like("nota_remision_numero", "NR-%")
      .order("nota_remision_numero", { ascending: false })
      .limit(1);
    if (nrQ.error) throw new Error(nrQ.error.message);
    let nextNr = 1;
    const lastNr = (nrQ.data?.[0] as { nota_remision_numero?: string } | undefined)?.nota_remision_numero;
    if (lastNr) {
      const m = lastNr.match(/^NR-(\d+)$/);
      if (m) nextNr = parseInt(m[1], 10) + 1;
    }
    notaRemisionNumero = `NR-${String(nextNr).padStart(6, "0")}`;
  }

  // Multi-depósito: la venta descuenta del depósito Abasto Norte (punto de venta) por default.
  const ubicacionVentaId = await getUbicacionIdByCodigo(sb, params.empresaId, "ABASTO-N");

  // 5) Insertar venta
  let insVenta = await sb
    .from("ventas")
    .insert({
      empresa_id: params.empresaId,
      cliente_id: params.clienteId,
      numero_control: numeroControl,
      moneda: params.moneda,
      tipo_cambio: params.tipoCambio,
      subtotal: calc.subtotal,
      monto_iva: calc.montoIva,
      total: calc.total,
      estado: "completada",
      tipo_venta: params.tipoVenta,
      plazo_dias: params.plazoDias,
      metodo_pago: params.metodoPago,
      genera_nota_remision: generaNota,
      nota_remision_numero: notaRemisionNumero,
      tipo_documento: params.tipoDocumento === "factura" ? "factura" : "ticket",
      ubicacion_id: ubicacionVentaId,
      fecha: fechaIso,
      observaciones: observacionesFinal,
    })
    .select("id")
    .single();
  if (insVenta.error) {
    // Fallback si la columna tipo_documento aún no existe en DB — reintenta sin ese campo.
    if (/tipo_documento/i.test(insVenta.error.message)) {
      const retry = await sb
        .from("ventas")
        .insert({
          empresa_id: params.empresaId,
          cliente_id: params.clienteId,
          numero_control: numeroControl,
          moneda: params.moneda,
          tipo_cambio: params.tipoCambio,
          subtotal: calc.subtotal,
          monto_iva: calc.montoIva,
          total: calc.total,
          estado: "completada",
          tipo_venta: params.tipoVenta,
          plazo_dias: params.plazoDias,
          metodo_pago: params.metodoPago,
          genera_nota_remision: generaNota,
          nota_remision_numero: notaRemisionNumero,
          fecha: fechaIso,
          observaciones: observacionesFinal,
        })
        .select("id")
        .single();
      if (retry.error) throw new Error(retry.error.message);
      insVenta = retry;
    } else {
      throw new Error(insVenta.error.message);
    }
  }
  const ventaId = String((insVenta.data as { id: string }).id);

  // Helper de rollback best-effort
  const rollback = async () => {
    try {
      await sb.from("cuentas_por_cobrar").delete().eq("venta_id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
    try {
      await sb.from("movimientos_inventario").delete().eq("venta_id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
    try {
      await sb.from("ventas_items").delete().eq("venta_id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
    try {
      // Facturas creadas como bridge (si falló después de crearlas)
      const fq = await sb.from("facturas").select("id").eq("origen_venta_id", ventaId).eq("empresa_id", params.empresaId);
      const fids = ((fq.data ?? []) as Array<{ id: string }>).map((f) => f.id);
      for (const fid of fids) {
        try { await sb.from("factura_electronica").delete().eq("factura_id", fid); } catch {}
        try { await sb.from("factura_items").delete().eq("factura_id", fid); } catch {}
        try { await sb.from("facturas").delete().eq("id", fid); } catch {}
      }
    } catch {}
    try {
      await sb.from("ventas").delete().eq("id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
  };

  try {
    // 6) Insertar items (bulk)
    const itemsRows = items.map((line) => ({
      empresa_id: params.empresaId,
      venta_id: ventaId,
      producto_id: line.producto_id,
      producto_nombre: line.producto_nombre,
      sku: line.sku,
      cantidad: line.cantidad,
      precio_venta_original: line.precio_venta_original,
      precio_venta: line.precio_venta,
      tipo_iva: line.tipo_iva,
      tipo_precio: line.tipo_precio,
      subtotal: line.subtotal,
      monto_iva: line.monto_iva,
      total_linea: line.total_linea,
    }));
    const insItems = await sb.from("ventas_items").insert(itemsRows);
    if (insItems.error) throw new Error(insItems.error.message);

    // 7) Descuento de stock + movimientos solo para productos con controla_stock=true SIN receta.
    for (const line of items) {
      const p = stockMap.get(line.producto_id)!;
      if (recetaByProducto.has(line.producto_id)) continue;
      // produccion_previa: descuenta su propio stock del terminado aunque controla_stock=false.
      if (!p.controlaStock && p.modo !== "produccion_previa") continue;
      // El stock nunca baja de 0: si se vendió sin stock, queda en 0 (la cantidad real
      // vendida queda registrada en el movimiento SALIDA, así no se pierde trazabilidad).
      const nuevoStock = Math.max(0, p.stock - line.cantidad);
      const upd = await sb
        .from("productos")
        .update({ stock_actual: nuevoStock })
        .eq("id", line.producto_id)
        .eq("empresa_id", params.empresaId);
      if (upd.error) throw new Error(upd.error.message);
      p.stock = nuevoStock;

      // Multi-depósito: reflejar salida en productos_stock_ubicacion (Abasto Norte).
      // Capamos en 0 (mismo comportamiento que el stock global): si vendieron sin stock,
      // el movimiento SALIDA registra la cantidad real, pero el stock por ubicación no baja de 0.
      if (ubicacionVentaId) {
        const stockAntes = stockPorUbicacion.get(line.producto_id) ?? 0;
        const deltaClamped = -Math.min(line.cantidad, stockAntes);
        if (deltaClamped !== 0) {
          const errAju = await ajustarStockUbicacion(sb, params.empresaId, ubicacionVentaId, line.producto_id, deltaClamped);
          if (errAju) console.warn(`[venta] ajuste stock Abasto Norte falló para ${line.producto_nombre}: ${errAju}`);
          else stockPorUbicacion.set(line.producto_id, stockAntes + deltaClamped);
        }
      }

      const mov = await sb.from("movimientos_inventario").insert({
        empresa_id: params.empresaId,
        producto_id: line.producto_id,
        producto_nombre: line.producto_nombre,
        producto_sku: line.sku,
        tipo: "SALIDA",
        cantidad: line.cantidad,
        costo_unitario: p.costo,
        origen: "venta",
        referencia: numeroControl,
        fecha: fechaIso,
        venta_id: ventaId,
        ubicacion_id: ubicacionVentaId,
      });
      if (mov.error) throw new Error(mov.error.message);
    }

    // 7b) Descontar materia prima (insumos) por explosión de receta + movimiento SALIDA por insumo.
    for (const [insId, need] of insumoNeed) {
      const m = insumoMeta.get(insId)!;
      // Igual que productos: el stock de insumos nunca baja de 0 (la salida real
      // queda registrada en el movimiento SALIDA del insumo).
      const nuevoStock = Math.max(0, m.stock - need);
      const upd = await sb
        .from("productos")
        .update({ stock_actual: nuevoStock })
        .eq("id", insId)
        .eq("empresa_id", params.empresaId);
      if (upd.error) throw new Error(upd.error.message);
      m.stock = nuevoStock;

      // Multi-depósito: insumo también se descuenta de Abasto Norte (clampeado en 0)
      if (ubicacionVentaId) {
        // Leer stock actual del insumo en Abasto Norte para clampear
        const insQuery = await sb
          .from("productos_stock_ubicacion")
          .select("stock")
          .eq("empresa_id", params.empresaId)
          .eq("ubicacion_id", ubicacionVentaId)
          .eq("producto_id", insId)
          .maybeSingle();
        const stockAntes = insQuery.data ? Number((insQuery.data as { stock: number }).stock) : 0;
        const deltaClamped = -Math.min(need, stockAntes);
        if (deltaClamped !== 0) {
          const errAju = await ajustarStockUbicacion(sb, params.empresaId, ubicacionVentaId, insId, deltaClamped);
          if (errAju) console.warn(`[venta insumo] ajuste stock Abasto Norte falló para ${m.nombre}: ${errAju}`);
        }
      }

      const mov = await sb.from("movimientos_inventario").insert({
        empresa_id: params.empresaId,
        producto_id: insId,
        producto_nombre: m.nombre,
        producto_sku: m.sku,
        tipo: "SALIDA",
        cantidad: need,
        costo_unitario: m.costo,
        origen: "venta",
        referencia: numeroControl,
        fecha: fechaIso,
        venta_id: ventaId,
        ubicacion_id: ubicacionVentaId,
      });
      if (mov.error) throw new Error(mov.error.message);
    }

    // 8) Pedido cocina (tarjeta en proyectos) — no fatal: si falta setup, se salta.
    if (params.pedidoCocina) {
      const tipoQ = await sb
        .from("proyecto_tipos")
        .select("id")
        .eq("empresa_id", params.empresaId)
        .eq("codigo", "pedido")
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      const estadoQ = await sb
        .from("proyecto_estados")
        .select("id")
        .eq("empresa_id", params.empresaId)
        .eq("codigo", "nuevo")
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      if (tipoQ.error || estadoQ.error || !tipoQ.data || !estadoQ.data) {
        console.warn("[createVenta] pedido skip — falta proyecto_tipos.pedido o proyecto_estados.nuevo");
      } else {
      const tipoId = (tipoQ.data as { id: string }).id;
      const estadoId = (estadoQ.data as { id: string }).id;

      const itemsSnapshot = items.map((it) => ({
        producto_id: it.producto_id,
        producto_nombre: it.producto_nombre,
        sku: it.sku,
        cantidad: it.cantidad,
        precio_venta: it.precio_venta,
        total_linea: it.total_linea,
      }));
      const briefData = {
        modalidad: params.pedidoCocina.modalidad,
        mesa: params.pedidoCocina.mesa,
        cliente_nombre: params.pedidoCocina.cliente_nombre,
        cliente_telefono: params.pedidoCocina.cliente_telefono,
        direccion_entrega: params.pedidoCocina.direccion_entrega,
        observacion: params.pedidoCocina.observacion,
        items: itemsSnapshot,
        venta_id: ventaId,
        numero_control: numeroControl,
        fecha_iso: fechaIso,
      };
      const metadata = {
        source: "venta",
        venta_id: ventaId,
        numero_control: numeroControl,
        modalidad: params.pedidoCocina.modalidad,
      };
      const tituloModalidad =
        params.pedidoCocina.modalidad === "local" ? "Local"
        : params.pedidoCocina.modalidad === "delivery" ? "Delivery"
        : "Retiro";
      const detalle =
        params.pedidoCocina.modalidad === "local" && params.pedidoCocina.mesa
          ? ` · Mesa ${params.pedidoCocina.mesa}`
          : params.pedidoCocina.modalidad === "delivery" && params.pedidoCocina.cliente_nombre
          ? ` · ${params.pedidoCocina.cliente_nombre}`
          : "";
      const titulo = `Venta ${numeroControl} · ${tituloModalidad}${detalle}`.slice(0, 200);

      const insProy = await sb.from("proyectos").insert({
        empresa_id: params.empresaId,
        cliente_id: params.clienteId,
        tipo_id: tipoId,
        estado_id: estadoId,
        titulo,
        prioridad: "normal",
        monto_vendido: params.totalDeclarado,
        fecha_ingreso: fechaIso,
        brief_data: briefData,
        metadata,
      });
      if (insProy.error) throw new Error(insProy.error.message);
      }
    }

    // 9) Cuenta por cobrar (solo CRÉDITO con cliente). El saldo inicial = total de la venta;
    //    estado 'pendiente'. NO afecta stock ni movimientos: es cobranza. Un índice único
    //    sobre venta_id impide CxC duplicada si la venta se reintentara.
    let cuentaPorCobrarId: string | null = null;
    if (params.tipoVenta === "CREDITO" && params.clienteId) {
      const fechaEmision = fechaIso.slice(0, 10);
      let fechaVencimiento: string | null = null;
      if (params.fechaVencimiento) {
        fechaVencimiento = params.fechaVencimiento;
      } else if (params.plazoDias && params.plazoDias > 0) {
        const d = new Date(fechaIso);
        d.setDate(d.getDate() + params.plazoDias);
        fechaVencimiento = d.toISOString().slice(0, 10);
      }
      const insCxc = await sb
        .from("cuentas_por_cobrar")
        .insert({
          empresa_id: params.empresaId,
          cliente_id: params.clienteId,
          venta_id: ventaId,
          numero_venta: numeroControl,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          moneda: params.moneda === "USD" ? "USD" : "PYG",
          total: calc.total,
          saldo: calc.total,
          estado: "pendiente",
        })
        .select("id")
        .single();
      if (insCxc.error) throw new Error(insCxc.error.message);
      cuentaPorCobrarId = String((insCxc.data as { id: string }).id);
    }

    // 9) Puente Venta → Factura (SIFEN) — solo si tipo_documento = 'factura'
    // NO-BLOQUEANTE: si falla, la venta queda igual y devolvemos el error en `facturaError`
    // para que la UI lo muestre. Evita perder la venta ante un problema de schema/config.
    let facturaId: string | null = null;
    let numeroFactura: string | null = null;
    let facturaError: string | null = null;
    if (params.tipoDocumento === "factura") {
      try {
        console.log("[bridge] iniciando factura para venta", ventaId, "cliente", params.clienteId);
        if (!params.clienteId) throw new Error("Factura electrónica requiere cliente.");

        const cliQ = await sb
          .from("clientes")
          .select("ruc, documento, empresa, nombre")
          .eq("empresa_id", params.empresaId)
          .eq("id", params.clienteId)
          .maybeSingle();
        if (cliQ.error) throw new Error(`Cliente snapshot: ${cliQ.error.message}`);
        const cli = (cliQ.data ?? {}) as { ruc?: string | null; documento?: string | null; empresa?: string | null; nombre?: string | null };
        const clienteRuc = (cli.ruc ?? cli.documento ?? "").trim() || null;
        const clienteRazonSocial = (cli.empresa ?? cli.nombre ?? "").trim() || null;
        console.log("[bridge] cliente snapshot", { clienteRuc, clienteRazonSocial });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        numeroFactura = await obtenerSiguienteNumeroFacturaEmpresa(sb as any, params.empresaId);
        console.log("[bridge] numero_factura siguiente", numeroFactura);

        const fechaSolo = fechaIso.slice(0, 10);
        const tipoFactura = params.tipoVenta === "CREDITO" ? "credito" : "contado";
        // Fecha vencimiento: si crédito y plazo → fecha + plazo, si no → misma fecha
        let fechaVencFactura = fechaSolo;
        if (params.tipoVenta === "CREDITO" && params.plazoDias && params.plazoDias > 0) {
          const d = new Date(fechaSolo);
          d.setDate(d.getDate() + params.plazoDias);
          fechaVencFactura = d.toISOString().slice(0, 10);
        }
        const insFac = await sb
          .from("facturas")
          .insert({
            empresa_id: params.empresaId,
            cliente_id: params.clienteId,
            numero_factura: numeroFactura,
            estado: "Pendiente",
            tipo: tipoFactura,
            moneda: params.moneda === "USD" ? "USD" : "GS",
            monto: calc.total,
            saldo: calc.total,
            fecha: fechaSolo,
            fecha_vencimiento: fechaVencFactura,
            origen_venta_id: ventaId,
            cliente_razon_social: clienteRazonSocial,
            cliente_ruc: clienteRuc,
            observaciones: observacionesFinal,
          })
          .select("id")
          .single();
        if (insFac.error) throw new Error(`Factura insert: ${insFac.error.message}`);
        facturaId = String((insFac.data as { id: string }).id);
        console.log("[bridge] factura creada", facturaId, numeroFactura);

        const facItems = items.map((line) => {
          const iva = String(line.tipo_iva ?? "10%");
          const ivaNorm = iva === "EXENTA" || iva === "5%" || iva === "10%" ? iva : "10%";
          return {
            empresa_id: params.empresaId,
            factura_id: facturaId!,
            descripcion: line.producto_nombre,
            cantidad: line.cantidad,
            precio_unitario: line.precio_venta,
            subtotal: line.subtotal,      // neto (sin IVA)
            iva: line.monto_iva,          // monto de IVA por línea
            total: line.total_linea,      // bruto (con IVA)
            tipo_iva: ivaNorm,
          };
        });
        const insFacItems = await sb.from("factura_items").insert(facItems);
        if (insFacItems.error) throw new Error(`Factura items: ${insFacItems.error.message}`);

        const insDe = await sb
          .from("factura_electronica")
          .insert({
            empresa_id: params.empresaId,
            factura_id: facturaId!,
            estado_sifen: "borrador",
          });
        if (insDe.error) throw new Error(`Factura electrónica: ${insDe.error.message}`);

        const linkV = await sb
          .from("ventas")
          .update({ factura_id: facturaId })
          .eq("empresa_id", params.empresaId)
          .eq("id", ventaId);
        if (linkV.error) throw new Error(`Link venta→factura: ${linkV.error.message}`);

        console.log("[bridge] OK factura=", facturaId);
      } catch (e) {
        facturaError = e instanceof Error ? e.message : String(e);
        console.error("[bridge] FALLO creando factura para venta", ventaId, "→", facturaError);
        // Best-effort: si ya se creó la factura pero falló algo después, limpiarla
        if (facturaId) {
          try { await sb.from("factura_electronica").delete().eq("factura_id", facturaId); } catch {}
          try { await sb.from("factura_items").delete().eq("factura_id", facturaId); } catch {}
          try { await sb.from("facturas").delete().eq("id", facturaId); } catch {}
          facturaId = null;
          numeroFactura = null;
        }
      }
    }

    return { ventaId, numeroControl, fechaIso, notaRemisionNumero, cuentaPorCobrarId, facturaId, numeroFactura, facturaError };
  } catch (err) {
    await rollback();
    throw err;
  }
}
