import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ConflictoNombre, Elemento, PoliticaConflicto, Propuesta, TipoNodo, TipoPropuesta } from './modelos';
import { SesionService } from './sesion.service';

// Un diálogo abierto con sus datos y la función que entrega la respuesta a quien lo abrió.
export class Peticion<D, R> {
  readonly actual = signal<{ datos: D; resolver: (respuesta: R) => void } | null>(null);

  constructor(private readonly alCancelar: R) {}

  abrir(datos: D): Promise<R> {
    this.actual()?.resolver(this.alCancelar);
    return new Promise<R>((resolver) => this.actual.set({ datos, resolver }));
  }

  responder(respuesta: R) {
    const actual = this.actual();
    this.actual.set(null);
    actual?.resolver(respuesta);
  }

  cancelar() {
    this.responder(this.alCancelar);
  }
}

export interface PedirTexto {
  titulo: string;
  etiqueta: string;
  valor?: string;
  boton?: string;
  // Al renombrar un archivo se selecciona el nombre sin la extensión, como en Windows.
  seleccionarSinExtension?: boolean;
  tipoCampo?: 'text' | 'email';
  // Si lanza un error, el mensaje se muestra en el diálogo y este sigue abierto.
  aceptar: (valor: string) => Promise<unknown>;
}

export interface PreguntaConflictos {
  conflictos: ConflictoNombre[];
  accion: 'subir' | 'mover' | 'copiar';
  permitirReemplazo: boolean;
}

export interface DatosPropuesta {
  espacioId: number;
  tipo: TipoPropuesta;
  elementos: { id: number; nombre: string; tipo: TipoNodo }[];
  todos?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DialogosService {
  readonly texto = new Peticion<PedirTexto, boolean>(false);
  readonly conflictos = new Peticion<PreguntaConflictos, PoliticaConflicto | null>(null);
  readonly propuesta = new Peticion<DatosPropuesta, Propuesta | null>(null);
  readonly color = new Peticion<Elemento, Elemento | null>(null);
  readonly versiones = new Peticion<Elemento, void>(undefined);
  readonly visor = new Peticion<{ elemento: Elemento; lista: Elemento[] }, void>(undefined);
  readonly editor = new Peticion<Elemento, void>(undefined);
  readonly invitaciones = new Peticion<void, void>(undefined);

  constructor() {
    const sesion = inject(SesionService);
    const todas = [this.texto, this.conflictos, this.propuesta, this.color, this.versiones, this.visor, this.editor, this.invitaciones];
    effect(() => {
      if (!sesion.conectado()) untracked(() => todas.forEach((p) => p.cancelar()));
    });
  }
}
