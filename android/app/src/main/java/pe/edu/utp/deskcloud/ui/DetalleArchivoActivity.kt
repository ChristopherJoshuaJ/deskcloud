package pe.edu.utp.deskcloud.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import coil.load
import pe.edu.utp.deskcloud.R
import pe.edu.utp.deskcloud.data.PrefsHelper
import pe.edu.utp.deskcloud.databinding.ActivityDetalleBinding

class DetalleArchivoActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDetalleBinding
    private lateinit var prefs: PrefsHelper
    private var archivoId: Int = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDetalleBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = PrefsHelper(this)

        binding.toolbar.setNavigationOnClickListener { finish() }

        archivoId = intent.getIntExtra(EXTRA_ID, -1)
        val titulo = intent.getStringExtra(EXTRA_TITULO).orEmpty()
        val album = intent.getIntExtra(EXTRA_ALBUM, 0)
        val url = intent.getStringExtra(EXTRA_URL).orEmpty()
        val thumb = intent.getStringExtra(EXTRA_THUMB).orEmpty()

        binding.tvDetalleNombre.text = titulo.replaceFirstChar { it.uppercase() }
        binding.tvDetalleAlbum.text = getString(R.string.album, album)
        binding.tvDetalleUrl.text = url
        binding.ivDetalle.load(url.ifBlank { thumb }) {
            crossfade(true)
            placeholder(R.drawable.ic_folder)
            error(R.drawable.ic_folder)
        }

        actualizarBotonFavorito()
        binding.btnToggleFavorito.setOnClickListener {
            val nuevo = !prefs.esFavorito(archivoId)
            prefs.setFavorito(archivoId, nuevo)
            actualizarBotonFavorito()
        }
    }

    private fun actualizarBotonFavorito() {
        val fav = prefs.esFavorito(archivoId)
        binding.btnToggleFavorito.text =
            if (fav) "Quitar de favoritos" else getString(R.string.marcar_favorito)
    }

    companion object {
        const val EXTRA_ID = "id"
        const val EXTRA_TITULO = "titulo"
        const val EXTRA_ALBUM = "album"
        const val EXTRA_URL = "url"
        const val EXTRA_THUMB = "thumb"
    }
}
