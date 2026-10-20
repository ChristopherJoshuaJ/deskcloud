export function crearEspaciosController({ compartidos, propuestas }) {
  return {
    listar(req, res) {
      res.json(compartidos.listar(req.usuario));
    },
    crear(req, res) {
      res.status(201).json(compartidos.crear(req.usuario, req.body));
    },
    detalles(req, res) {
      res.json(compartidos.detalles(req.usuario, req.params.id));
    },
    renombrar(req, res) {
      res.json(compartidos.renombrar(req.usuario, req.params.id, req.body));
    },
    invitar(req, res) {
      res.status(201).json(compartidos.invitar(req.usuario, req.params.id, req.body));
    },
    cancelarInvitacion(req, res) {
      res.json(compartidos.cancelarInvitacion(req.usuario, req.params.id, req.params.invitacionId));
    },
    expulsar(req, res) {
      res.json(compartidos.expulsar(req.usuario, req.params.id, req.params.usuarioId));
    },
    salir(req, res) {
      res.json(compartidos.salir(req.usuario, req.params.id, req.body));
    },
    actividad(req, res) {
      res.json({ actividad: compartidos.listarActividad(req.usuario, req.params.id, req.query) });
    },
    papelera(req, res) {
      res.json({ elementos: compartidos.listarPapelera(req.usuario, req.params.id) });
    },
    propuestas(req, res) {
      res.json({ propuestas: propuestas.listar(req.usuario, req.params.id, req.query) });
    },
    proponer(req, res) {
      res.status(201).json({ propuesta: propuestas.proponer(req.usuario, req.params.id, req.body) });
    },
  };
}
