import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { Api } from '../core/api.service';
import { EspaciosService } from '../core/espacios.service';
import { EventosService } from '../core/eventos.service';
import { RelativaPipe } from '../core/formato';
import { Aviso } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { Notificar } from '../core/notificar.service';
import { textoAviso } from '../core/textos';

@Component({
  selector: 'dc-avisos',
  imports: [Button, Popover, RelativaPipe],
  templateUrl: './avisos.html',
  styleUrl: './avisos.scss',
})
export class Avisos {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly eventos = inject(EventosService);
  private readonly navegacion = inject(NavegacionService);
  private readonly notificar = inject(Notificar);
  readonly espacios = inject(EspaciosService);

  private readonly panel = viewChild.required<Popover>('panel');
  readonly avisos = signal<Aviso[] | null>(null);
  readonly noLeidos = computed(() => this.espacios.resumen().noLeidos);
  readonly invitacionesPendientes = computed(() => new Set(this.espacios.invitaciones().map((i) => i.id)));
  readonly texto = textoAviso;

  abrir(evento: Event) {
    this.panel().toggle(evento);
  }

  async alMostrar() {
    try {
      this.avisos.set((await this.api.avisos()).avisos);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  // Al cerrar el panel lo mostrado queda como leído.
  async alOcultar() {
    if (this.noLeidos() === 0) return;
    try {
      await this.api.marcarAvisosLeidos();
      this.eventos.avisar('avisos');
    } catch {}
  }

  async ir(aviso: Aviso) {
    const datos = aviso.datos;
    if (aviso.tipo === 'COLOR_PARA_TODOS' && datos['nodoId']) {
      this.panel().hide();
      try {
        const { elemento } = await this.api.detalles(datos['nodoId']);
        if (elemento.padreId) this.router.navigate(['/carpeta', elemento.padreId], { queryParams: { sel: elemento.id } });
      } catch (error) {
        this.notificar.error(error, 'Ese elemento ya no está disponible');
      }
      return;
    }
    if (aviso.tipo === 'INVITACION' || aviso.tipo === 'EXPULSADO' || !aviso.espacioId) return;
    this.panel().hide();
    this.router.navigate(['/espacios', aviso.espacioId]);
  }

  async responder(aviso: Aviso, aceptar: boolean, evento: Event) {
    evento.stopPropagation();
    const id = aviso.datos['invitacionId'];
    try {
      if (aceptar) {
        const { espacio } = await this.api.aceptarInvitacion(id);
        this.panel().hide();
        this.notificar.exito(`Te uniste a "${espacio.nombre}"`);
        this.navegacion.abrir(espacio.raizId);
      } else {
        await this.api.rechazarInvitacion(id);
      }
    } catch (error) {
      this.notificar.error(error);
    }
    this.eventos.avisar('espacios', 'avisos');
  }
}
