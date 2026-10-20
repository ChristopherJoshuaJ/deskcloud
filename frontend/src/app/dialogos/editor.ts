import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { esCodigo, mensajeDe } from '../core/errores';
import { ResumenVersion } from '../core/modelos';
import { Notificar } from '../core/notificar.service';

@Component({
  selector: 'dc-editor',
  imports: [FormsModule, Dialog, Button],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      [visible]="!!elemento()"
      (visibleChange)="!$event && cerrar()"
      [modal]="true"
      [draggable]="false"
      [closeOnEscape]="false"
      [showHeader]="false"
      [style]="{ width: '88vw', height: '86vh' }"
      [contentStyle]="{ padding: 0, height: '100%', display: 'flex', 'flex-direction': 'column' }"
      (keydown.control.s)="$event.preventDefault(); guardar()"
      (keydown.meta.s)="$event.preventDefault(); guardar()"
      (keydown.escape)="cerrar()"
      (onShow)="enfocar()"
    >
      @if (elemento(); as e) {
        <header>
          <i class="pi pi-file-edit"></i>
          <span class="nombre">{{ e.nombre }}</span>
          @if (sinGuardar()) {
            <span class="cambios" title="Cambios sin guardar">●</span>
          }
          @if (version(); as v) {
            <span class="dc-mono dc-secundario">v{{ v.numero }}</span>
          }
          <span class="espacio"></span>
          <span class="dc-secundario atajo">Ctrl+S para guardar</span>
          <p-button label="Guardar" icon="pi pi-save" size="small" [loading]="guardando()" [disabled]="!sinGuardar() || cargando()" (onClick)="guardar()" />
          <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="secondary" ariaLabel="Cerrar" (onClick)="cerrar()" />
        </header>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        <textarea #area class="area dc-mono" spellcheck="false" [disabled]="cargando()" [(ngModel)]="texto" [placeholder]="cargando() ? 'Cargando…' : ''"></textarea>
      }
    </p-dialog>
  `,
  styles: `
    header { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 16px; border-bottom: 1px solid var(--dc-divisor); flex: none;
      > .pi { color: var(--dc-texto); } }
    .nombre { color: var(--dc-texto-destacado); font-weight: 600; }
    .cambios { color: var(--dc-aviso); font-size: 12px; }
    .espacio { flex: 1; }
    .atajo { font-size: 12px; }
    .error { margin: 0; padding: 8px 16px; background: rgba(224, 87, 87, 0.12); color: var(--dc-peligro); font-size: 13px; }
    .area { flex: 1; min-height: 0; width: 100%; resize: none; border: none; outline: none; padding: 14px 18px; tab-size: 4;
      background: var(--dc-fondo-archivos); color: var(--dc-texto-destacado); line-height: 1.55; font-size: 13.5px; }
  `,
})
export class Editor {
  private readonly api = inject(Api);
  private readonly confirmar = inject(ConfirmationService);
  private readonly notificar = inject(Notificar);
  private readonly peticion = inject(DialogosService).editor;
  private readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');

  readonly elemento = computed(() => this.peticion.actual()?.datos ?? null);
  readonly texto = signal('');
  private readonly original = signal('');
  readonly version = signal<ResumenVersion | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly sinGuardar = computed(() => this.texto() !== this.original());

  constructor() {
    effect(() => {
      const e = this.elemento();
      this.texto.set('');
      this.original.set('');
      this.version.set(null);
      this.error.set(null);
      if (e) this.cargar(e.id);
    });
  }

  private async cargar(id: number) {
    this.cargando.set(true);
    try {
      const { texto, version } = await this.api.leerTexto(id);
      this.texto.set(texto);
      this.original.set(texto);
      this.version.set(version);
    } catch (error) {
      this.error.set(mensajeDe(error));
    } finally {
      this.cargando.set(false);
      setTimeout(() => this.enfocar());
    }
  }

  enfocar() {
    this.area()?.nativeElement.focus();
  }

  async guardar(sobrescribir = false) {
    const e = this.elemento();
    const version = this.version();
    if (!e || !version || this.guardando() || (!this.sinGuardar() && !sobrescribir)) return;
    this.guardando.set(true);
    this.error.set(null);
    const texto = this.texto();
    try {
      const resultado = await this.api.guardarTexto(e.id, texto, sobrescribir ? '*' : version.sha256);
      this.original.set(texto);
      this.version.set(resultado.version);
      if (resultado.accion === 'guardado') this.notificar.exito(`Guardado como versión ${resultado.version.numero}`);
    } catch (error) {
      if (esCodigo(error, 'VERSION_DESACTUALIZADA')) {
        this.confirmar.confirm({
          header: 'Hay una versión más nueva',
          message: 'Otra persona (u otra pestaña) guardó este archivo mientras lo editabas. Si guardas igual, tu texto será la versión nueva; la otra queda en el historial de versiones.',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'Guardar igual',
          rejectLabel: 'Cancelar',
          rejectButtonProps: { severity: 'secondary', text: true },
          accept: () => this.guardar(true),
        });
      } else {
        this.error.set(mensajeDe(error));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  cerrar() {
    if (!this.elemento()) return;
    if (!this.sinGuardar()) {
      this.peticion.responder();
      return;
    }
    this.confirmar.confirm({
      header: 'Cambios sin guardar',
      message: '¿Cerrar el editor y descartar los cambios?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Descartar',
      rejectLabel: 'Seguir editando',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: () => this.peticion.responder(),
    });
  }
}
