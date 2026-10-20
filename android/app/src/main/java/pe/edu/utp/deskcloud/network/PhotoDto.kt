package pe.edu.utp.deskcloud.network

import com.google.gson.annotations.SerializedName

/**
 * DTO de la API pública JSONPlaceholder.
 * En la UI se presenta como un "archivo" de DeskCloud.
 */
data class PhotoDto(
    @SerializedName("albumId") val albumId: Int,
    @SerializedName("id") val id: Int,
    @SerializedName("title") val title: String,
    @SerializedName("url") val url: String,
    @SerializedName("thumbnailUrl") val thumbnailUrl: String,
)
