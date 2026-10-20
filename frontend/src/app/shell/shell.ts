import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { filter } from 'rxjs';
import { PANTALLA_ESTRECHA } from '../core/formato';
import { DialogoColor } from '../dialogos/dialogo-color';
import { DialogoConflictos } from '../dialogos/dialogo-conflictos';
import { DialogoPropuesta } from '../dialogos/dialogo-propuesta';
import { DialogoTexto } from '../dialogos/dialogo-texto';
import { DialogoVersiones } from '../dialogos/dialogo-versiones';
import { Editor } from '../dialogos/editor';
import { Visor } from '../dialogos/visor';
import { Notificar } from '../core/notificar.service';
import { SesionService } from '../core/sesion.service';
import { Avisos } from './avisos';
import { BarraLateral } from './barra-lateral';
import { PanelSubidas } from './panel-subidas';

const ANCHO_LATERAL = 'dc.anchoLateral';

@Component({
  selector: 'dc-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    Menu,
    BarraLateral,
    Avisos,
    PanelSubidas,
    DialogoTexto,
    DialogoConflictos,
    DialogoPropuesta,
    DialogoColor,
    DialogoVersiones,
    Visor,
    Editor,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly notificar = inject(Notificar);
  readonly sesion = inject(SesionService);

  private readonly menuUsuario = viewChild.required<Menu>('menuUsuario');
  private readonly pantallaEstrecha = window.matchMedia(PANTALLA_ESTRECHA);
  readonly anchoLateral = signal(Number(localStorage.getItem(ANCHO_LATERAL)) || 260);
  // En pantallas estrechas la barra lateral flota sobre el contenido y se cierra al navegar.
  readonly lateralFlotante = signal(this.pantallaEstrecha.matches);
  readonly lateralOculta = signal(this.pantallaEstrecha.matches);

  constructor() {
    const alCambiar = (evento: MediaQueryListEvent) => {
      this.lateralFlotante.set(evento.matches);
      this.lateralOculta.set(evento.matches);
    };
    this.pantallaEstrecha.addEventListener('change', alCambiar);
    const navegacion = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      if (this.lateralFlotante()) this.lateralOculta.set(true);
    });
    inject(DestroyRef).onDestroy(() => {
      this.pantallaEstrecha.removeEventListener('change', alCambiar);
      navegacion.unsubscribe();
    });
  }

  readonly iniciales = computed(() => {
    const partes = (this.sesion.usuario()?.nombre ?? '').trim().split(/\s+/);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
  });

  readonly opcionesUsuario = computed<MenuItem[]>(() => [
    {
      label: this.sesion.usuario()?.correo ?? '',
      items: [
        { label: 'Mi cuenta', icon: 'pi pi-user', command: () => this.router.navigate(['/cuenta']) },
        { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.cerrarSesion() },
      ],
    },
  ]);

  abrirMenuUsuario(evento: Event) {
    this.menuUsuario().toggle(evento);
  }

  async cerrarSesion() {
    try {
      await this.sesion.logout();
    } catch (error) {
      this.notificar.error(error);
    }
    this.router.navigate(['/login']);
  }

  // Divisor arrastrable entre la barra lateral y el contenido.
  redimensionar(evento: PointerEvent) {
    evento.preventDefault();
    const inicioX = evento.clientX;
    const inicioAncho = this.anchoLateral();
    const mover = (e: PointerEvent) => this.anchoLateral.set(Math.min(480, Math.max(180, inicioAncho + e.clientX - inicioX)));
    const soltar = () => {
      localStorage.setItem(ANCHO_LATERAL, String(this.anchoLateral()));
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  }
}
