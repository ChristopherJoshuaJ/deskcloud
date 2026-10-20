CREATE TABLE usuarios (
  id               INTEGER PRIMARY KEY,
  nombre           TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  correo           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  hash_contrasena  TEXT NOT NULL,
  creado_en        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Carpetas y archivos del espacio de cada usuario.
-- La raíz (es_raiz = 1) es el "ROOT" interno; la interfaz la muestra como "Mi espacio".
-- Un elemento enviado a la papelera queda con padre_id NULL y recuerda su carpeta en padre_original_id;
-- su contenido conserva padre_id y viaja con él.
CREATE TABLE nodos (
  id                 INTEGER PRIMARY KEY,
  propietario_id     INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  padre_id           INTEGER REFERENCES nodos (id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL CHECK (tipo IN ('CARPETA', 'ARCHIVO')),
  nombre             TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  es_raiz            INTEGER NOT NULL DEFAULT 0 CHECK (es_raiz IN (0, 1)),
  version_actual_id  INTEGER REFERENCES versiones (id) ON DELETE SET NULL,
  en_papelera        INTEGER NOT NULL DEFAULT 0 CHECK (en_papelera IN (0, 1)),
  padre_original_id  INTEGER REFERENCES nodos (id) ON DELETE SET NULL,
  eliminado_en       TEXT,
  creado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  modificado_en      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (es_raiz = 1 AND tipo = 'CARPETA' AND padre_id IS NULL AND en_papelera = 0)
    OR (es_raiz = 0 AND (padre_id IS NOT NULL OR en_papelera = 1))
  ),
  CHECK (tipo = 'ARCHIVO' OR version_actual_id IS NULL),
  CHECK ((en_papelera = 1) = (eliminado_en IS NOT NULL))
);

CREATE UNIQUE INDEX ux_nodos_raiz ON nodos (propietario_id) WHERE es_raiz = 1;
CREATE UNIQUE INDEX ux_nodos_nombre_hermanos ON nodos (padre_id, nombre COLLATE NOCASE) WHERE padre_id IS NOT NULL;
CREATE INDEX ix_nodos_papelera ON nodos (propietario_id) WHERE en_papelera = 1;

-- Cada subida o edición de un archivo crea una versión.
-- Mientras se reciben los fragmentos la versión está PENDIENTE y no tiene número.
CREATE TABLE versiones (
  id                INTEGER PRIMARY KEY,
  nodo_id           INTEGER NOT NULL REFERENCES nodos (id) ON DELETE CASCADE,
  numero            INTEGER,
  estado            TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'COMPLETA')),
  tamano            INTEGER NOT NULL DEFAULT 0 CHECK (tamano >= 0),
  tamano_fragmento  INTEGER NOT NULL CHECK (tamano_fragmento > 0),
  total_fragmentos  INTEGER NOT NULL DEFAULT 0 CHECK (total_fragmentos >= 0),
  mime              TEXT,
  sha256            TEXT,
  creado_por        INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (estado = 'PENDIENTE' OR (numero IS NOT NULL AND sha256 IS NOT NULL))
);

CREATE UNIQUE INDEX ux_versiones_numero ON versiones (nodo_id, numero) WHERE numero IS NOT NULL;

-- Contenido binario de cada versión dividido en bloques consecutivos.
CREATE TABLE fragmentos (
  version_id  INTEGER NOT NULL REFERENCES versiones (id) ON DELETE CASCADE,
  indice      INTEGER NOT NULL CHECK (indice >= 0),
  datos       BLOB NOT NULL,
  PRIMARY KEY (version_id, indice)
);

CREATE TABLE favoritos (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nodo_id     INTEGER NOT NULL REFERENCES nodos (id) ON DELETE CASCADE,
  orden       INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (usuario_id, nodo_id)
);

CREATE TABLE compartidos (
  id               INTEGER PRIMARY KEY,
  nodo_id          INTEGER NOT NULL REFERENCES nodos (id) ON DELETE CASCADE,
  propietario_id   INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  destinatario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  permiso          TEXT NOT NULL CHECK (permiso IN ('VER', 'EDITAR')),
  creado_en        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (nodo_id, destinatario_id),
  CHECK (propietario_id <> destinatario_id)
);

CREATE INDEX ix_compartidos_destinatario ON compartidos (destinatario_id);

-- Partes de una carpeta compartida que el destinatario no debe ver.
CREATE TABLE exclusiones (
  compartido_id  INTEGER NOT NULL REFERENCES compartidos (id) ON DELETE CASCADE,
  nodo_id        INTEGER NOT NULL REFERENCES nodos (id) ON DELETE CASCADE,
  PRIMARY KEY (compartido_id, nodo_id)
);
