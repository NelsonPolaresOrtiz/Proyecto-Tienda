import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import Chart from 'chart.js/auto';
import { environment } from '../../../environments/environment';

export interface DashboardKPIs {
  ventasTotales: number;
  totalEfectivo: number;
  totalQR: number;
  totalTarjeta: number;
  gastosOperativos: number;
  gastosEfectivo: number;
  gastosTransferencia: number;
  utilidadNeta: number;
  margenUtilidad: number;
  totalTransacciones: number;
  ticketPromedio: number;
}

export interface VentaDia {
  fecha: string;
  fecha_corta: string;
  total: number;
  efectivo: number;
  qr: number;
  transacciones: number;
}

export interface PagoDist {
  metodo_pago: string;
  total_operaciones: number;
  monto_total: number;
}

export interface TopProduct {
  id: number;
  nombre: string;
  categoria: string;
  categoria_color: string;
  unidades_vendidas: number;
  ingresos_totales: number;
}

export interface AlertaVencimiento {
  id: number;
  numero_lote: string;
  fecha_vencimiento: string;
  stock_actual_unidades: number;
  en_oferta: number;
  precio_venta_normal: number;
  precio_venta_oferta: number | null;
  producto_nombre: string;
  codigo_barras: string;
  sucursal_nombre: string;
  dias_para_vencer: number;
}

export interface AlertaStock {
  id: number;
  producto_id: number;
  stock_total_unidades: number;
  stock_minimo_alerta: number;
  precio_venta_normal: number;
  producto_nombre: string;
  codigo_barras: string;
  unidad_medida: string;
  sucursal_nombre: string;
  categoria_nombre: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly Number = Number;
  protected readonly Math = Math;

  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  @ViewChild('ventasChart') ventasCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pagosChart') pagosCanvas!: ElementRef<HTMLCanvasElement>;

  private ventasChartInstance: Chart | null = null;
  private pagosChartInstance: Chart | null = null;

  // Estados reactivos con Signals
  sucursales = signal<{ id: number; nombre: string; codigo: string }[]>([]);
  sucursalSeleccionada = signal<string>('todas');
  isLoading = signal<boolean>(false);

  kpis = signal<DashboardKPIs>({
    ventasTotales: 0,
    totalEfectivo: 0,
    totalQR: 0,
    totalTarjeta: 0,
    gastosOperativos: 0,
    gastosEfectivo: 0,
    gastosTransferencia: 0,
    utilidadNeta: 0,
    margenUtilidad: 0,
    totalTransacciones: 0,
    ticketPromedio: 0
  });

  ventasPorDia = signal<VentaDia[]>([]);
  distribucionPagos = signal<PagoDist[]>([]);
  topProductos = signal<TopProduct[]>([]);
  alertasVencimiento = signal<AlertaVencimiento[]>([]);
  alertasStock = signal<AlertaStock[]>([]);

  ngOnInit(): void {
    this.loadSucursales();
    this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    // Si los datos ya llegaron antes de renderizar la vista, renderizar gráficos
    if (this.ventasPorDia().length > 0 || this.distribucionPagos().length > 0) {
      this.initCharts();
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  loadSucursales(): void {
    this.http.get<{ success: boolean; data: any[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success) {
          this.sucursales.set(res.data);
        }
      }
    });
  }

  onSucursalChange(nuevaSucursal: string): void {
    this.sucursalSeleccionada.set(nuevaSucursal);
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading.set(true);
    const suc = this.sucursalSeleccionada();
    const url = `${environment.apiUrl}/dashboard/resumen?sucursal_id=${encodeURIComponent(suc)}`;

    this.http.get<{ success: boolean; data: any }>(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.data) {
          this.kpis.set(res.data.kpis);
          this.ventasPorDia.set(res.data.ventasPorDia || []);
          this.distribucionPagos.set(res.data.distribucionPagos || []);
          this.topProductos.set(res.data.topProductos || []);
          this.alertasVencimiento.set(res.data.alertas?.proximosVencer || []);
          this.alertasStock.set(res.data.alertas?.stockBajo || []);

          setTimeout(() => this.initCharts(), 50);
        }
      },
      error: () => this.isLoading.set(false)
    });
  }

  private destroyCharts(): void {
    if (this.ventasChartInstance) {
      this.ventasChartInstance.destroy();
      this.ventasChartInstance = null;
    }
    if (this.pagosChartInstance) {
      this.pagosChartInstance.destroy();
      this.pagosChartInstance = null;
    }
  }

  private initCharts(): void {
    this.destroyCharts();

    // 1. Gráfico de Ventas Diarias (Líneas y Barras)
    if (this.ventasCanvas?.nativeElement) {
      const dias = this.ventasPorDia();
      const labels = dias.length > 0 ? dias.map(d => d.fecha_corta) : ['Sin datos'];
      const dataTotal = dias.length > 0 ? dias.map(d => Number(d.total)) : [0];
      const dataEfectivo = dias.length > 0 ? dias.map(d => Number(d.efectivo)) : [0];
      const dataQR = dias.length > 0 ? dias.map(d => Number(d.qr)) : [0];

      this.ventasChartInstance = new Chart(this.ventasCanvas.nativeElement, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              type: 'line',
              label: 'Ventas Totales (Bs.)',
              data: dataTotal,
              borderColor: '#143628',
              backgroundColor: 'rgba(20, 54, 40, 0.08)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
              pointBackgroundColor: '#143628',
              pointRadius: 3
            },
            {
              type: 'bar',
              label: 'Efectivo (Bs.)',
              data: dataEfectivo,
              backgroundColor: '#143628',
              borderRadius: 4
            },
            {
              type: 'bar',
              label: 'QR Simple (Bs.)',
              data: dataQR,
              backgroundColor: '#E0432D',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 12,
                color: '#12261E',
                font: { size: 11, family: 'sans-serif', weight: 'bold' }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: Bs. ${Number(ctx.raw).toFixed(2)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: '#52665D',
                callback: (val) => `Bs. ${val}`
              },
              grid: { color: '#E7E0D3' }
            },
            x: {
              ticks: { color: '#52665D' },
              grid: { display: false }
            }
          }
        }
      });
    }

    // 2. Gráfico de Métodos de Pago (Doughnut)
    if (this.pagosCanvas?.nativeElement) {
      const dist = this.distribucionPagos();
      const labels = dist.length > 0 ? dist.map(d => d.metodo_pago.toUpperCase()) : ['Efectivo', 'QR Simple'];
      const dataValues = dist.length > 0 ? dist.map(d => Number(d.monto_total)) : [1, 0];

      this.pagosChartInstance = new Chart(this.pagosCanvas.nativeElement, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data: dataValues,
              backgroundColor: ['#143628', '#E0432D', '#15803D', '#52665D'],
              borderWidth: 2,
              borderColor: '#FFFFFF'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                color: '#12261E',
                font: { size: 11, family: 'sans-serif', weight: 'bold' }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: Bs. ${Number(ctx.raw).toFixed(2)}`
              }
            }
          }
        }
      });
    }
  }
}
