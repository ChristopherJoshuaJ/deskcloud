const INTERVALO_MS = 10 * 60 * 1000;

// Tareas de mantenimiento que corren solas mientras el servidor está encendido.
// Las votaciones vencidas también se cierran al consultarlas, así que esto solo adelanta los avisos.
export function iniciarTareasPeriodicas(servicios, { intervaloMs = INTERVALO_MS } = {}) {
  function ejecutar() {
    try {
      servicios.propuestas.cerrarVencidas();
      servicios.propuestas.avisarPorVencer();
      servicios.papelera.purgarVencidos();
    } catch (error) {
      console.error('Error en las tareas periódicas:', error);
    }
  }
  ejecutar();
  const temporizador = setInterval(ejecutar, intervaloMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
