export function crearPapeleraController({ papelera }) {
  return {
    listar(req, res) {
      res.json({ elementos: papelera.listar(req.usuario) });
    },
    restaurar(req, res) {
      res.json(papelera.restaurar(req.usuario, req.body));
    },
    eliminar(req, res) {
      res.json(papelera.eliminarDefinitivamente(req.usuario, req.body));
    },
    vaciar(req, res) {
      res.json(papelera.vaciar(req.usuario));
    },
  };
}
