package pe.edu.utp.deskcloud.ui

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.Patterns
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import pe.edu.utp.deskcloud.R
import pe.edu.utp.deskcloud.data.PrefsHelper
import pe.edu.utp.deskcloud.databinding.ActivityLoginBinding

/**
 * Pantalla de acceso (navegación APF1).
 * Validación en tiempo real = estado dinámico sin recrear la Activity.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var prefs: PrefsHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = PrefsHelper(this)
        if (prefs.haySesion()) {
            irAPrincipal()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) = actualizarValidacion()
        }
        binding.etCorreo.addTextChangedListener(watcher)
        binding.etContrasena.addTextChangedListener(watcher)

        binding.btnEntrar.setOnClickListener {
            if (!formularioValido()) return@setOnClickListener
            prefs.setSesion(true)
            irAPrincipal()
        }
    }

    private fun actualizarValidacion() {
        val correo = binding.etCorreo.text?.toString()?.trim().orEmpty()
        val clave = binding.etContrasena.text?.toString().orEmpty()
        val mensaje = when {
            correo.isNotEmpty() && !Patterns.EMAIL_ADDRESS.matcher(correo).matches() ->
                getString(R.string.error_correo)
            clave.isNotEmpty() && clave.length < 6 ->
                getString(R.string.error_contrasena)
            else -> null
        }
        if (mensaje == null) {
            binding.tvValidacion.visibility = View.GONE
            binding.tilCorreo.error = null
            binding.tilContrasena.error = null
        } else {
            binding.tvValidacion.visibility = View.VISIBLE
            binding.tvValidacion.text = mensaje
        }
        binding.btnEntrar.isEnabled = formularioValido()
    }

    private fun formularioValido(): Boolean {
        val correo = binding.etCorreo.text?.toString()?.trim().orEmpty()
        val clave = binding.etContrasena.text?.toString().orEmpty()
        return Patterns.EMAIL_ADDRESS.matcher(correo).matches() && clave.length >= 6
    }

    private fun irAPrincipal() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
