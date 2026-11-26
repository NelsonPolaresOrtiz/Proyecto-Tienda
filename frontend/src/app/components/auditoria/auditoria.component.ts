import { Component, Input, OnChanges, OnInit, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

export interface AuditoriaItem {
  id: number;
  usuario_id: number;
  sucursal_id: number | null;
  modulo: string;
  accion: string;
  detalle: string;
  ip_equipo: string;
  created_at: string;
  usuario_nombre: string;
  usuario_email: string;
  usuario_rol: 'admin' | 'vendedor';
  sucursal_nombre: string;
  sucursal_codigo?: string;
}

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auditoria.component.html'
})
export class AuditoriaComponent implements OnInit, OnChanges {
  @Input() embedded = false;
  @Input() presetUserId: number | null = null;

  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  actividades = signal<AuditoriaItem[]>([]);
  usuarios = signal<{ id: number; nombre: string; rol: string }[]>([]);
  sucursales = signal<{ id: number; nombre: string; codigo: string }[]>([]);
  isLoading = signal<boolean>(false);

  // Filtros combinables
  usuarioFiltro = signal<string>('todos');
  sucursalFiltro = signal<string>('todas');
  moduloFiltro = signal<string>('todos');
  fechaInicio = signal<string>('');
  fechaFin = signal<string>('');
  busqueda = signal<string>('');

  readonly modulosDisponibles: string[] = [
    'Login',
    'POS',
    'Compras',
    'Vencimientos',
    'Ingresos/Egresos',
    'Caja',
    'Inventario',
    'Traspasos',
    'Usuarios',
    'Sucursales',
    'Perfil'
  ];

  ngOnInit(): void {
    const qUser = this.route.snapshot.queryParamMap.get('usuario_id');
    if (this.presetUserId) {
      this.usuarioFiltro.set(String(this.presetUserId));
    } else if (qUser) {
      this.usuarioFiltro.set(qUser);
    }

    this.loadCatalogos();
    this.loadActividades();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['presetUserId'] && !changes['presetUserId'].firstChange) {
      const val = changes['presetUserId'].currentValue;
      this.usuarioFiltro.set(val ? String(val) : 'todos');
      this.loadActividades();
    }
  }

  loadCatalogos(): void {
    this.http.get<{ success: boolean; data: any[] }>(`${environment.apiUrl}/usuarios`).subscribe({
      next: (res) => {
        if (res.success) this.usuarios.set(res.data);
      }
    });
    this.http.get<{ success: boolean; data: any[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success) this.sucursales.set(res.data);
      }
    });
  }

  loadActividades(): void {
    this.isLoading.set(true);
    const params: string[] = [];
    if (this.usuarioFiltro() !== 'todos') params.push(`usuario_id=${encodeURIComponent(this.usuarioFiltro())}`);
    if (this.sucursalFiltro() !== 'todas') params.push(`sucursal_id=${encodeURIComponent(this.sucursalFiltro())}`);
    if (this.moduloFiltro() !== 'todos') params.push(`modulo=${encodeURIComponent(this.moduloFiltro())}`);
    if (this.fechaInicio()) params.push(`fecha_inicio=${encodeURIComponent(this.fechaInicio())}`);
    if (this.fechaFin()) params.push(`fecha_fin=${encodeURIComponent(this.fechaFin())}`);
    if (this.busqueda().trim()) params.push(`busqueda=${encodeURIComponent(this.busqueda().trim())}`);

    const url = `${environment.apiUrl}/auditoria${params.length > 0 ? '?' + params.join('&') : ''}`;
    this.http.get<{ success: boolean; data: AuditoriaItem[] }>(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) this.actividades.set(res.data);
      },
      error: () => this.isLoading.set(false)
    });
  }

  limpiarFiltros(): void {
    this.usuarioFiltro.set('todos');
    this.sucursalFiltro.set('todas');
    this.moduloFiltro.set('todos');
    this.fechaInicio.set('');
    this.fechaFin.set('');
    this.busqueda.set('');
    this.loadActividades();
  }

  getModuloBadgeClass(modulo: string): string {
    switch (modulo) {
      case 'POS': return 'bg-[#F5EFE6] text-[#15803D] border-[#E7E0D3]';
      case 'Compras': return 'bg-[#F5EFE6] text-[#E0432D] border-[#E7E0D3]';
      case 'Vencimientos': return 'bg-[#F5EFE6] text-[#D97706] border-[#E7E0D3]';
      case 'Ingresos/Egresos': return 'bg-[#F5EFE6] text-[#DC2626] border-[#E7E0D3]';
      case 'Caja': return 'bg-[#F5EFE6] text-[#143628] border-[#E7E0D3]';
      default: return 'bg-[#F5EFE6] text-[#12261E] border-[#E7E0D3]';
    }
  }
}
