import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { interceptorSesion } from './core/interceptor';
import { TemaDeskCloud } from './tema';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([interceptorSesion])),
    providePrimeNG({
      ripple: false,
      theme: { preset: TemaDeskCloud, options: { darkModeSelector: '.dc-oscuro', cssLayer: false } },
      translation: {
        accept: 'Sí',
        reject: 'No',
        emptyMessage: 'Sin resultados',
        aria: { close: 'Cerrar', previous: 'Anterior', next: 'Siguiente', navigation: 'Navegación' },
      },
    }),
    MessageService,
    ConfirmationService,
  ],
};
