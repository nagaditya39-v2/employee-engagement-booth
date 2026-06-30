import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';

@Component({
  selector: 'app-resume',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resume.html',
  styleUrl: './resume.scss'
})
export class Resume {
  userId: string = '';
  errorMessage: string = '';

  constructor(private api: Api, private router: Router) {}

  resume() {
    if (!this.userId.trim()) {
      this.errorMessage = 'Please enter your ID or scan your QR code.';
      return;
    }
    const input = this.userId.trim();
    const isNumeric = /^\d+$/.test(input);
    const call = isNumeric
      ? this.api.resumeById(Number(input))
      : this.api.resumeByQr(input);

    call.subscribe({
      next: (user: any) => this.router.navigate(['/menu', user.id]),
      error: () => { this.errorMessage = 'User not found. Please sign up instead.'; }
    });
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}