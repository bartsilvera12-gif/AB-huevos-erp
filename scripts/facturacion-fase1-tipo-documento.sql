-- Facturación Fase 1 — toggle Ticket / Factura electrónica en cabecera de venta
-- Correr en Supabase SQL Editor (schema abhuevos)

ALTER TABLE abhuevos.ventas
  ADD COLUMN IF NOT EXISTS tipo_documento text NOT NULL DEFAULT 'ticket'
  CHECK (tipo_documento IN ('ticket', 'factura'));

CREATE INDEX IF NOT EXISTS idx_ventas_tipo_documento
  ON abhuevos.ventas(empresa_id, tipo_documento);

-- Verificación
SELECT tipo_documento, COUNT(*) AS ventas
FROM abhuevos.ventas
GROUP BY tipo_documento
ORDER BY tipo_documento;
