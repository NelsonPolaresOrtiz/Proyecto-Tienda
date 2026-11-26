import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { MainLayoutComponent } from './components/layout/main-layout.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SucursalesComponent } from './components/sucursales/sucursales.component';
import { UsuariosComponent } from './components/usuarios/usuarios.component';
import { ComprasComponent } from './components/compras/compras.component';
import { VencimientosComponent } from './components/vencimientos/vencimientos.component';
import { TraspasosComponent } from './components/traspasos/traspasos.component';
import { InventarioComponent } from './components/inventario/inventario.component';
import { PosComponent } from './components/pos/pos.component';
import { EgresosComponent } from './components/egresos/egresos.component';
import { ArqueoCajaComponent } from './components/arqueo/arqueo-caja.component';
import { ReportesComponent } from './components/reportes/reportes.component';
import { AuditoriaComponent } from './components/auditoria/auditoria.component';
import { PerfilComponent } from './components/perfil/perfil.component';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  // Ruta pública de autenticación
  {
    path: 'login',
    component: LoginComponent
  },

  // Rutas con Layout Principal (Protegidas por roleGuard)
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [roleGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      // Vistas de Administración
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: 'sucursales',
        component: SucursalesComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: 'usuarios',
        component: UsuariosComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: 'auditoria',
        component: AuditoriaComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: 'inventario',
        component: InventarioComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: 'compras',
        component: ComprasComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'vendedor'] }
      },
      {
        path: 'vencimientos',
        component: VencimientosComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'vendedor'] }
      },
      {
        path: 'traspasos',
        component: TraspasosComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: 'reportes',
        component: ReportesComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },

      // Vistas Compartidas / Vendedor y Admin
      {
        path: 'pos',
        component: PosComponent,
        canActivate: [roleGuard],
        data: { roles: ['vendedor', 'admin'] }
      },
      {
        path: 'caja',
        component: ArqueoCajaComponent,
        canActivate: [roleGuard],
        data: { roles: ['vendedor', 'admin'] }
      },
      {
        path: 'caja/gastos',
        component: EgresosComponent,
        canActivate: [roleGuard],
        data: { roles: ['vendedor', 'admin'] }
      },
      {
        path: 'caja/arqueo',
        component: ArqueoCajaComponent,
        canActivate: [roleGuard],
        data: { roles: ['vendedor', 'admin'] }
      },
      {
        path: 'egresos',
        redirectTo: 'caja/gastos'
      },
      {
        path: 'arqueo',
        redirectTo: 'caja/arqueo'
      },
      {
        path: 'perfil',
        component: PerfilComponent,
        canActivate: [roleGuard],
        data: { roles: ['vendedor', 'admin'] }
      }
    ]
  },

  // Fallback
  {
    path: '**',
    redirectTo: 'login'
  }
];
