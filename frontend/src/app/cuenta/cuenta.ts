import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { Tag } from 'primeng/tag';
import { Api } from '../core/api.service';
import { aErrorApi } from '../core/errores';
import { FechaPipe, RelativaPipe, TamanoPipe } from '../core/formato';
import { Sesion, UsoEspacio } from '../core/modelos';
import { Notificar } from '../core/notificar.service';
import { SesionService } from '../core/sesion.service';

// Resumen legible del "user agent" guardado con cada sesión.
export function describirNavegador(ua: string | null): string {
  if (!ua) return 'Navegador desconocido';
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|undici/i.test(ua)
              ? 'Programa'
              : 'Navegador';
  const sistema = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return sistema ? `${navegador} en ${sistema}` : navegador;
}

@Component({
  selector: 'dc-cuenta',
  imports: [FormsModule, Button, InputText, Password, Tag, FechaPipe, RelativaPipe, TamanoPipe],
  templateUrl: './cuenta.html',
  styleUrl: './cuenta.scss',
})
export class Cuenta {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly confirmar = inject(ConfirmationService);
  private readonly notificar = inject(Notificar);
  readonly sesion = inject(SesionService);
  readonly describirNavegador = describirNavegador;

  readonly nombre = signal(this.sesion.usuario()?.nombre ?? '');
  readonly guardandoNombre = signal(false);
  readonly nombreCambiado = computed(() => this.nombre().trim() !== '' && this.nombre().trim() !== this.sesion.usuario()?.nombre);

  readonly actual = signal('');
  readonly nueva = signal('');
  readonly repetida = signal('');
  readonly guardandoContrasena = signal(false);
  readonly erroresContrasena = signal<Record<string, string>>({});

  readonly sesiones = signal<Sesion[] | null>(null);
  readonly uso = signal<{ personal: UsoEspacio; compartidos: UsoEspacio[] } | null>(null);

  readonly contrasenaEliminar = signal('');
  readonly errorEliminar = signal<string | null>(null);
  readonly eliminando = signal(false);

  constructor() {
    this.cargarSesiones();
    this.api
      .espacioUsado()
      .then((uso) => this.uso.set(uso))
      .catch((error) => this.notificar.error(error));
  }

  async guardarNombre() {
    if (!this.nombreCambiado() || this.guardandoNombre()) return;
    this.guardandoNombre.set(true);
    try {
      const { usuario } = await this.api.cambiarNombre(this.nombre().trim());
      this.sesion.actualizar(usuario);
      this.notificar.exito('Nombre actualizado');
    } catch (error) {
      this.notificar.error(error);
    } finally {
      this.guardandoNombre.set(false);
    }
  }

  async cambiarContrasena() {
    if (this.guardandoContrasena()) return;
    if (this.nueva() !== this.repetida()) {
      this.erroresContrasena.set({ repetida: 'Las contraseñas no coinciden' });
      return;
    }
    this.guardandoContrasena.set(true);
    this.erroresContrasena.set({});
    try {
      const { sesionesCerradas } = await this.api.cambiarContrasena(this.actual(), this.nueva());
      this.actual.set('');
      this.nueva.set('');
      this.repetida.set('');
      this.notificar.exito(
        'Contraseña cambiada',
        sesionesCerradas > 0 ? `Se cerraron ${sesionesCerradas} ${sesionesCerradas === 1 ? 'sesión' : 'sesiones'} en otros dispositivos.` : undefined,
      );
      this.cargarSesiones();
    } catch (e) {
      const error = aErrorApi(e);
      if (error.codigo === 'DATOS_INVALIDOS' && error.detalles) this.erroresContrasena.set(error.detalles as Record<string, string>);
      else this.notificar.error(e);
    } finally {
      this.guardandoContrasena.set(false);
    }
  }

  async cargarSesiones() {
    try {
      this.sesiones.set((await this.api.sesiones()).sesiones);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  async cerrarSesion(s: Sesion) {
    try {
      this.sesiones.set((await this.api.cerrarSesionRemota(s.id)).sesiones);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  async cerrarOtras() {
    try {
      const { sesionesCerradas } = await this.api.cerrarOtrasSesiones();
      this.notificar.exito(`Se ${sesionesCerradas === 1 ? 'cerró 1 sesión' : `cerraron ${sesionesCerradas} sesiones`}`);
      this.cargarSesiones();
    } catch (error) {
      this.notificar.error(error);
    }
  }

  porcentaje(parte: number, total: number) {
    return total === 0 ? 0 : (parte / total) * 100;
  }

  eliminarCuenta() {
    if (!this.contrasenaEliminar()) return;
    this.confirmar.confirm({
      header: 'Eliminar cuenta',
      message:
        'Se borrará todo Mi espacio (archivos, versiones y papelera) y saldrás de todos los espacios compartidos. Lo que subiste a los espacios compartidos se queda para los demás. No se puede deshacer.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar mi cuenta',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        this.eliminando.set(true);
        this.errorEliminar.set(null);
        try {
          await this.api.eliminarCuenta(this.contrasenaEliminar());
          this.sesion.olvidar();
          this.router.navigate(['/login']);
        } catch (e) {
          const error = aErrorApi(e);
          this.errorEliminar.set(error.detalles?.['contrasena'] ?? error.mensaje);
        } finally {
          this.eliminando.set(false);
        }
      },
    });
  }
}
