import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface VencimientoLote {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  sucursal_codigo?: string;
  producto_id: number;
  producto_nombre: string;
  categoria_nombre?: string;
  codigo_barras: string;
  unidad_medida: string;
  numero_lote: string;
  stock_actual_unidades: number;
  costo_unitario?: number;
  precio_venta_normal: number;
  en_oferta: number;
  descuento_porcentaje: number;
  precio_venta_oferta: number | null;
  fecha_vencimiento: string;
  dias_restantes: number;
  estado_alerta: 'vencido' | 'critico' | 'alerta' | 'normal';
  ahorro_bs?: number;
}

export interface SucursalOption {
  id: number;
  nombre: string;
  codigo: string;
}

export interface ConfigWhatsapp {
  telefono: string;
  activo: boolean | number;
  hora_envio?: string;
  apikey_callmebot?: string;
  webhook_url?: string;
  ultimo_envio?: string | null;
}

@Component({
  selector: 'app-vencimientos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './vencimientos.component.html'
})
export class VencimientosComponent implements OnInit {
  protected readonly Number = Number;
  protected readonly Math = Math;

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  // Estados
  sucursales = signal<SucursalOption[]>([]);
  selectedSucursal = signal<string>('todas');
  lotes = signal<VencimientoLote[]>([]);
  filtroActivo = signal<'todos' | '14_dias' | 'vencidos' | 'en_oferta'>('todos');
  isLoading = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modales
  showOfferModal = signal<boolean>(false);
  showWhatsappConfigModal = signal<boolean>(false);
  showWhatsappPreviewModal = signal<boolean>(false);
  selectedLote = signal<VencimientoLote | null>(null);

  // WhatsApp
  isSendingWhatsapp = signal<boolean>(false);
  ultimoResultadoWhatsapp = signal<any>(null);
  whatsappConfig = signal<ConfigWhatsapp>({
    telefono: '+59170000000',
    activo: 1,
    hora_envio: '08:00'
  });

  // Formulario reactivo del Modal de Oferta / Rebaja
  offerForm: FormGroup = this.fb.group({
    en_oferta: [true],
    descuento_porcentaje: [20, [Validators.required, Validators.min(1), Validators.max(90)]],
    precio_venta_oferta: [0.00, [Validators.required, Validators.min(0.10)]]
  });

  // Formulario de WhatsApp
  whatsappForm: FormGroup = this.fb.group({
    telefono: ['+59170000000', [Validators.required, Validators.minLength(8)]],
    activo: [true],
    hora_envio: ['08:00'],
    apikey_callmebot: [''],
    webhook_url: ['']
  });

