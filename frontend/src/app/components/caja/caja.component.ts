import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 class="text-xl font-bold text-[#143628] tracking-tight">Caja y Egresos</h1>

        <div class="bg-white px-3 py-1.5 rounded-md border border-[#E7E0D3] text-xs font-semibold text-[#143628]">
          {{ auth.currentSucursal() }}
        </div>
      </div>

      <div *ngIf="feedbackMessage()"
        [ngClass]="feedbackMessage()?.type === 'success' ? 'bg-white text-[#15803D] border-[#15803D]' : 'bg-white text-[#DC2626] border-[#DC2626]'"
        class="px-3.5 py-2.5 rounded-md border text-xs font-semibold flex items-center justify-between">
        <span>{{ feedbackMessage()?.text }}</span>
        <button type="button" (click)="feedbackMessage.set(null)" class="text-[#52665D] hover:text-[#12261E] p-0.5 cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-lg p-5 border border-[#E7E0D3] shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b border-[#E7E0D3] pb-3">
            <h2 class="text-sm font-bold text-[#143628]">Estado de Caja</h2>
            <span
              [ngClass]="cajaActiva() ? 'text-[#15803D] border-[#15803D]/30 bg-[#F5EFE6]' : 'text-[#52665D] border-[#E7E0D3] bg-[#F5EFE6]'"
              class="px-2 py-0.5 rounded text-[11px] font-semibold border">
              {{ cajaActiva() ? 'Abierta' : 'Cerrada' }}
            </span>
          </div>

          <div *ngIf="cajaActiva()" class="space-y-3 tabular-nums">
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-[#F5EFE6] p-3 rounded-md border border-[#E7E0D3]">
                <p class="text-[11px] font-medium text-[#52665D]">Apertura</p>
                <p class="text-lg font-bold text-[#143628] mt-0.5">Bs. {{ Number(cajaActiva()?.monto_apertura).toFixed(2) }}</p>
              </div>
              <div class="bg-[#F5EFE6] p-3 rounded-md border border-[#E7E0D3]">
                <p class="text-[11px] font-medium text-[#52665D]">Ventas Efectivo</p>
                <p class="text-lg font-bold text-[#15803D] mt-0.5">Bs. {{ Number(cajaActiva()?.total_ventas_efectivo).toFixed(2) }}</p>
              </div>
              <div class="bg-[#F5EFE6] p-3 rounded-md border border-[#E7E0D3]">
                <p class="text-[11px] font-medium text-[#52665D]">Ventas QR</p>
                <p class="text-lg font-bold text-[#143628] mt-0.5">Bs. {{ Number(cajaActiva()?.total_ventas_qr).toFixed(2) }}</p>
              </div>
              <div class="bg-[#F5EFE6] p-3 rounded-md border border-[#E7E0D3]">
                <p class="text-[11px] font-medium text-[#52665D]">Egresos</p>
                <p class="text-lg font-bold text-[#DC2626] mt-0.5">Bs. {{ Number(cajaActiva()?.total_gastos).toFixed(2) }}</p>
              </div>
            </div>

            <p class="text-xs text-[#52665D]">
              Cajero: <strong class="text-[#143628]">{{ cajaActiva()?.cajero_nombre }}</strong>
            </p>
          </div>

          <div *ngIf="!cajaActiva()" class="p-4 bg-[#F5EFE6] rounded-md border border-[#E7E0D3] space-y-3">
            <p class="text-xs text-[#52665D]">Ingresa el fondo inicial en Bolivianos (Bs.) para abrir turno:</p>
            <div class="flex gap-2">
              <input
                type="number"
                #montoAp
                value="100.00"
                class="flex-1 px-3 py-2 rounded-md border border-[#E7E0D3] text-sm font-bold text-right tabular-nums bg-white focus:border-[#E0432D] outline-none"
              />
              <button
                type="button"
                (click)="abrirCaja(montoAp.value)"
                class="px-4 py-2 rounded-md text-xs font-semibold text-white bg-[#E0432D] hover:bg-[#C43420] cursor-pointer">
                Abrir Caja
              </button>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg p-5 border border-[#E7E0D3] shadow-xs space-y-4">
          <h2 class="text-sm font-bold text-[#143628] border-b border-[#E7E0D3] pb-3">Registrar Egreso</h2>

          <form [formGroup]="gastoForm" (ngSubmit)="onSubmitGasto()" class="space-y-3.5 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-[#12261E] mb-1">Categoría *</label>
                <select formControlName="categoria_gasto" class="w-full px-3 py-2 rounded-md border border-[#E7E0D3] font-medium focus:border-[#E0432D] outline-none bg-white">
                  <option value="Proveedor">Proveedor</option>
                  <option value="Alquiler">Alquiler</option>
                  <option value="Servicios Básicos">Servicios Básicos</option>
                  <option value="Impuesto RTS">Impuesto RTS</option>
                  <option value="Sueldos">Sueldos</option>
                  <option value="Viáticos/Otros">Viáticos / Otros</option>
                </select>
              </div>

              <div>
                <label class="block font-semibold text-[#12261E] mb-1">Monto (Bs.) *</label>
                <input
                  type="number"
                  step="0.50"
                  formControlName="monto"
                  class="w-full px-3 py-2 rounded-md border border-[#E7E0D3] font-bold text-right tabular-nums text-[#143628] focus:border-[#E0432D] outline-none"
                />
              </div>
            </div>

            <div>
              <label class="block font-semibold text-[#12261E] mb-1">Concepto *</label>
              <input
                type="text"
                formControlName="concepto"
                placeholder="Detalle del gasto"
                class="w-full px-3 py-2 rounded-md border border-[#E7E0D3] focus:border-[#E0432D] outline-none"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-[#12261E] mb-1">Beneficiario</label>
                <input
                  type="text"
                  formControlName="beneficiario"
                  class="w-full px-3 py-2 rounded-md border border-[#E7E0D3] focus:border-[#E0432D] outline-none"
                />
              </div>

              <div>
                <label class="block font-semibold text-[#12261E] mb-1">Comprobante N°</label>
                <input
                  type="text"
                  formControlName="comprobante_nro"
                  class="w-full px-3 py-2 rounded-md border border-[#E7E0D3] focus:border-[#E0432D] outline-none"
                />
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <button
                type="submit"
                [disabled]="isSubmittingGasto()"
                class="px-4 py-2 rounded-md font-semibold text-white bg-[#E0432D] hover:bg-[#C43420] disabled:opacity-50 cursor-pointer">
                {{ isSubmittingGasto() ? 'Registrando...' : 'Registrar Egreso' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
})
export class CajaComponent implements OnInit {
  protected readonly Number = Number;
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  cajaActiva = signal<any | null>(null);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  isSubmittingGasto = signal<boolean>(false);

  gastoForm: FormGroup = this.fb.group({
    categoria_gasto: ['Viáticos/Otros', [Validators.required]],
    monto: [15.00, [Validators.required, Validators.min(0.5)]],
    concepto: ['', [Validators.required, Validators.minLength(4)]],
    beneficiario: [''],
    comprobante_nro: [''],
    metodo_pago: ['efectivo']
  });

  ngOnInit(): void {
    this.loadCajaActiva();
  }

  loadCajaActiva(): void {
    this.http.get<{ success: boolean; data: any }>(`${environment.apiUrl}/pos/arqueo-activo`).subscribe({
      next: (res) => {
        if (res.success) this.cajaActiva.set(res.data);
      }
    });
  }

  abrirCaja(monto: string): void {
    const val = parseFloat(monto);
    if (isNaN(val) || val < 0) {
      this.showFeedback('error', 'Ingrese un monto de apertura válido');
      return;
    }

    this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/pos/abrir-caja`, {
      monto_apertura: val,
      observaciones: 'Apertura de turno de ventas'
    }).subscribe({
      next: (res) => {
        this.showFeedback('success', res.message || 'Caja abierta');
        this.loadCajaActiva();
      },
      error: (err) => this.showFeedback('error', err.error?.error || 'Error al abrir caja')
    });
  }

  onSubmitGasto(): void {
    if (this.gastoForm.invalid) {
      this.gastoForm.markAllAsTouched();
      return;
    }

    this.isSubmittingGasto.set(true);
    this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/pos/gastos`, this.gastoForm.value).subscribe({
      next: (res) => {
        this.isSubmittingGasto.set(false);
        this.showFeedback('success', res.message || 'Egreso registrado');
        this.gastoForm.reset({
          categoria_gasto: 'Viáticos/Otros',
          monto: 15.00,
          concepto: '',
          beneficiario: '',
          comprobante_nro: '',
          metodo_pago: 'efectivo'
        });
        this.loadCajaActiva();
      },
      error: (err) => {
        this.isSubmittingGasto.set(false);
        this.showFeedback('error', err.error?.error || 'Error al registrar egreso');
      }
    });
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }
}
