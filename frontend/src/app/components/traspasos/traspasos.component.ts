import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Sucursal } from '../sucursales/sucursales.component';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface LoteDisponible {
  id: number;
  numero_lote: string;
  producto_id: number;
  producto_nombre: string;
  sucursal_id: number;
  stock_actual_unidades: number;
  precio_venta_normal: number;
  costo_unitario: number;
  fecha_vencimiento: string;
}

export interface TraspasoItem {
  id: number;
  codigo_traspaso: string;
  sucursal_origen_id: number;
  sucursal_origen_nombre: string;
  sucursal_origen_codigo: string;
  sucursal_destino_id: number;
  sucursal_destino_nombre: string;
  sucursal_destino_codigo: string;
  producto_nombre: string;
  codigo_barras: string;
  cantidad: number;
  estado: string;
  motivo?: string;
  usuario_envia_nombre: string;
  fecha_solicitud: string;
}

@Component({
  selector: 'app-traspasos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './traspasos.component.html'
})
export class TraspasosComponent implements OnInit {
  protected readonly Number = Number;

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  sucursales = signal<Sucursal[]>([]);
  lotesDisponibles = signal<LoteDisponible[]>([]);
  traspasosHistorial = signal<TraspasoItem[]>([]);
  isLoading = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  selectedLote = signal<LoteDisponible | null>(null);

  form: FormGroup = this.fb.group({
    sucursal_origen_id: [1, [Validators.required]],
    sucursal_destino_id: [2, [Validators.required]],
    producto_id: [null, [Validators.required]],
    lote_id: [null, [Validators.required]],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    motivo: ['Reabastecimiento por alta demanda', [Validators.required, Validators.minLength(5)]]
  });

  ngOnInit(): void {
    this.loadSucursales();
    this.loadHistorial();

    // Cuando cambie la sucursal de origen, recargar lotes disponibles
    this.form.get('sucursal_origen_id')?.valueChanges.subscribe(origenId => {
      this.loadLotesOrigen(origenId);
    });

    // Cuando se seleccione un lote, actualizar la referencia y el validador max
    this.form.get('lote_id')?.valueChanges.subscribe(loteId => {
      const lote = this.lotesDisponibles().find(l => l.id === Number(loteId)) || null;
      this.selectedLote.set(lote);
      if (lote) {
        this.form.patchValue({ producto_id: lote.producto_id }, { emitEvent: false });
        this.form.get('cantidad')?.setValidators([Validators.required, Validators.min(1), Validators.max(lote.stock_actual_unidades)]);
        this.form.get('cantidad')?.updateValueAndValidity();
      }
    });
  }

  loadSucursales(): void {
    this.http.get<{ success: boolean; data: Sucursal[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success && res.data.length > 0) {
          this.sucursales.set(res.data);
          const origen = res.data[0].id;
          const destino = res.data.length > 1 ? res.data[1].id : res.data[0].id;
          this.form.patchValue({ sucursal_origen_id: origen, sucursal_destino_id: destino });
          this.loadLotesOrigen(origen);
        }
      }
    });
  }

  loadLotesOrigen(sucursalId: number): void {
    this.http.get<{ success: boolean; data: LoteDisponible[] }>(`${environment.apiUrl}/inventario/lotes?sucursal_id=${sucursalId}`).subscribe({
      next: (res) => {
        if (res.success) {
          // Filtrar solo los lotes con stock disponible > 0
          const conStock = res.data.filter(l => l.stock_actual_unidades > 0);
          this.lotesDisponibles.set(conStock);
          if (conStock.length > 0) {
            this.form.patchValue({ lote_id: conStock[0].id, producto_id: conStock[0].producto_id });
          } else {
            this.form.patchValue({ lote_id: null, producto_id: null });
            this.selectedLote.set(null);
          }
        }
      }
    });
  }

  loadHistorial(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: TraspasoItem[] }>(`${environment.apiUrl}/inventario/traspasos`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.traspasosHistorial.set(res.data);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.showFeedback('error', 'Error al cargar historial de traspasos');
      }
    });
  }

  getSucursalName(id: number): string {
    const s = this.sucursales().find(x => x.id === Number(id));
    return s ? s.nombre : `Sucursal #${id}`;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { sucursal_origen_id, sucursal_destino_id } = this.form.value;
    if (Number(sucursal_origen_id) === Number(sucursal_destino_id)) {
      this.showFeedback('error', 'La tienda de origen y la tienda de destino deben ser distintas');
      return;
    }

    this.isLoading.set(true);
    const payload = this.form.value;

    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/inventario/traspasos`, payload).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.showFeedback('success', res.message || 'Traspaso completado exitosamente sin mezclar inventarios');
        this.loadLotesOrigen(this.form.get('sucursal_origen_id')?.value);
        this.loadHistorial();
        this.form.patchValue({ cantidad: 1 });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showFeedback('error', err.error?.error || 'Error al ejecutar el traspaso');
      }
    });
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 5000);
  }
}
