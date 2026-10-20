import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SesionService } from './sesion.service';

// inject() solo funciona antes del primer await, por eso el Router se pide al principio.
export const requiereSesion: CanActivateFn = async (_ruta, estado) => {
  const router = inject(Router);
  const usuario = await inject(SesionService).comprobar();
  return usuario ? true : router.createUrlTree(['/login'], { queryParams: { volver: estado.url } });
};

export const soloInvitados: CanActivateFn = async () => {
  const router = inject(Router);
  const usuario = await inject(SesionService).comprobar();
  return usuario ? router.createUrlTree(['/carpeta', usuario.raizId]) : true;
};

export const irAMiEspacio: CanActivateFn = async () => {
  const router = inject(Router);
  const usuario = await inject(SesionService).comprobar();
  return router.createUrlTree(usuario ? ['/carpeta', usuario.raizId] : ['/login']);
};
