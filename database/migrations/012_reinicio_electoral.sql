-- No se atribuye retrospectivamente un origen que no fue registrado.
ALTER TABLE estudiantes ADD COLUMN origen_registro TEXT NOT NULL DEFAULT 'desconocido'
    CHECK (origen_registro IN ('desconocido', 'manual', 'excel'));
ALTER TABLE auditoria_borrado_datos DROP CONSTRAINT auditoria_borrado_datos_operacion_check;
ALTER TABLE auditoria_borrado_datos ADD CONSTRAINT auditoria_borrado_datos_operacion_check CHECK (operacion IN (
    'solo_votos', 'candidatos_listas', 'estudiantes', 'reinicio_pruebas',
    'solo_candidatos', 'solo_listas', 'estudiantes_importados'
));
