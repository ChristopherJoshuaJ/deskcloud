package pe.edu.utp.deskcloud.data

import android.content.Context
import android.content.SharedPreferences
import androidx.appcompat.app.AppCompatDelegate

/**
 * Persistencia local simple (equivalente de AsyncStorage en React Native).
 * Guarda favoritos, preferencia de tema y el último término buscado.
 */
class PrefsHelper(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun esTemaOscuro(): Boolean = prefs.getBoolean(KEY_TEMA_OSCURO, true)

    fun setTemaOscuro(oscuro: Boolean) {
        prefs.edit().putBoolean(KEY_TEMA_OSCURO, oscuro).apply()
    }

    fun aplicarTemaGuardado() {
        val modo = if (esTemaOscuro()) {
            AppCompatDelegate.MODE_NIGHT_YES
        } else {
            AppCompatDelegate.MODE_NIGHT_NO
        }
        AppCompatDelegate.setDefaultNightMode(modo)
    }

    fun obtenerFavoritos(): MutableSet<Int> {
        val raw = prefs.getStringSet(KEY_FAVORITOS, emptySet()) ?: emptySet()
        return raw.mapNotNull { it.toIntOrNull() }.toMutableSet()
    }

    fun esFavorito(id: Int): Boolean = obtenerFavoritos().contains(id)

    fun setFavorito(id: Int, marcado: Boolean) {
        val actual = obtenerFavoritos()
        if (marcado) actual.add(id) else actual.remove(id)
        prefs.edit().putStringSet(KEY_FAVORITOS, actual.map { it.toString() }.toSet()).apply()
    }

    fun obtenerUltimaBusqueda(): String = prefs.getString(KEY_ULTIMA_BUSQUEDA, "") ?: ""

    fun setUltimaBusqueda(termino: String) {
        prefs.edit().putString(KEY_ULTIMA_BUSQUEDA, termino).apply()
    }

    fun haySesion(): Boolean = prefs.getBoolean(KEY_SESION, false)

    fun setSesion(activa: Boolean) {
        prefs.edit().putBoolean(KEY_SESION, activa).apply()
    }

    companion object {
        private const val PREFS_NAME = "deskcloud_prefs"
        private const val KEY_TEMA_OSCURO = "tema_oscuro"
        private const val KEY_FAVORITOS = "favoritos"
        private const val KEY_ULTIMA_BUSQUEDA = "ultimo_busqueda"
        private const val KEY_SESION = "sesion_activa"
    }
}
