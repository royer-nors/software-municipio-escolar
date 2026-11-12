-- Las imágenes utilizan listas.logo_url y candidatos.foto_url, ya existentes.
-- No se asignan números ficticios a las listas históricas.
ALTER TABLE listas ADD COLUMN numero INTEGER CHECK (numero > 0);
CREATE UNIQUE INDEX listas_numero_unico ON listas(numero) WHERE numero IS NOT NULL;
