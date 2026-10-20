import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { aErrorApi } from '../core/errores';
import { SesionService } from '../core/sesion.service';

@Component({
  selector: 'dc-acceso',
  imports: [FormsModule, RouterLink, Button, InputText, Password, Message],
  templateUrl: './acceso.html',
  styleUrl: './acceso.scss',
})
export class Acceso {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  // Vienen de la ruta (data y query params) gracias a withComponentInputBinding.
  readonly modo = input<'login' | 'registro'>('login');
  readonly volver = input<string>();

  readonly esRegistro = computed(() => this.modo() === 'registro');
  readonly nombre = signal('');
  readonly correo = signal('');
  readonly contrasena = signal('');
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly erroresCampo = signal<Record<string, string>>({});

  async enviar() {
    if (this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.erroresCampo.set({});
    try {
      const usuario = this.esRegistro()
        ? await this.sesion.registro(this.nombre().trim(), this.correo().trim(), this.contrasena())
        : await this.sesion.login(this.correo().trim(), this.contrasena());
      const destino = this.volver();
      await this.router.navigateByUrl(destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : `/carpeta/${usuario!.raizId}`);
    } catch (e) {
      const error = aErrorApi(e);
      if (error.codigo === 'DATOS_INVALIDOS' && error.detalles) {
        this.erroresCampo.set(error.detalles as Record<string, string>);
      } else if (error.codigo === 'DEMASIADOS_INTENTOS') {
        const minutos = Math.ceil((error.detalles?.['reintentarEnSegundos'] ?? 60) / 60);
        this.error.set(`Demasiados intentos fallidos. Prueba de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`);
      } else {
        this.error.set(error.mensaje);
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
