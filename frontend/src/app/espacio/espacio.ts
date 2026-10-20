import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { esCodigo, mensajeDe } from '../core/errores';
import { EventosService } from '../core/eventos.service';
import { FechaPipe, RelativaPipe } from '../core/formato';
import { Actividad, DetallesEspacio, Propuesta } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { Notificar } from '../core/notificar.service';
import { SesionService } from '../core/sesion.service';
import { NOMBRE_PROPUESTA, lineaActividad } from '../core/textos';

const ESTADOS: Record<string, { texto: string; severidad: 'success' | 'warn' | 'secondary' | 'danger' | 'info' }> = {
  ABIERTA: { texto: 'Abierta', severidad: 'info' },
  APROBADA: { texto: 'Aprobada', severidad: 'success' },
  VENCIDA: { texto: 'Vencida', severidad: 'warn' },
  RETIRADA: { texto: 'Retirada', severidad: 'secondary' },
  ANULADA: { texto: 'Anulada', severidad: 'secondary' },
};

@Component({
  selector: 'dc-espacio',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Button, InputText, Tabs, TabList, Tab, TabPanels, TabPanel, Tag, Tooltip, FechaPipe, RelativaPipe],
  templateUrl: './espacio.html',
  styleUrl: './espacio.scss',
})
export class Espacio {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly confirmar = inject(ConfirmationService);
  private readonly dialogos = inject(DialogosService);
  private readonly eventos = inject(EventosService);
  private readonly navegacion = inject(NavegacionService);
  private readonly notificar = inject(Notificar);
  readonly sesion = inject(SesionService);

  readonly espacioId = input.required<string>();
  readonly id = computed(() => Number(this.espacioId()));

  readonly pestana = signal<string | number | undefined>('votaciones');
  readonly datos = signal<DetallesEspacio | null>(null);
  readonly error = signal<string | null>(null);
  readonly abiertas = signal<Propuesta[] | null>(null);
  readonly cerradas = signal<Propuesta[] | null>(null);
  readonly verCerradas = signal(false);
  readonly actividad = signal<Actividad[]>([]);
  readonly hayMasActividad = signal(true);
  readonly cargandoActividad = signal(false);
  readonly correo = signal('');
  readonly invitando = signal(false);
  readonly votando = signal<number | null>(null);

