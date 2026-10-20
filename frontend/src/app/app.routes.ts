import { Routes } from '@angular/router';
import { irAMiEspacio, requiereSesion, soloInvitados } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [soloInvitados],
    data: { modo: 'login' },
    title: 'Iniciar sesión · DeskCloud',
    loadComponent: () => import('./acceso/acceso').then((m) => m.Acceso),
  },
  {
    path: 'registro',
    canActivate: [soloInvitados],
    data: { modo: 'registro' },
    title: 'Crear cuenta · DeskCloud',
    loadComponent: () => import('./acceso/acceso').then((m) => m.Acceso),
  },
  {
    path: '',
    canActivate: [requiereSesion],
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'carpeta/:id',
        title: 'DeskCloud',
        loadComponent: () => import('./explorador/explorador').then((m) => m.Explorador),
      },
      {
        path: 'papelera',
        title: 'Papelera · DeskCloud',
        loadComponent: () => import('./papelera/papelera').then((m) => m.Papelera),
      },
      {
        path: 'espacios/:espacioId/papelera',
        title: 'Papelera del espacio · DeskCloud',
        loadComponent: () => import('./papelera/papelera').then((m) => m.Papelera),
      },
      {
        path: 'espacios/:espacioId',
        title: 'Espacio compartido · DeskCloud',
        loadComponent: () => import('./espacio/espacio').then((m) => m.Espacio),
      },
      {
        path: 'cuenta',
        title: 'Mi cuenta · DeskCloud',
        loadComponent: () => import('./cuenta/cuenta').then((m) => m.Cuenta),
      },
      { path: '', pathMatch: 'full', canActivate: [irAMiEspacio], children: [] },
    ],
  },
  { path: '**', redirectTo: '' },
];
