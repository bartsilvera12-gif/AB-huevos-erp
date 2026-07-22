-- Fix stock fantasma en Abasto Norte tras anular ventas "sin stock".
--
-- Problema: cuando una venta se hacía con stock=0 en Abasto Norte (permitir_sin_stock),
-- el movimiento SALIDA guardaba cantidad=line.cantidad pero el stock por ubicación se
-- clampeaba a 0 (no se descontaba nada real). Al anular, la ENTRADA sumaba la
-- cantidad completa a Abasto Norte → generaba stock fantasma.
--
-- Solución: registrar la cantidad realmente descontada de la ubicación en una nueva
-- columna. En la anulación, devolver sólo esa cantidad (no la de la línea).

ALTER TABLE abhuevos.movimientos_inventario
  ADD COLUMN IF NOT EXISTS cantidad_descontada numeric(14,3);

COMMENT ON COLUMN abhuevos.movimientos_inventario.cantidad_descontada IS
  'Cantidad realmente descontada del stock de la ubicación (puede ser menor que cantidad si hubo clamp por stock=0). NULL = usar cantidad como fallback (movimientos legacy).';
