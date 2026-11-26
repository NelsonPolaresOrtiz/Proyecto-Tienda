import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoginTransitionService } from '../../services/login-transition.service';

@Component({
  selector: 'app-login-transition-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login-transition-overlay.component.html',
  styleUrls: ['./login-transition-overlay.component.css']
})
export class LoginTransitionOverlayComponent {
  readonly transition = inject(LoginTransitionService);

  @HostListener('window:keydown.enter')
  onEnterPress(): void {
    if (this.transition.state().active) {
      this.transition.skipOrAccelerate();
    }
  }
}
