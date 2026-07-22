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
  private socket: WebSocket | null = null;
  connected = false;
  private pollTimer: number | null = null;

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
    this.closeSocket();

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
        const standings = this.parseStandings(event.data);
        if (standings) {
          this.standings = standings;
          this.cdr.detectChanges();
        }
      });
    };

    this.socket.onclose = () => {
      this.zone.run(() => {
        this.connected = false;
        this.cdr.detectChanges();
      });
      this.startPolling();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };

    this.startPolling();
  }

  private parseStandings(data: string | MessageEvent['data']) {
    try {
      const parsed = JSON.parse(typeof data === 'string' ? data : String(data));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private startPolling() {
    if (this.pollTimer !== null) {
      return;
    }

    this.loadStandingsFromApi();
    this.pollTimer = window.setInterval(() => {
      this.loadStandingsFromApi();
    }, 5000);
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private loadStandingsFromApi() {
    fetch(`${API_BASE_URL}/leaderboard/standings`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Leaderboard request failed: ${res.status}`);
        }
        return res.json();
      })
      .then((payload) => {
        const standings = this.parseStandings(JSON.stringify(payload));
        if (standings) {
          this.zone.run(() => {
            this.standings = standings;
            this.connected = true;
            this.cdr.detectChanges();
          });
        }
      })
      .catch(() => {
        this.zone.run(() => {
          this.connected = false;
          this.cdr.detectChanges();
        });
      });
  }

  private closeSocket() {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    this.stopPolling();
    this.closeSocket();
  }
}