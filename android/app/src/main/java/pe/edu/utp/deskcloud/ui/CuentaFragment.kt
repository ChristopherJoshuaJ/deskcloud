package pe.edu.utp.deskcloud.ui

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatDelegate
import androidx.fragment.app.Fragment
import pe.edu.utp.deskcloud.R
import pe.edu.utp.deskcloud.data.PrefsHelper
import pe.edu.utp.deskcloud.databinding.FragmentCuentaBinding

/**
 * Preferencias de usuario: tema claro/oscuro y última búsqueda (SharedPreferences).
 */
class CuentaFragment : Fragment() {

    private var _binding: FragmentCuentaBinding? = null
    private val binding get() = _binding!!
    private lateinit var prefs: PrefsHelper

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentCuentaBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PrefsHelper(requireContext())

        binding.switchTema.setOnCheckedChangeListener(null)
        binding.switchTema.isChecked = prefs.esTemaOscuro()
        binding.switchTema.setOnCheckedChangeListener { _, checked ->
            prefs.setTemaOscuro(checked)
            AppCompatDelegate.setDefaultNightMode(
                if (checked) AppCompatDelegate.MODE_NIGHT_YES else AppCompatDelegate.MODE_NIGHT_NO,
            )
        }

        val ultima = prefs.obtenerUltimaBusqueda()
        binding.tvUltimaBusqueda.text = if (ultima.isBlank()) getString(R.string.sin_busqueda) else ultima

        binding.btnCerrarSesion.setOnClickListener {
            prefs.setSesion(false)
            startActivity(
                Intent(requireContext(), LoginActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                },
            )
        }
    }

    override fun onResume() {
        super.onResume()
        val ultima = prefs.obtenerUltimaBusqueda()
        binding.tvUltimaBusqueda.text = if (ultima.isBlank()) getString(R.string.sin_busqueda) else ultima
    }

    override fun onDestroyView() {
        _binding = null
        super.onDestroyView()
    }
}
