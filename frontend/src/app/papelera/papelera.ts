import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { ContextMenu } from 'primeng/contextmenu';
import { Tooltip } from 'primeng/tooltip';
import { AccionesService, describir } from '../core/acciones.service';
import { Api } from '../core/api.service';
import { mensajeDe } from '../core/errores';
import { EspaciosService } from '../core/espacios.service';
import { EventosService } from '../core/eventos.service';
import { FechaPipe, RelativaPipe, TamanoPipe, iconoDe } from '../core/formato';
import { ElementoPapelera, TipoPropuesta } from '../core/modelos';
import { Notificar } from '../core/notificar.service';
import { NOMBRE_PROPUESTA } from '../core/textos';

@Component({
  selector: 'dc-papelera',
  imports: [RouterLink, Button, ContextMenu, Tooltip, FechaPipe, RelativaPipe, TamanoPipe],
  templateUrl: './papelera.html',
  styleUrl: './papelera.scss',
})
export class Papelera {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly confirmar = inject(ConfirmationService);
  private readonly acciones = inject(AccionesService);
  private readonly eventos = inject(EventosService);
  private readonly notificar = inject(Notificar);
  private readonly espacios = inject(EspaciosService);

  readonly espacioId = input<string>();
  private readonly menu = viewChild.required<ContextMenu>('menu');

  readonly elementos = signal<ElementoPapelera[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly seleccion = signal<ReadonlySet<number>>(new Set());
  readonly trabajando = signal(false);
  readonly opcionesMenu = signal<MenuItem[]>([]);
  readonly iconoDe = iconoDe;
  readonly nombrePropuesta = NOMBRE_PROPUESTA;

  readonly idEspacio = computed(() => (this.espacioId() ? Number(this.espacioId()) : null));
  readonly espacio = computed(() => this.espacios.espacioDe(this.idEspacio()));
  readonly esCompartida = computed(() => this.idEspacio() !== null);
  readonly seleccionados = computed(() => (this.elementos() ?? []).filter((e) => this.seleccion().has(e.id)));
  constructor() {
    effect(() => {
      this.idEspacio();
      this.eventos.contenido();
      untracked(() => this.cargar());
    });
  }

  async cargar() {
    const id = this.idEspacio();
    try {
      const { elementos } = id === null ? await this.api.papelera() : await this.api.papeleraEspacio(id);
      if (id !== this.idEspacio()) return;
      this.elementos.set(elementos);
      this.error.set(null);
      const ids = new Set(elementos.map((e) => e.id));
      this.seleccion.update((s) => new Set([...s].filter((x) => ids.has(x))));
    } catch (error) {
      this.error.set(mensajeDe(error));
      this.elementos.set([]);
    }
  }

  ubicacion(e: ElementoPapelera) {
    if (!e.ubicacionOriginal) return this.esCompartida() ? 'La carpeta original ya no existe' : 'Mi espacio (la carpeta original ya no existe)';
    return e.ubicacionOriginal.map((p) => (p.esRaiz && !this.esCompartida() ? 'Mi espacio' : p.nombre)).join(' / ');
  }

  alClic(e: ElementoPapelera, evento: MouseEvent) {
    evento.stopPropagation();
    if (evento.ctrlKey || evento.metaKey) {
      const s = new Set(this.seleccion());
      if (s.has(e.id)) s.delete(e.id);
      else s.add(e.id);
      this.seleccion.set(s);
    } else {
      this.seleccion.set(new Set([e.id]));
    }
  }

  limpiarSeleccion() {
    this.seleccion.set(new Set());
  }

  abrirMenu(e: ElementoPapelera, evento: MouseEvent) {
    evento.preventDefault();
    evento.stopPropagation();
    if (!this.seleccion().has(e.id)) this.seleccion.set(new Set([e.id]));
    const compartida = this.esCompartida();
    this.opcionesMenu.set([
      { label: compartida ? 'Proponer restaurar' : 'Restaurar', icon: 'pi pi-replay', command: () => this.restaurar() },
      { label: compartida ? 'Proponer eliminar definitivamente' : 'Eliminar definitivamente', icon: 'pi pi-times-circle', command: () => this.eliminar() },
    ]);
    this.menu().show(evento);
  }

  async restaurar() {
    const lista = this.seleccionados();
    if (lista.length === 0) return;
    if (this.esCompartida()) {
      await this.proponer('RESTAURAR', lista);
      return;
    }
    this.trabajando.set(true);
    try {
      const { elementos } = await this.api.restaurar(lista.map((e) => e.id));
      this.notificar.exito(`Se restauró ${describir(lista)}`);
      this.eventos.carpetas(elementos.map((e) => e.padreId));
    } catch (error) {
      this.notificar.error(error);
    } finally {
      this.trabajando.set(false);
    }
  }

  eliminar() {
    const lista = this.seleccionados();
    if (lista.length === 0) return;
    if (this.esCompartida()) {
      this.proponer('ELIMINAR_DEFINITIVO', lista);
      return;
    }
    this.confirmarPeligro(`¿Eliminar definitivamente ${describir(lista)}? No se puede deshacer.`, 'Eliminar', async () => {
      await this.api.eliminarDefinitivamente(lista.map((e) => e.id));
      this.notificar.exito(`Se eliminó ${describir(lista)}`);
    });
  }

  vaciar() {
    if (this.esCompartida()) {
      this.proponer('ELIMINAR_DEFINITIVO', [], true);
      return;
    }
    const cantidad = this.elementos()?.length ?? 0;
    this.confirmarPeligro(`¿Eliminar definitivamente ${cantidad === 1 ? 'el elemento' : `los ${cantidad} elementos`} de la papelera? No se puede deshacer.`, 'Vaciar papelera', async () => {
      await this.api.vaciarPapelera();
      this.notificar.exito('La papelera quedó vacía');
    });
  }

  private async proponer(tipo: TipoPropuesta, lista: ElementoPapelera[], todos = false) {
    const id = this.idEspacio();
    if (id === null) return;
    const propuesta = await this.acciones.proponer(tipo, lista, todos, id);
    if (propuesta) this.cargar();
  }

  private confirmarPeligro(mensaje: string, boton: string, accion: () => Promise<void>) {
    this.confirmar.confirm({
      header: 'Eliminar definitivamente',
      message: mensaje,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: boton,
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        this.trabajando.set(true);
        try {
          await accion();
          this.seleccion.set(new Set());
          await this.cargar();
        } catch (error) {
          this.notificar.error(error);
        } finally {
          this.trabajando.set(false);
        }
      },
    });
  }

  verVotaciones() {
    const id = this.idEspacio();
    if (id !== null) this.router.navigate(['/espacios', id]);
  }
}
