ALTER TABLE auditoria_borrado_datos
    ADD COLUMN consumida_en TIMESTAMPTZ;

CREATE INDEX auditoria_borrado_datos_simulacion_vigente_idx
    ON auditoria_borrado_datos (id)
    WHERE modo = 'simulacion' AND consumida_en IS NULL;
