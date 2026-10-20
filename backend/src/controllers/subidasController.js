export function crearSubidasController({ subidas }) {
  return {
    async subir(req, res) {
      const resultado = await subidas.subirArchivo(req.usuario, req.params.carpetaId, {
        ruta: req.query.ruta,
        conflicto: req.query.conflicto,
        tipoContenido: req.get('content-type'),
        contenido: req,
      });
      res.status(resultado.accion === 'omitido' ? 200 : 201).json(resultado);
    },
  };
}
