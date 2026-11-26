import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Sucursal } from '../sucursales/sucursales.component';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface ProductoCatalogo {
  id: number;
  nombre: string;
  codigo_barras: string;
  contenido_por_caja: number;
  unidad_medida: string;
  categoria_id?: number;
  categoria_nombre: string;
  precio_venta_normal?: number;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export interface ItemCompra {
  producto_id: number;
  producto_nombre: string;
  codigo_barras: string;
  categoria_nombre: string;
  cajas_compradas: number;
  unidades_por_caja: number;
  total_unidades: number;
  costo_caja: number;
  costo_unitario: number;
  precio_venta_normal: number;
  ganancia_unitaria: number;
  ganancia_total: number;
  inversion_item: number;
  fecha_vencimiento: string;
  numero_lote: string;
}

export interface LoteHistorial {
  id: number;
  numero_lote: string;
  producto_nombre: string;
  codigo_barras: string;
  sucursal_id?: number;
  sucursal_nombre: string;
  cajas_compradas: number;
  unidades_por_caja: number;
  unidades_totales_ingresadas: number;
  stock_actual_unidades: number;
  costo_caja: number;
  costo_unitario: number;
  precio_venta_normal: number;
  fecha_ingreso: string;
  fecha_vencimiento: string;
  proveedor?: string;
  dias_restantes?: number;
}

@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './compras.component.html'
})
export class ComprasComponent implements OnInit {
  protected readonly Number = Number;
  protected readonly Math = Math;

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  // Estados generales
  sucursales = signal<Sucursal[]>([]);
  catalogo = signal<ProductoCatalogo[]>([]);
  categorias = signal<Categoria[]>([]);
  lotesRecientes = signal<LoteHistorial[]>([]);
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Cabecera Única de la Compra (se eligen una sola vez)
  sucursalId = signal<number>(1);
  proveedor = signal<string>('Distribuidora Arcor Bolivia');
  fechaIngreso = signal<string>(new Date().toISOString().slice(0, 10));
  numeroFactura = signal<string>('');
  observaciones = signal<string>('');

  // 2. Formulario de Producto a Ingresar
  selectedProductoId = signal<number>(1);
  busquedaProducto = signal<string>('');
  cajasCompradas = signal<number>(5);
  unidadesPorCaja = signal<number>(24);
  costoCaja = signal<number>(72.00);
  precioVentaTienda = signal<number>(5.00);
  fechaVencimiento = signal<string>(this.obtenerFechaSugerida());
  numeroLoteManual = signal<string>('');

  // 3. Lista de Productos en la Nota Actual
  itemsCompra = signal<ItemCompra[]>([]);

  // 4. Filtros del Historial Inferior
  filtroHistorialSucursal = signal<number | 'todas'>('todas');
  busquedaHistorial = signal<string>('');

  // Modal Nuevo Producto Rápido
  showModalNuevo = signal<boolean>(false);
  nuevoProductoForm: FormGroup = this.fb.group({
    codigo_barras: ['', [Validators.required, Validators.minLength(4)]],
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    descripcion: [''],
    categoria_id: [1, [Validators.required]],
    unidad_medida: ['Unidad', [Validators.required]],
    contenido_por_caja: [24, [Validators.required, Validators.min(1)]],
    precio_venta_normal: [5.00, [Validators.required, Validators.min(0.10)]],
    stock_minimo_alerta: [10, [Validators.required, Validators.min(0)]]
  });

