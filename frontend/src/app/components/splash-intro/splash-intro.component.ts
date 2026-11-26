import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  ViewChild,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash-intro',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './splash-intro.component.html'
})
export class SplashIntroComponent implements AfterViewInit, OnDestroy {
  /** Duración máxima de reproducción antes de cortar antes del login incluido en el video */
  readonly MAX_DURATION_SECONDS = 4.2;

  @Output() completed = new EventEmitter<void>();
  @ViewChild('introVideo') introVideo?: ElementRef<HTMLVideoElement>;

  isExiting = signal<boolean>(false);
  useFallback = signal<boolean>(false);

  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Enter') {
      this.finishIntro();
    }
  }

  ngAfterViewInit(): void {
    const video = this.introVideo?.nativeElement;
    if (video) {
      video.muted = true;
      video.playsInline = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          this.triggerFallback();
        });
      }
    }
  }

  triggerFallback(): void {
    if (this.useFallback() || this.isExiting()) return;
    this.useFallback.set(true);
    this.fallbackTimer = setTimeout(() => {
      this.finishIntro();
    }, 2000);
  }

  onTimeUpdate(event: Event): void {
    if (this.isExiting()) return;
    const video = event.target as HTMLVideoElement | null;
    if (video && video.currentTime >= this.MAX_DURATION_SECONDS) {
      video.pause();
      this.finishIntro();
    }
  }

  finishIntro(): void {
    if (this.isExiting()) return;

    const video = this.introVideo?.nativeElement;
    if (video && !video.paused) {
      video.pause();
    }

    try {
      sessionStorage.setItem('intro_vista', 'true');
    } catch {
      // Ignorar si sessionStorage no está disponible
    }

    this.isExiting.set(true);
    this.exitTimer = setTimeout(() => {
      this.completed.emit();
    }, 400);
  }

  ngOnDestroy(): void {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    if (this.exitTimer) clearTimeout(this.exitTimer);
  }
}
