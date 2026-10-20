const MAXIMO_CLAVES = 10_000;

// Cuenta intentos fallidos por clave dentro de una ventana de tiempo. Vive en memoria:
// al reiniciar el servidor el conteo empieza de nuevo, lo cual basta para frenar ataques de fuerza bruta.
export function crearLimiteIntentos({ maximo, ventanaMs, ahora = Date.now }) {
  const fallos = new Map();

  function vigente(clave) {
    const registro = fallos.get(clave);
    if (registro && ahora() - registro.desde >= ventanaMs) {
      fallos.delete(clave);
      return null;
    }
    return registro ?? null;
  }

  function purgar() {
    for (const clave of fallos.keys()) vigente(clave);
  }

  return {
    // Segundos que faltan para poder volver a intentar; 0 si no está bloqueado.
    espera(clave) {
      const registro = vigente(clave);
      if (!registro || registro.cantidad < maximo) return 0;
      return Math.ceil((registro.desde + ventanaMs - ahora()) / 1000);
    },
    fallo(clave) {
      if (fallos.size >= MAXIMO_CLAVES) purgar();
      const registro = vigente(clave) ?? { cantidad: 0, desde: ahora() };
      registro.cantidad += 1;
      fallos.set(clave, registro);
    },
    limpiar(clave) {
      fallos.delete(clave);
    },
  };
}