  readonly espacio = computed(() => this.datos()?.espacio ?? null);
  readonly soyAdministrador = computed(() => this.espacio()?.esAdministrador ?? false);
  readonly estados = ESTADOS;
  readonly nombrePropuesta: Record<string, string> = NOMBRE_PROPUESTA;
  readonly lineaActividad = lineaActividad;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.datos.set(null);
        this.abiertas.set(null);
        this.cerradas.set(null);
        this.verCerradas.set(false);
        this.actividad.set([]);
        this.hayMasActividad.set(true);
        this.cargarTodo(id);
      });
    });
    // Los avisos (votos de otros, propuestas cerradas) llegan por sondeo: se refresca lo visible.
    let primera = true;
    effect(() => {
      this.eventos.avisos();
      this.eventos.espacios();
      if (primera) {
        primera = false;
        return;
      }
      untracked(() => this.refrescar());
    });
  }

  private async cargarTodo(id: number) {
    try {
      this.datos.set(await this.api.espacio(id));
      this.error.set(null);
    } catch (error) {
      this.error.set(mensajeDe(error));
      return;
    }
    await Promise.all([this.cargarPropuestas(), this.cargarActividad(true)]);
  }

  private async refrescar() {
    const id = this.id();
    try {
      this.datos.set(await this.api.espacio(id));
    } catch {
      return;
    }
    await Promise.all([this.cargarPropuestas(), this.cargarActividad(true)]);
  }

  async cargarPropuestas() {
    const id = this.id();
    try {
      this.abiertas.set((await this.api.propuestasEspacio(id)).propuestas);
      if (this.verCerradas()) this.cerradas.set((await this.api.propuestasEspacio(id, true)).propuestas);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  async alternarCerradas() {
    this.verCerradas.update((v) => !v);
    if (this.verCerradas() && this.cerradas() === null) {
      try {
        this.cerradas.set((await this.api.propuestasEspacio(this.id(), true)).propuestas);
      } catch (error) {
        this.notificar.error(error);
      }
    }
  }

  async cargarActividad(desdeCero = false) {
    if (this.cargandoActividad()) return;
    this.cargandoActividad.set(true);
    try {
      const antes = desdeCero ? undefined : this.actividad().at(-1)?.id;
      const { actividad } = await this.api.actividad(this.id(), antes);
      this.actividad.set(desdeCero ? actividad : [...this.actividad(), ...actividad]);
      this.hayMasActividad.set(actividad.length === 50);
    } catch (error) {
      this.notificar.error(error);
    } finally {
      this.cargandoActividad.set(false);
    }
  }

  async votar(propuesta: Propuesta, voto: 'si' | 'no') {
    this.votando.set(propuesta.id);
    try {
      const { propuesta: actualizada } = await this.api.votar(propuesta.id, voto);
      if (actualizada.estado === 'APROBADA') {
        this.notificar.exito('Propuesta aprobada', 'Todos votaron a favor, así que ya se aplicó.');
        this.eventos.avisar('contenido');
      }
      this.eventos.avisar('espacios', 'avisos');
      await this.cargarPropuestas();
      this.cargarActividad(true);
    } catch (error) {
      this.notificar.error(error);
    } finally {
      this.votando.set(null);
    }
  }

  retirar(propuesta: Propuesta) {
    this.confirmar.confirm({
      header: 'Retirar propuesta',
      message: '¿Retirar esta propuesta? La votación se cierra y no se hace ningún cambio.',
      icon: 'pi pi-undo',
      acceptLabel: 'Retirar',
      rejectLabel: 'Cancelar',
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.retirarPropuesta(propuesta.id);
          this.eventos.avisar('contenido', 'espacios', 'avisos');
          await this.cargarPropuestas();
        } catch (error) {
          this.notificar.error(error);
        }
      },
    });
  }

  renombrar() {
    const espacio = this.espacio();
    if (!espacio) return;
    this.dialogos.texto.abrir({
      titulo: 'Cambiar nombre del espacio',
      etiqueta: 'Nombre',
      valor: espacio.nombre,
      boton: 'Cambiar nombre',
      aceptar: async (nombre) => {
        this.datos.set(await this.api.renombrarEspacio(espacio.id, nombre));
        this.eventos.avisar('espacios');
        this.eventos.carpetas([espacio.raizId]);
      },
    });
  }

  async invitar() {
    const correo = this.correo().trim();
    if (!correo || this.invitando()) return;
    this.invitando.set(true);
    try {
      this.datos.set(await this.api.invitar(this.id(), correo));
      this.correo.set('');
      this.notificar.exito('Invitación enviada', `${correo} la verá en sus avisos.`);
    } catch (error) {
      this.notificar.error(error, 'No se pudo invitar');
    } finally {
      this.invitando.set(false);
    }
  }

  async cancelarInvitacion(invitacionId: number) {
    try {
      this.datos.set(await this.api.cancelarInvitacion(this.id(), invitacionId));
    } catch (error) {
      this.notificar.error(error);
    }
  }

  expulsar(usuarioId: number, nombre: string) {
    this.confirmar.confirm({
      header: 'Sacar del espacio',
      message: `¿Sacar a ${nombre} del espacio? Dejará de ver sus archivos; lo que subió se queda.`,
      icon: 'pi pi-user-minus',
      acceptLabel: 'Sacar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.expulsar(this.id(), usuarioId);
          // Sin su voto, las votaciones abiertas se recalculan y alguna puede haberse aprobado:
          // avisar 'espacios' recarga esta página entera y la barra lateral.
          this.eventos.avisar('espacios', 'contenido');
        } catch (error) {
          this.notificar.error(error);
        }
      },
    });
  }

  salir() {
    const espacio = this.espacio();
    if (!espacio) return;
    if (espacio.totalMiembros === 1) {
      this.confirmarUltimo();
      return;
    }
    this.confirmar.confirm({
      header: 'Salir del espacio',
      message: `¿Salir de "${espacio.nombre}"? Para volver tendrán que invitarte de nuevo.${espacio.esAdministrador ? ' La administración pasa al miembro más antiguo.' : ''}`,
      icon: 'pi pi-sign-out',
      acceptLabel: 'Salir',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: () => this.confirmarSalida(false),
    });
  }

  private confirmarUltimo() {
    this.confirmar.confirm({
      header: 'Eres el último miembro',
      message: 'Si sales, el espacio y todo su contenido se eliminan definitivamente. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Salir y eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: () => this.confirmarSalida(true),
    });
  }

  private async confirmarSalida(confirmado: boolean) {
    try {
      const { eliminado } = await this.api.salir(this.id(), confirmado);
      this.notificar.exito(eliminado ? 'Saliste y el espacio se eliminó' : 'Saliste del espacio');
      this.eventos.avisar('espacios', 'favoritos', 'avisos');
      const usuario = this.sesion.usuario();
      if (usuario) this.navegacion.abrir(usuario.raizId);
    } catch (error) {
      // Los demás salieron mientras tanto: ahora sí es el último.
      if (!confirmado && esCodigo(error, 'CONFIRMACION_REQUERIDA')) {
        // El diálogo anterior todavía se está cerrando; se espera un momento para abrir el siguiente.
        setTimeout(() => this.confirmarUltimo(), 250);
        return;
      }
      this.notificar.error(error);
    }
  }

  abrirArchivos() {
    const espacio = this.espacio();
    if (espacio) this.navegacion.abrir(espacio.raizId);
  }

  async abrirElemento(id: number | null) {
    if (id === null) return;
    try {
      const { elemento } = await this.api.detalles(id);
      if (elemento.tipo === 'CARPETA') {
        this.navegacion.abrir(elemento.id);
      } else if (elemento.padreId) {
        this.router.navigate(['/carpeta', elemento.padreId], { queryParams: { sel: elemento.id } });
      }
    } catch {
      this.notificar.info('Ese elemento ya no está disponible');
    }
  }

  porcentaje(p: Propuesta) {
    return p.recuento.total === 0 ? 0 : Math.round((p.recuento.si / p.recuento.total) * 100);
  }
}
