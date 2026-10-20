import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { mensajeDe } from './errores';

@Injectable({ providedIn: 'root' })
export class Notificar {
  private readonly mensajes = inject(MessageService);

  exito(texto: string, detalle?: string) {
    this.mensajes.add({ severity: 'success', summary: texto, detail: detalle, life: 3500 });
  }

  info(texto: string, detalle?: string) {
    this.mensajes.add({ severity: 'info', summary: texto, detail: detalle, life: 4500 });
  }

  aviso(texto: string, detalle?: string) {
    this.mensajes.add({ severity: 'warn', summary: texto, detail: detalle, life: 6000 });
  }

  error(error: unknown, titulo = 'No se pudo completar') {
    this.mensajes.add({ severity: 'error', summary: titulo, detail: mensajeDe(error), life: 7000 });
  }
}
