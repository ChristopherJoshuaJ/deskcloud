import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Textarea } from 'primeng/textarea';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { mensajeDe } from '../core/errores';
import { EspaciosService } from '../core/espacios.service';
import { Notificar } from '../core/notificar.service';
import { NOMBRE_PROPUESTA, VERBO_PROPUESTA } from '../core/textos';

@Component({
  selector: 'dc-dialogo-propuesta',
  imports: [FormsModule, Dialog, Button, Textarea],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      [header]="titulo()"
      [visible]="!!datos()"
      (visibleChange)="!$event && cancelar()"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '480px' }"
    >
      @if (datos(); as d) {
        <p class="explicacion">
          <i class="pi pi-users"></i>
          <span>
            En <strong>{{ nombreEspacio() }}</strong> esto se decide por votación: se hará cuando
            {{ miembros() > 2 ? 'los ' + (miembros() - 1) + ' miembros restantes voten' : miembros() === 2 ? 'el otro miembro vote' : 'se vote' }}
            a favor. Tu voto ya cuenta como sí. Si en 7 días no hay unanimidad, la propuesta vence.
          </span>
        </p>

        @if (d.todos) {
          <p class="elementos">Se propone <strong>vaciar la papelera</strong> del espacio.</p>
        } @else {
          <p class="dc-etiqueta">{{ d.elementos.length === 1 ? 'Elemento' : d.elementos.length + ' elementos' }}</p>
          <ul class="elementos">
            @for (e of d.elementos.slice(0, 8); track e.id) {
              <li><i class="pi" [class.pi-folder]="e.tipo === 'CARPETA'" [class.pi-file]="e.tipo === 'ARCHIVO'"></i> {{ e.nombre }}</li>
            }
            @if (d.elementos.length > 8) {
              <li class="dc-secundario">y {{ d.elementos.length - 8 }} más…</li>
            }
          </ul>
        }

        <form (ngSubmit)="enviar()">
          <div class="dc-campo">
            <label for="dc-motivo">Motivo (opcional, lo verán los demás)</label>
            <textarea pTextarea id="dc-motivo" name="motivo" rows="3" maxlength="500" [(ngModel)]="motivo" placeholder="Por ejemplo: está repetido en la carpeta Entregas"></textarea>
          </div>
          @if (error()) {
            <p class="dc-error-campo">{{ error() }}</p>
          }
          <div class="dc-acciones-dialogo">
            <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="cancelar()" />
            <p-button type="submit" label="Proponer" icon="pi pi-send" [loading]="enviando()" />
          </div>
        </form>
      }
    </p-dialog>
  `,
  styles: `
    .explicacion { display: flex; gap: 10px; margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; line-height: 1.45;
      background: rgba(106, 78, 160, 0.14); border: 1px solid rgba(106, 78, 160, 0.35); font-size: 13px;
      .pi { color: #b39ae0; margin-top: 3px; } strong { color: var(--dc-texto-destacado); } }
    .elementos { margin: 6px 0 14px; padding: 0; list-style: none; color: var(--dc-texto-destacado);
      li { padding: 2px 0; } .pi { color: var(--dc-carpeta); margin-right: 4px; } }
    textarea { resize: vertical; }
  `,
})
export class DialogoPropuesta {
  private readonly api = inject(Api);
  private readonly espacios = inject(EspaciosService);
  private readonly notificar = inject(Notificar);
  private readonly peticion = inject(DialogosService).propuesta;

  readonly datos = computed(() => this.peticion.actual()?.datos ?? null);
  readonly espacio = computed(() => this.espacios.espacioDe(this.datos()?.espacioId));
  readonly nombreEspacio = computed(() => this.espacio()?.nombre ?? 'este espacio');
  readonly miembros = computed(() => this.espacio()?.totalMiembros ?? 0);
  readonly titulo = computed(() => {
    const d = this.datos();
    if (!d) return '';
    return d.todos ? 'Proponer vaciar la papelera' : `Proponer: ${NOMBRE_PROPUESTA[d.tipo].toLowerCase()}`;
  });
  readonly motivo = signal('');
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  constructor() {
    effect(() => {
      this.datos();
      this.motivo.set('');
      this.error.set(null);
    });
  }

  async enviar() {
    const d = this.datos();
    if (!d || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      const motivo = this.motivo().trim() || undefined;
      const { propuesta } = await this.api.proponer(
        d.espacioId,
        d.todos ? { tipo: d.tipo, todos: true, motivo } : { tipo: d.tipo, ids: d.elementos.map((e) => e.id), motivo },
      );
      this.notificar.exito(
        propuesta.estado === 'APROBADA' ? 'Hecho' : 'Propuesta enviada',
        propuesta.estado === 'APROBADA' ? 'Eres el único miembro, así que se aplicó enseguida.' : `Los demás miembros votarán si ${VERBO_PROPUESTA[d.tipo]}.`,
      );
      this.peticion.responder(propuesta);
    } catch (error) {
      this.error.set(mensajeDe(error));
    } finally {
      this.enviando.set(false);
    }
  }

  cancelar() {
    if (this.datos()) this.peticion.cancelar();
  }
}
