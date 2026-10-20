import { Component, computed, inject } from '@angular/core';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { DialogosService } from '../core/dialogos.service';
import { PoliticaConflicto } from '../core/modelos';

// Como el diálogo "Reemplazar u omitir archivos" de Windows: una decisión para todos los repetidos.
@Component({
  selector: 'dc-dialogo-conflictos',
  imports: [Dialog, Button],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      header="Ya existen elementos con esos nombres"
      [visible]="!!datos()"
      (visibleChange)="!$event && responder(null)"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '480px' }"
    >
      @if (datos(); as d) {
        <p class="intro">
          {{ d.conflictos.length === 1 ? 'Ya hay un elemento llamado' : 'Ya hay ' + d.conflictos.length + ' elementos con el mismo nombre en el destino, por ejemplo' }}
          <strong class="dc-mono">{{ d.conflictos[0].ruta ?? d.conflictos[0].nombre }}</strong>.
        </p>
        @if (d.conflictos.length > 1) {
          <ul class="lista dc-mono">
            @for (c of d.conflictos.slice(0, 6); track $index) {
              <li>{{ c.ruta ?? c.nombre }}</li>
            }
            @if (d.conflictos.length > 6) {
              <li class="dc-secundario">y {{ d.conflictos.length - 6 }} más…</li>
            }
          </ul>
        }

        <div class="opciones">
          @if (d.permitirReemplazo) {
            <button type="button" class="opcion" (click)="responder('reemplazar')">
              <i class="pi pi-sync"></i>
              <span>
                <strong>Reemplazar</strong>
                <small>{{ d.accion === 'subir' ? 'Se guarda como versión nueva; la anterior queda en el historial.' : 'Lo existente se envía a la papelera.' }}</small>
              </span>
            </button>
          }
          <button type="button" class="opcion" (click)="responder('conservar')">
            <i class="pi pi-clone"></i>
            <span>
              <strong>Conservar ambos</strong>
              <small>Se agrega un número al nombre, por ejemplo {{ ejemplo() }}.</small>
            </span>
          </button>
          <button type="button" class="opcion" (click)="responder('omitir')">
            <i class="pi pi-forward"></i>
            <span>
              <strong>Omitir</strong>
              <small>Se deja lo que ya existe y no se {{ verbo() }} esos elementos.</small>
            </span>
          </button>
        </div>
        @if (!d.permitirReemplazo) {
          <p class="nota dc-secundario">En un espacio compartido no se puede reemplazar: eliminar lo existente necesita una votación.</p>
        }
      }
      <div class="dc-acciones-dialogo">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="responder(null)" />
      </div>
    </p-dialog>
  `,
  styles: `
    .intro { margin: 0 0 10px; line-height: 1.45; }
    .lista { margin: 0 0 12px; padding-left: 18px; color: var(--dc-texto-secundario); }
    .opciones { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 6px; }
    .opcion {
      display: flex; align-items: flex-start; gap: 12px; text-align: left; padding: 10px 12px; cursor: pointer;
      background: var(--dc-fondo-campos); border: 1px solid var(--dc-borde); border-radius: 8px; color: var(--dc-texto);
      &:hover { border-color: var(--dc-boton-activo); background: var(--dc-seleccion); }
      .pi { margin-top: 3px; color: var(--dc-texto-destacado); }
      span { display: flex; flex-direction: column; gap: 2px; }
      strong { color: var(--dc-texto-destacado); font-weight: 600; }
      small { color: var(--dc-texto-secundario); font-size: 12.5px; }
    }
    .nota { font-size: 12.5px; margin: 8px 0 0; }
  `,
})
export class DialogoConflictos {
  private readonly peticion = inject(DialogosService).conflictos;
  readonly datos = computed(() => this.peticion.actual()?.datos ?? null);
  readonly ejemplo = computed(() => this.datos()?.conflictos.find((c) => c.nombreSugerido)?.nombreSugerido ?? '"foto (2).jpg"');
  readonly verbo = computed(() => ({ subir: 'suben', mover: 'mueven', copiar: 'copian' })[this.datos()?.accion ?? 'subir']);

  responder(politica: PoliticaConflicto | null) {
    if (this.datos()) this.peticion.responder(politica);
  }
}
