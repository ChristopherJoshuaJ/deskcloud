export class ErrorAplicacion extends Error {
  constructor(mensaje, { estado = 500, codigo = 'ERROR_INTERNO' } = {}) {
    super(mensaje);
    this.name = this.constructor.name;
    this.estado = estado;
    this.codigo = codigo;
  }
}

export class RecursoNoEncontrado extends ErrorAplicacion {
  constructor(mensaje = 'Recurso no encontrado') {
    super(mensaje, { estado: 404, codigo: 'NO_ENCONTRADO' });
  }
}

export class ReglaNegocio extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 400, codigo: 'REGLA_NEGOCIO' });
  }
}

export class DatosInvalidos extends ErrorAplicacion {
  constructor(detalles, mensaje = 'Hay datos inválidos') {
    super(mensaje, { estado: 400, codigo: 'DATOS_INVALIDOS' });
    this.detalles = detalles;
  }
}

export class NoAutenticado extends ErrorAplicacion {
  constructor(mensaje = 'Debes iniciar sesión') {
    super(mensaje, { estado: 401, codigo: 'NO_AUTENTICADO' });
  }
}

export class CredencialesInvalidas extends ErrorAplicacion {
  constructor() {
    super('Correo o contraseña incorrectos', { estado: 401, codigo: 'CREDENCIALES_INVALIDAS' });
  }
}

export class Prohibido extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 403, codigo: 'PROHIBIDO' });
  }
}

export class OrigenNoPermitido extends ErrorAplicacion {
  constructor() {
    super('La petición viene de un sitio no permitido', { estado: 403, codigo: 'ORIGEN_NO_PERMITIDO' });
  }
}

export class DemasiadosIntentos extends ErrorAplicacion {
  constructor(segundos) {
    super(`Demasiados intentos fallidos. Vuelve a intentarlo en ${Math.ceil(segundos / 60)} min`, {
      estado: 429,
      codigo: 'DEMASIADOS_INTENTOS',
    });
    this.detalles = { reintentarEnSegundos: segundos };
  }
}

export class Conflicto extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 409, codigo: 'CONFLICTO' });
  }
}

// En un espacio compartido, eliminar, restaurar desde la papelera y eliminar definitivamente se votan.
export class VotacionRequerida extends ErrorAplicacion {
  constructor(mensaje = 'En un espacio compartido esto requiere la aprobación de todos los miembros') {
    super(mensaje, { estado: 409, codigo: 'VOTACION_REQUERIDA' });
  }
}

export class ConfirmacionRequerida extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 409, codigo: 'CONFIRMACION_REQUERIDA' });
  }
}

// detalles.conflictos: [{ nombre, existenteId, tipoExistente, nombreSugerido }]
export class NombreEnUso extends ErrorAplicacion {
  constructor(conflictos, mensaje = 'Ya existe un elemento con ese nombre') {
    super(mensaje, { estado: 409, codigo: 'NOMBRE_EN_USO' });
    this.detalles = { conflictos };
  }
}

export class RangoInvalido extends ErrorAplicacion {
  constructor(mensaje = 'Rango de bytes inválido') {
    super(mensaje, { estado: 416, codigo: 'RANGO_INVALIDO' });
  }
}

export class VistaNoDisponible extends ErrorAplicacion {
  constructor(mensaje = 'Este tipo de archivo no tiene vista previa') {
    super(mensaje, { estado: 415, codigo: 'VISTA_NO_DISPONIBLE' });
  }
}

export class TipoNoSoportado extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 415, codigo: 'TIPO_NO_SOPORTADO' });
  }
}

export class NoEditable extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 415, codigo: 'NO_EDITABLE' });
  }
}

export class ContenidoDemasiadoGrande extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 413, codigo: 'CONTENIDO_DEMASIADO_GRANDE' });
  }
}

export class PrecondicionRequerida extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 428, codigo: 'PRECONDICION_REQUERIDA' });
  }
}

// detalles.versionActual: { id, numero, sha256 } cuando se conoce.
export class VersionDesactualizada extends ErrorAplicacion {
  constructor(versionActual = null) {
    super('El archivo cambió desde que lo abriste', { estado: 412, codigo: 'VERSION_DESACTUALIZADA' });
    this.detalles = { versionActual };
  }
}

export class ErrorIntegridad extends ErrorAplicacion {
  constructor(mensaje) {
    super(mensaje, { estado: 500, codigo: 'ERROR_INTEGRIDAD' });
  }
}
