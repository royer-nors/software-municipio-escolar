ALTER TABLE administradores
    ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN version_token INTEGER NOT NULL DEFAULT 0 CHECK (version_token >= 0);

ALTER TABLE estudiantes ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION registrar_voto(p_estudiante_id INTEGER, p_lista_id INTEGER) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE estudiantes SET ya_voto = TRUE
    WHERE id = p_estudiante_id AND activo = TRUE AND ya_voto = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El estudiante no está habilitado o ya emitió su voto.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO votos (lista_id) VALUES (p_lista_id);
END;
$$;
