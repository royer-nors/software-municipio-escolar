CREATE TABLE auditoria_borrado_datos (
    id BIGSERIAL PRIMARY KEY,
    administrador_id INTEGER NOT NULL,
    administrador_usuario VARCHAR(50) NOT NULL,
    operacion VARCHAR(40) NOT NULL CHECK (operacion IN (
        'solo_votos',
        'candidatos_listas',
        'estudiantes',
        'reinicio_pruebas'
    )),
    modo VARCHAR(24) NOT NULL CHECK (modo IN (
        'simulacion',
        'eliminacion',
        'reinicio_excepcional'
    )),
    resultado VARCHAR(16) NOT NULL CHECK (resultado IN (
        'simulado',
        'bloqueado',
        'ejecutado',
        'fallido'
    )),
    detalle JSONB NOT NULL DEFAULT '{}'::JSONB,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auditoria_borrado_datos_creado_idx
    ON auditoria_borrado_datos(creado_en DESC);

CREATE INDEX auditoria_borrado_datos_operacion_idx
    ON auditoria_borrado_datos(operacion, creado_en DESC);