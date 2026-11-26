import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface Sucursal {
  id: number;
  nombre: string;
  codigo: string;
  direccion?: string;
  telefono?: string;
  es_matriz?: number;
}

export interface Categoria {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
}

export interface InventarioKpis {
  totalProductos: number;
  capitalInvertido: number;
  alertasStockBajo: number;
  lotesPorVencer: number;
}

export interface InventarioProductoItem {
  id: number;
  codigo_barras: string;
  nombre: string;
  descripcion: string | null;
  unidad_medida: string;
  contenido_por_caja: number;
  categoria_id: number;
  categoria_nombre: string;
  categoria_color?: string;
  sucursal_producto_id: number;
  sucursal_id: number;
  precio_venta_normal: number | string;
  en_oferta: number | boolean;
  descuento_porcentaje: number | string;
  precio_venta_oferta: number | string | null;
  precio_vigente: number | string;
  stock_total_unidades: number;
  stock_minimo_alerta: number;
  costo_unitario_promedio: number | string;
  proximo_lote: string | null;
  proximo_vencimiento: string | Date | null;
  dias_para_vencer: number | null;
  lotes_activos: number;
  stock_cajas: number;
  stock_sueltas: number;
  stock_equivalente: string;
  margen_porcentaje: number;
}

export interface LoteProductoItem {
  id: number;
  numero_lote: string;
  proveedor: string | null;
  fecha_ingreso: string;
  cajas_compradas: number;
  unidades_por_caja: number;
  unidades_totales_ingresadas: number;
  stock_actual_unidades: number;
  costo_caja: number | string;
  costo_unitario: number | string;
  precio_venta_normal: number | string;
  en_oferta: number | boolean;
  descuento_porcentaje: number | string;
  precio_venta_oferta: number | string | null;
  fecha_vencimiento: string;
  dias_restantes: number;
  estado_alerta: 'vencido' | 'critico' | 'proximo' | 'normal';
}

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './inventario.component.html'
})
export class InventarioComponent implements OnInit {
  protected readonly Number = Number;
  protected readonly Math = Math;

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  // Estado general reactivo (Signals)
  sucursales = signal<Sucursal[]>([]);
  selectedSucursalId = signal<number>(1);
  categorias = signal<Categoria[]>([]);
  productos = signal<InventarioProductoItem[]>([]);
  kpis = signal<InventarioKpis>({
    totalProductos: 0,
    capitalInvertido: 0,
    alertasStockBajo: 0,
    lotesPorVencer: 0
  });

  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtros reactivos
  busqueda = signal<string>('');
  categoriaFiltro = signal<number | null>(null);
  estadoFiltro = signal<'todos' | 'stock_bajo' | 'en_oferta'>('todos');

  // Modales
  showModalNuevoProducto = signal<boolean>(false);
  showModalLotes = signal<boolean>(false);
  showModalPrecioOferta = signal<boolean>(false);
  showModalAjuste = signal<boolean>(false);

  // Elemento activo en modal
  selectedProducto = signal<InventarioProductoItem | null>(null);
  lotesProducto = signal<LoteProductoItem[]>([]);
  loadingLotes = signal<boolean>(false);

  // Formularios reactivos
  productoForm: FormGroup = this.fb.group({
    codigo_barras: ['', [Validators.required, Validators.minLength(4)]],
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    descripcion: [''],
    categoria_id: [1, [Validators.required]],
    unidad_medida: ['Unidad', [Validators.required]],
    contenido_por_caja: [24, [Validators.required, Validators.min(1)]],
    precio_venta_normal: [5.00, [Validators.required, Validators.min(0.10)]],
    stock_minimo_alerta: [10, [Validators.required, Validators.min(0)]]
  });

  precioOfertaForm: FormGroup = this.fb.group({
    precio_venta_normal: [0.00, [Validators.required, Validators.min(0.10)]],
    en_oferta: [false],
    descuento_porcentaje: [15, [Validators.min(1), Validators.max(90)]],
    precio_venta_oferta: [0.00]
  });

  ajusteStockForm: FormGroup = this.fb.group({
    tipo_ajuste: ['conteo_fisico', [Validators.required]],
    nuevo_stock: [0, [Validators.required, Validators.min(0)]],
    motivo: ['', [Validators.required, Validators.minLength(5)]]
  });

  // Cálculo reactivo de diferencia en ajuste
  diferenciaAjuste = computed(() => {
    const prod = this.selectedProducto();
    if (!prod) return 0;
    const nuevo = Number(this.ajusteStockForm.get('nuevo_stock')?.value) || 0;
    return nuevo - Number(prod.stock_total_unidades);
  });

