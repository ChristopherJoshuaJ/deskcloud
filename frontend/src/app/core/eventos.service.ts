import { Injectable, signal } from '@angular/core';

export type TipoCambio = 'contenido' | 'favoritos' | 'espacios' | 'avisos';

// Avisa a las demás partes de la pantalla que algo cambió, para que vuelvan a pedir sus datos:
// por ejemplo, al crear una carpeta en el explorador el árbol de la barra lateral se actualiza.
@Injectable({ providedIn: 'root' })
export class EventosService {
  readonly contenido = signal(0);
  readonly favoritos = signal(0);
  readonly espacios = signal(0);
  readonly avisos = signal(0);

  // Carpetas cuyo contenido cambió; el árbol solo recarga esas ramas.
  readonly carpetasCambiadas = signal<ReadonlySet<number>>(new Set());

  avisar(...tipos: TipoCambio[]) {
    for (const tipo of tipos) this[tipo].update((n) => n + 1);
  }

  carpetas(ids: Iterable<number | null | undefined>) {
    const validos = [...ids].filter((id): id is number => typeof id === 'number');
    this.carpetasCambiadas.set(new Set(validos));
    this.avisar('contenido');
  }
}
