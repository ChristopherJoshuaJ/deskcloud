import { enviarVersion } from '../http/enviarVersion.js';
import { enviarZip } from '../http/enviarZip.js';

export function crearNodosController({ explorador, subidas, contenido, almacenamiento, versiones, texto, colores }) {
  return {
    detalles(req, res) {
      res.json(explorador.detalles(req.usuario, req.params.id));
    },

    contenido(req, res) {
      res.json(explorador.contenido(req.usuario, req.params.id));
    },

    subcarpetas(req, res) {
      res.json({ subcarpetas: explorador.subcarpetas(req.usuario, req.params.id) });
    },

    buscar(req, res) {
      res.json({ resultados: explorador.buscar(req.usuario, req.params.id, req.query.q) });
    },

    crearCarpeta(req, res) {
      res.status(201).json({ elemento: explorador.crearCarpeta(req.usuario, req.params.id, req.body) });
    },

    renombrar(req, res) {
      res.json({ elemento: explorador.renombrar(req.usuario, req.params.id, req.body) });
    },

    mover(req, res) {
      res.json(explorador.mover(req.usuario, req.body));
    },

    copiar(req, res) {
      res.status(201).json(explorador.copiar(req.usuario, req.body));
    },

    enviarAPapelera(req, res) {
      res.json(explorador.enviarAPapelera(req.usuario, req.body));
    },

    marcarVisto(req, res) {
      explorador.marcarVisto(req.usuario, req.body);
      res.status(204).end();
    },

    cambiarColor(req, res) {
      res.json({ elemento: colores.cambiar(req.usuario, req.params.id, req.body) });
    },

    verificarNombres(req, res) {
      res.json(subidas.verificarNombres(req.usuario, req.params.id, req.body));
    },

    async descargar(req, res) {
      await enviarVersion(req, res, { almacenamiento, ...contenido.paraDescarga(req.usuario, req.params.id) });
    },

    async vista(req, res) {
      await enviarVersion(req, res, { almacenamiento, ...contenido.paraVista(req.usuario, req.params.id) });
    },

    async descargarZip(req, res) {
      await enviarZip(req, res, contenido.paraZip(req.usuario, req.params.id));
    },

    versiones(req, res) {
      res.json({ versiones: versiones.listar(req.usuario, req.params.id) });
    },

    async descargarVersion(req, res) {
      const { id, versionId } = req.params;
      await enviarVersion(req, res, { almacenamiento, ...contenido.paraDescarga(req.usuario, id, versionId) });
    },

    async vistaVersion(req, res) {
      const { id, versionId } = req.params;
      await enviarVersion(req, res, { almacenamiento, ...contenido.paraVista(req.usuario, id, versionId) });
    },

    restaurarVersion(req, res) {
      res.status(201).json(versiones.restaurar(req.usuario, req.params.id, req.params.versionId));
    },

    eliminarVersion(req, res) {
      res.json({ versiones: versiones.eliminar(req.usuario, req.params.id, req.params.versionId) });
    },

    leerTexto(req, res) {
      res.json(texto.leer(req.usuario, req.params.id));
    },

    async guardarTexto(req, res) {
      const resultado = await texto.guardar(req.usuario, req.params.id, {
        tipoContenido: req.get('content-type'),
        siCoincide: req.get('if-match'),
        contenido: req,
      });
      res.status(resultado.accion === 'guardado' ? 201 : 200).json(resultado);
    },
  };
}
