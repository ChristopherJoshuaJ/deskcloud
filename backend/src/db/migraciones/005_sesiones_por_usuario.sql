-- Cada sesión queda ligada a su usuario para listarlas, cerrar las demás y borrarlas junto con la cuenta.
-- ultimo_uso está en milisegundos desde 1970, igual que expira_en.
ALTER TABLE sesiones ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE sesiones ADD COLUMN ultimo_uso INTEGER;

UPDATE sesiones
SET usuario_id = json_extract(datos, '$.usuarioId')
WHERE json_extract(datos, '$.usuarioId') IN (SELECT id FROM usuarios);

DELETE FROM sesiones WHERE usuario_id IS NULL;

CREATE INDEX ix_sesiones_usuario ON sesiones (usuario_id);
