export function crearFavoritosController({ favoritos }) {
  return {
    listar(req, res) {
      res.json({ favoritos: favoritos.listar(req.usuario) });
    },
    fijar(req, res) {
      res.json({ favoritos: favoritos.fijar(req.usuario, req.body) });
    },
    quitar(req, res) {
      res.json({ favoritos: favoritos.quitar(req.usuario, req.params.nodoId) });
    },
    reordenar(req, res) {
      res.json({ favoritos: favoritos.reordenar(req.usuario, req.body) });
    },
  };
}