  ngOnInit(): void {
    this.cargarSucursales();
    this.cargarCategorias();

    // Sincronizar recálculo de oferta en modal de precios
    this.precioOfertaForm.get('descuento_porcentaje')?.valueChanges.subscribe((pct) => {
      const normal = Number(this.precioOfertaForm.get('precio_venta_normal')?.value) || 0;
      if (pct && normal > 0) {
        const desc = parseFloat(pct);
        const precioOferta = parseFloat((normal * (1 - desc / 100)).toFixed(2));
        this.precioOfertaForm.patchValue({ precio_venta_oferta: precioOferta }, { emitEvent: false });
      }
    });

    this.precioOfertaForm.get('precio_venta_normal')?.valueChanges.subscribe((normal) => {
      const enOferta = this.precioOfertaForm.get('en_oferta')?.value;
      const pct = Number(this.precioOfertaForm.get('descuento_porcentaje')?.value) || 0;
      if (enOferta && pct > 0 && normal > 0) {
        const precioOferta = parseFloat((Number(normal) * (1 - pct / 100)).toFixed(2));
        this.precioOfertaForm.patchValue({ precio_venta_oferta: precioOferta }, { emitEvent: false });
      }
    });
  }

  cargarSucursales(): void {
    this.http.get<{ success: boolean; data: Sucursal[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success && res.data.length > 0) {
          this.sucursales.set(res.data);
          
          // Si el usuario es vendedor, forzar su sucursal_id
          const user = this.auth.currentUser();
          if (user?.rol === 'vendedor' && user.sucursal_id) {
            this.selectedSucursalId.set(user.sucursal_id);
          } else {
            // Verificar si viene sucursal_id en queryParams
            const qSucursalId = this.route.snapshot.queryParamMap.get('sucursal_id');
            const targetId = qSucursalId ? parseInt(qSucursalId, 10) : null;
            if (targetId && res.data.some(s => s.id === targetId)) {
              this.selectedSucursalId.set(targetId);
            } else {
              this.selectedSucursalId.set(res.data[0].id);
            }
          }
          this.loadInventario();
        }
      },
      error: () => this.loadInventario()
    });
  }

  cargarCategorias(): void {
    this.http.get<{ success: boolean; data: Categoria[] }>(`${environment.apiUrl}/inventario/categorias`).subscribe({
      next: (res) => {
        if (res.success) this.categorias.set(res.data);
      },
      error: () => {
        // Fallback a /api/pos/categorias si aplica
        this.http.get<{ success: boolean; data: Categoria[] }>(`${environment.apiUrl}/pos/categorias`).subscribe({
          next: (res) => {
            if (res.success) this.categorias.set(res.data);
          }
        });
      }
    });
  }

  loadInventario(): void {
    this.isLoading.set(true);
    const sucursalId = this.selectedSucursalId();
    const busqueda = encodeURIComponent(this.busqueda().trim());
    const categoria = this.categoriaFiltro() !== null ? this.categoriaFiltro() : '';
    const estado = this.estadoFiltro();

    const url = `${environment.apiUrl}/inventario/sucursal/${sucursalId}?busqueda=${busqueda}&categoria_id=${categoria}&estado=${estado}`;

    this.http.get<{ success: boolean; kpis: InventarioKpis; data: InventarioProductoItem[] }>(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.productos.set(res.data || []);
          if (res.kpis) {
            this.kpis.set(res.kpis);
          }
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.mostrarMensaje('error', 'Error al cargar el inventario: ' + (err.error?.error || err.message));
      }
    });
  }

  onSucursalChange(id: string | number): void {
    this.selectedSucursalId.set(Number(id));
    this.loadInventario();
  }

  setEstadoFiltro(estado: 'todos' | 'stock_bajo' | 'en_oferta'): void {
    this.estadoFiltro.set(estado);
    this.loadInventario();
  }

  onSearchChange(): void {
    this.loadInventario();
  }

  onCategoriaChange(catId: string): void {
    this.categoriaFiltro.set(catId ? Number(catId) : null);
    this.loadInventario();
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.categoriaFiltro.set(null);
    this.estadoFiltro.set('todos');
    this.loadInventario();
  }

  // MODAL 1: Nuevo Producto
  openModalNuevoProducto(): void {
    this.productoForm.reset({
      codigo_barras: this.generarCodigoBarras(),
      nombre: '',
      descripcion: '',
      categoria_id: this.categorias().length > 0 ? this.categorias()[0].id : 1,
      unidad_medida: 'Unidad',
      contenido_por_caja: 24,
      precio_venta_normal: 5.00,
      stock_minimo_alerta: 10
    });
    this.showModalNuevoProducto.set(true);
  }

  closeModalNuevoProducto(): void {
    this.showModalNuevoProducto.set(false);
  }

  setUnidadesRapidasNuevo(unidades: number): void {
    this.productoForm.patchValue({ contenido_por_caja: unidades });
  }

  generarCodigoBarras(): string {
    const random = Math.floor(10000000 + Math.random() * 90000000);
    return `777${random}`;
  }

  guardarNuevoProducto(): void {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/inventario/productos`, this.productoForm.value).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.showModalNuevoProducto.set(false);
        this.mostrarMensaje('success', res.message || 'Producto registrado correctamente');
        this.loadInventario();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.mostrarMensaje('error', err.error?.error || 'No se pudo crear el producto');
      }
    });
  }

  // MODAL 2: Ver Lotes
  openModalLotes(prod: InventarioProductoItem): void {
    this.selectedProducto.set(prod);
    this.showModalLotes.set(true);
    this.loadingLotes.set(true);
    this.lotesProducto.set([]);

    const sucursalId = this.selectedSucursalId();
    this.http.get<{ success: boolean; data: LoteProductoItem[] }>(`${environment.apiUrl}/inventario/sucursal/${sucursalId}/productos/${prod.id}/lotes`).subscribe({
      next: (res) => {
        this.loadingLotes.set(false);
        if (res.success) {
          this.lotesProducto.set(res.data);
        }
      },
      error: (err) => {
        this.loadingLotes.set(false);
        this.mostrarMensaje('error', 'Error al cargar lotes: ' + (err.error?.error || err.message));
      }
    });
  }

  closeModalLotes(): void {
    this.showModalLotes.set(false);
    this.selectedProducto.set(null);
    this.lotesProducto.set([]);
  }

  // MODAL 3: Editar Precio / Oferta
  openModalPrecio(prod: InventarioProductoItem): void {
    this.selectedProducto.set(prod);
    const normal = Number(prod.precio_venta_normal) || 0;
    const isOferta = Boolean(prod.en_oferta);
    const descPct = Number(prod.descuento_porcentaje) || 15;
    const ofertaPrecio = prod.precio_venta_oferta ? Number(prod.precio_venta_oferta) : parseFloat((normal * (1 - descPct / 100)).toFixed(2));

    this.precioOfertaForm.reset({
      precio_venta_normal: normal,
      en_oferta: isOferta,
      descuento_porcentaje: descPct,
      precio_venta_oferta: ofertaPrecio
    });

    this.showModalPrecioOferta.set(true);
  }

  closeModalPrecio(): void {
    this.showModalPrecioOferta.set(false);
    this.selectedProducto.set(null);
  }

  toggleOfertaModal(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.precioOfertaForm.patchValue({ en_oferta: isChecked });
    if (isChecked) {
      const normal = Number(this.precioOfertaForm.get('precio_venta_normal')?.value) || 0;
      const pct = Number(this.precioOfertaForm.get('descuento_porcentaje')?.value) || 15;
      const oferta = parseFloat((normal * (1 - pct / 100)).toFixed(2));
      this.precioOfertaForm.patchValue({ precio_venta_oferta: oferta });
    }
  }

  guardarPrecioOferta(): void {
    if (this.precioOfertaForm.invalid) {
      this.precioOfertaForm.markAllAsTouched();
      return;
    }

    const prod = this.selectedProducto();
    if (!prod) return;

    this.isSaving.set(true);
    const sucursalId = this.selectedSucursalId();

    this.http.put<{ success: boolean; message: string; data: any }>(
      `${environment.apiUrl}/inventario/sucursal/${sucursalId}/productos/${prod.id}/precio-oferta`,
      this.precioOfertaForm.value
    ).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.showModalPrecioOferta.set(false);
        this.mostrarMensaje('success', res.message || 'Precio y condiciones de oferta actualizados');
        this.loadInventario();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.mostrarMensaje('error', err.error?.error || 'Error al actualizar precio/oferta');
      }
    });
  }

  // MODAL 4: Ajuste de Stock
  openModalAjuste(prod: InventarioProductoItem): void {
    this.selectedProducto.set(prod);
    this.ajusteStockForm.reset({
      tipo_ajuste: 'conteo_fisico',
      nuevo_stock: prod.stock_total_unidades,
      motivo: ''
    });
    this.showModalAjuste.set(true);
  }

  closeModalAjuste(): void {
    this.showModalAjuste.set(false);
    this.selectedProducto.set(null);
  }

  guardarAjusteStock(): void {
    if (this.ajusteStockForm.invalid) {
      this.ajusteStockForm.markAllAsTouched();
      return;
    }

    const prod = this.selectedProducto();
    if (!prod) return;

    this.isSaving.set(true);
    const sucursalId = this.selectedSucursalId();

    this.http.post<{ success: boolean; message: string; data: any }>(
      `${environment.apiUrl}/inventario/sucursal/${sucursalId}/productos/${prod.id}/ajuste-stock`,
      this.ajusteStockForm.value
    ).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.showModalAjuste.set(false);
        this.mostrarMensaje('success', res.message || 'Ajuste de stock registrado');
        this.loadInventario();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.mostrarMensaje('error', err.error?.error || 'Error al registrar el ajuste de stock');
      }
    });
  }

  // Navegación
  goToCompras(): void {
    this.router.navigate(['/compras']);
  }

  mostrarMensaje(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => {
      this.feedbackMessage.set(null);
    }, 5000);
  }
}
