import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { DialogosService } from '../core/dialogos.service';
import { mensajeDe } from '../core/errores';

@Component({
  selector: 'dc-dialogo-texto',
  imports: [FormsModule, Dialog, Button, InputText],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      [header]="datos()?.titulo"
      [visible]="!!datos()"
      (visibleChange)="!$event && cancelar()"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '420px' }"
      (onShow)="enfocar()"
    >
      <form (ngSubmit)="aceptar()">
        <div class="dc-campo">
          <label for="dc-texto">{{ datos()?.etiqueta }}</label>
          <input #campo pInputText id="dc-texto" name="valor" [type]="datos()?.tipoCampo ?? 'text'" autocomplete="off" [(ngModel)]="valor" [invalid]="!!error()" />
          @if (error()) {
            <small class="dc-error-campo">{{ error() }}</small>
          }
        </div>
        <div class="dc-acciones-dialogo">
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="cancelar()" />
          <p-button type="submit" [label]="datos()?.boton ?? 'Aceptar'" [loading]="enviando()" [disabled]="!valor().trim()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class DialogoTexto {
  private readonly peticion = inject(DialogosService).texto;
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  readonly datos = computed(() => this.peticion.actual()?.datos ?? null);
  readonly valor = signal('');
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  constructor() {
    effect(() => {
      this.valor.set(this.datos()?.valor ?? '');
      this.error.set(null);
    });
  }

  enfocar() {
    const campo = this.campo()?.nativeElement;
    if (!campo) return;
    campo.focus();
    const punto = campo.value.lastIndexOf('.');
    if (this.datos()?.seleccionarSinExtension && punto > 0) {
      campo.setSelectionRange(0, punto);
    } else {
      campo.select();
    }
  }

  async aceptar() {
    const datos = this.datos();
    const valor = this.valor().trim();
    if (!datos || !valor || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      await datos.aceptar(valor);
      this.peticion.responder(true);
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
