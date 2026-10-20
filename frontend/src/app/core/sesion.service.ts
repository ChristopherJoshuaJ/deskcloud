import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api.service';
import { Usuario } from './modelos';

@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly api = inject(Api);
  private readonly _usuario = signal<Usuario | null>(null);
  private comprobacion: Promise<Usuario | null> | null = null;

  readonly usuario = this._usuario.asReadonly();
  readonly conectado = computed(() => this._usuario() !== null);

  // Se consulta una sola vez al abrir la app; después la sesión se mantiene en memoria.
  comprobar(): Promise<Usuario | null> {
    this.comprobacion ??= this.api
      .me()
      .then(({ usuario }) => this.establecer(usuario))
      .catch(() => this.establecer(null));
    return this.comprobacion;
  }

  async login(correo: string, contrasena: string) {
    const { usuario } = await this.api.login(correo, contrasena);
    return this.establecer(usuario);
  }

  async registro(nombre: string, correo: string, contrasena: string) {
    const { usuario } = await this.api.registro(nombre, correo, contrasena);
    return this.establecer(usuario);
  }

  async logout() {
    try {
      await this.api.logout();
    } finally {
      this.establecer(null);
    }
  }

  actualizar(usuario: Usuario) {
    this.establecer(usuario);
  }

  // La sesión venció o se cerró desde otro dispositivo.
  olvidar() {
    this.establecer(null);
  }

  private establecer(usuario: Usuario | null) {
    this._usuario.set(usuario);
    this.comprobacion = Promise.resolve(usuario);
    return usuario;
  }
}
