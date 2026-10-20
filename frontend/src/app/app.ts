import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, ConfirmDialog],
  template: `
    <router-outlet />
    <p-toast position="bottom-right" />
    <p-confirmdialog [style]="{ width: '440px' }" [pt]="{ pcCloseButton: { root: { 'aria-label': 'Cerrar' } } }" />
  `,
})
export class App {}
