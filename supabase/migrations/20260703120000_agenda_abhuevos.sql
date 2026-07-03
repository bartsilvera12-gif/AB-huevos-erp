-- =============================================================================
-- Módulo Agenda para instancia dedicada AB Huevos (schema único `abhuevos`).
-- Adaptado del módulo Agenda multi-tenant de neura-erp-sistemas-propio.
-- =============================================================================

CREATE TABLE IF NOT EXISTS abhuevos.agenda_citas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  cliente_id         uuid REFERENCES abhuevos.clientes(id) ON DELETE SET NULL,
  prospecto_id       uuid,
  responsable_id     uuid NOT NULL,
  contacto_nombre    text,
  contacto_telefono  text,
  titulo             text NOT NULL,
  tipo               text,
  estado             text NOT NULL DEFAULT 'pendiente',
  inicio_at          timestamptz NOT NULL,
  fin_at             timestamptz NOT NULL,
  ubicacion          text,
  observaciones      text,
  reprogramada_de_id uuid REFERENCES abhuevos.agenda_citas(id) ON DELETE SET NULL,
  cancelada_motivo   text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_agenda_citas_titulo_non_empty CHECK (length(trim(titulo)) > 0),
  CONSTRAINT chk_agenda_citas_rango CHECK (fin_at > inicio_at),
  CONSTRAINT chk_agenda_citas_estado CHECK (
    estado IN ('pendiente','confirmada','completada','no_asistio','cancelada','reprogramada')
  )
);

-- FK opcional a CRM si existe
DO $$
BEGIN
  IF to_regclass('abhuevos.crm_prospectos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'fk_agenda_citas_prospecto'
     ) THEN
    ALTER TABLE abhuevos.agenda_citas
      ADD CONSTRAINT fk_agenda_citas_prospecto
      FOREIGN KEY (prospecto_id) REFERENCES abhuevos.crm_prospectos(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_agenda_citas_ini    ON abhuevos.agenda_citas (empresa_id, inicio_at);
CREATE INDEX IF NOT EXISTS ix_agenda_citas_resp   ON abhuevos.agenda_citas (empresa_id, responsable_id, inicio_at);
CREATE INDEX IF NOT EXISTS ix_agenda_citas_estado ON abhuevos.agenda_citas (empresa_id, estado);
CREATE INDEX IF NOT EXISTS ix_agenda_citas_cli    ON abhuevos.agenda_citas (empresa_id, cliente_id);

ALTER TABLE abhuevos.agenda_citas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_citas_select ON abhuevos.agenda_citas;
CREATE POLICY agenda_citas_select ON abhuevos.agenda_citas
  FOR SELECT USING (abhuevos.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS agenda_citas_insert ON abhuevos.agenda_citas;
CREATE POLICY agenda_citas_insert ON abhuevos.agenda_citas
  FOR INSERT WITH CHECK (abhuevos.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS agenda_citas_update ON abhuevos.agenda_citas;
CREATE POLICY agenda_citas_update ON abhuevos.agenda_citas
  FOR UPDATE USING (abhuevos.puede_acceder_empresa(empresa_id))
             WITH CHECK (abhuevos.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS agenda_citas_delete ON abhuevos.agenda_citas;
CREATE POLICY agenda_citas_delete ON abhuevos.agenda_citas
  FOR DELETE USING (abhuevos.puede_acceder_empresa(empresa_id));

DROP TRIGGER IF EXISTS tr_agenda_citas_updated ON abhuevos.agenda_citas;
CREATE TRIGGER tr_agenda_citas_updated
  BEFORE UPDATE ON abhuevos.agenda_citas
  FOR EACH ROW EXECUTE FUNCTION abhuevos.set_updated_at();

-- Registrar módulo en catálogo (si no existe)
INSERT INTO abhuevos.modulos (nombre, slug)
SELECT 'Agenda', 'agenda'
WHERE NOT EXISTS (SELECT 1 FROM abhuevos.modulos WHERE slug = 'agenda');

-- Activar para AB Huevos
INSERT INTO abhuevos.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM abhuevos.empresas e
CROSS JOIN abhuevos.modulos m
WHERE e.nombre_empresa = 'AB Huevos'
  AND m.slug = 'agenda'
  AND NOT EXISTS (
    SELECT 1 FROM abhuevos.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

-- Grants para service_role, authenticated, anon
GRANT ALL ON abhuevos.agenda_citas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON abhuevos.agenda_citas TO authenticated;
GRANT SELECT ON abhuevos.agenda_citas TO anon;
