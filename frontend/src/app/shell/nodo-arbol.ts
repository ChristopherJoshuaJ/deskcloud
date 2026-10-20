import { Component, Injectable, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AccionesService } from '../core/acciones.service';
import { Api } from '../core/api.service';
import { entradasDeArrastre, leerEntradas } from '../core/archivos-locales';
import { EventosService } from '../core/eventos.service';
import { Elemento } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { ArrastreService } from '../core/portapapeles.service';
import { SubidasService } from '../core/subidas.service';

// Una subcarpeta (Elemento) o la raíz de un espacio, que la barra lateral arma con menos datos.
export interface NodoCarpeta {
  id: number;
  nombre: string;
  espacioId: number;
  tieneSubcarpetas?: boolean;
  color?: string | null;
  sinVer?: boolean;
}

export function esElemento(nodo: NodoCarpeta): nodo is Elemento {
  return 'tipo' in nodo;
}

// La barra lateral lo provee para abrir su menú contextual desde cualquier nivel del árbol.
@Injectable()
export class MenuArbol {
  abrir: (evento: MouseEvent, nodo: NodoCarpeta) => void = () => {};
}

const ESPERA_PARA_ABRIR_MS = 700;

@Component({
  selector: 'dc-nodo-arbol',
  imports: [NodoArbol],
  templateUrl: './nodo-arbol.html',
  styleUrl: './nodo-arbol.scss',
})
export class NodoArbol {
  private readonly api = inject(Api);
  private readonly navegacion = inject(NavegacionService);
  private readonly eventos = inject(EventosService);
  private readonly arrastre = inject(ArrastreService);
  private readonly acciones = inject(AccionesService);
  private readonly subidas = inject(SubidasService);
  private readonly menu = inject(MenuArbol, { optional: true });

  readonly nodo = input.required<NodoCarpeta>();
  readonly nivel = input(0);
  readonly icono = input('pi pi-folder');
  readonly ancestros = input<ReadonlySet<number>>(new Set());
  readonly insignia = input<number>(0);
  // Los accesos rápidos no se abren solos al navegar: solo el árbol de los espacios sigue la ruta.
  readonly sincronizar = input(true);
  readonly abrirAlInicio = input(false);

  readonly abierto = signal(false);
  readonly hijos = signal<Elemento[] | null>(null);
  readonly cargando = signal(false);
  readonly encima = signal(false);

  private readonly id = computed(() => this.nodo().id);
  readonly activo = computed(() => this.navegacion.carpeta()?.id === this.id());
  readonly tieneHijos = computed(() => {
    const hijos = this.hijos();
    return hijos ? hijos.length > 0 : this.nodo().tieneSubcarpetas !== false;
  });
  readonly rutaHijos = computed(() => new Set([...this.ancestros(), this.id()]));

  private temporizadorAbrir: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Abre las carpetas que contienen a la carpeta actual, para que siempre se vea en el árbol.
    effect(() => {
      if (untracked(this.abrirAlInicio)) untracked(() => this.expandir());
    });
    effect(() => {
      if (!this.sincronizar()) return;
      const ruta = this.navegacion.ruta();
      const id = this.id();
      const indice = ruta.findIndex((p) => p.id === id);
      if (indice >= 0 && indice < ruta.length - 1) untracked(() => this.expandir());
    });
    // Si cambió el contenido de esta carpeta se vuelven a pedir sus subcarpetas, aunque esté
    // cerrada, para saber si ahora debe mostrar la flecha.
    effect(() => {
      const cambiadas = this.eventos.carpetasCambiadas();
      if (cambiadas.has(this.id())) untracked(() => this.cargar());
    });
  }

  alternar(evento: Event) {
    evento.stopPropagation();
    if (this.abierto()) {
      this.abierto.set(false);
    } else {
      this.expandir();
    }
  }

  abrirCarpeta() {
    this.navegacion.abrir(this.nodo().id);
  }

  menuContextual(evento: MouseEvent) {
    if (!this.menu) return;
    evento.preventDefault();
    evento.stopPropagation();
    this.menu.abrir(evento, this.nodo());
  }

  private async expandir() {
    this.abierto.set(true);
    if (this.hijos() === null) await this.cargar();
  }

  private async cargar() {
    this.cargando.set(true);
    try {
      this.hijos.set((await this.api.subcarpetas(this.nodo().id)).subcarpetas);
    } catch {
      this.hijos.set([]);
    } finally {
      this.cargando.set(false);
    }
  }

  // Arrastrar y soltar: elementos del explorador (mover o copiar con Ctrl) o archivos del equipo.
  alArrastrarEncima(evento: DragEvent) {
    const nodo = this.nodo();
    const conArchivos = ArrastreService.traeArchivos(evento);
    if (!conArchivos && !this.arrastre.sePuedeSoltarEn(nodo, this.rutaHijos())) return;
    evento.preventDefault();
    evento.stopPropagation();
    if (evento.dataTransfer) {
      const otroEspacio = this.arrastre.arrastrando()?.espacioId !== nodo.espacioId;
      evento.dataTransfer.dropEffect = conArchivos || evento.ctrlKey || otroEspacio ? 'copy' : 'move';
    }
    if (!this.encima()) {
      this.encima.set(true);
      if (!this.abierto() && this.tieneHijos()) {
        this.temporizadorAbrir = setTimeout(() => this.expandir(), ESPERA_PARA_ABRIR_MS);
      }
    }
  }

  alSalir(evento: DragEvent) {
    const destino = evento.relatedTarget as Node | null;
    if (destino && (evento.currentTarget as HTMLElement).contains(destino)) return;
    this.limpiarArrastre();
  }

  async alSoltar(evento: DragEvent) {
    evento.preventDefault();
    evento.stopPropagation();
    this.limpiarArrastre();
    const nodo = this.nodo();
    if (ArrastreService.traeArchivos(evento) && evento.dataTransfer) {
      const entradas = entradasDeArrastre(evento.dataTransfer);
      this.subidas.subir(nodo.id, nodo.espacioId, await leerEntradas(entradas));
      return;
    }
    const arrastrado = this.arrastre.arrastrando();
    const sePuede = this.arrastre.sePuedeSoltarEn(nodo, this.rutaHijos());
    this.arrastre.terminar();
    if (arrastrado && sePuede) {
      await this.acciones.moverOCopiar(arrastrado.elementos, nodo, evento.ctrlKey);
    }
  }

  private limpiarArrastre() {
    this.encima.set(false);
    if (this.temporizadorAbrir) clearTimeout(this.temporizadorAbrir);
    this.temporizadorAbrir = null;
  }
}
