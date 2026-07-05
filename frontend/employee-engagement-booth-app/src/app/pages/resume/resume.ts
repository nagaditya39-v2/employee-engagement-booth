import { Component, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Html5Qrcode } from 'html5-qrcode';
import { Api } from '../../services/api';
import { BrandHeader } from '../../shared/brand-header/brand-header';

@Component({
  selector: 'app-resume',
  standalone: true,
  imports: [CommonModule, FormsModule, BrandHeader],
  templateUrl: './resume.html',
  styleUrl: './resume.scss'
})
export class Resume implements OnDestroy {
  userId: string = '';
  errorMessage: string = '';

  scannerActive: boolean = false;
  scannerStarting: boolean = false;
  private html5QrCode: Html5Qrcode | null = null;
  private readonly SCANNER_ELEMENT_ID = 'qr-reader';

  constructor(
    private api: Api,
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  resume() {
    if (!this.userId.trim()) {
      this.errorMessage = 'Please enter your ID or scan your QR code.';
      return;
    }
    this.resolveAndNavigate(this.userId.trim());
  }

  private resolveAndNavigate(input: string) {
    const isNumeric = /^\d+$/.test(input);
    const call = isNumeric
      ? this.api.resumeById(Number(input))
      : this.api.resumeByQr(input);

    call.subscribe({
      next: async (user: any) => {
        await this.stopScanner();
        this.router.navigate(['/menu', user.id]);
      },
      error: () => {
        this.zone.run(() => {
          this.errorMessage = 'User not found. Please sign up instead.';
          this.scannerStarting = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  async startScanner() {
    this.errorMessage = '';
    this.scannerStarting = true;
    this.scannerActive = true;

    setTimeout(async () => {
      try {
        this.html5QrCode = new Html5Qrcode(this.SCANNER_ELEMENT_ID);
        await this.html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            // This fires from html5-qrcode's own scan loop, outside Angular's zone.
            this.zone.run(() => this.onScanSuccess(decodedText));
          },
          () => { /* per-frame decode failures are normal, ignore */ }
        );
        this.zone.run(() => {
          this.scannerStarting = false;
          this.cdr.detectChanges();
        });
      } catch (err) {
        this.zone.run(() => {
          this.scannerStarting = false;
          this.scannerActive = false;
          this.errorMessage = 'Could not access camera. Please enter your ID manually.';
          this.cdr.detectChanges();
        });
      }
    }, 0);
  }

  private onScanSuccess(decodedText: string) {
    console.log(decodedText)
    this.html5QrCode?.pause(true);
    this.scannerStarting = false; // in case a scan races the start() resolution
    this.cdr.detectChanges();

    let qrCode = decodedText;
    try {
      const url = new URL(decodedText);
      const segments = url.pathname.split('/').filter(Boolean);
      qrCode = segments[segments.length - 1] || decodedText;
    } catch {
      // Not a URL — assume the raw value is already the qr_code.
    }

    this.resolveAndNavigate(qrCode);
  }

  async stopScanner() {
  if (this.html5QrCode) {
    try {
      await this.html5QrCode.stop();
      this.html5QrCode.clear();
    } catch {
      // already stopped or never started dunno what to put here
    }
    this.html5QrCode = null;
  }
  this.scannerActive = false;
  this.scannerStarting = false;
}

goToRegister() {
  this.stopScanner().then(() => this.router.navigate(['/register']));
}

ngOnDestroy() {
  this.stopScanner();
}
}