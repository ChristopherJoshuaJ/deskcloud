import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { mensajeDe } from '../core/errores';
import { EspaciosService } from '../core/espacios.service';
import { ColorPredeterminado } from '../core/modelos';

@Component({
  selector: 'dc-dialogo-color',
  imports: [FormsModule, Dialog, Button, Checkbox, InputText, Textarea],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      header="Color"
      [visible]="!!elemento()"
      (visibleChange)="!$event && cancelar()"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '440px' }"
    >
      @if (elemento(); as e) {
        <p class="nombre"><i class="pi" [class.pi-folder]="e.tipo === 'CARPETA'" [class.pi-file]="e.tipo === 'ARCHIVO'" [style.color]="elegido() ?? null"></i> {{ e.nombre }}</p>

        <div class="paleta" role="radiogroup" aria-label="Colores">
          @for (c of predeterminados(); track c.valor) {
            <button type="button" class="muestra" role="radio" [attr.aria-checked]="elegido() === c.valor" [class.elegida]="elegido() === c.valor" [style.background]="c.valor" [title]="c.nombre" (click)="elegido.set(c.valor)"></button>
          }
          <label class="muestra personalizada" [class.elegida]="esPersonalizado()" title="Otro color" [style.background]="esPersonalizado() ? elegido() : null">
            <i class="pi pi-plus"></i>
            <input type="color" [value]="elegido() ?? '#4668a1'" (input)="elegido.set($any($event.target).value)" />
          </label>
          <button type="button" class="muestra sin-color" role="radio" [attr.aria-checked]="elegido() === null" [class.elegida]="elegido() === null" title="Sin color" (click)="elegido.set(null)">
            <i class="pi pi-ban"></i>
          </button>
        </div>

        <div class="codigo">
          <label for="dc-color-codigo">Código</label>
          <input pInputText id="dc-color-codigo" class="dc-mono" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#4668a1" [value]="elegido() ?? ''" (input)="escribirCodigo($any($event.target).value)" />
        </div>

        @if (compartido()) {
          @if (e.notaColor) {
            <p class="nota-actual">
              <i class="pi pi-comment"></i>
              <span>"{{ e.notaColor.texto }}" — {{ e.notaColor.autor?.nombre ?? 'alguien' }}</span>
            </p>
          }
          <label class="para-todos">
            <p-checkbox [binary]="true" [(ngModel)]="paraTodos" inputId="dc-para-todos" />
            <span>Cambiar el color para todos</span>
          </label>
          @if (paraTodos()) {
            <div class="dc-campo">
              <label for="dc-nota">Nota para los demás (obligatoria)</label>
              <textarea pTextarea id="dc-nota" rows="2" maxlength="300" [(ngModel)]="nota" placeholder="Por ejemplo: en rojo lo que falta revisar"></textarea>
            </div>
          } @else {
            <p class="ayuda dc-secundario">{{ ayudaCompartido() }}</p>
          }
        }

        @if (error()) {
          <p class="dc-error-campo">{{ error() }}</p>
        }
        <div class="dc-acciones-dialogo">
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="cancelar()" />
          <p-button label="Aplicar" [loading]="enviando()" [disabled]="paraTodos() && !nota().trim()" (onClick)="aplicar()" />
        </div>
      }
    </p-dialog>
  `,
  styles: `
    .nombre { margin: 0 0 14px; color: var(--dc-texto-destacado); .pi { color: var(--dc-carpeta); margin-right: 6px; } }
    .paleta { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .muestra { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0;
      display: grid; place-items: center; outline: none; box-shadow: 0 0 0 1px var(--dc-borde);
      &.elegida { border-color: var(--dc-texto-destacado); box-shadow: 0 0 0 2px var(--dc-fondo-barras), 0 0 0 4px var(--dc-texto-destacado); }
      &:focus-visible { box-shadow: 0 0 0 2px var(--dc-boton-activo); } }
    .personalizada { position: relative; background: var(--dc-fondo-campos); color: var(--dc-texto-secundario); overflow: hidden;
      input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } }
    .sin-color { background: var(--dc-fondo-campos); color: var(--dc-texto-secundario); }
    .codigo { display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
      label { font-size: 13px; color: var(--dc-texto-secundario); }
      input { width: 110px; } }
    .nota-actual { display: flex; gap: 8px; font-size: 13px; color: var(--dc-texto-secundario); font-style: italic; margin: 0 0 12px; }
    .para-todos { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: pointer; }
    .ayuda { font-size: 12.5px; margin: 0 0 8px; line-height: 1.4; }
    textarea { width: 100%; resize: vertical; }
  `,
})
export class DialogoColor {
  private readonly api = inject(Api);
  private readonly espacios = inject(EspaciosService);
  private readonly peticion = inject(DialogosService).color;

  readonly elemento = computed(() => this.peticion.actual()?.datos ?? null);
  readonly compartido = computed(() => this.espacios.esCompartido(this.elemento()?.espacioId));
  readonly predeterminados = signal<ColorPredeterminado[]>([]);
  readonly elegido = signal<string | null>(null);
  readonly paraTodos = signal(false);
  readonly nota = signal('');
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  readonly esPersonalizado = computed(() => {
    const color = this.elegido();
    return color !== null && !this.predeterminados().some((c) => c.valor === color);
  });

  readonly ayudaCompartido = computed(() => {
    const e = this.elemento();
    if (!e) return '';
    if (e.colorEsPersonal) return 'Este color solo lo ves tú. "Sin color" vuelve al color del grupo.';
    if (e.color === null) return 'Será el color del grupo: lo verán todos los miembros.';
    return 'El color que elijas solo lo verás tú; los demás seguirán viendo el del grupo.';
  });

  constructor() {
    effect(() => {
      const e = this.elemento();
      this.elegido.set(e?.color ?? null);
      this.paraTodos.set(false);
      this.nota.set('');
      this.error.set(null);
      if (e && untracked(this.predeterminados).length === 0) this.cargarPredeterminados();
    });
  }

  private async cargarPredeterminados() {
    try {
      this.predeterminados.set((await this.api.colores()).predeterminados);
    } catch {}
  }

  async aplicar() {
    const e = this.elemento();
    if (!e || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      const { elemento } = await this.api.cambiarColor(
        e.id,
        this.paraTodos() ? { color: this.elegido(), paraTodos: true, nota: this.nota().trim() } : { color: this.elegido() },
      );
      this.peticion.responder(elemento);
    } catch (error) {
      this.error.set(mensajeDe(error));
    } finally {
      this.enviando.set(false);
    }
  }

  escribirCodigo(texto: string) {
    const codigo = texto.trim().replace(/^#?/, '#').toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(codigo)) this.elegido.set(codigo);
  }

  cancelar() {
    if (this.elemento()) this.peticion.cancelar();
  }
}
