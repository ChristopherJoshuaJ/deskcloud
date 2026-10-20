import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearFavoritosRepository } from '../repositories/favoritosRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';

export const CARPETAS_SUGERIDAS = ['Documentos', 'Imágenes', 'Audio', 'Videos'];

// Mi espacio: el espacio personal de cada usuario.
export function crearEspacioService(db) {
  const espacios = crearEspaciosRepository(db);
  const nodos = crearNodosRepository(db);
  const favoritos = crearFavoritosRepository(db);

  return {
    // Debe ejecutarse dentro de la misma transacción que crea al usuario.
    crearEspacio(usuarioId) {
      const espacioId = espacios.crearPersonal(usuarioId);
      const raizId = nodos.crear({ espacioId, tipo: 'CARPETA', nombre: 'ROOT', esRaiz: true, creadoPor: usuarioId });
      CARPETAS_SUGERIDAS.forEach((nombre, orden) => {
        const carpetaId = nodos.crear({ espacioId, padreId: raizId, tipo: 'CARPETA', nombre, creadoPor: usuarioId });
        favoritos.agregar(usuarioId, carpetaId, orden);
      });
      return raizId;
    },
    obtenerPersonal(usuarioId) {
      return espacios.personalDe(usuarioId);
    },
  };
}
