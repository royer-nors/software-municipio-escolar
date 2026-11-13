-- El modo manual existente se conserva hasta programar explícitamente la elección.
ALTER TABLE configuracion_votacion
  ADD COLUMN institucion VARCHAR(150),
  ADD COLUMN ubicacion VARCHAR(150),
  ADD COLUMN anio_electoral INTEGER CHECK (anio_electoral BETWEEN 2000 AND 2100),
  ADD COLUMN fecha_votacion DATE,
  ADD COLUMN hora_inicio TIME(0),
  ADD COLUMN hora_fin TIME(0),
  ADD COLUMN automatica BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT horario_electoral_valido CHECK (
    (fecha_votacion IS NULL AND hora_inicio IS NULL AND hora_fin IS NULL AND anio_electoral IS NULL)
    OR (fecha_votacion IS NOT NULL AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
      AND anio_electoral IS NOT NULL AND EXTRACT(YEAR FROM fecha_votacion) = anio_electoral
      AND hora_fin > hora_inicio)),
  ADD CONSTRAINT programacion_completa CHECK (NOT automatica OR (
    fecha_votacion IS NOT NULL AND institucion IS NOT NULL AND ubicacion IS NOT NULL));

CREATE TABLE auditoria_configuracion_electoral (
  id BIGSERIAL PRIMARY KEY,
  administrador_id INTEGER NOT NULL,
  administrador_usuario TEXT NOT NULL,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  motivo TEXT NOT NULL,
  anterior JSONB NOT NULL,
  nueva JSONB NOT NULL
);

-- Inicio inclusivo, fin exclusivo; independiente de la zona del SO y clientes.
CREATE FUNCTION estado_votacion(c configuracion_votacion, instante TIMESTAMPTZ DEFAULT clock_timestamp())
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN NOT c.automatica THEN CASE WHEN c.votacion_abierta THEN 'Abierta' ELSE 'Cerrada' END
    WHEN instante < ((c.fecha_votacion + c.hora_inicio) AT TIME ZONE 'America/Lima') THEN 'Programada'
    WHEN instante >= ((c.fecha_votacion + c.hora_fin) AT TIME ZONE 'America/Lima') THEN 'Finalizada'
    ELSE 'Abierta' END;
$$;

CREATE OR REPLACE FUNCTION registrar_voto(p_estudiante_id INTEGER, p_lista_id INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  c configuracion_votacion%ROWTYPE;
BEGIN
  SELECT * INTO c FROM configuracion_votacion WHERE id = 1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la configuración de votación.'; END IF;
  IF estado_votacion(c, clock_timestamp()) <> 'Abierta' THEN
    RAISE EXCEPTION 'La votación está cerrada.' USING ERRCODE = 'V0001';
  END IF;
  IF p_lista_id IS NULL AND NOT c.voto_blanco_habilitado THEN
    RAISE EXCEPTION 'El voto en blanco está deshabilitado.' USING ERRCODE = 'V0002';
  END IF;
  UPDATE estudiantes SET ya_voto = TRUE
    WHERE id = p_estudiante_id AND activo = TRUE AND ya_voto = FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El estudiante no está habilitado o ya emitió su voto.' USING ERRCODE = 'P0001';
  END IF;
  -- Reloj real después de esperar bloqueos; el error revierte también ya_voto.
  IF estado_votacion(c, clock_timestamp()) <> 'Abierta' THEN
    RAISE EXCEPTION 'La votación está cerrada.' USING ERRCODE = 'V0001';
  END IF;
  INSERT INTO votos (lista_id) VALUES (p_lista_id);
END;
$$;
