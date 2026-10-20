import { Component, computed, effect, inject, signal } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { descargarUrl } from '../core/acciones.service';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { mensajeDe } from '../core/errores';
import { EspaciosService } from '../core/espacios.service';
import { FechaPipe, TamanoPipe } from '../core/formato';
import { Version } from '../core/modelos';
import { Notificar } from '../core/notificar.service';

@Component({
  selector: 'dc-dialogo-versiones',
  imports: [Dialog, Button, Tag, Tooltip, FechaPipe, TamanoPipe],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      [header]="'Versiones de ' + (elemento()?.nombre ?? '')"
      [visible]="!!elemento()"
      (visibleChange)="!$event && cerrar()"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '640px' }"
    >
      <p class="ayuda dc-secundario">
        Cada vez que se sube o se guarda el archivo queda una versión. Restaurar crea una versión nueva con ese contenido: no se pierde nada.
        @if (compartido()) {
          En un espacio compartido las versiones anteriores no se eliminan.
        }
      </p>
      @if (error()) {
        <p class="dc-error-campo">{{ error() }}</p>
      }
      <ul class="dc-lista-simple">
        @for (v of versiones(); track v.id) {
          <li>
            <span class="numero dc-mono">v{{ v.numero }}</span>
            <div class="info">
              <span>
                {{ v.creadoEn | fecha }}
                @if (v.esActual) {
                  <p-tag value="Actual" severity="info" />
                }
              </span>
              <span class="dc-secundario detalle">
                {{ v.autor?.nombre ?? 'Cuenta eliminada' }} · <span class="dc-mono">{{ v.tamano | tamano }}</span>
                @if (v.restauradaDe) {
                  · restaurada de v{{ v.restauradaDe }}
                }
              </span>
            </div>
            @if (v.tipoVista) {
              <p-button icon="pi pi-eye" [text]="true" [rounded]="true" severity="secondary" pTooltip="Ver" ariaLabel="Ver" (onClick)="ver(v)" />
            }
            <p-button icon="pi pi-download" [text]="true" [rounded]="true" severity="secondary" pTooltip="Descargar" ariaLabel="Descargar" (onClick)="descargar(v)" />
            @if (!v.esActual) {
              <p-button icon="pi pi-history" [text]="true" [rounded]="true" severity="secondary" pTooltip="Restaurar" ariaLabel="Restaurar" [loading]="trabajando() === v.id" (onClick)="restaurar(v)" />
              @if (!compartido()) {
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" pTooltip="Eliminar versión" ariaLabel="Eliminar versión" (onClick)="eliminar(v)" />
              }
            }
          </li>
        } @empty {
          <li class="dc-secundario"><i class="pi pi-spin pi-spinner"></i> Cargando…</li>
        }
      </ul>
    </p-dialog>
  `,
  styles: `
    .ayuda { margin: 0 0 12px; font-size: 13px; line-height: 1.45; }
    .numero { width: 40px; color: var(--dc-texto-destacado); }
    .info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;
      > span:first-child { display: flex; align-items: center; gap: 8px; } }
    .detalle { font-size: 12.5px; }
  `,
})
export class DialogoVersiones {
  private readonly api = inject(Api);
  private readonly espacios = inject(EspaciosService);
  private readonly confirmar = inject(ConfirmationService);
  private readonly notificar = inject(Notificar);
  private readonly peticion = inject(DialogosService).versiones;

  readonly elemento = computed(() => this.peticion.actual()?.datos ?? null);
  readonly compartido = computed(() => this.espacios.esCompartido(this.elemento()?.espacioId));
  readonly versiones = signal<Version[]>([]);
  readonly error = signal<string | null>(null);
  readonly trabajando = signal<number | null>(null);

  constructor() {
    effect(() => {
      const e = this.elemento();
      this.versiones.set([]);
      this.error.set(null);
      if (e) this.cargar(e.id);
    });
  }

  private async cargar(id: number) {
    try {
      this.versiones.set((await this.api.versiones(id)).versiones);
    } catch (error) {
      this.error.set(mensajeDe(error));
    }
  }

  ver(v: Version) {
    window.open(this.api.urlVista(this.elemento()!.id, v.id), '_blank', 'noopener');
  }

  descargar(v: Version) {
    descargarUrl(this.api.urlDescarga(this.elemento()!.id, v.id));
  }

  async restaurar(v: Version) {
    const e = this.elemento()!;
    this.trabajando.set(v.id);
    try {
      await this.api.restaurarVersion(e.id, v.id);
      this.notificar.exito(`Se restauró la versión ${v.numero}`);
      await this.cargar(e.id);
    } catch (error) {
      this.notificar.error(error);
    } finally {
      this.trabajando.set(null);
    }
  }

  eliminar(v: Version) {
    const e = this.elemento()!;
    this.confirmar.confirm({
      header: 'Eliminar versión',
      message: `¿Eliminar definitivamente la versión ${v.numero}? No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          this.versiones.set((await this.api.eliminarVersion(e.id, v.id)).versiones);
        } catch (error) {
          this.notificar.error(error);
        }
      },
    });
  }

  cerrar() {
    if (this.elemento()) this.peticion.responder();
  }
}
