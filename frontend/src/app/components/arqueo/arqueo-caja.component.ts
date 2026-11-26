import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface ArqueoActivoResumen {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  usuario_id: number;
  cajero_nombre: string;
  monto_apertura: number;
  total_ventas_efectivo: number;
  total_ventas_qr: number;
  total_ventas_tarjeta: number;
  total_gastos: number;
  total_ingresos_extra?: number;
  efectivo_esperado: number;
  total_transacciones_ventas: number;
  total_facturado_sistema: number;
  total_registros_gastos: number;
  fecha_apertura: string;
  observaciones?: string;
}

export interface ArqueoHistorial {
  id: number;
  sucursal_nombre: string;
  cajero_nombre: string;
  monto_apertura: number;
  monto_cierre_sistema: number;
  monto_cierre_real: number;
  diferencia: number;
  total_ventas_efectivo: number;
  total_ventas_qr: number;
  total_gastos: number;
  fecha_apertura: string;
  fecha_cierre: string;
  observaciones?: string;
}

@Component({
  selector: 'app-arqueo-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './arqueo-caja.component.html'
})
export class ArqueoCajaComponent implements OnInit {
  protected readonly Number = Number;
  protected readonly Math = Math;

  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  // Estados reactivos con Signals
  cajaActiva = signal<ArqueoActivoResumen | null>(null);
  historial = signal<ArqueoHistorial[]>([]);
  isLoading = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Apertura de turno
  saldoAnteriorSugerido = signal<number>(0);
  existeCierreAnterior = signal<boolean>(false);
  montoAperturaInput = signal<number>(0);
  observacionesApertura = signal<string>('Apertura de turno');

  // Cierre de turno
  efectivoFisicoContado = signal<number>(0);
  observacionesCierre = signal<string>('Cierre de turno');

  // Computados para el arqueo en vivo
  efectivoEsperado = computed(() => {
    const act = this.cajaActiva();
    if (!act) return 0;
    const ap = Number(act.monto_apertura) || 0;
    const ef = Number(act.total_ventas_efectivo) || 0;
    const ingEx = Number(act.total_ingresos_extra) || 0;
    const ga = Number(act.total_gastos) || 0;
    return parseFloat((ap + ef + ingEx - ga).toFixed(2));
  });

  diferenciaCierre = computed(() => {
    const contado = Number(this.efectivoFisicoContado()) || 0;
    const esperado = this.efectivoEsperado();
    return parseFloat((contado - esperado).toFixed(2));
  });

  cuadraExacto = computed(() => {
    return Math.abs(this.diferenciaCierre()) < 0.01;
  });

  esSobrante = computed(() => {
    return this.diferenciaCierre() > 0.01;
  });

  esFaltante = computed(() => {
    return this.diferenciaCierre() < -0.01;
  });

  ngOnInit(): void {
    this.loadEstadoCaja();
    this.loadHistorial();
  }

  loadEstadoCaja(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: ArqueoActivoResumen | null }>(`${environment.apiUrl}/pos/arqueo-activo`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.cajaActiva.set(res.data);
          if (res.data) {
            // Inicializar el conteo sugerido con el monto esperado
            this.efectivoFisicoContado.set(res.data.efectivo_esperado);
          } else {
            // Si la caja está cerrada, consultar saldo del cierre anterior
            this.loadSaldoAnterior();
          }
        }
      },
      error: () => this.isLoading.set(false)
    });
  }

  loadSaldoAnterior(): void {
    this.http.get<{ success: boolean; data: { existeCierreAnterior: boolean; saldoSugerido: number } }>(`${environment.apiUrl}/pos/saldo-anterior`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.existeCierreAnterior.set(res.data.existeCierreAnterior);
          this.saldoAnteriorSugerido.set(res.data.saldoSugerido);
          this.montoAperturaInput.set(res.data.saldoSugerido);
        }
      }
    });
  }

  loadHistorial(): void {
    this.http.get<{ success: boolean; data: ArqueoHistorial[] }>(`${environment.apiUrl}/pos/historial-arqueos`).subscribe({
      next: (res) => {
        if (res.success) this.historial.set(res.data);
      }
    });
  }

  abrirTurno(): void {
    const monto = Number(this.montoAperturaInput());
    if (isNaN(monto) || monto < 0) {
      this.showFeedback('error', 'El monto de apertura no puede ser negativo');
      return;
    }

    this.isLoading.set(true);
    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/pos/abrir-caja`, {
      monto_apertura: monto,
      observaciones: this.observacionesApertura() || 'Apertura de turno de caja'
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.showFeedback('success', res.message || 'Caja abierta con éxito');
        this.loadEstadoCaja();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showFeedback('error', err.error?.error || 'Error al abrir caja');
      }
    });
  }

  cerrarTurno(): void {
    const contado = Number(this.efectivoFisicoContado());
    if (isNaN(contado) || contado < 0) {
      this.showFeedback('error', 'Debe ingresar el efectivo físico contado');
      return;
    }

    this.isLoading.set(true);
    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/pos/cerrar-caja`, {
      monto_cierre_real: contado,
      observaciones: this.observacionesCierre() || 'Cierre de turno normal'
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.showFeedback('success', res.message || 'Turno de caja cerrado exitosamente');
        this.loadEstadoCaja();
        this.loadHistorial();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showFeedback('error', err.error?.error || 'Error al cerrar caja');
      }
    });
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 5000);
  }
}
