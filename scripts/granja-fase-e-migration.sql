-- Granja Fase E — inventario integration
-- Correr en Supabase SQL Editor, schema abhuevos

-- 1) granja_tipos_huevo: vinculación opcional a un producto del inventario
ALTER TABLE abhuevos.granja_tipos_huevo
  ADD COLUMN IF NOT EXISTS producto_id uuid NULL REFERENCES abhuevos.productos(id);

CREATE INDEX IF NOT EXISTS idx_granja_tipos_huevo_producto
  ON abhuevos.granja_tipos_huevo(producto_id);

-- 2) granja_clasificaciones: flag para saber si el detalle ya fue aplicado al inventario
ALTER TABLE abhuevos.granja_clasificaciones
  ADD COLUMN IF NOT EXISTS stock_aplicado boolean NOT NULL DEFAULT false;

-- 3) Relajar CHECK de movimientos_inventario para aceptar 'clasificacion' como origen
--    Si el CHECK actual tiene lista blanca de orígenes, agregamos los nuevos.
DO $$
DECLARE
  cnt_ck int;
BEGIN
  -- Solo si existe una restricción con nombre convencional
  SELECT COUNT(*) INTO cnt_ck
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'abhuevos'
    AND t.relname = 'movimientos_inventario'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%origen%';

  IF cnt_ck > 0 THEN
    -- Advertencia — inspeccioná manualmente si "clasificacion" o "clasificacion_revertida" están permitidos.
    RAISE NOTICE 'Existe(n) % CHECK(s) sobre origen en movimientos_inventario. Revisar manualmente que acepte "clasificacion" y "clasificacion_revertida".', cnt_ck;
  END IF;
END $$;

-- Verificación
SELECT
  (SELECT COUNT(*) FROM abhuevos.granja_tipos_huevo WHERE producto_id IS NOT NULL) AS tipos_vinculados,
  (SELECT COUNT(*) FROM abhuevos.granja_clasificaciones WHERE stock_aplicado = true) AS clasif_aplicadas;
