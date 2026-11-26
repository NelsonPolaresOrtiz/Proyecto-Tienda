import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface PosProduct {
  id: number;
  codigo_barras: string;
  nombre: string;
  descripcion?: string;
  unidad_medida: string;
  contenido_por_caja: number;
  imagen_url?: string;
  categoria_id: number;
  categoria_nombre: string;
  categoria_color?: string;
  precio_venta_normal: number;
  en_oferta: number;
  descuento_porcentaje?: number;
  precio_venta_oferta?: number | null;
  precio_final: number;
  stock_total_unidades: number;
  stock_minimo_alerta: number;
  proximo_lote?: string;
  proximo_vencimiento?: string;
  dias_para_vencer?: number;
  lote_en_oferta?: number;
}

export interface CartItem {
  producto: PosProduct;
  cantidad: number;
  precioUnitario: number;
  esOferta: boolean;
  subtotal: number;
}

export interface VentaResult {
  ventaId: number;
  numeroComprobante: string;
  montoTotal: number;
  metodoPago: string;
  cambio: number;
  esVentaRapida?: boolean;
  fechaVenta: Date;
  clienteNombre?: string;
  items?: CartItem[];
}

export interface SucursalOption {
  id: number;
  nombre: string;
  codigo: string;
  es_matriz?: number;
  estado?: string;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos.component.html',
  styleUrls: ['./pos.component.css']
})
export class PosComponent implements OnInit {
  protected readonly Number = Number;
  protected readonly Math = Math;

  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  // Sucursales (Selector solo visible para Admin; Vendedor bloqueado en su sucursal)
  sucursales = signal<SucursalOption[]>([]);
  selectedSucursalId = signal<number | null>(null);
  sucursalLabel = computed(() => {
    if (!this.auth.isAdmin()) {
      return this.auth.currentSucursal();
    }
    const sucId = this.selectedSucursalId();
    const found = this.sucursales().find(s => s.id === sucId);
    return found ? `${found.nombre} (${found.codigo})` : 'Sucursal Activa';
  });

  // Estados con Signals
  productos = signal<PosProduct[]>([]);
  categorias = signal<{ id: number; nombre: string; color: string }[]>([]);
  categoriaSeleccionada = signal<number | null>(null);
  busqueda = signal<string>('');
  isLoading = signal<boolean>(false);
  cajaAbierta = signal<boolean>(true);
  arqueoActivo = signal<any | null>(null);

  // Carrito de Compras Reactivo
  cart = signal<CartItem[]>([]);
  clienteNombre = signal<string>('Sin Nombre / Consumidor Final');
  clienteNitCi = signal<string>('0');
  tipoComprobante = signal<'nota_venta' | 'recibo' | 'factura_qr'>('nota_venta');
  metodoPago = signal<'efectivo' | 'qr_simple' | 'mixto'>('efectivo');

  // Valores de Cobro
  montoRecibido = signal<number>(0);
  montoEfectivoMixto = signal<number>(0);
  montoQrMixto = signal<number>(0);
  descuentoGlobal = signal<number>(0);

  // Computados del Carrito
  subtotalCarrito = computed(() => {
    return this.cart().reduce((acc, it) => acc + it.subtotal, 0);
  });

  totalPagar = computed(() => {
    const st = this.subtotalCarrito();
    const desc = this.descuentoGlobal();
    return Math.max(0, parseFloat((st - desc).toFixed(2)));
  });

  cambioVuelto = computed(() => {
    if (this.metodoPago() !== 'efectivo') return 0;
    const rec = this.montoRecibido();
    const tot = this.totalPagar();
    return rec >= tot ? parseFloat((rec - tot).toFixed(2)) : 0;
  });

  // Modales
  showQuickSaleModal = signal<boolean>(false);
  quickSaleMonto = signal<number>(10.00);
  quickSaleMetodo = signal<'efectivo' | 'qr_simple'>('efectivo');
  quickSaleRecibido = signal<number>(10.00);

  showSuccessModal = signal<boolean>(false);
  ultimaVenta = signal<VentaResult | null>(null);
  feedbackError = signal<string | null>(null);

  // Filtro de productos en memoria para búsqueda instantánea
  productosFiltrados = computed(() => {
    const catId = this.categoriaSeleccionada();
    const q = this.busqueda().trim().toLowerCase();
    return this.productos().filter(p => {
      const matchCat = catId === null || p.categoria_id === catId;
      const matchText = !q || p.nombre.toLowerCase().includes(q) || p.codigo_barras.includes(q);
      return matchCat && matchText;
    });
  });

  ngOnInit(): void {
    this.loadCategorias();
    if (this.auth.isAdmin()) {
      this.loadSucursalesAdmin();
    } else {
      const userSuc = this.auth.currentUser()?.sucursal_id ?? null;
      this.selectedSucursalId.set(userSuc);
      this.checkArqueoCaja();
      this.loadProductos();
    }
  }

