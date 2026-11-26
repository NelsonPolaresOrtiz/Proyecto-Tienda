import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. Verificar si está autenticado
  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  const currentUser = authService.currentUser();
  const allowedRoles = route.data?.['roles'] as UserRole[] | undefined;

  // 2. Si no hay restricción explícita de roles, permitir paso
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  // 3. Verificar si el rol del usuario está dentro de los permitidos
  if (currentUser && allowedRoles.includes(currentUser.rol)) {
    return true;
  }

  // 4. Si el rol no coincide, redirigir al panel correspondiente según su rol
  if (currentUser?.rol === 'vendedor') {
    router.navigate(['/pos']);
  } else if (currentUser?.rol === 'admin') {
    router.navigate(['/dashboard']);
  } else {
    router.navigate(['/login']);
  }

  return false;
};
