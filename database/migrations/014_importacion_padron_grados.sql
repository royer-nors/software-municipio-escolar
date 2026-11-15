-- Preparación temporal de importaciones; no modifica el padrón existente.
CREATE TABLE vistas_previas_padron (
    id UUID PRIMARY KEY,
    administrador_id INTEGER NOT NULL,
    grado SMALLINT NOT NULL CHECK (grado BETWEEN 1 AND 5),
    modo TEXT NOT NULL CHECK (modo IN ('agregar', 'reemplazar')),
    estudiantes JSONB,
    huella TEXT NOT NULL CHECK (huella ~ '^[a-f0-9]{64}$'),
    creada_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    vence_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + interval '10 minutes',
    consumida_en TIMESTAMPTZ,
    CHECK (vence_en > creada_en),
    CHECK ((consumida_en IS NULL AND jsonb_typeof(estudiantes)='array' AND estudiantes IS NOT NULL)
        OR (consumida_en IS NOT NULL AND estudiantes IS NULL))
);
CREATE INDEX vistas_previas_padron_vigencia ON vistas_previas_padron(vence_en);
CREATE TABLE auditoria_importaciones_padron (
    id BIGSERIAL PRIMARY KEY,
    administrador_id INTEGER NOT NULL,
    administrador_usuario TEXT NOT NULL,
    vista_previa_id UUID NOT NULL UNIQUE REFERENCES vistas_previas_padron(id),
    grado SMALLINT NOT NULL CHECK (grado BETWEEN 1 AND 5),
    modo TEXT NOT NULL CHECK (modo IN ('agregar', 'reemplazar')),
    cantidades JSONB NOT NULL,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
