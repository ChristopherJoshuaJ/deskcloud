package pe.edu.utp.deskcloud.ui

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import pe.edu.utp.deskcloud.adapter.ArchivoAdapter
import pe.edu.utp.deskcloud.data.ArchivoCache
import pe.edu.utp.deskcloud.data.PrefsHelper
import pe.edu.utp.deskcloud.databinding.FragmentFavoritosBinding
import pe.edu.utp.deskcloud.network.PhotoDto
import pe.edu.utp.deskcloud.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

/**
 * Muestra los IDs marcados como favoritos en SharedPreferences.
 */
class FavoritosFragment : Fragment() {

    private var _binding: FragmentFavoritosBinding? = null
    private val binding get() = _binding!!
    private lateinit var prefs: PrefsHelper
    private lateinit var adapter: ArchivoAdapter
    private var llamada: Call<List<PhotoDto>>? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFavoritosBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PrefsHelper(requireContext())
        adapter = ArchivoAdapter(
            prefs = prefs,
            onClick = { abrirDetalle(it) },
            onFavoritoChanged = { _, _ -> refrescar() },
        )
        binding.rvFavoritos.layoutManager = LinearLayoutManager(requireContext())
        binding.rvFavoritos.adapter = adapter

        if (ArchivoCache.archivos.isEmpty()) {
            cargarYRefrescar()
        } else {
            refrescar()
        }
    }

    override fun onResume() {
        super.onResume()
        refrescar()
    }

    private fun cargarYRefrescar() {
        llamada = RetrofitClient.api.listarFotos(20)
        llamada?.enqueue(object : Callback<List<PhotoDto>> {
            override fun onResponse(call: Call<List<PhotoDto>>, response: Response<List<PhotoDto>>) {
                if (!isAdded) return
                ArchivoCache.archivos = response.body().orEmpty()
                refrescar()
            }

            override fun onFailure(call: Call<List<PhotoDto>>, t: Throwable) {
                if (!isAdded || call.isCanceled) return
                refrescar()
            }
        })
    }

    private fun refrescar() {
        val ids = prefs.obtenerFavoritos()
        val lista = ArchivoCache.archivos.filter { ids.contains(it.id) }
        adapter.enviar(lista)
        binding.tvVacioFavoritos.visibility = if (lista.isEmpty()) View.VISIBLE else View.GONE
        binding.rvFavoritos.visibility = if (lista.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun abrirDetalle(archivo: PhotoDto) {
        startActivity(
            Intent(requireContext(), DetalleArchivoActivity::class.java).apply {
                putExtra(DetalleArchivoActivity.EXTRA_ID, archivo.id)
                putExtra(DetalleArchivoActivity.EXTRA_TITULO, archivo.title)
                putExtra(DetalleArchivoActivity.EXTRA_ALBUM, archivo.albumId)
                putExtra(DetalleArchivoActivity.EXTRA_URL, archivo.url)
                putExtra(DetalleArchivoActivity.EXTRA_THUMB, archivo.thumbnailUrl)
            },
        )
    }

    override fun onDestroyView() {
        llamada?.cancel()
        _binding = null
        super.onDestroyView()
    }
}
