import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '../models/user.model';

export interface LoginTransitionState {
  active: boolean;
  userName: string;
  sucursalLabel: string;
}

@Injectable({
  providedIn: 'root'
})
export class LoginTransitionService {
  private readonly router = inject(Router);

  readonly state = signal<LoginTransitionState>({
    active: false,
    userName: '',
    sucursalLabel: ''
  });

  readonly isExiting = signal<boolean>(false);
  readonly isAccelerated = signal<boolean>(false);
  readonly progress = signal<number>(0);

  private targetRoute: string = '/dashboard';
  private hasNavigated = false;
  private navTimer: ReturnType<typeof setTimeout> | null = null;
  private completeTimer: ReturnType<typeof setTimeout> | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  startTransition(user: User, route: string): void {
    this.clearTimers();

    this.targetRoute = route;
    this.hasNavigated = false;
    this.isExiting.set(false);
    this.isAccelerated.set(false);
    this.progress.set(0);

    const sucursalLabel =
      user.rol === 'admin'
        ? 'Todas las Sucursales'
        : user.sucursal_nombre || 'Sucursal Asignada';

    this.state.set({
      active: true,
      userName: user.nombre,
      sucursalLabel
    });

    // Iniciar llenado suave de barra 0% -> 100% en 1.8s
    setTimeout(() => {
      if (this.state().active && !this.isAccelerated()) {
        this.progress.set(100);
      }
    }, 40);

    // Navegar debajo del telón una vez cubierto el viewport (~260ms) para renderizar sin parpadeos
    this.navTimer = setTimeout(() => {
      this.navigateUnderOverlay();
    }, 260);

    // Al completarse la barra (~1.85s), iniciar salida cortina/zoom
    this.completeTimer = setTimeout(() => {
      this.triggerExit();
    }, 1850);
  }

  skipOrAccelerate(): void {
    if (!this.state().active || this.isExiting()) return;

    this.clearTimers();
    this.isAccelerated.set(true);
    this.progress.set(100);
    this.navigateUnderOverlay();

    this.completeTimer = setTimeout(() => {
      this.triggerExit();
    }, 120);
  }

  private navigateUnderOverlay(): void {
    if (this.hasNavigated) return;
    this.hasNavigated = true;
    this.router.navigate([this.targetRoute]);
  }

  private triggerExit(): void {
    if (this.isExiting()) return;
    this.navigateUnderOverlay();
    this.isExiting.set(true);

    this.exitTimer = setTimeout(() => {
      this.state.set({
        active: false,
        userName: '',
        sucursalLabel: ''
      });
      this.isExiting.set(false);
      this.isAccelerated.set(false);
      this.progress.set(0);
    }, 500);
  }

  private clearTimers(): void {
    if (this.navTimer) {
      clearTimeout(this.navTimer);
      this.navTimer = null;
    }
    if (this.completeTimer) {
      clearTimeout(this.completeTimer);
      this.completeTimer = null;
    }
    if (this.exitTimer) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
  }
}
