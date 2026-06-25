import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { API_BASE_URL } from '../../constants';

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

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.connect();
  }

  connect() {
    const wsUrl = API_BASE_URL.replace('http://', 'ws://') + '/ws/leaderboard';
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
    this.socket.close();
  }
}