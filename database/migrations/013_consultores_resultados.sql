-- Identidades independientes del padrón y de los administradores.
CREATE TABLE consultores_resultados (
    id SMALLINT PRIMARY KEY CHECK (id IN (1, 2)),
    usuario VARCHAR(50),
    password_hash TEXT,
    activo BOOLEAN NOT NULL DEFAULT FALSE,
    version_token INTEGER NOT NULL DEFAULT 0 CHECK (version_token >= 0),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (usuario IS NULL OR (usuario = lower(btrim(usuario)) AND usuario <> '')),
    CHECK (NOT activo OR (usuario IS NOT NULL AND password_hash IS NOT NULL))
);
CREATE UNIQUE INDEX consultores_usuario_unico ON consultores_resultados(lower(usuario));
INSERT INTO consultores_resultados(id) VALUES (1), (2);
CREATE TABLE auditoria_consultores_resultados (
    id BIGSERIAL PRIMARY KEY,
    administrador_id INTEGER NOT NULL,
    consultor_id SMALLINT NOT NULL REFERENCES consultores_resultados(id),
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    accion TEXT NOT NULL
);
