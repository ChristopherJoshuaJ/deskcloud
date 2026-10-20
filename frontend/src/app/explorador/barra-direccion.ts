import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MenuItem } from 'primeng/api';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Menu } from 'primeng/menu';
import { Tooltip } from 'primeng/tooltip';
import { Api } from '../core/api.service';
import { entradasDeArrastre, leerEntradas } from '../core/archivos-locales';
import { ParteRuta } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { ArrastreService } from '../core/portapapeles.service';
import { ExploradorEstado } from './explorador-estado';

@Component({
  selector: 'dc-barra-direccion',
  imports: [FormsModule, IconField, InputIcon, InputText, Menu, Tooltip],
  templateUrl: './barra-direccion.html',
  styleUrl: './barra-direccion.scss',
})
export class BarraDireccion {
  private readonly api = inject(Api);
  readonly estado = inject(ExploradorEstado);
  readonly navegacion = inject(NavegacionService);

  private readonly menuSubcarpetas = viewChild.required<Menu>('menuSubcarpetas');
  private readonly campoBusqueda = viewChild.required<ElementRef<HTMLInputElement>>('campoBusqueda');
  private readonly contenedorRuta = viewChild<ElementRef<HTMLElement>>('contenedorRuta');

  readonly texto = signal('');
  readonly subcarpetas = signal<MenuItem[]>([]);
  readonly destino = signal<number | null>(null);
  private espera: ReturnType<typeof setTimeout> | null = null;

  readonly iconoRaiz = computed(() => (this.estado.compartido() ? 'pi pi-users' : 'pi pi-home'));
  readonly lugar = computed(() => {
    const carpeta = this.estado.carpeta();
    if (!carpeta) return '';
    return carpeta.esRaiz ? (this.estado.ruta()[0]?.nombre ?? '') : carpeta.nombre;
  });

  constructor() {
    effect(() => this.texto.set(this.estado.consulta()));
    // Si la ruta no entra, se muestra el final (la carpeta actual), como en Windows.
    effect(() => {
      this.estado.ruta();
      setTimeout(() => {
        const el = this.contenedorRuta()?.nativeElement;
        if (el) el.scrollLeft = el.scrollWidth;
      });
    });
  }

  enfocarBusqueda() {
    const campo = this.campoBusqueda().nativeElement;
    campo.focus();
    campo.select();
  }

  alEscribir(valor: string) {
    this.texto.set(valor);
    if (this.espera) clearTimeout(this.espera);
    this.espera = setTimeout(() => this.buscarAhora(), 450);
  }

  buscarAhora() {
    if (this.espera) clearTimeout(this.espera);
    this.espera = null;
    if (this.texto().trim() !== this.estado.consulta().trim()) this.estado.buscar(this.texto());
  }

  limpiarBusqueda() {
    this.texto.set('');
    this.buscarAhora();
  }

  async mostrarSubcarpetas(evento: MouseEvent, parte: ParteRuta) {
    evento.stopPropagation();
    const objetivo = evento.currentTarget as HTMLElement;
    this.subcarpetas.set([{ label: 'Cargando…', disabled: true }]);
    this.menuSubcarpetas().show({ currentTarget: objetivo, target: objetivo } as unknown as Event);
    try {
      const { subcarpetas } = await this.api.subcarpetas(parte.id);
      const actual = this.estado.ruta().map((p) => p.id);
      this.subcarpetas.set(
        subcarpetas.length
          ? subcarpetas.map((c) => ({
              label: c.nombre,
              icon: 'pi pi-folder',
              styleClass: actual.includes(c.id) ? 'dc-en-ruta' : undefined,
              command: () => this.navegacion.abrir(c.id),
            }))
          : [{ label: 'No hay subcarpetas', disabled: true }],
      );
    } catch {
      this.subcarpetas.set([{ label: 'No se pudo cargar', disabled: true }]);
    }
  }

  // Los tramos de la ruta también aceptan que les suelten elementos o archivos, como en Windows.
  alArrastrarSobre(parte: ParteRuta, indice: number, evento: DragEvent) {
    if (indice === this.estado.ruta().length - 1 && !this.estado.buscando()) return;
    const conArchivos = ArrastreService.traeArchivos(evento);
    if (!conArchivos && !this.estado.arrastre.sePuedeSoltarEn(parte)) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = conArchivos || evento.ctrlKey ? 'copy' : 'move';
    this.destino.set(parte.id);
  }

  async alSoltar(parte: ParteRuta, evento: DragEvent) {
    evento.preventDefault();
    this.destino.set(null);
    const carpeta = this.estado.carpeta();
    if (!carpeta) return;
    const destino = { ...carpeta, id: parte.id };
    if (ArrastreService.traeArchivos(evento) && evento.dataTransfer) {
      this.estado.subir(await leerEntradas(entradasDeArrastre(evento.dataTransfer)), destino);
      return;
    }
    const arrastrado = this.estado.arrastre.arrastrando();
    const sePuede = this.estado.arrastre.sePuedeSoltarEn(parte);
    this.estado.arrastre.terminar();
    if (arrastrado && sePuede) await this.estado.acciones.moverOCopiar(arrastrado.elementos, destino, evento.ctrlKey);
  }
}
