package pe.edu.utp.deskcloud.network

import retrofit2.Call
import retrofit2.http.GET
import retrofit2.http.Query

interface DeskCloudApi {

    /** Lista de fotos públicas mapeadas como archivos en Mi espacio. */
    @GET("photos")
    fun listarFotos(@Query("_limit") limite: Int = 20): Call<List<PhotoDto>>
}
