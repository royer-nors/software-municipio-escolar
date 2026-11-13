-- Inventario administrativo; no concede credenciales ni acceso a votación.
-- No relaciona la identidad del estudiante con equipos ni votos.
CREATE TABLE computadoras (
    id SERIAL PRIMARY KEY,
    identificador VARCHAR(30) UNIQUE NOT NULL
        CHECK (identificador ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
    nombre VARCHAR(100) NOT NULL
        CHECK (nombre = btrim(nombre) AND char_length(nombre) > 0),
    grado SMALLINT NOT NULL CHECK (grado BETWEEN 1 AND 5),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
