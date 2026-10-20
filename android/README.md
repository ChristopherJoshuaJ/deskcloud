# DeskCloud (Android) — APF2

Aplicación nativa Android de **DeskCloud** para el curso de móviles (Avance de Proyecto Final 2).  
Incluye la navegación del APF1 y la gestión de datos del APF2.

- **Package name:** `pe.edu.utp.deskcloud`
- **Lenguaje:** Kotlin + Views (XML)
- **IDE:** Android Studio

## API pública consumida

| Campo | Detalle |
|---|---|
| API | [JSONPlaceholder](https://jsonplaceholder.typicode.com) |
| Endpoint | `GET https://jsonplaceholder.typicode.com/photos?_limit=20` |
| Uso en la app | Cada foto se muestra como un “archivo” en **Mi espacio** (título, miniatura, álbum) |

Cliente HTTP: **Retrofit + OkHttp** (`network/RetrofitClient.kt`, `network/DeskCloudApi.kt`).

## Qué se guarda con SharedPreferences

Clase: [`data/PrefsHelper.kt`](app/src/main/java/pe/edu/utp/deskcloud/data/PrefsHelper.kt)

| Clave | Contenido |
|---|---|
| `favoritos` | IDs de archivos marcados con la estrella |
| `tema_oscuro` | Preferencia de tema claro/oscuro |
| `ultimo_busqueda` | Último texto escrito en el buscador de Mi espacio |
| `sesion_activa` | Si el usuario ya pasó por el login (demo local) |

## Tabla de equivalencias (React Native → Android nativo)

| Concepto (sílabo RN) | Implementación nativa en este proyecto |
|---|---|
| `useState` / `useEffect` | Variables de instancia en `MiEspacioFragment` (`todos`, `filtro`) + `TextWatcher` / callbacks Retrofit en `onViewCreated`; refresco con `notifyDataSetChanged()` y `visibility` de paneles. Lifecycle: `onCreate`, `onViewCreated`, `onResume`. |
| `fetch` / `axios` | `RetrofitClient` + `DeskCloudApi.listarFotos()` (Retrofit/OkHttp) |
| `AsyncStorage` | `PrefsHelper` con `SharedPreferences` |
| Tema claro/oscuro | `Theme.DeskCloud.DayNight` + `AppCompatDelegate` en `DeskCloudApp` y `CuentaFragment` |

## Estructura

```
android/
├── app/src/main/
│   ├── java/pe/edu/utp/deskcloud/
│   │   ├── ui/          LoginActivity, MainActivity, fragments, DetalleArchivoActivity
│   │   ├── data/        PrefsHelper, ArchivoCache
│   │   ├── network/     RetrofitClient, DeskCloudApi, PhotoDto
│   │   └── adapter/     ArchivoAdapter
│   ├── res/layout/
│   └── AndroidManifest.xml   (permiso INTERNET)
└── README.md
```

## Cómo abrir y ejecutar

1. Abre la carpeta `android/` en **Android Studio** (File → Open).
2. Espera a que Gradle sincronice.
3. Ejecuta en un emulador o dispositivo (Run ▶).

Si compilas por consola (con Android SDK instalado):

```bat
cd android
gradlew.bat assembleDebug
```

El APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

### Login de demo

Cualquier correo válido y una contraseña de **al menos 6 caracteres** (no hay backend de auth; es solo navegación local del APF1).

## Requisitos del APF2 cubiertos

- Navegación APF1: `LoginActivity` → `MainActivity` con `BottomNavigationView` (Mi espacio, Favoritos, Cuenta) e Intents a `DetalleArchivoActivity`.
- Lista desde API pública en `RecyclerView` (≥ 10 elementos).
- Estados visibles: ProgressBar (cargando), lista (éxito), mensaje + Reintentar (error).
- Estado dinámico: buscador/filtro en vivo y validación del login sin recrear la Activity.
- Persistencia: favoritos, tema y última búsqueda en SharedPreferences.
- Tema claro/oscuro persistido entre sesiones.

## Capturas sugeridas para la entrega

1. **Lista cargada** — Mi espacio con datos reales de la API.
2. **Estado de carga** — ProgressBar al abrir o al tirar para refrescar (puedes poner un breakpoint o limitar la red en el emulador).
3. **Estado de error** — Apaga el internet del emulador y pulsa Reintentar / refrescar.
4. **Estado dinámico** — Escribe en el buscador y/o marca un favorito; muestra también Favoritos o el switch de tema en Cuenta.

## Sustentación (preguntas del PDF)

1. En React Native, `fetch` + `useState` actualizan la UI al cambiar el estado; en Android hay que enlazar la respuesta de Retrofit con el `Adapter` y los paneles a mano, por eso hay más líneas.
2. `SharedPreferences` guarda tipos primitivos y `StringSet`; `AsyncStorage` guarda strings (suele serializar JSON). Aquí los favoritos van como conjunto de IDs en texto.
