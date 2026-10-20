package pe.edu.utp.deskcloud.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import coil.load
import pe.edu.utp.deskcloud.R
import pe.edu.utp.deskcloud.data.PrefsHelper
import pe.edu.utp.deskcloud.databinding.ItemArchivoBinding
import pe.edu.utp.deskcloud.network.PhotoDto

class ArchivoAdapter(
    private val prefs: PrefsHelper,
    private val onClick: (PhotoDto) -> Unit,
    private val onFavoritoChanged: (PhotoDto, Boolean) -> Unit,
) : RecyclerView.Adapter<ArchivoAdapter.VH>() {

    private val items = mutableListOf<PhotoDto>()

    fun enviar(lista: List<PhotoDto>) {
        items.clear()
        items.addAll(lista)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemArchivoBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(binding)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.bind(items[position])
    }

    inner class VH(private val binding: ItemArchivoBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(archivo: PhotoDto) {
            binding.tvNombre.text = archivo.title.replaceFirstChar { it.uppercase() }
            binding.tvAlbum.text = binding.root.context.getString(R.string.album, archivo.albumId)
            binding.ivMiniatura.load(archivo.thumbnailUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_folder)
                error(R.drawable.ic_folder)
            }

            val favorito = prefs.esFavorito(archivo.id)
            binding.btnFavorito.setImageResource(
                if (favorito) android.R.drawable.btn_star_big_on else android.R.drawable.btn_star_big_off,
            )

            binding.root.setOnClickListener { onClick(archivo) }
            binding.btnFavorito.setOnClickListener {
                val nuevo = !prefs.esFavorito(archivo.id)
                prefs.setFavorito(archivo.id, nuevo)
                notifyItemChanged(bindingAdapterPosition)
                onFavoritoChanged(archivo, nuevo)
            }
        }
    }
}
