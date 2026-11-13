ALTER TABLE auditoria_borrado_datos
    ALTER COLUMN administrador_id DROP NOT NULL,
    ALTER COLUMN operacion DROP NOT NULL;
