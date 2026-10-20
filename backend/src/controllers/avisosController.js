export function crearAvisosController({ avisos }) {
  return {
    listar(req, res) {
      res.json(avisos.listar(req.usuario, req.query));
    },
    resumen(req, res) {
      res.json(avisos.resumen(req.usuario));
    },
    marcarLeidos(req, res) {
      res.json(avisos.marcarLeidos(req.usuario, req.body));
    },
  };
}
