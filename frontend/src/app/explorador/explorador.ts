import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { ContextMenu } from 'primeng/contextmenu';
import { Skeleton } from 'primeng/skeleton';
import { desdeInput, soltadoDesdeEquipo } from '../core/archivos-locales';
import { EventosService } from '../core/eventos.service';
import { TamanoPipe } from '../core/formato';
import { Elemento } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { SesionService } from '../core/sesion.service';
import { BarraComandos } from './barra-comandos';
import { BarraDireccion } from './barra-direccion';
import { Cuadricula } from './cuadricula';
import { CampoOrden, ExploradorEstado, NOMBRES_ORDEN } from './explorador-estado';
import { Lista } from './lista';
import { PanelDetalles } from './panel-detalles';

@Component({
  selector: 'dc-explorador',
  imports: [Button, ContextMenu, Skeleton, TamanoPipe, BarraDireccion, BarraComandos, Lista, Cuadricula, PanelDetalles],
  providers: [ExploradorEstado],
  templateUrl: './explorador.html',
  styleUrl: './explorador.scss',
  host: { '(document:keydown)': 'teclado($event)' },
})
export class Explorador {
  private readonly titulo = inject(Title);
  private readonly eventos = inject(EventosService);
  private readonly navegacion = inject(NavegacionService);
  readonly sesion = inject(SesionService);
  readonly estado = inject(ExploradorEstado);

  // Parámetro de la ruta y parámetros de consulta (?q= búsqueda, ?sel= elemento a seleccionar).
  readonly id = input.required<string>();
  readonly q = input<string>();
  readonly sel = input<string>();

  private readonly menu = viewChild.required<ContextMenu>('menu');
  private readonly barraDireccion = viewChild.required(BarraDireccion);
  private readonly entradaArchivos = viewChild.required<ElementRef<HTMLInputElement>>('entradaArchivos');
  private readonly entradaCarpeta = viewChild.required<ElementRef<HTMLInputElement>>('entradaCarpeta');

  readonly opcionesMenu = signal<MenuItem[]>([]);
  menuAbierto = false;
  readonly soltando = signal(false);
  readonly nombreCarpeta = this.estado.nombreCarpeta;
  readonly vacio = computed(() => !!this.estado.contenido() && this.estado.todos().length === 0);

  constructor() {
    effect(() => {
      const id = Number(this.id());
      const consulta = this.q() ?? '';
      const seleccionar = Number(this.sel()) || undefined;
      untracked(() => this.estado.ir(id, consulta, seleccionar));
    });
    // Otra parte de la app cambió algo (subida, árbol, diálogo): se recarga sin parpadeo.
    let primera = true;
    effect(() => {
      this.eventos.contenido();
      if (primera) {
        primera = false;
        return;
      }
      untracked(() => this.estado.cargar(true));
    });
    effect(() => {
      const nombre = this.nombreCarpeta();
      this.titulo.setTitle(nombre ? `${nombre} · DeskCloud` : 'DeskCloud');
    });
    this.estado.abrirMenu = (evento, elemento) => this.abrirMenu(evento, elemento);
  }

  ngOnDestroy() {
    this.navegacion.limpiar();
  }

  navegacionMiEspacio() {
    const usuario = this.sesion.usuario();
    if (usuario) this.navegacion.abrir(usuario.raizId);
  }

  elegirArchivos() {
    this.entradaArchivos().nativeElement.click();
  }

  elegirCarpeta() {
    this.entradaCarpeta().nativeElement.click();
  }

  alElegir(entrada: HTMLInputElement) {
    this.estado.subir(desdeInput(entrada.files));
    entrada.value = '';
  }

  // --- Soltar archivos del equipo sobre el área ---

  alArrastrarSobreArea(evento: DragEvent) {
    if (!evento.dataTransfer || ![...evento.dataTransfer.types].includes('Files') || !this.estado.carpeta()) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'copy';
    this.soltando.set(true);
  }

  alSalirDelArea(evento: DragEvent) {
    const hacia = evento.relatedTarget as Node | null;
    if (!hacia || !(evento.currentTarget as HTMLElement).contains(hacia)) this.soltando.set(false);
  }

