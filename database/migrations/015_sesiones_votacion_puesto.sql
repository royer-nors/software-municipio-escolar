-- Control de sesiones, sin almacenar JWT ni selección electoral.
-- No cambia registros electorales, cuentas ni migraciones anteriores.
CREATE TABLE sesiones_votacion_puesto (
    token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones_puesto(id) ON DELETE RESTRICT,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    vence_en TIMESTAMPTZ NOT NULL,
    finalizada_en TIMESTAMPTZ,
    CHECK (vence_en > creada_en)
);
CREATE INDEX sesiones_votacion_puesto_activas ON sesiones_votacion_puesto(vence_en)
    WHERE finalizada_en IS NULL;
