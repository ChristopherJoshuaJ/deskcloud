import { Component, computed, inject, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { ProgressBar } from 'primeng/progressbar';
import { Tooltip } from 'primeng/tooltip';
import { TamanoPipe } from '../core/formato';
import { SubidasService } from '../core/subidas.service';

@Component({
  selector: 'dc-panel-subidas',
  imports: [Button, ProgressBar, Tooltip, TamanoPipe],
  template: `
    @if (subidas.tareas().length > 0) {
      <section class="panel" [class.plegado]="plegado()">
        <header>
          <i class="pi" [class.pi-cloud-upload]="activas() > 0" [class.pi-check-circle]="activas() === 0"></i>
          <span class="resumen">{{ resumen() }}</span>
          <p-button [icon]="plegado() ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" [text]="true" [rounded]="true" size="small" severity="secondary" ariaLabel="Plegar" (onClick)="plegado.set(!plegado())" />
          @if (activas() > 0) {
            <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary" pTooltip="Cancelar todo" ariaLabel="Cancelar todo" (onClick)="subidas.cancelarTodo()" />
          } @else {
            <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary" pTooltip="Cerrar" ariaLabel="Cerrar" (onClick)="subidas.limpiarTerminadas()" />
          }
        </header>
        <p-progressbar [value]="subidas.progreso()" [showValue]="false" styleClass="barra" />
        @if (!plegado()) {
          <ul>
            @for (tarea of subidas.tareas(); track tarea.id) {
              <li [class]="tarea.estado">
                <i class="pi" [class]="iconos[tarea.estado]"></i>
                <div class="texto">
                  <span class="nombre" [title]="tarea.ruta">{{ tarea.ruta }}</span>
                  <span class="estado">
                    @switch (tarea.estado) {
                      @case ('subiendo') { {{ tarea.enviado | tamano }} de {{ tarea.tamano | tamano }} }
                      @case ('esperando') { En espera · {{ tarea.tamano | tamano }} }
                      @case ('listo') { Subido · {{ tarea.tamano | tamano }} }
                      @case ('omitido') { Omitido: ya existía }
                      @case ('cancelado') { Cancelado }
                      @case ('error') { {{ tarea.error }} }
                    }
                  </span>
                </div>
                @if (tarea.estado === 'esperando' || tarea.estado === 'subiendo') {
                  <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary" ariaLabel="Cancelar" (onClick)="subidas.cancelar(tarea.id)" />
                }
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styleUrl: './panel-subidas.scss',
})
export class PanelSubidas {
  readonly subidas = inject(SubidasService);
  readonly plegado = signal(false);
  readonly activas = computed(() => this.subidas.activas().length);
  readonly iconos: Record<string, string> = {
    esperando: 'pi-clock',
    subiendo: 'pi-spin pi-spinner',
    listo: 'pi-check',
    omitido: 'pi-minus-circle',
    cancelado: 'pi-ban',
    error: 'pi-exclamation-triangle',
  };

  readonly resumen = computed(() => {
    const tareas = this.subidas.tareas();
    const activas = this.activas();
    if (activas > 0) return `Subiendo ${tareas.length - activas + 1} de ${tareas.length} · ${this.subidas.progreso()} %`;
    const errores = tareas.filter((t) => t.estado === 'error').length;
    const listas = tareas.filter((t) => t.estado === 'listo').length;
    return errores > 0 ? `${listas} subidos, ${errores} con error` : `${listas} ${listas === 1 ? 'archivo subido' : 'archivos subidos'}`;
  });
}
