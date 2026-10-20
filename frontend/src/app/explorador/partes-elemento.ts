import { Component, ElementRef, afterNextRender, computed, inject, input, viewChild } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';
import { Api } from '../core/api.service';
import { iconoDe } from '../core/formato';
import { Elemento } from '../core/modelos';
import { NOMBRE_PROPUESTA } from '../core/textos';
import { ExploradorEstado } from './explorador-estado';

// Ícono del elemento con su color. En tamaño grande las imágenes muestran una miniatura, salvo
// las que tienen cambios sin ver: pedir la miniatura contaría como "visto".
@Component({
  selector: 'dc-icono-elemento',
  template: `
    @if (miniatura()) {
      <img [src]="miniatura()" alt="" loading="lazy" decoding="async" draggable="false" />
    } @else {
      <i [class]="icono()" [style.color]="elemento().color ?? null" [class.carpeta]="elemento().tipo === 'CARPETA'"></i>
    }
  `,
  styles: `
    :host { display: inline-grid; place-items: center; flex: none; }
    i { color: var(--dc-texto); font-size: 16px; }
    i.carpeta { color: var(--dc-carpeta); }
    :host(.grande) { width: 100%; height: 100%; i { font-size: 46px; } }
    img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
  `,
})
export class IconoElemento {
  private readonly api = inject(Api);
  readonly elemento = input.required<Elemento>();
  readonly grande = input(false);
  readonly icono = computed(() => iconoDe(this.elemento()));
  readonly miniatura = computed(() => {
    const e = this.elemento();
    return this.grande() && e.tipoVista === 'imagen' && !e.sinVer ? `${this.api.urlVista(e.id)}?v=${e.version}` : null;
  });
}

@Component({
  selector: 'dc-insignias',
  imports: [Tooltip],
  template: `
    @let e = elemento();
    @if (e.propuestaPendiente) {
      <i class="pi pi-hourglass propuesta" [pTooltip]="'En votación: ' + nombrePropuesta[e.propuestaPendiente.tipo].toLowerCase()"></i>
    }
    @if (e.notaColor) {
      <i class="pi pi-comment nota" [pTooltip]="'“' + e.notaColor.texto + '” — ' + (e.notaColor.autor?.nombre ?? 'alguien')" [style.color]="e.color ?? null"></i>
    }
    @if (e.esFavorito) {
      <i class="pi pi-thumbtack fijado" pTooltip="En Accesos rápidos"></i>
    }
    @if (e.sinVer) {
      <span class="dc-punto" pTooltip="Hay cambios que no has visto"></span>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; flex: none; }
    .pi { font-size: 12px; }
    .propuesta { color: #b39ae0; }
    .nota { color: var(--dc-texto-secundario); }
    .fijado { color: var(--dc-texto-secundario); font-size: 11px; }
  `,
})
export class Insignias {
  readonly elemento = input.required<Elemento>();
  readonly nombrePropuesta = NOMBRE_PROPUESTA;
}

// Campo para renombrar en el lugar (F2), como en el Explorador de Windows.
@Component({
  selector: 'dc-renombrar',
  template: `
    <input
      #campo
      class="campo"
      [value]="elemento().nombre"
      (keydown.enter)="$event.preventDefault(); confirmar()"
      (keydown.escape)="$event.stopPropagation(); cancelar()"
      (keydown)="$event.stopPropagation()"
      (blur)="confirmar()"
      (click)="$event.stopPropagation()"
      (dblclick)="$event.stopPropagation()"
      maxlength="255"
      spellcheck="false"
    />
  `,
  styles: `
    :host { display: block; flex: 1; min-width: 0; }
    .campo { width: 100%; height: 24px; padding: 0 6px; font: inherit; color: var(--dc-texto-destacado);
      background: var(--dc-fondo-campos); border: 1px solid var(--dc-texto); border-radius: 4px; outline: none; }
  `,
})
export class Renombrar {
  private readonly estado = inject(ExploradorEstado);
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');
  readonly elemento = input.required<Elemento>();
  private terminado = false;

  constructor() {
    afterNextRender(() => {
      const campo = this.campo().nativeElement;
      campo.focus();
      const punto = campo.value.lastIndexOf('.');
      campo.setSelectionRange(0, this.elemento().tipo === 'ARCHIVO' && punto > 0 ? punto : campo.value.length);
    });
  }

  confirmar() {
    if (this.terminado) return;
    this.terminado = true;
    this.estado.confirmarRenombre(this.elemento(), this.campo().nativeElement.value);
  }

  cancelar() {
    this.terminado = true;
    this.estado.renombrando.set(null);
  }
}
