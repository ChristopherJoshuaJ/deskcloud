export function crearPropuestasController({ propuestas }) {
  return {
    pendientes(req, res) {
      res.json({ propuestas: propuestas.pendientes(req.usuario) });
    },
    obtener(req, res) {
      res.json({ propuesta: propuestas.obtener(req.usuario, req.params.id) });
    },
    votar(req, res) {
      res.json({ propuesta: propuestas.votar(req.usuario, req.params.id, req.body) });
    },
    retirar(req, res) {
      res.json({ propuesta: propuestas.retirar(req.usuario, req.params.id) });
    },
  };
}
