package pe.edu.utp.deskcloud.data

import pe.edu.utp.deskcloud.network.PhotoDto

/**
 * Caché en memoria de la última lista cargada desde la API,
 * para que Favoritos pueda mostrar los mismos elementos sin otra petición.
 */
object ArchivoCache {
    var archivos: List<PhotoDto> = emptyList()
}
