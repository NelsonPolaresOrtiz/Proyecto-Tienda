import { Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { LoginTransitionService } from '../../services/login-transition.service';
import { SplashIntroComponent } from '../splash-intro/splash-intro.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SplashIntroComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly loginTransition = inject(LoginTransitionService);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true]
  });

  isLoading = signal<boolean>(false);
  isSuccess = signal<boolean>(false);
  shakeCard = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal<boolean>(false);
  toastMessage = signal<{ text: string } | null>(null);

  private successTimer: ReturnType<typeof setTimeout> | null = null;
  private shakeTimer: ReturnType<typeof setTimeout> | null = null;

  // Pantalla de bienvenida animada (una vez por sesión)
  showIntro = signal<boolean>(this.checkShouldShowIntro());

  private checkShouldShowIntro(): boolean {
    try {
      return sessionStorage.getItem('intro_vista') !== 'true';
    } catch {
      return false;
    }
  }

  onIntroCompleted(): void {
    this.showIntro.set(false);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((val) => !val);
  }

  showSupportNotice(): void {
    this.showToast('Comunícate con Gerencia de Candy Boom en Sucre para restablecer tu acceso.');
  }

  showToast(text: string): void {
    this.toastMessage.set({ text });
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  private triggerCardShake(): void {
    if (this.shakeTimer) {
      clearTimeout(this.shakeTimer);
    }
    this.shakeCard.set(false);
    setTimeout(() => {
      this.shakeCard.set(true);
      this.shakeTimer = setTimeout(() => {
        this.shakeCard.set(false);
      }, 350);
    }, 10);
  }

  onSubmit(): void {
    if (this.isLoading() || this.isSuccess()) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.triggerCardShake();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.isLoading.set(true);
    this.isSuccess.set(false);
    this.errorMessage.set(null);
    this.loginForm.disable({ emitEvent: false });

    this.authService.login({ email, password }).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        this.isSuccess.set(true);
        const targetRoute = response.user.rol === 'admin' ? '/dashboard' : '/pos';
        this.successTimer = setTimeout(() => {
          this.loginTransition.startTransition(response.user, targetRoute);
        }, 500);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.isSuccess.set(false);
        this.loginForm.enable({ emitEvent: false });

        let errorText = err.error?.error || 'No se pudo iniciar sesión. Verifique sus credenciales.';

        if (errorText.toLowerCase().includes('inactiva') || errorText.toLowerCase().includes('inactivo')) {
          errorText = 'Tu cuenta o sucursal se encuentra inactiva. Por favor contacta a Gerencia.';
        } else if (errorText.toLowerCase().includes('inválidas') || errorText.toLowerCase().includes('credenciales')) {
          errorText = 'Correo electrónico o contraseña incorrectos. Verifica tus datos e inténtalo nuevamente.';
        }

        this.errorMessage.set(errorText);
        this.triggerCardShake();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.successTimer) {
      clearTimeout(this.successTimer);
    }
    if (this.shakeTimer) {
      clearTimeout(this.shakeTimer);
    }
  }
}
