-- Los elementos dejan de pertenecer a un usuario y pasan a pertenecer a un espacio:
-- el espacio personal de cada usuario ("Mi espacio") o un espacio compartido entre varios miembros.
-- Compartir elementos sueltos con permisos y exclusiones se reemplaza por los espacios compartidos.
DROP TABLE exclusiones;
DROP TABLE compartidos;

-- Un espacio personal tiene propietario; uno compartido no pertenece a nadie y su
-- administrador (quien lo creó) es el único que invita y saca miembros.
-- El nombre de un espacio compartido es el nombre de su carpeta raíz.
CREATE TABLE espacios (
  id                INTEGER PRIMARY KEY,
  tipo              TEXT NOT NULL CHECK (tipo IN ('PERSONAL', 'COMPARTIDO')),
  propietario_id    INTEGER REFERENCES usuarios (id) ON DELETE CASCADE,
  administrador_id  INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (tipo = 'PERSONAL' AND propietario_id IS NOT NULL AND administrador_id IS NULL)
    OR (tipo = 'COMPARTIDO' AND propietario_id IS NULL)
  )
);

CREATE UNIQUE INDEX ux_espacios_personal ON espacios (propietario_id) WHERE tipo = 'PERSONAL';

INSERT INTO espacios (tipo, propietario_id) SELECT 'PERSONAL', id FROM usuarios;

