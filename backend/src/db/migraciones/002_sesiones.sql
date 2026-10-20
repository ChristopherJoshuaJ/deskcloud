-- Sesiones de inicio de sesión. expira_en está en milisegundos desde 1970.
CREATE TABLE sesiones (
  id         TEXT PRIMARY KEY,
  datos      TEXT NOT NULL,
  expira_en  INTEGER NOT NULL
);

CREATE INDEX ix_sesiones_expira_en ON sesiones (expira_en);

CREATE TABLE ajustes (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);
