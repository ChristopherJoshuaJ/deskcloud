export function crearInvitacionesController({ compartidos }) {
  return {
    listar(req, res) {
      res.json({ invitaciones: compartidos.misInvitaciones(req.usuario) });
    },
    aceptar(req, res) {
      res.json(compartidos.aceptar(req.usuario, req.params.id));
    },
    rechazar(req, res) {
      res.json(compartidos.rechazar(req.usuario, req.params.id));
    },
  };
}
