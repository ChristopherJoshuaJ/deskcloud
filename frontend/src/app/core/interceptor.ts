import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SesionService } from './sesion.service';

// Si una petición responde 401 la sesión ya no es válida (venció o se cerró desde otro
// dispositivo): se vuelve al inicio de sesión recordando a dónde se quería ir.
export const interceptorSesion: HttpInterceptorFn = (req, next) => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((error) => {
      const esDeAutenticacion = req.url.startsWith('/api/auth/');
      if (error instanceof HttpErrorResponse && error.status === 401 && !esDeAutenticacion && sesion.conectado()) {
        sesion.olvidar();
        router.navigate(['/login'], { queryParams: { volver: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
