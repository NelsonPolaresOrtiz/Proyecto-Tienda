import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginTransitionOverlayComponent } from './components/login-transition-overlay/login-transition-overlay.component';

@Component({
  imports: [RouterOutlet, LoginTransitionOverlayComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend');
}
