import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { Sucursal } from '../sucursales/sucursales.component';
import { environment } from '../../../environments/environment';

export interface MovimientoItem {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  usuario_id: number;
  cajero_nombre: string;
  tipo: 'egreso' | 'ingreso';
  categoria_gasto: string;
  monto: number;
  comprobante_nro?: string;
  concepto: string;
  beneficiario?: string;
  metodo_pago: 'efectivo' | 'transferencia_qr' | 'cheque';
  fecha_gasto: string;
}

export interface MovimientosResumen {
  totalVentas: number;
  totalIngresosExtra: number;
  totalIngresos: number;
  totalEgresos: number;
  saldoNetoCaja: number;
  saldoCajaFisica: number;
  totalGeneral: number;
  totalEfectivoCaja: number;
  totalTransferenciaQR: number;
}

@Component({
  selector: 'app-egresos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './egresos.component.html'
})
export class EgresosComponent implements OnInit {
  protected readonly Number = Number;

  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  sucursales = signal<Sucursal[]>([]);
  movimientos = signal<MovimientoItem[]>([]);
  resumen = signal<MovimientosResumen>({
    totalVentas: 0,
    totalIngresosExtra: 0,
    totalIngresos: 0,
    totalEgresos: 0,
    saldoNetoCaja: 0,
    saldoCajaFisica: 0,
    totalGeneral: 0,
    totalEfectivoCaja: 0,
    totalTransferenciaQR: 0
  });

  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pestaña de registro: Egreso (Salida) vs Ingreso Extra (Entrada)
  tabRegistro = signal<'egreso' | 'ingreso'>('egreso');
  sucursalRegistroId = signal<number>(1);

  // Filtros de la tabla unificada
  filtroSucursal = signal<string>('todas');
  filtroTipo = signal<'todos' | 'ingreso' | 'egreso'>('todos');
  filtroCategoria = signal<string>('todas');
  filtroFechaInicio = signal<string>('');
  filtroFechaFin = signal<string>('');

  readonly categoriasEgreso = [
    'Proveedor',
    'Alquiler',
    'Servicios Básicos',
    'Impuesto RTS',
    'Sueldos',
    'Viáticos/Otros'
  ];

  readonly categoriasIngreso = [
    'Reposición de Cambio',
    'Aporte de Caja',
    'Cobro de Deuda',
    'Otro Ingreso'
  ];

  form: FormGroup = this.fb.group({
    categoria_gasto: ['Proveedor', [Validators.required]],
    monto: [50.00, [Validators.required, Validators.min(0.5)]],
    metodo_pago: ['efectivo', [Validators.required]],
    concepto: ['', [Validators.required, Validators.minLength(4)]],
    beneficiario: [''],
    comprobante_nro: ['']
  });

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user?.rol === 'vendedor' && user.sucursal_id) {
      this.sucursalRegistroId.set(user.sucursal_id);
      this.filtroSucursal.set(String(user.sucursal_id));
    }

    this.cargarSucursales();
    this.loadMovimientos();
  }

  cargarSucursales(): void {
    this.http.get<{ success: boolean; data: Sucursal[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success && res.data.length > 0) {
          this.sucursales.set(res.data);
          if (this.auth.isAdmin()) {
            this.sucursalRegistroId.set(res.data[0].id);
          }
        }
      }
    });
  }

  setTabRegistro(tipo: 'egreso' | 'ingreso'): void {
    this.tabRegistro.set(tipo);
    const defaultCat = tipo === 'egreso' ? 'Proveedor' : 'Reposición de Cambio';
    this.form.patchValue({
      categoria_gasto: defaultCat,
      metodo_pago: 'efectivo'
    });
  }

  setCategoria(cat: string): void {
    this.form.patchValue({ categoria_gasto: cat });
  }

  setMetodoPago(metodo: 'efectivo' | 'transferencia_qr'): void {
    this.form.patchValue({ metodo_pago: metodo });
  }

  loadMovimientos(): void {
    this.isLoading.set(true);
    const params: string[] = [];

    if (this.auth.isAdmin()) {
      params.push(`sucursal_id=${encodeURIComponent(this.filtroSucursal())}`);
    } else if (this.auth.currentUser()?.sucursal_id) {
      params.push(`sucursal_id=${this.auth.currentUser()?.sucursal_id}`);
    }

    if (this.filtroTipo() !== 'todos') {
      params.push(`tipo=${this.filtroTipo()}`);
    }
    if (this.filtroCategoria() !== 'todas') {
      params.push(`categoria_gasto=${encodeURIComponent(this.filtroCategoria())}`);
    }
    if (this.filtroFechaInicio()) {
      params.push(`fecha_inicio=${this.filtroFechaInicio()}`);
    }
    if (this.filtroFechaFin()) {
      params.push(`fecha_fin=${this.filtroFechaFin()}`);
    }

    const url = `${environment.apiUrl}/pos/gastos${params.length > 0 ? '?' + params.join('&') : ''}`;
    this.http.get<{ success: boolean; data: MovimientoItem[]; resumen: MovimientosResumen }>(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.movimientos.set(res.data);
          if (res.resumen) this.resumen.set(res.resumen);
        }
      },
      error: () => this.isLoading.set(false)
    });
  }

  limpiarFiltros(): void {
    if (this.auth.isAdmin()) {
      this.filtroSucursal.set('todas');
    }
    this.filtroTipo.set('todos');
    this.filtroCategoria.set('todas');
    this.filtroFechaInicio.set('');
    this.filtroFechaFin.set('');
    this.loadMovimientos();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const tipo = this.tabRegistro();
    const payload = {
      ...this.form.value,
      tipo,
      sucursal_id: this.auth.isAdmin() ? this.sucursalRegistroId() : this.auth.currentUser()?.sucursal_id
    };

    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/pos/gastos`, payload).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.showFeedback('success', res.message || 'Movimiento registrado con éxito');
        this.form.reset({
          categoria_gasto: tipo === 'egreso' ? 'Proveedor' : 'Reposición de Cambio',
          monto: 50.00,
          metodo_pago: 'efectivo',
          concepto: '',
          beneficiario: '',
          comprobante_nro: ''
        });
        this.loadMovimientos();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.showFeedback('error', err.error?.error || 'Error al registrar el movimiento');
      }
    });
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }
}
