import { Component, computed, inject } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';
import { soltadoDesdeEquipo } from '../core/archivos-locales';
import { FechaPipe, TamanoPipe, tipoLegible } from '../core/formato';
import { Elemento } from '../core/modelos';
import { CampoOrden, ExploradorEstado } from './explorador-estado';
import { IconoElemento, Insignias, Renombrar } from './partes-elemento';

@Component({
  selector: 'dc-lista',
  imports: [Tooltip, FechaPipe, TamanoPipe, IconoElemento, Insignias, Renombrar],
  templateUrl: './lista.html',
  styleUrl: './lista.scss',
})
export class Lista {
  readonly estado = inject(ExploradorEstado);
  readonly tipoLegible = tipoLegible;
  readonly leer = soltadoDesdeEquipo;
  readonly columnas = computed(() =>
    this.estado.buscando() ? 'minmax(220px, 1fr) minmax(140px, 0.6fr) 150px 140px 150px' : 'minmax(220px, 1fr) 160px 160px 150px',
  );
  readonly grupos = computed(() => [
    { tipo: 'CARPETA' as const, titulo: 'Carpetas', elementos: this.estado.carpetas() },
    { tipo: 'ARCHIVO' as const, titulo: 'Archivos', elementos: this.estado.archivos() },
  ]);

  flecha(campo: CampoOrden) {
    const orden = this.estado.orden();
    return orden.campo === campo ? (orden.asc ? 'pi pi-angle-up' : 'pi pi-angle-down') : '';
  }

  menu(evento: MouseEvent, elemento: Elemento) {
    evento.preventDefault();
    evento.stopPropagation();
    if (!this.estado.seleccion().has(elemento.id)) this.estado.seleccionarSolo(elemento.id);
    this.estado.abrirMenu(evento, elemento);
  }
}