CREATE TABLE miembros (
  espacio_id  INTEGER NOT NULL REFERENCES espacios (id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  unido_en    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (espacio_id, usuario_id)
);

CREATE INDEX ix_miembros_usuario ON miembros (usuario_id);

CREATE TABLE invitaciones (
  id             INTEGER PRIMARY KEY,
  espacio_id     INTEGER NOT NULL REFERENCES espacios (id) ON DELETE CASCADE,
  invitado_id    INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  invitado_por   INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (espacio_id, invitado_id)
);

CREATE INDEX ix_invitaciones_invitado ON invitaciones (invitado_id);

-- color: en Mi espacio es el color del elemento; en un espacio compartido es el color del grupo.
-- nota_color: la nota obligatoria del último "cambiar el color para todos".
CREATE TABLE nodos_nueva (
  id                 INTEGER PRIMARY KEY,
  espacio_id         INTEGER NOT NULL REFERENCES espacios (id) ON DELETE CASCADE,
  padre_id           INTEGER REFERENCES nodos (id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL CHECK (tipo IN ('CARPETA', 'ARCHIVO')),
  nombre             TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  es_raiz            INTEGER NOT NULL DEFAULT 0 CHECK (es_raiz IN (0, 1)),
  version_actual_id  INTEGER REFERENCES versiones (id) ON DELETE SET NULL,
  en_papelera        INTEGER NOT NULL DEFAULT 0 CHECK (en_papelera IN (0, 1)),
  padre_original_id  INTEGER REFERENCES nodos (id) ON DELETE SET NULL,
  eliminado_en       TEXT,
  color              TEXT CHECK (color IS NULL OR color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  nota_color         TEXT,
  nota_color_por     INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  nota_color_en      TEXT,
  creado_por         INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  modificado_en      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (es_raiz = 1 AND tipo = 'CARPETA' AND padre_id IS NULL AND en_papelera = 0)
    OR (es_raiz = 0 AND (padre_id IS NOT NULL OR en_papelera = 1))
  ),
  CHECK (tipo = 'ARCHIVO' OR version_actual_id IS NULL),
  CHECK ((en_papelera = 1) = (eliminado_en IS NOT NULL))
);

INSERT INTO nodos_nueva (
  id, espacio_id, padre_id, tipo, nombre, es_raiz, version_actual_id,
  en_papelera, padre_original_id, eliminado_en, creado_por, creado_en, modificado_en
)
SELECT n.id, e.id, n.padre_id, n.tipo, n.nombre, n.es_raiz, n.version_actual_id,
       n.en_papelera, n.padre_original_id, n.eliminado_en, n.propietario_id, n.creado_en, n.modificado_en
FROM nodos n
JOIN espacios e ON e.propietario_id = n.propietario_id AND e.tipo = 'PERSONAL';

DROP TABLE nodos;
ALTER TABLE nodos_nueva RENAME TO nodos;

CREATE UNIQUE INDEX ux_nodos_raiz ON nodos (espacio_id) WHERE es_raiz = 1;
CREATE UNIQUE INDEX ux_nodos_nombre_hermanos ON nodos (padre_id, nombre COLLATE NOCASE) WHERE padre_id IS NOT NULL;
CREATE INDEX ix_nodos_papelera ON nodos (espacio_id) WHERE en_papelera = 1;

-- Color que un miembro eligió solo para sí en un espacio compartido.
CREATE TABLE colores_personales (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nodo_id     INTEGER NOT NULL REFERENCES nodos (id) ON DELETE CASCADE,
  color       TEXT NOT NULL CHECK (color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  PRIMARY KEY (usuario_id, nodo_id)
);

CREATE INDEX ix_colores_personales_nodo ON colores_personales (nodo_id);

-- Elementos que otro miembro cambió y que el usuario todavía no ha visto (el punto en la esquina).
-- Las carpetas que los contienen muestran el punto porque se recorre la cadena de ancestros.
CREATE TABLE sin_ver (
  usuario_id   INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nodo_id      INTEGER NOT NULL REFERENCES nodos (id) ON DELETE CASCADE,
  cambiado_en  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (usuario_id, nodo_id)
);

CREATE INDEX ix_sin_ver_nodo ON sin_ver (nodo_id);

-- Votaciones de un espacio compartido. Votan los miembros que había al proponer;
-- quien propone ya cuenta como sí. Se aprueba cuando todos votaron sí y vence en 7 días.
CREATE TABLE propuestas (
  id                 INTEGER PRIMARY KEY,
  espacio_id         INTEGER NOT NULL REFERENCES espacios (id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL CHECK (tipo IN ('ELIMINAR', 'RESTAURAR', 'ELIMINAR_DEFINITIVO')),
  propuesto_por      INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  motivo             TEXT,
  estado             TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'APROBADA', 'VENCIDA', 'RETIRADA', 'ANULADA')),
  creada_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_en          TEXT NOT NULL,
  cerrada_en         TEXT,
  aviso_vencimiento  INTEGER NOT NULL DEFAULT 0 CHECK (aviso_vencimiento IN (0, 1)),
  CHECK ((estado = 'ABIERTA') = (cerrada_en IS NULL))
);

CREATE INDEX ix_propuestas_abiertas ON propuestas (espacio_id) WHERE estado = 'ABIERTA';

-- El nombre se guarda para que el historial siga legible aunque el elemento se elimine.
CREATE TABLE propuesta_nodos (
  id            INTEGER PRIMARY KEY,
  propuesta_id  INTEGER NOT NULL REFERENCES propuestas (id) ON DELETE CASCADE,
  nodo_id       INTEGER REFERENCES nodos (id) ON DELETE SET NULL,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('CARPETA', 'ARCHIVO'))
);

CREATE INDEX ix_propuesta_nodos_propuesta ON propuesta_nodos (propuesta_id);
CREATE INDEX ix_propuesta_nodos_nodo ON propuesta_nodos (nodo_id);

-- voto NULL = todavía no votó.
CREATE TABLE votos (
  propuesta_id  INTEGER NOT NULL REFERENCES propuestas (id) ON DELETE CASCADE,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  voto          TEXT CHECK (voto IN ('SI', 'NO')),
  votado_en     TEXT,
  PRIMARY KEY (propuesta_id, usuario_id)
);

CREATE INDEX ix_votos_usuario ON votos (usuario_id);

-- Historial de lo que pasa en un espacio compartido. detalles es JSON.
CREATE TABLE actividad (
  id          INTEGER PRIMARY KEY,
  espacio_id  INTEGER NOT NULL REFERENCES espacios (id) ON DELETE CASCADE,
  usuario_id  INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  accion      TEXT NOT NULL,
  nodo_id     INTEGER REFERENCES nodos (id) ON DELETE SET NULL,
  nombre      TEXT,
  detalles    TEXT NOT NULL DEFAULT '{}',
  creado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_actividad_espacio ON actividad (espacio_id, id);
CREATE INDEX ix_actividad_nodo ON actividad (nodo_id);

-- Avisos dentro de la app. datos es JSON con lo necesario para mostrar el aviso.
CREATE TABLE avisos (
  id          INTEGER PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  espacio_id  INTEGER REFERENCES espacios (id) ON DELETE CASCADE,
  datos       TEXT NOT NULL DEFAULT '{}',
  leido       INTEGER NOT NULL DEFAULT 0 CHECK (leido IN (0, 1)),
  creado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_avisos_usuario ON avisos (usuario_id, id);
CREATE INDEX ix_avisos_espacio ON avisos (espacio_id);
