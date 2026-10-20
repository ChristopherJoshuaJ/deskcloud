package pe.edu.utp.deskcloud.ui

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import pe.edu.utp.deskcloud.adapter.ArchivoAdapter
import pe.edu.utp.deskcloud.data.ArchivoCache
import pe.edu.utp.deskcloud.data.PrefsHelper
import pe.edu.utp.deskcloud.databinding.FragmentMiEspacioBinding
import pe.edu.utp.deskcloud.network.PhotoDto
import pe.edu.utp.deskcloud.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

/**
 * Consume la API REST pública y muestra los datos en un RecyclerView.
 * Estados: cargando / éxito / error.
 * Filtro en vivo = estado dinámico (equivalente useState) sin recrear la Activity.
 */
class MiEspacioFragment : Fragment() {

    private var _binding: FragmentMiEspacioBinding? = null
    private val binding get() = _binding!!

    private lateinit var prefs: PrefsHelper
    private lateinit var adapter: ArchivoAdapter

    /** Estado en memoria (equivalente useState). */
    private var todos: List<PhotoDto> = emptyList()
    private var filtro: String = ""
    private var llamada: Call<List<PhotoDto>>? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentMiEspacioBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PrefsHelper(requireContext())
        filtro = prefs.obtenerUltimaBusqueda()
        binding.etBuscar.setText(filtro)

        adapter = ArchivoAdapter(
            prefs = prefs,
            onClick = { abrirDetalle(it) },
            onFavoritoChanged = { _, _ -> },
        )
        binding.rvArchivos.layoutManager = LinearLayoutManager(requireContext())
        binding.rvArchivos.adapter = adapter

        binding.etBuscar.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                filtro = s?.toString().orEmpty()
                prefs.setUltimaBusqueda(filtro)
                aplicarFiltro()
            }
        })

        binding.btnReintentar.setOnClickListener { cargar() }
        binding.swipeRefresh.setOnRefreshListener { cargar() }

        if (ArchivoCache.archivos.isNotEmpty()) {
            todos = ArchivoCache.archivos
            mostrarExito()
            aplicarFiltro()
        } else {
            cargar()
        }
    }

    override fun onResume() {
        super.onResume()
        // Refresca estrellas si se cambiaron en Detalle o Favoritos
        if (todos.isNotEmpty()) aplicarFiltro()
    }

    private fun cargar() {
        mostrarCarga()
        llamada?.cancel()
        llamada = RetrofitClient.api.listarFotos(20)
        llamada?.enqueue(object : Callback<List<PhotoDto>> {
            override fun onResponse(call: Call<List<PhotoDto>>, response: Response<List<PhotoDto>>) {
                if (!isAdded) return
                binding.swipeRefresh.isRefreshing = false
                val cuerpo = response.body()
                if (response.isSuccessful && cuerpo != null && cuerpo.isNotEmpty()) {
                    todos = cuerpo
                    ArchivoCache.archivos = cuerpo
                    mostrarExito()
                    aplicarFiltro()
                } else {
                    mostrarError()
                }
            }

            override fun onFailure(call: Call<List<PhotoDto>>, t: Throwable) {
                if (!isAdded || call.isCanceled) return
                binding.swipeRefresh.isRefreshing = false
                mostrarError()
            }
        })
    }

    private fun aplicarFiltro() {
        val filtrados = if (filtro.isBlank()) {
            todos
        } else {
            todos.filter { it.title.contains(filtro, ignoreCase = true) }
        }
        adapter.enviar(filtrados)
        binding.tvVacio.visibility =
            if (filtrados.isEmpty() && todos.isNotEmpty()) View.VISIBLE else View.GONE
    }

    private fun mostrarCarga() {
        binding.panelCarga.visibility = View.VISIBLE
        binding.panelError.visibility = View.GONE
        binding.rvArchivos.visibility = View.GONE
        binding.tvVacio.visibility = View.GONE
    }

    private fun mostrarExito() {
        binding.panelCarga.visibility = View.GONE
        binding.panelError.visibility = View.GONE
        binding.rvArchivos.visibility = View.VISIBLE
    }

    private fun mostrarError() {
        binding.panelCarga.visibility = View.GONE
        binding.panelError.visibility = View.VISIBLE
        binding.rvArchivos.visibility = View.GONE
        binding.tvVacio.visibility = View.GONE
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
