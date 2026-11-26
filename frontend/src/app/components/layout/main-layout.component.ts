import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  label: string;
  route: string;
  iconType: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent {
  readonly auth = inject(AuthService);

  // Control de sidebar móvil
  sidebarOpen = signal<boolean>(false);

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  // Iniciales del usuario para el avatar minimalista
  getUserInitials(): string {
    const name = this.auth.currentUser()?.nombre || 'Gerencia Candy Boom';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // Menú para Administrador (Estilo Square / Stripe, sin emojis)
  readonly adminNavItems: NavItem[] = [
    { label: 'Panel Principal', route: '/dashboard', iconType: 'dashboard' },
    { label: 'Tiendas y Sucursales', route: '/sucursales', iconType: 'sucursales' },
    { label: 'Personal y Cajeros', route: '/usuarios', iconType: 'usuarios' },
    { label: 'Auditoría', route: '/auditoria', iconType: 'auditoria' },
    { label: 'Inventario', route: '/inventario', iconType: 'inventario' },
    { label: 'Registro de Compras', route: '/compras', iconType: 'compras' },
    { label: 'Control de Vencimientos', route: '/vencimientos', iconType: 'vencimientos' },
    { label: 'Traspasos entre Tiendas', route: '/traspasos', iconType: 'traspasos' },
    { label: 'Punto de Venta', route: '/pos', iconType: 'pos' },
    { label: 'Ingresos y Egresos', route: '/caja/gastos', iconType: 'gastos' },
    { label: 'Arqueo de Caja', route: '/caja/arqueo', iconType: 'arqueo' },
    { label: 'Reportes', route: '/reportes', iconType: 'reportes' }
  ];

  // Menú para Vendedor / Cajero
  readonly vendedorNavItems: NavItem[] = [
    { label: 'Punto de Venta', route: '/pos', iconType: 'pos' },
    { label: 'Registro de Compras', route: '/compras', iconType: 'compras' },
    { label: 'Control de Vencimientos', route: '/vencimientos', iconType: 'vencimientos' },
    { label: 'Ingresos y Egresos', route: '/caja/gastos', iconType: 'gastos' },
    { label: 'Arqueo de Caja', route: '/caja/arqueo', iconType: 'arqueo' }
  ];

  onLogout(): void {
    this.auth.logout();
  }
}