  private buildPosQuery(): string {
    if (this.auth.isAdmin() && this.selectedSucursalId()) {
      return `?sucursal_id=${this.selectedSucursalId()}`;
    }
    return '';
  }

  loadSucursalesAdmin(): void {
    this.http.get<{ success: boolean; data: SucursalOption[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        const activas = (res.data || []).filter(s => !s.estado || s.estado === 'activo');
        const lista = activas.length > 0 ? activas : (res.data || []);
        this.sucursales.set(lista);
        const matriz = lista.find(s => s.codigo === 'SUC-01' || s.es_matriz === 1) || lista[0];
        this.selectedSucursalId.set(matriz ? matriz.id : 1);
        this.checkArqueoCaja();
        this.loadProductos();
      },
      error: () => {
        this.selectedSucursalId.set(1);
        this.checkArqueoCaja();
        this.loadProductos();
      }
    });
  }

  onSucursalChange(rawId: string | number): void {
    const newId = Number(rawId);
    if (!newId || newId === this.selectedSucursalId()) return;
    if (this.cart().length > 0) {
      this.clearCart();
    }
    this.selectedSucursalId.set(newId);
    this.checkArqueoCaja();
    this.loadProductos();
  }

  checkArqueoCaja(): void {
    this.http.get<{ success: boolean; cajaAbierta: boolean; data: any }>(`${environment.apiUrl}/pos/arqueo-activo${this.buildPosQuery()}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.cajaAbierta.set(res.cajaAbierta);
          this.arqueoActivo.set(res.data);
        }
      }
    });
  }

  loadCategorias(): void {
    this.http.get<{ success: boolean; data: any[] }>(`${environment.apiUrl}/pos/categorias`).subscribe({
      next: (res) => {
        if (res.success) this.categorias.set(res.data);
      }
    });
  }

  loadProductos(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: PosProduct[] }>(`${environment.apiUrl}/pos/productos${this.buildPosQuery()}`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) this.productos.set(res.data);
      },
      error: () => this.isLoading.set(false)
    });
  }

  setCategoria(catId: number | null): void {
    this.categoriaSeleccionada.set(catId);
  }

  addToCart(prod: PosProduct): void {
    if (prod.stock_total_unidades <= 0) return;

    const items = [...this.cart()];
    const index = items.findIndex(it => it.producto.id === prod.id);
    const precio = Number(prod.precio_final);
    const esOferta = prod.en_oferta === 1;

    if (index >= 0) {
      if (items[index].cantidad < prod.stock_total_unidades) {
        items[index].cantidad += 1;
        items[index].subtotal = parseFloat((items[index].cantidad * precio).toFixed(2));
      }
    } else {
      items.push({
        producto: prod,
        cantidad: 1,
        precioUnitario: precio,
        esOferta,
        subtotal: precio
      });
    }

    this.cart.set(items);
    this.montoRecibido.set(this.totalPagar());
  }

  incrementQuantity(item: CartItem): void {
    if (item.cantidad < item.producto.stock_total_unidades) {
      const items = [...this.cart()];
      const idx = items.findIndex(i => i.producto.id === item.producto.id);
      if (idx >= 0) {
        items[idx].cantidad += 1;
        items[idx].subtotal = parseFloat((items[idx].cantidad * items[idx].precioUnitario).toFixed(2));
        this.cart.set(items);
        this.montoRecibido.set(this.totalPagar());
      }
    }
  }

  decrementQuantity(item: CartItem): void {
    const items = [...this.cart()];
    const idx = items.findIndex(i => i.producto.id === item.producto.id);
    if (idx >= 0) {
      if (items[idx].cantidad > 1) {
        items[idx].cantidad -= 1;
        items[idx].subtotal = parseFloat((items[idx].cantidad * items[idx].precioUnitario).toFixed(2));
      } else {
        items.splice(idx, 1);
      }
      this.cart.set(items);
      this.montoRecibido.set(this.totalPagar());
    }
  }

  removeFromCart(item: CartItem): void {
    const items = this.cart().filter(i => i.producto.id !== item.producto.id);
    this.cart.set(items);
    this.montoRecibido.set(this.totalPagar());
  }

  clearCart(): void {
    this.cart.set([]);
    this.montoRecibido.set(0);
    this.descuentoGlobal.set(0);
  }

  setMetodoPago(metodo: 'efectivo' | 'qr_simple' | 'mixto'): void {
    this.metodoPago.set(metodo);
    if (metodo === 'mixto') {
      const mitad = parseFloat((this.totalPagar() / 2).toFixed(2));
      this.montoEfectivoMixto.set(mitad);
      this.montoQrMixto.set(parseFloat((this.totalPagar() - mitad).toFixed(2)));
    }
  }

  setMontoRecibidoExacto(): void {
    this.montoRecibido.set(this.totalPagar());
  }

  setMontoRecibidoBilletes(billete: number): void {
    this.montoRecibido.set(billete);
  }

  // PROCESAR COBRO NORMAL
  processCheckout(): void {
    if (this.cart().length === 0) return;

    const tot = this.totalPagar();
    if (this.metodoPago() === 'efectivo' && this.montoRecibido() < tot) {
      this.feedbackError.set(`El monto en efectivo recibido (Bs. ${this.montoRecibido().toFixed(2)}) es menor al total a cobrar (Bs. ${tot.toFixed(2)})`);
      setTimeout(() => this.feedbackError.set(null), 4000);
      return;
    }

    this.isLoading.set(true);

    const payload: Record<string, any> = {
      cliente_nombre: this.clienteNombre() || 'Sin Nombre / Consumidor Final',
      cliente_nit_ci: this.clienteNitCi() || '0',
      tipo_comprobante: this.tipoComprobante(),
      metodo_pago: this.metodoPago(),
      items: this.cart().map(it => ({
        producto_id: it.producto.id,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        es_oferta: it.esOferta ? 1 : 0,
        subtotal: it.subtotal
      })),
      descuento: this.descuentoGlobal(),
      monto_recibido: this.metodoPago() === 'efectivo' ? this.montoRecibido() : tot,
      monto_efectivo: this.metodoPago() === 'mixto' ? this.montoEfectivoMixto() : (this.metodoPago() === 'efectivo' ? tot : 0),
      monto_qr: this.metodoPago() === 'mixto' ? this.montoQrMixto() : (this.metodoPago() === 'qr_simple' ? tot : 0)
    };
    if (this.auth.isAdmin() && this.selectedSucursalId()) {
      payload['sucursal_id'] = this.selectedSucursalId();
    }

    this.http.post<{ success: boolean; data: any; message: string }>(`${environment.apiUrl}/pos/ventas`, payload).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.ultimaVenta.set({
            ventaId: res.data.ventaId,
            numeroComprobante: res.data.numeroComprobante,
            montoTotal: res.data.montoTotal,
            metodoPago: res.data.metodoPago,
            cambio: res.data.cambio,
            fechaVenta: new Date(),
            clienteNombre: this.clienteNombre(),
            items: [...this.cart()]
          });
          this.clearCart();
          this.showSuccessModal.set(true);
          this.loadProductos(); // Recargar existencias en tiempo real
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.feedbackError.set(err.error?.error || 'No se pudo procesar la venta');
        setTimeout(() => this.feedbackError.set(null), 5000);
      }
    });
  }

  // MODAL VENTA RÁPIDA SIN DETALLE
  openQuickSaleModal(): void {
    this.quickSaleMonto.set(10.00);
    this.quickSaleRecibido.set(10.00);
    this.quickSaleMetodo.set('efectivo');
    this.showQuickSaleModal.set(true);
  }

  closeQuickSaleModal(): void {
    this.showQuickSaleModal.set(false);
  }

  submitQuickSale(): void {
    const monto = parseFloat(String(this.quickSaleMonto()));
    if (!monto || monto <= 0) return;

    this.isLoading.set(true);
    const payload: Record<string, any> = {
      es_venta_rapida: true,
      monto_total_rapido: monto,
      cliente_nombre: 'Cliente Venta Rápida',
      cliente_nit_ci: '0',
      tipo_comprobante: 'recibo',
      metodo_pago: this.quickSaleMetodo(),
      monto_recibido: this.quickSaleMetodo() === 'efectivo' ? this.quickSaleRecibido() : monto
    };
    if (this.auth.isAdmin() && this.selectedSucursalId()) {
      payload['sucursal_id'] = this.selectedSucursalId();
    }

    this.http.post<{ success: boolean; data: any; message: string }>(`${environment.apiUrl}/pos/ventas`, payload).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.closeQuickSaleModal();
        if (res.success) {
          this.ultimaVenta.set({
            ventaId: res.data.ventaId,
            numeroComprobante: res.data.numeroComprobante,
            montoTotal: res.data.montoTotal,
            metodoPago: res.data.metodoPago,
            cambio: res.data.cambio,
            esVentaRapida: true,
            fechaVenta: new Date(),
            clienteNombre: 'Cliente Venta Rápida'
          });
          this.showSuccessModal.set(true);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.feedbackError.set(err.error?.error || 'Error al procesar venta rápida');
        setTimeout(() => this.feedbackError.set(null), 5000);
      }
    });
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
    this.ultimaVenta.set(null);
  }
}
