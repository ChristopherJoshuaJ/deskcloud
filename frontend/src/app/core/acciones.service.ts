import { Injectable, inject } from '@angular/core';
import { Api } from './api.service';
import { DialogosService } from './dialogos.service';
import { aErrorApi, esCodigo } from './errores';
import { EspaciosService } from './espacios.service';
import { EventosService } from './eventos.service';
import { ConflictoNombre, Elemento, PoliticaConflicto, TipoPropuesta } from './modelos';
import { NavegacionService } from './navegacion.service';
import { Notificar } from './notificar.service';

const cantidad = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

export function describir(elementos: Pick<Elemento, 'nombre'>[]) {
  return elementos.length === 1 ? `"${elementos[0].nombre}"` : cantidad(elementos.length, 'elemento', 'elementos');
}

// Operaciones que se hacen desde varios lugares (explorador, árbol, menú contextual, arrastrar y soltar).
@Injectable({ providedIn: 'root' })
export class AccionesService {
  private readonly api = inject(Api);
  private readonly dialogos = inject(DialogosService);
  private readonly eventos = inject(EventosService);
  private readonly espacios = inject(EspaciosService);
  private readonly navegacion = inject(NavegacionService);
  private readonly notificar = inject(Notificar);

  abrir(elemento: Elemento, lista: Elemento[] = [elemento]) {
    if (elemento.tipo === 'CARPETA') {
      this.navegacion.abrir(elemento.id);
    } else if (elemento.esTextoEditable && elemento.tipoVista === 'texto') {
      this.dialogos.editor.abrir(elemento).then(() => this.eventos.carpetas([elemento.padreId]));
    } else if (elemento.tipoVista) {
      const archivos = lista.filter((e) => e.tipo === 'ARCHIVO' && e.tipoVista);
      this.dialogos.visor.abrir({ elemento, lista: archivos }).then(() => {
        if (archivos.some((e) => e.sinVer)) this.eventos.avisar('contenido', 'espacios');
      });
    } else {
      this.descargar([elemento]);
    }
  }

  // Entre espacios distintos solo se puede copiar, así que arrastrar a otro espacio siempre copia.
  async moverOCopiar(elementos: Elemento[], destino: { id: number; espacioId: number }, copiar: boolean): Promise<boolean> {
    if (elementos.length === 0) return false;
    const operacion = copiar || elementos[0].espacioId !== destino.espacioId ? 'copiar' : 'mover';
    const ids = elementos.map((e) => e.id);
    let politica: PoliticaConflicto = 'preguntar';
    for (;;) {
      try {
        const resultado =
          operacion === 'copiar' ? await this.api.copiar(ids, destino.id, politica) : await this.api.mover(ids, destino.id, politica);
        this.eventos.carpetas([destino.id, ...elementos.map((e) => e.padreId)]);
        const hechos = resultado.elementos.length;
        if (hechos > 0) {
          this.notificar.exito(`${operacion === 'copiar' ? 'Se copió' : 'Se movió'} ${describir(hechos === elementos.length ? elementos : resultado.elementos)}`);
        } else {
          this.notificar.info('No se cambió nada', 'Se omitieron los elementos que ya existían');
        }
        return true;
      } catch (error) {
        if (politica === 'preguntar' && esCodigo(error, 'NOMBRE_EN_USO')) {
          const elegida = await this.preguntarConflictos(aErrorApi(error).detalles?.['conflictos'] ?? [], operacion, destino.espacioId);
          if (!elegida) return false;
          politica = elegida;
          continue;
        }
        this.notificar.error(error);
        return false;
      }
    }
  }

  // En un espacio compartido reemplazar enviaría a la papelera lo existente sin votación.
  preguntarConflictos(conflictos: ConflictoNombre[], accion: 'subir' | 'mover' | 'copiar', espacioDestino: number) {
    return this.dialogos.conflictos.abrir({
      conflictos,
      accion,
      permitirReemplazo: accion === 'subir' || !this.espacios.esCompartido(espacioDestino),
    });
  }

  async eliminar(elementos: Elemento[]) {
    if (elementos.length === 0) return;
    if (this.espacios.esCompartido(elementos[0].espacioId)) {
      await this.proponer('ELIMINAR', elementos);
      return;
    }
    try {
      await this.api.enviarAPapelera(elementos.map((e) => e.id));
      this.eventos.carpetas(elementos.map((e) => e.padreId));
      if (elementos.some((e) => e.tipo === 'CARPETA')) this.eventos.avisar('favoritos');
      this.notificar.exito(`Se envió ${describir(elementos)} a la papelera`);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  async proponer(tipo: TipoPropuesta, elementos: Pick<Elemento, 'id' | 'nombre' | 'tipo' | 'espacioId'>[], todos = false, espacioId?: number) {
    const espacio = espacioId ?? elementos[0]?.espacioId;
    if (espacio == null) return null;
    const propuesta = await this.dialogos.propuesta.abrir({ espacioId: espacio, tipo, elementos, todos });
    if (propuesta) {
      this.eventos.avisar('contenido', 'espacios', 'avisos');
    }
    return propuesta;
  }

  renombrar(elemento: Elemento) {
    return this.dialogos.texto.abrir({
      titulo: 'Cambiar nombre',
      etiqueta: 'Nombre',
      valor: elemento.nombre,
      boton: 'Cambiar nombre',
      seleccionarSinExtension: elemento.tipo === 'ARCHIVO',
      aceptar: async (nombre) => {
        if (nombre === elemento.nombre) return;
        await this.api.renombrar(elemento.id, nombre);
        this.eventos.carpetas([elemento.padreId, elemento.id]);
        if (elemento.esFavorito) this.eventos.avisar('favoritos');
      },
    });
  }

  descargar(elementos: Elemento[]) {
    elementos.forEach((elemento, i) => {
      const url = elemento.tipo === 'CARPETA' ? this.api.urlZip(elemento.id) : this.api.urlDescarga(elemento.id);
      // Los navegadores bloquean varias descargas simultáneas; se espacian un poco.
      setTimeout(() => descargarUrl(url), i * 400);
    });
    if (elementos.some((e) => e.sinVer)) setTimeout(() => this.eventos.avisar('contenido', 'espacios'), 1500);
  }

  async alternarFijado(elemento: Elemento) {
    try {
      if (this.espacios.idsFavoritos().has(elemento.id)) {
        await this.espacios.desfijar(elemento.id);
      } else {
        await this.espacios.fijar(elemento.id);
        this.notificar.exito(`"${elemento.nombre}" se fijó en Accesos rápidos`);
      }
      this.eventos.avisar('contenido');
    } catch (error) {
      this.notificar.error(error);
    }
  }

  async marcarVisto(elementos: Elemento[]) {
    try {
      await this.api.marcarVisto(
        elementos.map((e) => e.id),
        true,
      );
      this.eventos.avisar('contenido', 'espacios');
    } catch (error) {
      this.notificar.error(error);
    }
  }

  async cambiarColor(elemento: Elemento) {
    const actualizado = await this.dialogos.color.abrir(elemento);
    if (!actualizado) return;
    this.eventos.carpetas([elemento.padreId]);
    if (elemento.esFavorito) this.eventos.avisar('favoritos');
  }

  versiones(elemento: Elemento) {
    return this.dialogos.versiones.abrir(elemento).then(() => this.eventos.carpetas([elemento.padreId]));
  }
}

export function descargarUrl(url: string) {
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = '';
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}
