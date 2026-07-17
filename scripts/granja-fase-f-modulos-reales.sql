-- Granja Fase F — registrar los módulos en catálogo y activarlos para Aviagro
-- Corrió en Supabase SQL Editor. Idempotente.

-- 1) Registrar en catálogo global (public.modulos)
INSERT INTO public.modulos (id, nombre, slug)
SELECT gen_random_uuid(), 'Galpones', 'galpones'
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'galpones');

INSERT INTO public.modulos (id, nombre, slug)
SELECT gen_random_uuid(), 'Producción de huevos', 'produccion_huevos'
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'produccion_huevos');

INSERT INTO public.modulos (id, nombre, slug)
SELECT gen_random_uuid(), 'Clasificación de huevos', 'clasificacion_huevos'
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'clasificacion_huevos');

-- 2) Activar los 3 módulos para todas las empresas que usan el schema abhuevos.
--    (Si querés restringir a una empresa puntual, cambiá el WHERE por empresa_id = '…')
INSERT INTO public.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM public.empresas e
CROSS JOIN public.modulos m
WHERE m.slug IN ('galpones', 'produccion_huevos', 'clasificacion_huevos')
  AND e.schema_name = 'abhuevos'
  AND NOT EXISTS (
    SELECT 1 FROM public.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

-- 3) Verificación
SELECT
  e.nombre AS empresa,
  m.slug,
  em.activo
FROM public.empresa_modulos em
JOIN public.empresas e ON e.id = em.empresa_id
JOIN public.modulos m ON m.id = em.modulo_id
WHERE m.slug IN ('galpones', 'produccion_huevos', 'clasificacion_huevos')
  AND e.schema_name = 'abhuevos'
ORDER BY m.slug;
