import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

export interface Sucursal {
  id: number;
  nombre: string;
  codigo: string;
  ciudad: string;
  direccion: string;
  telefono?: string;
  es_matriz: number;
  estado: 'activo' | 'inactivo';
  ventas_hoy_bs: number | string;
  transacciones_hoy: number;
  productos_con_stock: number;
  total_productos: number;
  personal_count: number;
  personal_nombres: string;
  caja_estado: 'abierto' | 'cerrado';
  cajero_en_turno?: string | null;
  caja_fecha_apertura?: string | null;
}

@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './sucursales.component.html'
})
export class SucursalesComponent implements OnInit {
  protected readonly Number = Number;

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  sucursales = signal<Sucursal[]>([]);
  isLoading = signal<boolean>(false);
  showModal = signal<boolean>(false);
  editingSucursal = signal<Sucursal | null>(null);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Métricas Consolidadas para la Barra Superior
  totalSucursales = computed(() => this.sucursales().length);
  sucursalesActivas = computed(() => this.sucursales().filter(s => s.estado === 'activo').length);
  cajasAbiertasHoy = computed(() => this.sucursales().filter(s => s.caja_estado === 'abierto').length);
  ventasConsolidadasHoy = computed(() => 
    this.sucursales().reduce((acc, s) => acc + (Number(s.ventas_hoy_bs) || 0), 0)
  );

  form: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    codigo: ['', [Validators.required, Validators.pattern(/^[A-Z0-9_-]{3,15}$/)]],
    ciudad: ['Sucre', [Validators.required]],
    direccion: ['', [Validators.required, Validators.minLength(5)]],
    telefono: [''],
    es_matriz: [false],
    estado: ['activo']
  });

  ngOnInit(): void {
    this.loadSucursales();
  }

  loadSucursales(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: Sucursal[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.sucursales.set(res.data);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.showFeedback('error', 'Error al cargar el listado de sucursales');
      }
    });
  }

  verInventario(sucursal: Sucursal): void {
    this.router.navigate(['/inventario'], { queryParams: { sucursal_id: sucursal.id } });
  }

  openCreateModal(): void {
    this.editingSucursal.set(null);
    this.form.reset({
      nombre: '',
      codigo: `SUC-0${this.sucursales().length + 1}`,
      ciudad: 'Sucre',
      direccion: '',
      telefono: '',
      es_matriz: false,
      estado: 'activo'
    });
    this.showModal.set(true);
  }

  openEditModal(sucursal: Sucursal): void {
    this.editingSucursal.set(sucursal);
    this.form.patchValue({
      nombre: sucursal.nombre,
      codigo: sucursal.codigo,
      ciudad: sucursal.ciudad || 'Sucre',
      direccion: sucursal.direccion,
      telefono: sucursal.telefono || '',
      es_matriz: sucursal.es_matriz === 1,
      estado: sucursal.estado
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingSucursal.set(null);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.value;
    const editing = this.editingSucursal();

    this.isLoading.set(true);

    if (editing) {
      this.http.put<{ success: boolean; message: string; data: Sucursal }>(`${environment.apiUrl}/sucursales/${editing.id}`, payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.closeModal();
          this.showFeedback('success', res.message || 'Sucursal actualizada exitosamente');
          this.loadSucursales();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.showFeedback('error', err.error?.error || 'No se pudo actualizar la sucursal');
        }
      });
    } else {
      this.http.post<{ success: boolean; message: string; data: Sucursal }>(`${environment.apiUrl}/sucursales`, payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.closeModal();
          this.showFeedback('success', res.message || 'Sucursal creada con inventario inicial independiente');
          this.loadSucursales();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.showFeedback('error', err.error?.error || 'No se pudo crear la sucursal');
        }
      });
    }
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }
}