  async alSoltarEnArea(evento: DragEvent) {
    this.soltando.set(false);
    const locales = soltadoDesdeEquipo(evento);
    if (!locales) return;
    evento.preventDefault();
    this.estado.subir(await locales);
  }

  // --- Teclado, como en el Explorador de Windows ---

  teclado(evento: KeyboardEvent) {
    const objetivo = evento.target as HTMLElement;
    if (objetivo.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (this.menuAbierto || document.querySelector('.p-dialog-mask, .p-menu-overlay')) return;
    const ctrl = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key;
    const hecho = () => evento.preventDefault();

    if (evento.altKey) {
      if (tecla === 'ArrowLeft') this.navegacion.atras();
      else if (tecla === 'ArrowRight') this.navegacion.adelante();
      else if (tecla === 'ArrowUp') this.navegacion.subir();
      else return;
      return hecho();
    }
    if (ctrl) {
      const clave = tecla.toLowerCase();
      if (clave === 'a') this.estado.seleccionarTodo();
      else if (clave === 'c') this.estado.copiar();
      else if (clave === 'x') this.estado.cortar();
      else if (clave === 'v') this.estado.pegar();
      else if (clave === 'f') this.barraDireccion().enfocarBusqueda();
      else if (clave === 'n' && evento.shiftKey) this.estado.nuevaCarpeta();
      else return;
      return hecho();
    }
    switch (tecla) {
      case 'Enter':
        this.estado.abrirSeleccion();
        break;
      case 'Delete':
        this.estado.eliminar();
        break;
      case 'F2':
        this.estado.empezarRenombre();
        break;
      case 'F3':
        this.barraDireccion().enfocarBusqueda();
        break;
      case 'F5':
        this.estado.recargar();
        break;
      case 'Backspace':
        this.navegacion.atras();
        break;
      case 'Escape':
        if (this.estado.seleccion().size > 0) this.estado.limpiarSeleccion();
        else this.estado.portapapeles.vaciar();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
        this.estado.moverFoco(tecla, evento.shiftKey);
        break;
      default:
        return;
    }
    hecho();
  }

  alClicFondo(evento: MouseEvent) {
    if ((evento.target as HTMLElement).closest('button, input, a')) return;
    this.estado.limpiarSeleccion();
  }

  // --- Menú contextual ---

  menuFondo(evento: MouseEvent) {
    evento.preventDefault();
    this.estado.limpiarSeleccion();
    this.abrirMenu(evento, null);
  }

  private abrirMenu(evento: MouseEvent, elemento: Elemento | null) {
    this.opcionesMenu.set(elemento ? this.opcionesElemento() : this.opcionesFondo());
    this.menu().show(evento);
  }

  private opcionesElemento(): MenuItem[] {
    const estado = this.estado;
    const acciones = estado.acciones;
    const seleccion = estado.seleccionados();
    const unico = estado.unico();
    const portapapeles = estado.portapapeles.contenido();
    const fijado = unico ? estado.espacios.idsFavoritos().has(unico.id) : false;
    const items: MenuItem[] = [];
    if (unico) {
      items.push({ label: 'Abrir', icon: 'pi pi-folder-open', styleClass: 'dc-principal', command: () => estado.abrir(unico) }, { separator: true });
    }
    items.push(
      { label: 'Cortar', icon: 'pi pi-clipboard', command: () => estado.cortar() },
      { label: 'Copiar', icon: 'pi pi-copy', command: () => estado.copiar() },
    );
    if (unico?.tipo === 'CARPETA' && portapapeles) {
      items.push({ label: 'Pegar dentro', icon: 'pi pi-file-import', command: () => estado.pegar(unico) });
    }
    items.push({ separator: true });
    if (unico) {
      items.push(
        { label: 'Cambiar nombre', icon: 'pi pi-pencil', command: () => estado.empezarRenombre() },
        { label: 'Color', icon: 'pi pi-palette', command: () => acciones.cambiarColor(unico) },
      );
      if (unico.tipo === 'CARPETA') {
        items.push({
          label: fijado ? 'Quitar de Accesos rápidos' : 'Fijar en Accesos rápidos',
          icon: fijado ? 'pi pi-minus-circle' : 'pi pi-thumbtack',
          command: () => acciones.alternarFijado(unico),
        });
      } else {
        items.push({ label: 'Versiones', icon: 'pi pi-history', command: () => acciones.versiones(unico) });
      }
    }
    items.push({
      label: unico?.tipo === 'CARPETA' ? 'Descargar como ZIP' : 'Descargar',
      icon: 'pi pi-download',
      command: () => estado.descargar(),
    });
    if (seleccion.some((e) => e.sinVer)) {
      items.push({ label: 'Marcar como visto', icon: 'pi pi-eye', command: () => acciones.marcarVisto(seleccion) });
    }
    if (unico?.propuestaPendiente) {
      items.push({ label: 'Ver votación', icon: 'pi pi-hourglass', command: () => estado.verVotacion(unico) });
    }
    items.push(
      { separator: true },
      { label: estado.compartido() ? 'Proponer eliminar' : 'Eliminar', icon: 'pi pi-trash', command: () => estado.eliminar() },
      { separator: true },
      { label: 'Propiedades', icon: 'pi pi-info-circle', command: () => estado.detallesVisible() || estado.alternarDetalles() },
    );
    return items;
  }

  private opcionesFondo(): MenuItem[] {
    const estado = this.estado;
    const carpeta = estado.carpeta();
    const orden = estado.orden();
    const puedeCrear = !!carpeta && !estado.buscando();
    const fijado = carpeta ? estado.espacios.idsFavoritos().has(carpeta.id) : false;
    const marca = (activo: boolean) => (activo ? 'pi pi-check' : 'pi pi-fw');
    const items: MenuItem[] = [
      {
        label: 'Ver',
        icon: 'pi pi-eye',
        items: [
          { label: 'Lista', icon: marca(estado.vista() === 'lista'), command: () => estado.cambiarVista('lista') },
          { label: 'Cuadrícula', icon: marca(estado.vista() === 'cuadricula'), command: () => estado.cambiarVista('cuadricula') },
        ],
      },
      {
        label: 'Ordenar por',
        icon: 'pi pi-sort-alt',
        items: [
          ...(Object.keys(NOMBRES_ORDEN) as CampoOrden[]).map((campo) => ({
            label: NOMBRES_ORDEN[campo],
            icon: marca(orden.campo === campo),
            command: () => estado.ordenarPor(campo, orden.asc),
          })),
          { separator: true },
          { label: 'Ascendente', icon: marca(orden.asc), command: () => estado.ordenarPor(orden.campo, true) },
          { label: 'Descendente', icon: marca(!orden.asc), command: () => estado.ordenarPor(orden.campo, false) },
        ],
      },
      { label: 'Actualizar', icon: 'pi pi-refresh', command: () => estado.recargar() },
      { separator: true },
      { label: 'Pegar', icon: 'pi pi-file-import', disabled: !puedeCrear || !estado.portapapeles.contenido(), command: () => estado.pegar() },
      {
        label: 'Nuevo',
        icon: 'pi pi-plus-circle',
        disabled: !puedeCrear,
        items: [
          { label: 'Carpeta', icon: 'pi pi-folder-plus', command: () => estado.nuevaCarpeta() },
          { label: 'Documento de texto', icon: 'pi pi-file-edit', command: () => estado.nuevoDocumento() },
        ],
      },
      { label: 'Subir archivos', icon: 'pi pi-upload', disabled: !carpeta, command: () => this.elegirArchivos() },
      { label: 'Subir carpeta', icon: 'pi pi-folder-open', disabled: !carpeta, command: () => this.elegirCarpeta() },
      { separator: true },
    ];
    if (carpeta && !carpeta.esRaiz) {
      items.push({
        label: fijado ? 'Quitar de Accesos rápidos' : 'Fijar en Accesos rápidos',
        icon: fijado ? 'pi pi-minus-circle' : 'pi pi-thumbtack',
        command: () => estado.acciones.alternarFijado(carpeta),
      });
    }
    items.push(
      { label: 'Descargar carpeta (ZIP)', icon: 'pi pi-download', disabled: !carpeta, command: () => carpeta && estado.acciones.descargar([carpeta]) },
      { label: 'Propiedades', icon: 'pi pi-info-circle', command: () => estado.detallesVisible() || estado.alternarDetalles() },
    );
    return items;
  }
}
