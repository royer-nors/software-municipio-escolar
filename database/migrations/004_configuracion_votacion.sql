
-- Configuración persistente de la votación escolar.
CREATE TABLE configuracion_votacion (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    votacion_abierta BOOLEAN NOT NULL DEFAULT FALSE,
    voto_blanco_habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Se crea una única configuración inicial.
INSERT INTO configuracion_votacion (id)
VALUES (1);

-- Registro atómico del voto con validación de la configuración.
CREATE OR REPLACE FUNCTION registrar_voto(
    p_estudiante_id INTEGER,
    p_lista_id INTEGER
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_votacion_abierta BOOLEAN;
    v_voto_blanco_habilitado BOOLEAN;
BEGIN
    -- Bloquea la configuración mientras se registra el voto.
    SELECT votacion_abierta, voto_blanco_habilitado
    INTO v_votacion_abierta, v_voto_blanco_habilitado
    FROM configuracion_votacion
    WHERE id = 1
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la configuración de votación.';
    END IF;

    -- No se permite votar si la elección está cerrada.
    IF NOT v_votacion_abierta THEN
        RAISE EXCEPTION 'La votación está cerrada.'
            USING ERRCODE = 'V0001';
    END IF;

    -- No se permite el voto en blanco si está deshabilitado.
    IF p_lista_id IS NULL AND NOT v_voto_blanco_habilitado THEN
        RAISE EXCEPTION 'El voto en blanco está deshabilitado.'
            USING ERRCODE = 'V0002';
    END IF;

    -- Se conserva la protección de estudiantes desactivados y votantes.
    UPDATE estudiantes
    SET ya_voto = TRUE
    WHERE id = p_estudiante_id
      AND activo = TRUE
      AND ya_voto = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El estudiante no está habilitado o ya emitió su voto.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Si falla la inserción, PostgreSQL revierte también la actualización.
    INSERT INTO votos (lista_id)
    VALUES (p_lista_id);
END;
$$;
