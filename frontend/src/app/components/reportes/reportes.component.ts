import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface ReportePeriodo {
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  sucursalId: number | null;
  sucursalNombre: string;
  metodoPago: string;
}

export interface ReporteTotales {
  totalIngresos: number;
  totalEfectivoVentas: number;
  totalQrVentas: number;
  totalTarjetaVentas: number;
  totalEgresos: number;
  totalEgresosCaja: number;
  totalEgresosTransferencia: number;
  utilidadNeta: number;
  margenUtilidad: number;
  cantidadVentas: number;
  cantidadEgresos: number;
}

export interface VentaItem {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  cajero_nombre: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  cliente_nombre: string;
  cliente_nit_ci: string;
  metodo_pago: string;
  subtotal: number;
  descuento: number;
  monto_total: number;
  monto_recibido: number;
  cambio: number;
  fecha_venta: string;
}

export interface GastoItem {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  cajero_nombre: string;
  categoria_gasto: string;
  monto: number;
  comprobante_nro?: string;
  concepto: string;
  beneficiario?: string;
  metodo_pago: string;
  fecha_gasto: string;
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.component.html'
})
export class ReportesComponent implements OnInit {
  protected readonly Number = Number;
  protected readonly Math = Math;

  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  // Filtros
  sucursales = signal<{ id: number; nombre: string; codigo: string }[]>([]);
  sucursalSeleccionada = signal<string>('todas');
  periodoSeleccionado = signal<string>('mensual');
  fechaInicio = signal<string>('');
  fechaFin = signal<string>('');
  metodoPagoSeleccionado = signal<string>('todos');

  // Pestaña activa en la tabla
  tabActiva = signal<'resumen' | 'ventas' | 'egresos'>('resumen');

  // Estados de carga y feedback
  isLoading = signal<boolean>(false);
  isExportingExcel = signal<boolean>(false);
  isExportingPDF = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Datos del reporte
  periodoInfo = signal<ReportePeriodo | null>(null);
  totales = signal<ReporteTotales>({
    totalIngresos: 0,
    totalEfectivoVentas: 0,
    totalQrVentas: 0,
    totalTarjetaVentas: 0,
    totalEgresos: 0,
    totalEgresosCaja: 0,
    totalEgresosTransferencia: 0,
    utilidadNeta: 0,
    margenUtilidad: 0,
    cantidadVentas: 0,
    cantidadEgresos: 0
  });
  ventas = signal<VentaItem[]>([]);
  egresos = signal<GastoItem[]>([]);

  ngOnInit(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.fechaInicio.set(today);
    this.fechaFin.set(today);

    this.loadSucursales();
    this.consultarReporte();
  }

  loadSucursales(): void {
    this.http.get<{ success: boolean; data: any[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success) this.sucursales.set(res.data);
      }
    });
  }

  consultarReporte(): void {
    this.isLoading.set(true);

    let queryParams = `periodo=${this.periodoSeleccionado()}&metodo_pago=${this.metodoPagoSeleccionado()}`;
    if (this.sucursalSeleccionada() !== 'todas') {
      queryParams += `&sucursal_id=${this.sucursalSeleccionada()}`;
    }
    if (this.periodoSeleccionado() === 'personalizado') {
      queryParams += `&fecha_inicio=${this.fechaInicio()}&fecha_fin=${this.fechaFin()}`;
    }

    this.http.get<{ success: boolean; data: any }>(`${environment.apiUrl}/reportes/datos?${queryParams}`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.data) {
          this.periodoInfo.set(res.data.periodo);
          this.totales.set(res.data.totales);
          this.ventas.set(res.data.ventas || []);
          this.egresos.set(res.data.egresos || []);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showFeedback('error', err.error?.error || 'Error al obtener reporte');
      }
    });
  }

  descargarExcel(): void {
    this.isExportingExcel.set(true);

    let queryParams = `periodo=${this.periodoSeleccionado()}&metodo_pago=${this.metodoPagoSeleccionado()}`;
    if (this.sucursalSeleccionada() !== 'todas') {
      queryParams += `&sucursal_id=${this.sucursalSeleccionada()}`;
    }
    if (this.periodoSeleccionado() === 'personalizado') {
      queryParams += `&fecha_inicio=${this.fechaInicio()}&fecha_fin=${this.fechaFin()}`;
    }

    this.http.get(`${environment.apiUrl}/reportes/exportar/excel?${queryParams}`, {
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        this.isExportingExcel.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10);
        a.download = `CandyBoom_Reporte_${this.periodoSeleccionado()}_${timestamp}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.showFeedback('success', 'Archivo Excel descargado exitosamente');
      },
      error: () => {
        this.isExportingExcel.set(false);
        this.showFeedback('error', 'Error al generar el archivo Excel');
      }
    });
  }

  descargarPDF(): void {
    this.isExportingPDF.set(true);

    let queryParams = `periodo=${this.periodoSeleccionado()}&metodo_pago=${this.metodoPagoSeleccionado()}`;
    if (this.sucursalSeleccionada() !== 'todas') {
      queryParams += `&sucursal_id=${this.sucursalSeleccionada()}`;
    }
    if (this.periodoSeleccionado() === 'personalizado') {
      queryParams += `&fecha_inicio=${this.fechaInicio()}&fecha_fin=${this.fechaFin()}`;
    }

    this.http.get(`${environment.apiUrl}/reportes/exportar/pdf?${queryParams}`, {
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        this.isExportingPDF.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10);
        a.download = `CandyBoom_Reporte_${this.periodoSeleccionado()}_${timestamp}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.showFeedback('success', 'Archivo PDF descargado exitosamente');
      },
      error: () => {
        this.isExportingPDF.set(false);
        this.showFeedback('error', 'Error al generar el documento PDF');
      }
    });
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }
}
