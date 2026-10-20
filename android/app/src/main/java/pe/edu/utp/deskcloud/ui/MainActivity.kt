package pe.edu.utp.deskcloud.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import pe.edu.utp.deskcloud.R
import pe.edu.utp.deskcloud.databinding.ActivityMainBinding

/**
 * Contenedor con BottomNavigationView (continuidad APF1).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (savedInstanceState == null) {
            mostrar(MiEspacioFragment())
        }

        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_mi_espacio -> mostrar(MiEspacioFragment())
                R.id.nav_favoritos -> mostrar(FavoritosFragment())
                R.id.nav_cuenta -> mostrar(CuentaFragment())
                else -> return@setOnItemSelectedListener false
            }
            true
        }
    }

    private fun mostrar(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, fragment)
            .commit()
    }
}
