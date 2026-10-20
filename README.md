# DeskCloud

Almacenamiento en la nube con una interfaz tipo explorador de archivos. Proyecto universitario.

Solo requiere [Node.js](https://nodejs.org/) 24 o superior.

## Puesta en marcha

```bash
cd frontend
npm install
npm run build       # genera frontend/dist/deskcloud/browser
cd ../backend
npm install
npm run db:migrar
npm start           # http://localhost:3000
```

## Frontend

Angular 21 con PrimeNG 21, PrimeIcons 7 y Angular CDK, todos con licencia MIT. La interfaz imita el Explorador de Windows 11: barra de dirección con historial y búsqueda, barra de comandos, árbol lateral con accesos rápidos y espacios compartidos, vista de lista o cuadrícula, panel de detalles y barra de estado.

Para desarrollar con recarga automática se usan dos terminales:

```bash
cd backend && npm start          # API en http://localhost:3000
cd frontend && npm start         # http://localhost:4200, reenvía /api al backend
```

| Atajo | Acción |
|---|---|
| `Alt+←` / `Alt+→` / `Alt+↑` / `Retroceso` | Atrás, adelante, subir un nivel |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copiar, cortar, pegar |
| `Ctrl+A` / `Esc` | Seleccionar todo, quitar la selección |
| `Ctrl+Shift+N` | Nueva carpeta |
| `F2` / `Supr` / `Enter` | Cambiar nombre, eliminar, abrir |
| `Ctrl+F` o `F3` / `F5` | Buscar, actualizar |
| Flechas, `Inicio`, `Fin` (con `Mayús` para extender) | Moverse por los elementos |

Se puede arrastrar elementos a carpetas, al árbol, a la ruta o a la Papelera, y soltar archivos o carpetas del equipo para subirlos. En los espacios compartidos, eliminar y restaurar se convierten en propuestas que se votan; los avisos se consultan cada 30 segundos mientras la pestaña está visible.

## Backend

```bash
cd backend
npm install
npm run db:migrar   # crea o actualiza backend/data/deskcloud.db
npm start           # http://localhost:3000/api/salud
npm test
```

Los archivos se guardan dentro de la base SQLite divididos en fragmentos (1 MB por defecto).

Si existe el frontend compilado (`frontend/dist/deskcloud/browser`), el mismo servidor lo sirve en `http://localhost:3000`: cualquier ruta que no sea de `/api` devuelve `index.html`.

Mientras el servidor está encendido, cada 10 minutos cierra las votaciones vencidas, avisa las que vencen en menos de un día y borra lo que lleva más de 30 días en la papelera de Mi espacio.

### Seguridad

- Contraseñas con scrypt; la sesión cambia de identificador al iniciar sesión.
- Tras 5 intentos fallidos para una cuenta, o 20 desde la misma IP, el login responde `429 DEMASIADOS_INTENTOS` durante 15 minutos (con `Retry-After`).
- Las peticiones que modifican datos (`POST`, `PUT`, `PATCH`, `DELETE`) solo se aceptan desde el propio sitio o desde `ORIGENES_PERMITIDOS`; si no, responden `403 ORIGEN_NO_PERMITIDO`.
- Un elemento de otra persona o de un espacio ajeno responde `404`, como si no existiera.
- Las vistas previas se sirven con `Content-Security-Policy` en modo sandbox y los textos como texto plano.

### Autenticación

La sesión viaja en una cookie `HttpOnly` llamada `deskcloud.sid` y se guarda en la base de datos.

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/auth/registro` | `{ nombre, correo, contrasena }` | `201 { usuario }` y sesión abierta |
| `POST /api/auth/login` | `{ correo, contrasena }` | `200 { usuario }` y sesión abierta |
| `POST /api/auth/logout` | | `204` |
| `GET /api/auth/me` | | `200 { usuario }` o `401` |

`usuario` tiene `id`, `nombre`, `correo`, `espacioId` y `raizId` (su espacio personal y la carpeta raíz) y `creadoEn`. Al registrarse se crean las carpetas Documentos, Imágenes, Audio y Videos, fijadas como accesos rápidos.

Los errores responden `{ codigo, mensaje, detalles? }`.

### Cuenta

| Método y ruta | Uso |
|---|---|
| `PATCH /api/cuenta` | `{ nombre }` cambia el nombre; responde `{ usuario }` |
| `PUT /api/cuenta/contrasena` | `{ actual, nueva }`; cierra las demás sesiones y responde `{ sesionesCerradas }` |
| `DELETE /api/cuenta` | `{ contrasena }`; borra Mi espacio y sale de todos los espacios compartidos (`204`) |
| `GET /api/cuenta/sesiones` | Sesiones abiertas con `navegador`, `creadaEn`, `ultimoUso` y `actual` |
| `DELETE /api/cuenta/sesiones/:id` | Cierra otra sesión |
| `POST /api/cuenta/sesiones/cerrar-otras` | Cierra todas menos la actual |
| `GET /api/cuenta/espacio-usado` | Bytes usados en Mi espacio y en cada espacio compartido: `total`, `archivos`, `versionesAnteriores`, `papelera` y `cantidadArchivos`. Es solo informativo: no hay cuotas |

Una contraseña incorrecta responde `400` con el campo en `detalles`, para no confundirse con una sesión vencida.

### Explorador

Todas requieren sesión. `:id` es el identificador de una carpeta o archivo; la raíz del usuario es `usuario.raizId` y se muestra como "Mi espacio". Las mismas rutas sirven dentro de un espacio compartido usando su `raizId`.

| Método y ruta | Uso |
|---|---|
| `GET /api/nodos/:id/contenido` | `{ carpeta, ruta, elementos }`, carpetas primero |
| `GET /api/nodos/:id/subcarpetas` | Hijos para el árbol, con `tieneSubcarpetas` |
| `GET /api/nodos/:id` | `{ elemento, ruta, resumen }` (resumen solo en carpetas) |
| `GET /api/nodos/:id/buscar?q=` | Búsqueda por nombre en la carpeta y sus subcarpetas |
| `GET /api/nodos/:id/descarga` | Descarga del archivo (admite `Range`) |
| `GET /api/nodos/:id/zip` | Descarga la carpeta completa como ZIP (sin compresión, hasta 4 GB) |
| `GET /api/nodos/:id/vista` | Contenido para mostrar en el navegador (admite `Range`); `415` si el formato no tiene vista |
| `POST /api/nodos/:id/carpetas` | `{ nombre }` crea una carpeta; `{ ruta: "A/B/C" }` crea las que falten |
| `PATCH /api/nodos/:id` | `{ nombre }` renombra |
| `POST /api/nodos/mover` | `{ ids, destinoId, conflicto? }` |
| `POST /api/nodos/copiar` | `{ ids, destinoId, conflicto? }` (la copia solo lleva la versión actual) |
| `POST /api/nodos/papelera` | `{ ids }` envía a la papelera (en un espacio compartido responde `409 VOTACION_REQUERIDA`) |
| `PUT /api/nodos/:id/color` | `{ color, paraTodos?, nota? }` con `color` en `#rrggbb` o `null`; responde `{ elemento }` |
| `POST /api/nodos/visto` | `{ ids, incluirContenido? }` quita el punto de cambios; con `incluirContenido` también a todo lo de dentro |
| `POST /api/nodos/:id/verificar-nombres` | `{ rutas }` devuelve qué archivos ya existen, antes de subir |
| `POST /api/subidas/:carpetaId?ruta=&conflicto=` | El cuerpo son los bytes del archivo y `Content-Type` su tipo. `ruta` puede incluir carpetas (`Viaje/Día 1/foto.jpg`) |

`conflicto` decide qué pasa si el nombre ya existe en el destino:

- `preguntar` (por defecto): responde `409 NOMBRE_EN_USO` con `detalles.conflictos[]` y `nombreSugerido`, sin cambiar nada.
- `reemplazar`: al subir, guarda una versión nueva del archivo existente; al mover o copiar, envía el anterior a la papelera.
- `conservar`: usa el nombre sugerido, por ejemplo `foto (2).jpg`.
- `omitir`: deja el existente y no hace nada.

Cada elemento trae `tipoVista`: `imagen`, `pdf`, `audio`, `video`, `texto` o `null` si no tiene vista previa. Los textos (incluidos HTML y código) se sirven como texto plano para que nunca se ejecuten. `esTextoEditable` indica si el archivo se puede abrir en el editor (texto de hasta 5 MB).

También trae `espacioId`, `color` (el que ve esta persona), `colorEsPersonal`, `notaColor` (`{ texto, autor, creadaEn }` o `null`), `propuestaPendiente` (`{ id, tipo }` si se está votando su eliminación) y `sinVer` (punto de cambios). Entre espacios distintos solo se puede copiar: mover responde `400`, y la copia llega sin color.

### Versiones

| Método y ruta | Uso |
|---|---|
| `GET /api/nodos/:id/versiones` | Historial de la más reciente a la más antigua, con `autor`, `esActual` y `restauradaDe` |
| `GET /api/nodos/:id/versiones/:versionId/descarga` | Descarga esa versión como `nombre (versión N).ext` |
| `GET /api/nodos/:id/versiones/:versionId/vista` | Vista previa de esa versión |
| `POST /api/nodos/:id/versiones/:versionId/restaurar` | Crea una versión nueva con el contenido de la elegida; el historial no se pierde |
| `DELETE /api/nodos/:id/versiones/:versionId` | Elimina una versión anterior (la actual no se puede eliminar, y en los espacios compartidos ninguna) |

### Edición de texto

| Método y ruta | Uso |
|---|---|
| `GET /api/nodos/:id/texto` | `{ texto, version: { id, numero, sha256 } }` |
| `PUT /api/nodos/:id/texto` | Cuerpo en `text/plain; charset=utf-8` y cabecera `If-Match: "<sha256>"` de la versión que se abrió |

Cada guardado crea una versión. Si otra persona u otra pestaña guardó antes, responde `412 VERSION_DESACTUALIZADA` con `detalles.versionActual`; para sobrescribir de todos modos se envía `If-Match: *`. Sin `If-Match` responde `428`. Guardar el mismo texto responde `accion: "sin-cambios"` sin crear versión. Solo se editan archivos en UTF-8 (`415 NO_EDITABLE` si no) y se conserva el BOM si el archivo lo tenía. Un documento nuevo se crea subiendo un archivo vacío, por ejemplo `Nuevo documento.txt` con `conflicto=conservar`.

### Accesos rápidos

| Método y ruta | Uso |
|---|---|
| `GET /api/favoritos` | Carpetas fijadas en orden |
| `POST /api/favoritos` | `{ nodoId }` fija una carpeta al final |
| `PUT /api/favoritos/orden` | `{ ids }` con todos los accesos en el orden nuevo |
| `DELETE /api/favoritos/:nodoId` | Quita el acceso (la carpeta no se borra) |

Todas responden `{ favoritos }`. Un acceso desaparece si su carpeta va a la papelera, y no vuelve al restaurarla.

### Papelera

| Método y ruta | Uso |
|---|---|
| `GET /api/papelera` | Elementos eliminados con `eliminadoEn` y `ubicacionOriginal` (`null` si esa carpeta ya no existe) |
| `POST /api/papelera/restaurar` | `{ ids }` vuelve a la carpeta original, o a Mi espacio; si el nombre está ocupado se renombra (`a (2).txt`) |
| `POST /api/papelera/eliminar` | `{ ids }` elimina definitivamente |
| `POST /api/papelera/vaciar` | Elimina todo lo de la papelera |

Es la papelera de Mi espacio: lo que lleva 30 días en ella se borra solo, y cada elemento trae `seEliminaEn` y `diasRestantes`. Cada espacio compartido tiene su propia papelera, que nunca se vacía sola y se maneja con votaciones.

### Espacios compartidos

Un espacio compartido es un disco aparte que no pertenece a nadie. Quien lo crea es el administrador: es el único que invita y saca miembros, y la persona invitada debe aceptar. Todos los miembros pueden crear, subir, editar, renombrar y mover, pero eliminar, restaurar desde su papelera y eliminar definitivamente necesitan el voto unánime de los miembros. Si sale el administrador, el rol pasa al miembro más antiguo; si sale el último miembro (con `{ confirmar: true }`), el espacio se elimina.

| Método y ruta | Uso |
|---|---|
| `GET /api/espacios` | `{ personal, compartidos[] }` para la barra lateral; cada compartido trae `sinVer` y `votosPendientes` |
| `POST /api/espacios` | `{ nombre }` crea un espacio |
| `GET /api/espacios/:id` | `{ espacio, miembros, invitaciones }` |
| `PATCH /api/espacios/:id` | `{ nombre }` renombra (cualquier miembro) |
| `POST /api/espacios/:id/invitaciones` | `{ correo }` invita (solo el administrador) |
| `DELETE /api/espacios/:id/invitaciones/:invitacionId` | Cancela una invitación |
| `DELETE /api/espacios/:id/miembros/:usuarioId` | Saca a un miembro (solo el administrador) |
| `POST /api/espacios/:id/salir` | `{ confirmar? }`; `409 CONFIRMACION_REQUERIDA` si es el último miembro y no confirmó |
| `GET /api/espacios/:id/actividad?antesDe=&limite=` | Historial de actividad, del más reciente al más antiguo |
| `GET /api/espacios/:id/papelera` | Papelera del espacio |
| `GET /api/invitaciones` | Invitaciones recibidas |
| `POST /api/invitaciones/:id/aceptar` y `/rechazar` | Responde a una invitación |

### Votaciones

| Método y ruta | Uso |
|---|---|
| `POST /api/espacios/:id/propuestas` | `{ tipo, ids, motivo? }` con `tipo` `eliminar`, `restaurar` o `eliminar_definitivo`; `{ tipo: "eliminar_definitivo", todos: true }` propone vaciar la papelera |
| `GET /api/espacios/:id/propuestas?estado=cerradas` | Abiertas (por defecto) o el historial de cerradas |
| `GET /api/propuestas/pendientes` | Propuestas donde todavía no voté |
| `GET /api/propuestas/:id` | Detalle con `votos`, `recuento`, `miVoto` y `puedoVotar` |
| `POST /api/propuestas/:id/voto` | `{ voto: "si" \| "no" }`; un voto se puede cambiar mientras siga abierta |
| `POST /api/propuestas/:id/retirar` | Solo quien la propuso |

Quien propone ya cuenta como sí. Votan los miembros que había al proponer, y quien sale del espacio deja de contar. Cuando todos votaron sí se ejecuta (`APROBADA`); si a los 7 días no hay unanimidad vence (`VENCIDA`). Mientras se vota, el elemento sigue usable y muestra `propuestaPendiente`.

### Colores

`GET /api/colores` devuelve los colores predeterminados; también se acepta cualquier `#rrggbb`. En Mi espacio cada elemento tiene un solo color. En un espacio compartido, el primer color que alguien elige es el del grupo y los siguientes son personales (solo los ve quien los eligió; `null` lo quita y vuelve al del grupo). Con `paraTodos: true` y una `nota` obligatoria se cambia el color del grupo, se borran los personales, se avisa a los demás y la nota queda sobre el elemento.

### Punto de cambios y avisos

En los espacios compartidos, lo que hacen los demás (crear, subir, editar, renombrar, mover, restaurar versiones, color para todos, proponer eliminar) marca el elemento con `sinVer` y también todas sus carpetas hasta el espacio. Se quita al abrir la carpeta, previsualizar o descargar el archivo, o con `POST /api/nodos/visto`. Los colores personales y las acciones propias no cuentan.

| Método y ruta | Uso |
|---|---|
| `GET /api/avisos?antesDe=&limite=` | `{ avisos, noLeidos }` |
| `GET /api/avisos/resumen` | `{ noLeidos, invitaciones, votosPendientes }`, pensado para consultarlo cada cierto tiempo |
| `POST /api/avisos/leidos` | `{ ids? }`; sin `ids` marca todos |

### Variables de entorno opcionales

| Variable | Por defecto |
|---|---|
| `PUERTO` | `3000` |
| `RUTA_BD` | `backend/data/deskcloud.db` |
| `TAMANO_FRAGMENTO` | `1048576` (bytes) |
| `SECRETO_SESION` | se genera y se guarda en la base |
| `COOKIE_SEGURA` | `false` (usar `true` con HTTPS) |
| `DURACION_SESION_MS` | 7 días sin actividad |
| `RUTA_FRONTEND` | `frontend/dist/deskcloud/browser` |
| `ORIGENES_PERMITIDOS` | `http://localhost:4200` (servidor de desarrollo de Angular); varios separados por comas |
