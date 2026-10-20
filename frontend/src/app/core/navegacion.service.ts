import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Elemento, ParteRuta } from './modelos';
import { SesionService } from './sesion.service';

// Carpeta abierta en el explorador (la barra lateral la usa para abrir y resaltar el árbol)
// y el historial de Atrás / Adelante, que es por carpetas como en el Explorador de Windows.
@Injectable({ providedIn: 'root' })
export class NavegacionService {
  private readonly router = inject(Router);

  readonly carpeta = signal<Elemento | null>(null);
  readonly ruta = signal<ParteRuta[]>([]);
  readonly idsRuta = computed(() => new Set(this.ruta().map((p) => p.id)));

  private readonly historial = signal<number[]>([]);
  private readonly posicion = signal(-1);
  private saltoPendiente: number | null = null;

  readonly puedeIrAtras = computed(() => this.posicion() > 0);
  readonly puedeIrAdelante = computed(() => this.posicion() < this.historial().length - 1);
  readonly puedeSubir = computed(() => this.ruta().length > 1);

  constructor() {
    // El historial es de la cuenta: con otra sesión, Atrás no debe llevar a carpetas ajenas.
    const sesion = inject(SesionService);
    effect(() => {
      if (sesion.conectado()) return;
      untracked(() => {
        this.limpiar();
        this.historial.set([]);
        this.posicion.set(-1);
        this.saltoPendiente = null;
      });
    });
  }

  abrir(carpetaId: number, consulta?: string) {
    this.router.navigate(['/carpeta', carpetaId], { queryParams: consulta ? { q: consulta } : {} });
  }

  // Lo llama el explorador cada vez que cambia la carpeta de la URL.
  registrar(carpetaId: number) {
    if (this.saltoPendiente === carpetaId) {
      this.saltoPendiente = null;
      return;
    }
    const lista = this.historial();
    if (lista[this.posicion()] === carpetaId) return;
    const nueva = [...lista.slice(0, this.posicion() + 1), carpetaId].slice(-100);
    this.historial.set(nueva);
    this.posicion.set(nueva.length - 1);
  }

  establecer(carpeta: Elemento | null, ruta: ParteRuta[]) {
    this.carpeta.set(carpeta);
    this.ruta.set(ruta);
  }

  limpiar() {
    this.carpeta.set(null);
    this.ruta.set([]);
  }

  atras() {
    this.saltar(-1);
  }

  adelante() {
    this.saltar(1);
  }

  subir() {
    const ruta = this.ruta();
    if (ruta.length > 1) this.abrir(ruta[ruta.length - 2].id);
  }

  private saltar(paso: number) {
    const destino = this.posicion() + paso;
    const id = this.historial()[destino];
    if (id === undefined) return;
    this.posicion.set(destino);
    this.saltoPendiente = id;
    this.abrir(id);
  }
}
