import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { API_BASE_URL } from '../../constants';

type DisplayMode = 'portrait' | 'landscape';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.scss'
})
export class Leaderboard implements OnInit, OnDestroy {
  standings: { id: number; name: string; score: number }[] = [];
  private socket!: WebSocket;
  connected = false;

  // Drives layout — bound to a class on the host element
  mode: DisplayMode = 'landscape';

  @HostBinding('class.mode-portrait') get isPortrait() { return this.mode === 'portrait'; }
  @HostBinding('class.mode-landscape') get isLandscape() { return this.mode === 'landscape'; }

  private resizeHandler = () => this.detectMode();

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.applyModeFromQueryParamOrDetect();
    window.addEventListener('resize', this.resizeHandler);
    this.connect();
  }

  // Priority: explicit ?layout=portrait|landscape query param (set once per
  // display at setup time) > automatic aspect-ratio detection as a fallback.
  // Explicit is safer for kiosk hardware since screen dimensions can be
  // reported oddly depending on the device/browser combo.
  private applyModeFromQueryParamOrDetect() {
    const forced = this.route.snapshot.queryParamMap.get('layout');
    if (forced === 'portrait' || forced === 'landscape') {
      this.mode = forced;
      this.cdr.detectChanges();
      return;
    }
    this.detectMode();
  }

  private detectMode() {
    this.zone.run(() => {
      this.mode = window.innerWidth < window.innerHeight ? 'portrait' : 'landscape';
      this.cdr.detectChanges();
    });
  }

  connect() {
    const wsUrl = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/leaderboard';
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.zone.run(() => {
        this.connected = true;
        this.cdr.detectChanges();
      });
    };

    this.socket.onmessage = (event) => {
      this.zone.run(() => {
        this.standings = JSON.parse(event.data);
        this.cdr.detectChanges();
      });
    };

    this.socket.onclose = () => {
      this.zone.run(() => {
        this.connected = false;
        this.cdr.detectChanges();
        setTimeout(() => this.connect(), 3000);
      });
    };

    this.socket.onerror = () => {
      this.socket.close();
    };
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    this.socket.close();
  }
}