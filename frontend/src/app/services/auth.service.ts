import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { User, LoginRequest, LoginResponse } from '../models/user.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly TOKEN_KEY = 'candy_boom_token';
  private readonly USER_KEY = 'candy_boom_user';

  // Signals para reactividad moderna en Angular
  readonly currentUser = signal<User | null>(this.loadUserFromStorage());
  readonly token = signal<string | null>(this.loadTokenFromStorage());

  // Señales computadas
  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());
  readonly isAdmin = computed(() => this.currentUser()?.rol === 'admin');
  readonly isVendedor = computed(() => this.currentUser()?.rol === 'vendedor');
  readonly currentSucursal = computed(() => {
    const user = this.currentUser();
    if (!user) return 'No autenticado';
    if (user.rol === 'admin') return 'Acceso Global (Todas las Sucursales)';
    return user.sucursal_nombre || 'Sucursal Asignada';
  });

  /**
   * Iniciar sesión en Candy Boom API
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, credentials).pipe(
      tap((response) => {
        if (response.success && response.token) {
          this.setSession(response.token, response.user);
        }
      }),
      catchError((error) => {
        return throwError(() => error);
      })
    );
  }

  /**
   * Cerrar sesión y limpiar estado
   */
  logout(): void {
    // Notificar al backend para limpiar cookie httpOnly si aplica
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({
      next: () => {},
      error: () => {}
    });

    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Obtener perfil actualizado del usuario autenticado
   */
  getProfile(): Observable<{ success: boolean; user: User }> {
    return this.http.get<{ success: boolean; user: User }>(`${environment.apiUrl}/auth/me`).pipe(
      tap((res) => {
        if (res.success && res.user) {
          this.currentUser.set(res.user);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        }
      })
    );
  }

  /**
   * Guardar sesión localmente y actualizar signals
   */
  private setSession(token: string, user: User): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.token.set(token);
    this.currentUser.set(user);
  }

  /**
   * Limpiar estado local
   */
  clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.token.set(null);
    this.currentUser.set(null);
  }

  /**
   * Obtener token actual
   */
  getToken(): string | null {
    return this.token() || localStorage.getItem(this.TOKEN_KEY);
  }

  private loadTokenFromStorage(): string | null {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private loadUserFromStorage(): User | null {
    try {
      const data = localStorage.getItem(this.USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}
