-- Las validaciones fallan antes de adaptar datos incorrectos; no los descartan.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM estudiantes WHERE codigo !~ '^[0-9]{8}$' OR ya_voto IS NULL) THEN
        RAISE EXCEPTION 'El padrón contiene DNI inválidos o estados de voto nulos. Revisar antes de migrar.';
    END IF;
    IF EXISTS (SELECT 1 FROM candidatos WHERE lista IS NULL OR btrim(lista) = '') THEN
        RAISE EXCEPTION 'Hay candidatos sin lista. Asignar sus listas antes de migrar.';
    END IF;
END;
$$;

CREATE TABLE listas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL CHECK (btrim(nombre) <> ''),
    logo_url TEXT,
    propuestas TEXT[] NOT NULL DEFAULT '{}'
);

ALTER TABLE estudiantes
    ADD COLUMN grado VARCHAR(20),
    ADD COLUMN seccion VARCHAR(10),
    ADD CONSTRAINT estudiantes_dni_valido CHECK (codigo ~ '^[0-9]{8}$'),
    ADD CONSTRAINT estudiantes_nombre_valido CHECK (btrim(nombre) <> ''),
    ALTER COLUMN ya_voto SET NOT NULL;

ALTER TABLE candidatos
    ADD COLUMN lista_id INTEGER,
    ADD COLUMN cargo VARCHAR(80),
    ADD COLUMN foto_url TEXT,
    ADD CONSTRAINT candidatos_nombre_valido CHECK (btrim(nombre) <> '');

INSERT INTO listas (nombre)
SELECT DISTINCT lista FROM candidatos;

UPDATE candidatos c
SET lista_id = l.id
FROM listas l
WHERE c.lista = l.nombre;

ALTER TABLE candidatos
    ALTER COLUMN lista_id SET NOT NULL,
    ADD CONSTRAINT candidatos_lista_fk FOREIGN KEY (lista_id) REFERENCES listas(id) ON DELETE RESTRICT;

ALTER TABLE votos ADD COLUMN lista_id INTEGER;

UPDATE votos v
SET lista_id = c.lista_id
FROM candidatos c
WHERE v.candidato_id = c.id;

ALTER TABLE votos
    ADD CONSTRAINT votos_lista_fk FOREIGN KEY (lista_id) REFERENCES listas(id) ON DELETE RESTRICT,
    ADD CONSTRAINT votos_legacy_con_lista CHECK (candidato_id IS NULL OR lista_id IS NOT NULL);

-- Mantiene válidos los votos históricos y las inserciones antiguas por candidato.
CREATE FUNCTION asignar_lista_al_voto() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    lista_del_candidato INTEGER;
BEGIN
    IF NEW.candidato_id IS NOT NULL THEN
        SELECT lista_id INTO lista_del_candidato FROM candidatos WHERE id = NEW.candidato_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El candidato no existe.' USING ERRCODE = '23503';
        END IF;
        IF NEW.lista_id IS NULL THEN
            NEW.lista_id := lista_del_candidato;
        ELSIF NEW.lista_id <> lista_del_candidato THEN
            RAISE EXCEPTION 'El candidato no pertenece a la lista del voto.' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER votos_asignar_lista
BEFORE INSERT OR UPDATE ON votos
FOR EACH ROW EXECUTE FUNCTION asignar_lista_al_voto();

-- La misma sentencia marca el padrón y registra una lista completa, sin enlazar
-- la identidad del estudiante con la fila del voto. Un fallo revierte ambos pasos.
CREATE FUNCTION registrar_voto(p_estudiante_id INTEGER, p_lista_id INTEGER) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE estudiantes SET ya_voto = TRUE
    WHERE id = p_estudiante_id AND ya_voto = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El estudiante no está habilitado o ya emitió su voto.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO votos (lista_id) VALUES (p_lista_id);
END;
$$;

CREATE INDEX candidatos_lista_idx ON candidatos(lista_id);
CREATE INDEX votos_lista_idx ON votos(lista_id);
CREATE INDEX votos_candidato_idx ON votos(candidato_id);
CREATE INDEX votos_fecha_idx ON votos(fecha);
