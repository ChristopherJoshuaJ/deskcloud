import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Button } from 'primeng/button';
import { Api } from '../core/api.service';
import { FechaPipe, TamanoPipe, iconoDe, tipoLegible } from '../core/formato';
import { Detalles, Elemento } from '../core/modelos';
import { NOMBRE_PROPUESTA } from '../core/textos';
import { ExploradorEstado } from './explorador-estado';

@Component({
  selector: 'dc-panel-detalles',
  imports: [Button, FechaPipe, TamanoPipe],
  templateUrl: './panel-detalles.html',
  styleUrl: './panel-detalles.scss',
})
export class PanelDetalles {
  private readonly api = inject(Api);
  readonly estado = inject(ExploradorEstado);
  readonly tipoLegible = tipoLegible;
  readonly iconoDe = iconoDe;
  readonly nombrePropuesta = NOMBRE_PROPUESTA;

  // Sin selección se muestran los datos de la carpeta abierta.
  readonly objetivo = computed<Elemento | null>(() => {
    const seleccion = this.estado.seleccionados();
    if (seleccion.length === 1) return seleccion[0];
    return seleccion.length === 0 ? this.estado.carpeta() : null;
  });
  readonly varios = computed(() => this.estado.seleccionados().length > 1);
  readonly resumenSeleccion = computed(() => {
    const lista = this.estado.seleccionados();
    const carpetas = lista.filter((e) => e.tipo === 'CARPETA').length;
    return { carpetas, archivos: lista.length - carpetas };
  });
  readonly detalles = signal<Detalles | null>(null);
  readonly ubicacion = computed(() => {
    const ruta = this.detalles()?.ruta ?? [];
    return ruta
      .slice(0, -1)
      .map((p) => p.nombre)
      .join(' / ');
  });
  readonly urlVista = computed(() => {
    const e = this.objetivo();
    return e && e.tipo === 'ARCHIVO' && e.tipoVista ? this.api.urlVista(e.id) : null;
  });

  private espera: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const e = this.objetivo();
      const clave = e ? `${e.id}:${e.modificadoEn}:${e.elementos}` : null;
      if (this.espera) clearTimeout(this.espera);
      if (!clave || !e) {
        this.detalles.set(null);
        return;
      }
      if (untracked(this.detalles)?.elemento.id !== e.id) this.detalles.set(null);
      // Espera un poco para no pedir detalles por cada fila al moverse con las flechas.
      this.espera = setTimeout(() => this.cargar(e.id), 180);
    });
  }

  private async cargar(id: number) {
    try {
      const detalles = await this.api.detalles(id);
      if (this.objetivo()?.id === id) this.detalles.set(detalles);
    } catch {
      this.detalles.set(null);
    }
  }
}
