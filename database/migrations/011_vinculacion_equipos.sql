CREATE TABLE autorizaciones_puesto (
    id BIGSERIAL PRIMARY KEY,
    computadora_id INTEGER NOT NULL REFERENCES computadoras(id) ON DELETE RESTRICT,
    codigo_hash TEXT UNIQUE NOT NULL CHECK (codigo_hash ~ '^[a-f0-9]{64}$'),
    creada_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    vence_en TIMESTAMPTZ NOT NULL CHECK (vence_en > creada_en),
    consumida_en TIMESTAMPTZ,
    revocada_en TIMESTAMPTZ,
    UNIQUE (id, computadora_id)
);
CREATE UNIQUE INDEX autorizaciones_puesto_pendiente ON autorizaciones_puesto(computadora_id)
    WHERE consumida_en IS NULL AND revocada_en IS NULL;

CREATE TABLE vinculaciones_puesto (
    id BIGSERIAL PRIMARY KEY,
    computadora_id INTEGER NOT NULL REFERENCES computadoras(id) ON DELETE RESTRICT,
    autorizacion_id BIGINT UNIQUE NOT NULL REFERENCES autorizaciones_puesto(id) ON DELETE RESTRICT,
    credencial_hash TEXT UNIQUE NOT NULL CHECK (credencial_hash ~ '^[a-f0-9]{64}$'),
    vinculada_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    vence_en TIMESTAMPTZ NOT NULL CHECK (vence_en > vinculada_en),
    revocada_en TIMESTAMPTZ,
    FOREIGN KEY (autorizacion_id, computadora_id) REFERENCES autorizaciones_puesto(id, computadora_id) ON DELETE RESTRICT
);
-- Una sesión vencida también requiere revocación explícita antes de reemplazarla.
CREATE UNIQUE INDEX vinculaciones_puesto_unica ON vinculaciones_puesto(computadora_id)
    WHERE revocada_en IS NULL;

CREATE FUNCTION revocar_puesto_deshabilitado() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE autorizaciones_puesto SET revocada_en = clock_timestamp()
      WHERE computadora_id = NEW.id AND consumida_en IS NULL AND revocada_en IS NULL;
    UPDATE vinculaciones_puesto SET revocada_en = clock_timestamp()
      WHERE computadora_id = NEW.id AND revocada_en IS NULL;
    RETURN NEW;
END;
$$;
CREATE TRIGGER computadoras_revocar_al_deshabilitar AFTER UPDATE OF activo ON computadoras
    FOR EACH ROW WHEN (OLD.activo = TRUE AND NEW.activo = FALSE)
    EXECUTE FUNCTION revocar_puesto_deshabilitado();
