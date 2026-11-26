import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface PerfilResumen {
  ventasHoy: { cantidad: number; total_bs: number };
  ventasSemana: { cantidad: number; total_bs: number };
  comprasSemana: number;
  cajaActual: {
    abierta: boolean;
    id?: number;
    fecha_apertura?: string;
    efectivo_esperado?: number;
  };
  ultimasActividades: {
    id: number;
    modulo: string;
    accion: string;
    detalle: string;
    created_at: string;
    sucursal_nombre: string;
  }[];
  adminResumen?: {
    accionesHoy: number;
    cajerosActivos: number;
    cajasAbiertas: number;
  } | null;
}

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './perfil.component.html'
})
export class PerfilComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  resumen = signal<PerfilResumen | null>(null);
  isLoading = signal<boolean>(false);
  isSavingPhone = signal<boolean>(false);
  isSavingPass = signal<boolean>(false);
  telefonoInput = signal<string>('');
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (res) => {
        if (res.success && res.user) {
          this.telefonoInput.set(res.user.telefono || '');
        }
      }
    });
    this.loadResumen();
  }

  loadResumen(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: PerfilResumen }>(`${environment.apiUrl}/auth/mi-resumen`).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.resumen.set(res.data);
        }
      },
      error: () => this.isLoading.set(false)
    });
  }

  getUserInitials(): string {
    const name = this.auth.currentUser()?.nombre || 'CB';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  guardarTelefono(): void {
    this.isSavingPhone.set(true);
    this.http.put<{ success: boolean; message: string; user: any }>(`${environment.apiUrl}/auth/mi-perfil`, {
      telefono: this.telefonoInput()
    }).subscribe({
      next: (res) => {
        this.isSavingPhone.set(false);
        this.auth.getProfile().subscribe();
        this.showFeedback('success', res.message || 'Teléfono WhatsApp actualizado');
      },
      error: (err) => {
        this.isSavingPhone.set(false);
        this.showFeedback('error', err.error?.error || 'No se pudo actualizar el teléfono');
      }
    });
  }

  cambiarPassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) {
      this.showFeedback('error', 'La nueva contraseña y su confirmación no coinciden');
      return;
    }

    this.isSavingPass.set(true);
    this.http.put<{ success: boolean; message: string }>(`${environment.apiUrl}/auth/cambiar-password`, {
      currentPassword,
      newPassword
    }).subscribe({
      next: (res) => {
        this.isSavingPass.set(false);
        this.passwordForm.reset();
        this.showFeedback('success', res.message || 'Contraseña actualizada con éxito');
        this.loadResumen();
      },
      error: (err) => {
        this.isSavingPass.set(false);
        this.showFeedback('error', err.error?.error || 'No se pudo cambiar la contraseña');
      }
    });
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => this.feedbackMessage.set(null), 4500);
  }
}
