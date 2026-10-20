import { Component, computed, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Tooltip } from 'primeng/tooltip';
import { CampoOrden, ExploradorEstado, NOMBRES_ORDEN } from './explorador-estado';

@Component({
  selector: 'dc-barra-comandos',
  imports: [Menu, Tooltip],
  templateUrl: './barra-comandos.html',
  styleUrl: './barra-comandos.scss',
})
export class BarraComandos {
  private readonly router = inject(Router);
  readonly estado = inject(ExploradorEstado);

  readonly subirArchivos = output<void>();
  readonly subirCarpeta = output<void>();

  readonly hay = computed(() => this.estado.seleccionados().length > 0);
  readonly puedeCrear = computed(() => !!this.estado.carpeta() && !this.estado.buscando());
  readonly puedePegar = computed(() => this.puedeCrear() && !!this.estado.portapapeles.contenido());

  readonly opcionesNuevo = computed<MenuItem[]>(() => [
    { label: 'Carpeta', icon: 'pi pi-folder-plus', command: () => this.estado.nuevaCarpeta() },
    { label: 'Documento de texto', icon: 'pi pi-file-edit', command: () => this.estado.nuevoDocumento() },
    { separator: true },
    { label: 'Subir archivos', icon: 'pi pi-upload', command: () => this.subirArchivos.emit() },
    { label: 'Subir carpeta', icon: 'pi pi-folder-open', command: () => this.subirCarpeta.emit() },
  ]);

  readonly opcionesOrden = computed<MenuItem[]>(() => {
    const orden = this.estado.orden();
    const marca = (activo: boolean) => (activo ? 'pi pi-check' : 'pi pi-fw');
    return [
      ...(Object.keys(NOMBRES_ORDEN) as CampoOrden[]).map((campo) => ({
        label: NOMBRES_ORDEN[campo],
        icon: marca(orden.campo === campo),
        command: () => this.estado.ordenarPor(campo, orden.asc),
      })),
      { separator: true },
      { label: 'Ascendente', icon: marca(orden.asc), command: () => this.estado.ordenarPor(orden.campo, true) },
      { label: 'Descendente', icon: marca(!orden.asc), command: () => this.estado.ordenarPor(orden.campo, false) },
    ];
  });

  readonly opcionesVista = computed<MenuItem[]>(() => [
    { label: 'Lista', icon: 'pi pi-list', styleClass: this.estado.vista() === 'lista' ? 'dc-marcado' : '', command: () => this.estado.cambiarVista('lista') },
    { label: 'Cuadrícula', icon: 'pi pi-th-large', styleClass: this.estado.vista() === 'cuadricula' ? 'dc-marcado' : '', command: () => this.estado.cambiarVista('cuadricula') },
    { separator: true },
    { label: 'Panel de detalles', icon: this.estado.detallesVisible() ? 'pi pi-check' : 'pi pi-fw', command: () => this.estado.alternarDetalles() },
  ]);

  readonly opcionesMas = computed<MenuItem[]>(() => {
    const unico = this.estado.unico();
    const carpeta = this.estado.carpeta();
    const seleccion = this.estado.seleccionados();
    const fijable = unico?.tipo === 'CARPETA' ? unico : !this.hay() && carpeta && !carpeta.esRaiz ? carpeta : null;
    const fijado = fijable ? this.estado.espacios.idsFavoritos().has(fijable.id) : false;
    const items: MenuItem[] = [
      { label: 'Seleccionar todo', icon: 'pi pi-check-square', command: () => this.estado.seleccionarTodo() },
      { label: 'No seleccionar nada', icon: 'pi pi-stop', disabled: !this.hay(), command: () => this.estado.limpiarSeleccion() },
      { label: 'Invertir selección', icon: 'pi pi-sort-alt', command: () => this.estado.invertirSeleccion() },
      { separator: true },
    ];
    if (fijable) {
      items.push({
        label: fijado ? 'Quitar de Accesos rápidos' : 'Fijar en Accesos rápidos',
        icon: fijado ? 'pi pi-minus-circle' : 'pi pi-thumbtack',
        command: () => this.estado.acciones.alternarFijado(fijable),
      });
    }
    items.push(
      { label: 'Versiones', icon: 'pi pi-history', disabled: unico?.tipo !== 'ARCHIVO', command: () => unico && this.estado.acciones.versiones(unico) },
      {
        label: 'Marcar como visto',
        icon: 'pi pi-eye',
        disabled: !(seleccion.length ? seleccion : carpeta ? [carpeta] : []).some((e) => e.sinVer) && !this.estado.todos().some((e) => e.sinVer),
        command: () => this.estado.acciones.marcarVisto(seleccion.length ? seleccion : carpeta ? [carpeta] : []),
      },
      { label: 'Descargar esta carpeta (ZIP)', icon: 'pi pi-download', disabled: !carpeta, command: () => carpeta && this.estado.acciones.descargar([carpeta]) },
    );
    return items;
  });

  irAlEspacio() {
    const espacio = this.estado.espacioCompartido();
    if (espacio) this.router.navigate(['/espacios', espacio.id]);
  }
}