  // Cálculo en vivo del ahorro en el modal de ofertas
  ahorroCalculado = computed(() => {
    const lote = this.selectedLote();
    if (!lote) return 0;
    const normal = Number(lote.precio_venta_normal) || 0;
    const oferta = Number(this.offerForm.get('precio_venta_oferta')?.value) || 0;
    return parseFloat(Math.max(0, normal - oferta).toFixed(2));
  });

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user?.rol === 'vendedor' && user.sucursal_id) {
      this.selectedSucursal.set(String(user.sucursal_id));
    }
    this.cargarSucursales();
    if (this.auth.isAdmin()) {
      this.cargarConfigWhatsapp();
    }
    this.loadVencimientos();

    // Sincronizar recálculo de precio en base al porcentaje
    this.offerForm.get('descuento_porcentaje')?.valueChanges.subscribe(pct => {
      const lote = this.selectedLote();
      if (lote && pct) {
        const desc = parseFloat(pct);
        const precioNormal = Number(lote.precio_venta_normal);
        const nuevoPrecio = parseFloat((precioNormal * (1 - desc / 100)).toFixed(2));
        this.offerForm.patchValue({ precio_venta_oferta: nuevoPrecio }, { emitEvent: false });
      }
    });

    // Sincronizar porcentaje si el usuario escribe el precio final
    this.offerForm.get('precio_venta_oferta')?.valueChanges.subscribe(oferta => {
      const lote = this.selectedLote();
      if (lote && oferta) {
        const pOferta = parseFloat(oferta);
        const pNormal = Number(lote.precio_venta_normal);
        if (pNormal > 0 && pOferta < pNormal) {
          const desc = parseFloat((((pNormal - pOferta) / pNormal) * 100).toFixed(1));
          this.offerForm.patchValue({ descuento_porcentaje: desc }, { emitEvent: false });
        }
      }
    });
  }

  cargarSucursales(): void {
    this.http.get<{ success: boolean; data: SucursalOption[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success) {
          this.sucursales.set(res.data);
          // Si el usuario es vendedor, forzar su sucursal asignada
          const user = this.auth.currentUser();
          if (user?.rol === 'vendedor' && user.sucursal_id) {
            this.selectedSucursal.set(String(user.sucursal_id));
          }
        }
      }
    });
  }

  cargarConfigWhatsapp(): void {
    this.http.get<{ success: boolean; data: ConfigWhatsapp }>(`${environment.apiUrl}/inventario/vencimientos/config-whatsapp`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.whatsappConfig.set(res.data);
          this.whatsappForm.patchValue({
            telefono: res.data.telefono,
            activo: Boolean(res.data.activo),
            hora_envio: res.data.hora_envio || '08:00',
            apikey_callmebot: res.data.apikey_callmebot || '',
            webhook_url: res.data.webhook_url || ''
          });
        }
      }
    });
  }

  loadVencimientos(): void {
    this.isLoading.set(true);
    const filtro = this.filtroActivo();
    const sucursal = this.selectedSucursal();

    let url = `${environment.apiUrl}/inventario/vencimientos?filtro=${filtro}`;
    if (sucursal && sucursal !== 'todas') {
      url += `&sucursal_id=${sucursal}`;
    }

    this.http.get<{ success: boolean; data: VencimientoLote[] }>(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.lotes.set(res.data);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.showFeedback('error', 'Error al obtener alertas de vencimiento');
      }
    });
  }

  onSucursalChange(sucId: string): void {
    this.selectedSucursal.set(sucId);
    this.loadVencimientos();
  }

  setFiltro(filtro: 'todos' | '14_dias' | 'vencidos' | 'en_oferta'): void {
    this.filtroActivo.set(filtro);
    this.loadVencimientos();
  }

  // =========================================================================
  // OFERTAS RÁPIDAS
  // =========================================================================

  openOfferModal(lote: VencimientoLote): void {
    this.selectedLote.set(lote);
    const descActual = lote.descuento_porcentaje > 0 ? lote.descuento_porcentaje : 20;
    const precioNormal = Number(lote.precio_venta_normal);
    const precioCalculado = lote.precio_venta_oferta 
      ? Number(lote.precio_venta_oferta) 
      : parseFloat((precioNormal * (1 - descActual / 100)).toFixed(2));

    this.offerForm.patchValue({
      en_oferta: true,
      descuento_porcentaje: descActual,
      precio_venta_oferta: precioCalculado
    });
    this.showOfferModal.set(true);
  }

  setDiscountQuick(percent: number): void {
    this.offerForm.patchValue({ descuento_porcentaje: percent });
  }

  removeOffer(): void {
    const lote = this.selectedLote();
    if (!lote) return;

    this.isLoading.set(true);
    this.http.put<{ success: boolean; message: string }>(`${environment.apiUrl}/inventario/lotes/${lote.id}/oferta`, {
      en_oferta: 0,
      descuento_porcentaje: 0,
      precio_venta_oferta: null
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.closeModal();
        this.showFeedback('success', res.message || 'Lote retirado de oferta promocional');
        this.loadVencimientos();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showFeedback('error', err.error?.error || 'Error al retirar la oferta');
      }
    });
  }

  closeModal(): void {
    this.showOfferModal.set(false);
    this.selectedLote.set(null);
  }

  onSubmitOffer(): void {
    if (this.offerForm.invalid) {
      this.offerForm.markAllAsTouched();
      return;
    }

    const lote = this.selectedLote();
    if (!lote) return;

    this.isLoading.set(true);
    const payload = this.offerForm.value;

    this.http.put<{ success: boolean; message: string }>(`${environment.apiUrl}/inventario/lotes/${lote.id}/oferta`, payload).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.closeModal();
        this.showFeedback('success', res.message || 'Precio promocional aplicado con éxito');
        this.loadVencimientos();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showFeedback('error', err.error?.error || 'No se pudo aplicar el descuento');
      }
    });
  }

  // =========================================================================
  // ALERTAS WHATSAPP GERENCIA
  // =========================================================================

  openWhatsappConfig(): void {
    this.showWhatsappConfigModal.set(true);
  }

  closeWhatsappConfig(): void {
    this.showWhatsappConfigModal.set(false);
  }

  guardarConfigWhatsapp(): void {
    if (this.whatsappForm.invalid) {
      this.whatsappForm.markAllAsTouched();
      return;
    }

    this.http.post<{ success: boolean; message: string; data: ConfigWhatsapp }>(
      `${environment.apiUrl}/inventario/vencimientos/config-whatsapp`,
      this.whatsappForm.value
    ).subscribe({
      next: (res) => {
        this.closeWhatsappConfig();
        this.whatsappConfig.set(res.data);
        this.showFeedback('success', 'Configuración de alertas WhatsApp guardada');
      },
      error: (err) => {
        this.showFeedback('error', err.error?.error || 'Error al guardar configuración');
      }
    });
  }

  enviarAlertaWhatsappAhora(): void {
    this.isSendingWhatsapp.set(true);
    this.http.post<{ success: boolean; message: string; data: any }>(
      `${environment.apiUrl}/inventario/vencimientos/notificar-whatsapp`,
      {}
    ).subscribe({
      next: (res) => {
        this.isSendingWhatsapp.set(false);
        this.ultimoResultadoWhatsapp.set(res.data);
        this.showWhatsappPreviewModal.set(true);
        this.showFeedback('success', res.message || 'Alerta generada exitosamente');
      },
      error: (err) => {
        this.isSendingWhatsapp.set(false);
        this.showFeedback('error', err.error?.error || 'No se pudo generar la alerta');
      }
    });
  }

  abrirWhatsAppDirecto(): void {
    const resultado = this.ultimoResultadoWhatsapp();
    if (resultado && resultado.whatsappUrl) {
      window.open(resultado.whatsappUrl, '_blank');
    }
  }

  abrirWhatsAppUrl(url: string): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  closeWhatsappPreview(): void {
    this.showWhatsappPreviewModal.set(false);
  }

  // =========================================================================
  // CONTADORES REACTIVOS PARA LOS KPI CARDS
  // =========================================================================

  countVencidos(): number {
    return this.lotes().filter(l => l.dias_restantes <= 0).length;
  }

  count14Dias(): number {
    return this.lotes().filter(l => l.dias_restantes > 0 && l.dias_restantes <= 14).length;
  }

  count30Dias(): number {
    return this.lotes().filter(l => l.dias_restantes > 14 && l.dias_restantes <= 30).length;
  }

  countEnOferta(): number {
    return this.lotes().filter(l => l.en_oferta === 1).length;
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }
}
