import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { ContextMenu } from 'primeng/contextmenu';
import { Tooltip } from 'primeng/tooltip';
import { AccionesService, descargarUrl } from '../core/acciones.service';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { EspaciosService } from '../core/espacios.service';
import { EventosService } from '../core/eventos.service';
import { InvitacionRecibida } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { Notificar } from '../core/notificar.service';
import { ArrastreService } from '../core/portapapeles.service';
import { SesionService } from '../core/sesion.service';
import { MenuArbol, NodoArbol, NodoCarpeta, esElemento } from './nodo-arbol';

@Component({
  selector: 'dc-barra-lateral',
  imports: [NodoArbol, CdkDropList, CdkDrag, RouterLink, RouterLinkActive, Button, ContextMenu, Tooltip],
  providers: [MenuArbol],
  templateUrl: './barra-lateral.html',
  styleUrl: './barra-lateral.scss',
})
export class BarraLateral {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);
  private readonly acciones = inject(AccionesService);
  private readonly dialogos = inject(DialogosService);
  private readonly eventos = inject(EventosService);
  private readonly notificar = inject(Notificar);
  private readonly arrastre = inject(ArrastreService);
  private readonly navegacion = inject(NavegacionService);
  readonly espacios = inject(EspaciosService);

  private readonly menu = viewChild.required<ContextMenu>('menu');
  readonly opcionesMenu = signal<MenuItem[]>([]);
  readonly papeleraEncima = signal(false);
  readonly respondiendo = signal<number | null>(null);

  readonly miEspacio = computed<NodoCarpeta | null>(() => {
    const usuario = this.sesion.usuario();
    return usuario ? { id: usuario.raizId, nombre: 'Mi espacio', espacioId: usuario.espacioId, tieneSubcarpetas: true } : null;
  });

  readonly compartidos = computed(() =>
    this.espacios.compartidos().map((espacio) => ({
      espacio,
      nodo: { id: espacio.raizId, nombre: espacio.nombre, espacioId: espacio.id, sinVer: espacio.sinVer } satisfies NodoCarpeta,
    })),
  );

  constructor() {
    inject(MenuArbol).abrir = (evento, nodo) => this.abrirMenu(evento, nodo);
  }

  private abrirMenu(evento: MouseEvent, nodo: NodoCarpeta) {
    const espacio = this.espacios.compartidos().find((e) => e.raizId === nodo.id);
    const opciones: MenuItem[] = [{ label: 'Abrir', icon: 'pi pi-folder-open', command: () => this.navegacion.abrir(nodo.id) }];
    if (espacio) {
      opciones.push(
        { label: 'Miembros y votaciones', icon: 'pi pi-users', command: () => this.router.navigate(['/espacios', espacio.id]) },
        { label: 'Papelera del espacio', icon: 'pi pi-trash', command: () => this.router.navigate(['/espacios', espacio.id, 'papelera']) },
      );
    }
    if (esElemento(nodo)) {
      const fijado = this.espacios.idsFavoritos().has(nodo.id);
      opciones.push(
        { separator: true },
        {
          label: fijado ? 'Quitar de Accesos rápidos' : 'Fijar en Accesos rápidos',
          icon: fijado ? 'pi pi-minus-circle' : 'pi pi-thumbtack',
          command: () => this.acciones.alternarFijado(nodo),
        },
        { label: 'Cambiar nombre', icon: 'pi pi-pencil', command: () => this.acciones.renombrar(nodo) },
        { label: 'Color', icon: 'pi pi-palette', command: () => this.acciones.cambiarColor(nodo) },
        { label: 'Descargar como ZIP', icon: 'pi pi-download', command: () => this.acciones.descargar([nodo]) },
        { separator: true },
        {
          label: this.espacios.esCompartido(nodo.espacioId) ? 'Proponer eliminar' : 'Eliminar',
          icon: 'pi pi-trash',
          command: () => this.acciones.eliminar([nodo]),
        },
      );
    } else {
      opciones.push({ label: 'Descargar como ZIP', icon: 'pi pi-download', command: () => descargarUrl(this.api.urlZip(nodo.id)) });
    }
    this.opcionesMenu.set(opciones);
    this.menu().show(evento);
  }

  async soltarAcceso(evento: CdkDragDrop<unknown>) {
    if (evento.previousIndex === evento.currentIndex) return;
    const ids = this.espacios.favoritos().map((f) => f.id);
    moveItemInArray(ids, evento.previousIndex, evento.currentIndex);
    try {
      await this.espacios.reordenar(ids);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  nuevoEspacio() {
    this.dialogos.texto.abrir({
      titulo: 'Nuevo espacio compartido',
      etiqueta: 'Nombre del espacio',
      boton: 'Crear',
      aceptar: async (nombre) => {
        const { espacio } = await this.api.crearEspacio(nombre);
        this.eventos.avisar('espacios');
        this.router.navigate(['/espacios', espacio.id]);
      },
    });
  }

  async responder(invitacion: InvitacionRecibida, aceptar: boolean) {
    this.respondiendo.set(invitacion.id);
    try {
      if (aceptar) {
        const { espacio } = await this.api.aceptarInvitacion(invitacion.id);
        this.notificar.exito(`Te uniste a "${espacio.nombre}"`);
        this.navegacion.abrir(espacio.raizId);
      } else {
        await this.api.rechazarInvitacion(invitacion.id);
      }
      this.eventos.avisar('espacios', 'avisos');
    } catch (error) {
      this.notificar.error(error);
      this.eventos.avisar('avisos');
    } finally {
      this.respondiendo.set(null);
    }
  }

  // Soltar sobre la Papelera envía ahí lo arrastrado (o propone eliminarlo en un espacio compartido).
  papeleraDragOver(evento: DragEvent) {
    if (!this.arrastre.arrastrando()) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    this.papeleraEncima.set(true);
  }

  papeleraDrop(evento: DragEvent) {
    evento.preventDefault();
    this.papeleraEncima.set(false);
    const arrastrado = this.arrastre.arrastrando();
    this.arrastre.terminar();
    if (arrastrado) this.acciones.eliminar(arrastrado.elementos);
  }
}
