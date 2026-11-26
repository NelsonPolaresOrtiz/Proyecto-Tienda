import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Sucursal } from '../sucursales/sucursales.component';
import { AuditoriaComponent } from '../auditoria/auditoria.component';
import { environment } from '../../../environments/environment';

export interface UserRow {
  id: number;
  nombre: string;
  email: string;
  rol: 'admin' | 'vendedor';
  sucursal_id: number | null;
  sucursal_nombre?: string;
  sucursal_codigo?: string;
  ci?: string;
  telefono?: string;
  estado: 'activo' | 'inactivo';
  ultimo_login?: string;
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AuditoriaComponent],
  templateUrl: './usuarios.component.html'
})
export class UsuariosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  usuarios = signal<UserRow[]>([]);
  sucursales = signal<Sucursal[]>([]);
  isLoading = signal<boolean>(false);
  showModal = signal<boolean>(false);
  editingUser = signal<UserRow | null>(null);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pestaña activa: listado de personal o auditoría
  tabActiva = signal<'personal' | 'auditoria'>('personal');
  auditUserId = signal<number | null>(null);

  form: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    rol: ['vendedor', [Validators.required]],
    sucursal_id: [1],
    ci: [''],
    telefono: [''],
    estado: ['activo']
  });

  ngOnInit(): void {
    this.loadSucursales();
    this.loadUsuarios();
  }

  loadSucursales(): void {
    this.http.get<{ success: boolean; data: Sucursal[] }>(`${environment.apiUrl}/sucursales`).subscribe({
      next: (res) => {
        if (res.success) this.sucursales.set(res.data);
      }
    });
  }

  loadUsuarios(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: UserRow[] }>(`${environment.apiUrl}/usuarios`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) this.usuarios.set(res.data);
      },
      error: () => {
        this.isLoading.set(false);
        this.showFeedback('error', 'Error al obtener la lista de usuarios');
      }
    });
  }

  getInitials(nombre: string): string {
    const parts = (nombre || 'U').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (nombre || 'U').slice(0, 2).toUpperCase();
  }

  verAuditoriaUsuario(user: UserRow): void {
    this.auditUserId.set(user.id);
    this.tabActiva.set('auditoria');
  }

  abrirTabPersonal(): void {
    this.tabActiva.set('personal');
  }

  abrirTabAuditoriaGeneral(): void {
    this.auditUserId.set(null);
    this.tabActiva.set('auditoria');
  }

  openCreateModal(): void {
    this.editingUser.set(null);
    this.form.reset({
      nombre: '',
      email: '',
      password: '',
      rol: 'vendedor',
      sucursal_id: this.sucursales().length > 0 ? this.sucursales()[0].id : 1,
      ci: '',
      telefono: '+591',
      estado: 'activo'
    });
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.form.get('password')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  openEditModal(user: UserRow): void {
    this.editingUser.set(user);
    this.form.patchValue({
      nombre: user.nombre,
      email: user.email,
      password: '',
      rol: user.rol,
      sucursal_id: user.sucursal_id || (this.sucursales()[0]?.id ?? 1),
      ci: user.ci || '',
      telefono: user.telefono || '',
      estado: user.estado
    });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingUser.set(null);
  }

  toggleStatus(user: UserRow): void {
    this.http.patch<{ success: boolean; message: string; data: { id: number; estado: 'activo' | 'inactivo' } }>(
      `${environment.apiUrl}/usuarios/${user.id}/toggle-status`, {}
    ).subscribe({
      next: (res) => {
        this.showFeedback('success', res.message);
        this.loadUsuarios();
      },
      error: () => this.showFeedback('error', 'No se pudo cambiar el estado del usuario')
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const payload = {
      ...val,
      sucursal_id: val.rol === 'admin' ? null : parseInt(val.sucursal_id, 10)
    };

    const editing = this.editingUser();
    this.isLoading.set(true);

    if (editing) {
      this.http.put<{ success: boolean; message: string }>(`${environment.apiUrl}/usuarios/${editing.id}`, payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.closeModal();
          this.showFeedback('success', res.message || 'Usuario actualizado correctamente');
          this.loadUsuarios();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.showFeedback('error', err.error?.error || 'Error al actualizar el usuario');
        }
      });
    } else {
      this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/usuarios`, payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.closeModal();
          this.showFeedback('success', res.message || 'Usuario creado correctamente');
          this.loadUsuarios();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.showFeedback('error', err.error?.error || 'Error al crear el usuario');
        }
      });
    }
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }
}
