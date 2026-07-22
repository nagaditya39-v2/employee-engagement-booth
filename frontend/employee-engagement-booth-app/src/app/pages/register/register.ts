import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';
import { BrandHeader } from '../../shared/brand-header/brand-header';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, BrandHeader],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  name: string = '';
  errorMessage: string = '';
  showPopup = false;

  constructor(private api: Api, private router: Router) {}

  register() {
    this.showPopup = false;

    this.api.register(this.name.trim()).subscribe({
      next: (user: any) => {
        this.router.navigate(['/qr', user.id, user.qr_code]);
      },
      error: () => {
        this.errorMessage = 'Registration failed. Please try again.';
      }
    });
  }

  showAcknowledgement() {
    if (!this.name.trim()) {
      this.errorMessage = 'Please enter your name.';
      return;
    }

    this.errorMessage = '';
    this.showPopup = true;
  }

  goToResume() {
    this.router.navigate(['/resume']);
  }
}