  // Catálogo filtrado por buscador
  catalogoFiltrado = computed(() => {
    const q = this.busquedaProducto().toLowerCase().trim();
    if (!q) return this.catalogo();
    return this.catalogo().filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo_barras.includes(q)
    );
  });

  // =========================================================================
  // CÁLCULOS INSTANTÁNEOS DEL PRODUCTO
  // =========================================================================

  // Total unidades que entran a tienda (Cajas × Unidades por caja)
  totalUnidadesActual = computed(() => {
    const c = Math.max(0, this.cajasCompradas());
    const u = Math.max(1, this.unidadesPorCaja());
    return Math.round(c * u);
  });

  // Costo por unidad (Bs.) (Costo caja / Unidades por caja)
  costoUnitarioActual = computed(() => {
    const u = Math.max(1, this.unidadesPorCaja());
    const cCaja = Math.max(0, this.costoCaja());
    return parseFloat((cCaja / u).toFixed(2));
  });

  // Inversión del producto actual
  inversionActual = computed(() => {
    const c = Math.max(0, this.cajasCompradas());
    const cCaja = Math.max(0, this.costoCaja());
    return parseFloat((c * cCaja).toFixed(2));
  });

  // Ganancia estimada por unidad
  gananciaUnitariaActual = computed(() => {
    const p = Math.max(0, this.precioVentaTienda());
    const cu = this.costoUnitarioActual();
    return parseFloat((p - cu).toFixed(2));
  });

  // Ganancia total del producto
  gananciaTotalActual = computed(() => {
    const totalU = this.totalUnidadesActual();
    const gU = this.gananciaUnitariaActual();
    return parseFloat((totalU * gU).toFixed(2));
  });

  // Margen porcentual proyectado
  margenPorcentajeActual = computed(() => {
    const p = this.precioVentaTienda();
    const cu = this.costoUnitarioActual();
    if (p <= 0) return 0;
    return parseFloat((((p - cu) / p) * 100).toFixed(1));
  });

  // =========================================================================
  // TOTALES DE LA NOTA DE COMPRA ACTUAL
  // =========================================================================
  totalItemsNota = computed(() => this.itemsCompra().length);

  totalCajasNota = computed(() => {
    return this.itemsCompra().reduce((sum, item) => sum + item.cajas_compradas, 0);
  });

  totalUnidadesNota = computed(() => {
    return this.itemsCompra().reduce((sum, item) => sum + item.total_unidades, 0);
  });

  inversionTotalNota = computed(() => {
    const total = this.itemsCompra().reduce((sum, item) => sum + item.inversion_item, 0);
    return parseFloat(total.toFixed(2));
  });

  gananciaTotalNota = computed(() => {
    const total = this.itemsCompra().reduce((sum, item) => sum + item.ganancia_total, 0);
    return parseFloat(total.toFixed(2));
  });

  // =========================================================================
  // HISTORIAL FILTRADO
  // =========================================================================
  historialFiltrado = computed(() => {
    let list = this.lotesRecientes();
    const fSuc = this.filtroHistorialSucursal();
    if (fSuc !== 'todas') {
      list = list.filter(l => l.sucursal_id === fSuc);
    }
    const q = this.busquedaHistorial().toLowerCase().trim();
    if (q) {
      list = list.filter(l =>
        l.producto_nombre.toLowerCase().includes(q) ||
        l.codigo_barras.includes(q) ||
        l.numero_lote.toLowerCase().includes(q) ||
        (l.proveedor && l.proveedor.toLowerCase().includes(q))
      );
    }
    return list;
  });

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user?.rol === 'vendedor' && user.sucursal_id) {
      this.sucursalId.set(user.sucursal_id);
      this.filtroHistorialSucursal.set(user.sucursal_id);
    }
    this.cargarSucursales();
    this.cargarCategorias();
    this.cargarCatalogo();
    this.cargarHistorialCompras();
    this.numeroLoteManual.set(this.generarLoteAuto());
  }

  obtenerFechaSugerida(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  cargarSucursales(): void {
    this.http.get<{ success: boolean; data: Sucursal[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success && res.data.length > 0) {
          this.sucursales.set(res.data);
          const user = this.auth.currentUser();
          if (user?.rol === 'vendedor' && user.sucursal_id) {
            this.sucursalId.set(user.sucursal_id);
          } else {
            this.sucursalId.set(res.data[0].id);
          }
        }
      }
    });
  }

  cargarCategorias(): void {
    this.http.get<{ success: boolean; data: Categoria[] }>(`${environment.apiUrl}/inventario/categorias`).subscribe({
      next: (res) => {
        if (res.success) this.categorias.set(res.data);
      }
    });
  }

  cargarCatalogo(): void {
    this.http.get<{ success: boolean; data: ProductoCatalogo[] }>(`${environment.apiUrl}/inventario/catalogo`).subscribe({
      next: (res) => {
        if (res.success && res.data.length > 0) {
          this.catalogo.set(res.data);
          this.seleccionarProducto(res.data[0].id);
        }
      }
    });
  }

  cargarHistorialCompras(): void {
    this.http.get<{ success: boolean; data: LoteHistorial[] }>(`${environment.apiUrl}/inventario/lotes`).subscribe({
      next: (res) => {
        if (res.success) {
          this.lotesRecientes.set(res.data);
        }
      }
    });
  }

  seleccionarProducto(productoId: number | string): void {
    const pId = Number(productoId);
    this.selectedProductoId.set(pId);
    const prod = this.catalogo().find(p => p.id === pId);
    if (prod) {
      if (prod.contenido_por_caja && prod.contenido_por_caja > 0) {
        this.unidadesPorCaja.set(prod.contenido_por_caja);
      }
      if (prod.precio_venta_normal && Number(prod.precio_venta_normal) > 0) {
        this.precioVentaTienda.set(Number(prod.precio_venta_normal));
      }
      this.numeroLoteManual.set(this.generarLoteAuto(prod.nombre));
    }
  }

  setAtajoUnidades(unidades: number): void {
    this.unidadesPorCaja.set(unidades);
  }

  generarLoteAuto(nombre: string = 'LOTE'): string {
    const prefijo = nombre.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'BOOM');
    const fecha = new Date().toISOString().slice(2, 7).replace('-', '');
    const num = Math.floor(100 + Math.random() * 900);
    return `LOT-${prefijo}-${fecha}-${num}`;
  }

  // =========================================================================
  // GESTIÓN DE LA LISTA DE COMPRA
  // =========================================================================

  agregarProductoALista(): void {
    const prodId = this.selectedProductoId();
    const prod = this.catalogo().find(p => p.id === prodId);

    if (!prod) {
      this.mostrarMensaje('error', 'Por favor selecciona un producto válido del catálogo');
      return;
    }

    if (this.cajasCompradas() <= 0) {
      this.mostrarMensaje('error', 'Ingresa la cantidad de cajas compradas');
      return;
    }

    if (this.unidadesPorCaja() <= 0) {
      this.mostrarMensaje('error', 'Indica cuántas unidades vienen por caja');
      return;
    }

    if (this.costoCaja() <= 0) {
      this.mostrarMensaje('error', 'Indica el costo total cobrado por caja');
      return;
    }

    if (this.precioVentaTienda() <= 0) {
      this.mostrarMensaje('error', 'Indica el precio de venta en vitrina');
      return;
    }

    const item: ItemCompra = {
      producto_id: prod.id,
      producto_nombre: prod.nombre,
      codigo_barras: prod.codigo_barras,
      categoria_nombre: prod.categoria_nombre,
      cajas_compradas: this.cajasCompradas(),
      unidades_por_caja: this.unidadesPorCaja(),
      total_unidades: this.totalUnidadesActual(),
      costo_caja: this.costoCaja(),
      costo_unitario: this.costoUnitarioActual(),
      precio_venta_normal: this.precioVentaTienda(),
      ganancia_unitaria: this.gananciaUnitariaActual(),
      ganancia_total: this.gananciaTotalActual(),
      inversion_item: this.inversionActual(),
      fecha_vencimiento: this.fechaVencimiento() || this.obtenerFechaSugerida(),
      numero_lote: this.numeroLoteManual().trim() || this.generarLoteAuto(prod.nombre)
    };

    this.itemsCompra.update(items => [...items, item]);
    this.mostrarMensaje('success', `"${prod.nombre}" agregado (${item.total_unidades} u.)`);

    // Preparar siguiente lote
    this.numeroLoteManual.set(this.generarLoteAuto());
  }

  quitarItem(index: number): void {
    const item = this.itemsCompra()[index];
    this.itemsCompra.update(items => items.filter((_, i) => i !== index));
    if (item) {
      this.mostrarMensaje('success', `Se retiró "${item.producto_nombre}" de la lista`);
    }
  }

  limpiarNota(): void {
    this.itemsCompra.set([]);
  }

  // =========================================================================
  // CONFIRMAR E INGRESAR AL INVENTARIO (MYSQL)
  // =========================================================================

  guardarCompraEnInventario(): void {
    let lista = this.itemsCompra();

    if (lista.length === 0) {
      if (this.costoCaja() > 0 && this.precioVentaTienda() > 0 && this.cajasCompradas() > 0) {
        this.agregarProductoALista();
        lista = this.itemsCompra();
      } else {
        this.mostrarMensaje('error', 'Agrega al menos un producto a la lista antes de confirmar');
        return;
      }
    }

    if (lista.length === 0) return;

    this.isSaving.set(true);
    const notaObservacion = this.numeroFactura().trim() 
      ? `Factura/Nota: ${this.numeroFactura().trim()} · ${this.observaciones().trim() || 'Ingreso de mercadería'}`
      : (this.observaciones().trim() || 'Compra de mercadería por caja');

    const payload = {
      sucursal_id: this.sucursalId(),
      proveedor: this.proveedor().trim() || 'Proveedor Local',
      fecha_ingreso: this.fechaIngreso(),
      observaciones: notaObservacion,
      items: lista.map(it => ({
        producto_id: it.producto_id,
        numero_lote: it.numero_lote,
        cajas_compradas: it.cajas_compradas,
        unidades_por_caja: it.unidades_por_caja,
        costo_caja: it.costo_caja,
        precio_venta_normal: it.precio_venta_normal,
        fecha_vencimiento: it.fecha_vencimiento,
        proveedor: this.proveedor().trim() || 'Proveedor Local'
      }))
    };

    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/inventario/compras`, payload).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.mostrarMensaje('success', res.message || 'Compra guardada exitosamente en el inventario');
        this.limpiarNota();
        this.numeroFactura.set('');
        this.cargarHistorialCompras();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.mostrarMensaje('error', err.error?.error || 'No se pudo guardar la compra en inventario');
      }
    });
  }

  // =========================================================================
  // MODAL: + NUEVO PRODUCTO
  // =========================================================================

  abrirModalNuevoProducto(): void {
    this.nuevoProductoForm.reset({
      codigo_barras: this.generarCodigoBarras(),
      nombre: '',
      descripcion: '',
      categoria_id: this.categorias().length > 0 ? this.categorias()[0].id : 1,
      unidad_medida: 'Unidad',
      contenido_por_caja: 24,
      precio_venta_normal: 5.00,
      stock_minimo_alerta: 10
    });
    this.showModalNuevo.set(true);
  }

  cerrarModalNuevoProducto(): void {
    this.showModalNuevo.set(false);
  }

  generarCodigoBarras(): string {
    const random = Math.floor(10000000 + Math.random() * 90000000);
    return `777${random}`;
  }

  guardarNuevoProducto(): void {
    if (this.nuevoProductoForm.invalid) {
      this.nuevoProductoForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.http.post<{ success: boolean; message: string; data: any }>(`${environment.apiUrl}/inventario/productos`, this.nuevoProductoForm.value).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.cerrarModalNuevoProducto();
        this.mostrarMensaje('success', `Producto "${res.data.nombre}" registrado`);
        
        this.http.get<{ success: boolean; data: ProductoCatalogo[] }>(`${environment.apiUrl}/inventario/catalogo`).subscribe({
          next: (catRes) => {
            if (catRes.success) {
              this.catalogo.set(catRes.data);
              this.seleccionarProducto(res.data.productoId);
            }
          }
        });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.mostrarMensaje('error', err.error?.error || 'Error al crear producto');
      }
    });
  }

  mostrarMensaje(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => {
      this.feedbackMessage.set(null);
    }, 5000);
  }
}
