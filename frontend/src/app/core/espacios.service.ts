import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Api } from './api.service';
import { EventosService } from './eventos.service';
import { Elemento, EspacioResumen, Espacios, InvitacionRecibida, ResumenAvisos } from './modelos';
import { SesionService } from './sesion.service';

const INTERVALO_SONDEO_MS = 30_000;

// Datos de la barra lateral: espacios, accesos rápidos, invitaciones y el resumen de avisos.
// El resumen se consulta cada cierto tiempo; si cambia, se vuelve a pedir lo demás.
@Injectable({ providedIn: 'root' })
export class EspaciosService {
  private readonly api = inject(Api);
  private readonly sesion = inject(SesionService);
  private readonly eventos = inject(EventosService);

  readonly espacios = signal<Espacios | null>(null);
  readonly favoritos = signal<Elemento[]>([]);
  readonly invitaciones = signal<InvitacionRecibida[]>([]);
  readonly resumen = signal<ResumenAvisos>({ noLeidos: 0, invitaciones: 0, votosPendientes: 0 });

  readonly compartidos = computed(() => this.espacios()?.compartidos ?? []);
  readonly idsFavoritos = computed(() => new Set(this.favoritos().map((f) => f.id)));

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private resumenAnterior = '';

  constructor() {
    effect(() => {
      this.eventos.espacios();
      if (this.sesion.conectado()) this.cargarEspacios();
    });
    effect(() => {
      this.eventos.favoritos();
      if (this.sesion.conectado()) this.cargarFavoritos();
    });
    effect(() => {
      this.eventos.avisos();
      if (this.sesion.conectado()) this.consultarResumen(true);
    });
    effect(() => {
      if (this.sesion.conectado()) {
        this.iniciarSondeo();
      } else {
        this.detenerSondeo();
        this.espacios.set(null);
        this.favoritos.set([]);
        this.invitaciones.set([]);
      }
    });
    inject(DestroyRef).onDestroy(() => this.detenerSondeo());
  }

  esCompartido(espacioId: number | null | undefined) {
    const usuario = this.sesion.usuario();
    return espacioId != null && !!usuario && espacioId !== usuario.espacioId;
  }

  espacioDe(espacioId: number | null | undefined): EspacioResumen | undefined {
    return this.compartidos().find((e) => e.id === espacioId);
  }

  async cargarEspacios() {
    try {
      this.espacios.set(await this.api.espacios());
    } catch {
      // La barra lateral conserva lo último que tenía.
    }
  }

  async cargarFavoritos() {
    try {
      this.favoritos.set((await this.api.favoritos()).favoritos);
    } catch {}
  }

  async cargarInvitaciones() {
    try {
      this.invitaciones.set((await this.api.invitaciones()).invitaciones);
    } catch {}
  }

  async fijar(nodoId: number) {
    this.favoritos.set((await this.api.fijar(nodoId)).favoritos);
  }

  async desfijar(nodoId: number) {
    this.favoritos.set((await this.api.desfijar(nodoId)).favoritos);
  }

  async reordenar(ids: number[]) {
    const anterior = this.favoritos();
    const porId = new Map(anterior.map((f) => [f.id, f]));
    this.favoritos.set(ids.map((id) => porId.get(id)!).filter(Boolean));
    try {
      this.favoritos.set((await this.api.reordenarFavoritos(ids)).favoritos);
    } catch (error) {
      this.favoritos.set(anterior);
      throw error;
    }
  }

  private async consultarResumen(forzar = false) {
    try {
      const resumen = await this.api.resumenAvisos();
      const clave = JSON.stringify(resumen);
      const primera = this.resumenAnterior === '';
      const cambio = clave !== this.resumenAnterior;
      this.resumenAnterior = clave;
      this.resumen.set(resumen);
      if (cambio && !forzar && !primera) {
        // Otro miembro hizo algo (votó, propuso, invitó): se refresca también lo que esté abierto.
        this.eventos.avisar('contenido', 'espacios');
        await this.cargarInvitaciones();
      } else if (cambio || forzar) {
        await Promise.all([this.cargarEspacios(), this.cargarInvitaciones()]);
      }
    } catch {}
  }

  private iniciarSondeo() {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => {
      if (document.visibilityState === 'visible') this.consultarResumen();
    }, INTERVALO_SONDEO_MS);
    document.addEventListener('visibilitychange', this.alVolver);
  }

  private detenerSondeo() {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    this.resumenAnterior = '';
    document.removeEventListener('visibilitychange', this.alVolver);
  }

  private readonly alVolver = () => {
    if (document.visibilityState === 'visible') this.consultarResumen();
  };
}
