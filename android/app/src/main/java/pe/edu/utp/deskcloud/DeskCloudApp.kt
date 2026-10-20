package pe.edu.utp.deskcloud

import android.app.Application
import pe.edu.utp.deskcloud.data.PrefsHelper

class DeskCloudApp : Application() {
    override fun onCreate() {
        super.onCreate()
        PrefsHelper(this).aplicarTemaGuardado()
    }
}
