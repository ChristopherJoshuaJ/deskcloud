-- Restaurar una versión antigua crea una versión nueva con el mismo contenido;
-- restaurada_de guarda el número de la versión original para mostrarlo en el historial.
-- Es un número y no una referencia porque la versión original puede eliminarse después.
ALTER TABLE versiones ADD COLUMN restaurada_de INTEGER;
