import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  name: string = '';
  errorMessage: string = '';

  constructor(private api: Api, private router: Router) {}

  register() {
    if (!this.name.trim()) {
      this.errorMessage = 'Please enter your name.';
      return;
    }
    this.api.register(this.name.trim()).subscribe({
      next: (user: any) => {
        this.router.navigate(['/qr', user.id, user.qr_code]);
      },
      error: () => {
        this.errorMessage = 'Registration failed. Please try again.';
      }
    });
  }

  goToResume() {
    this.router.navigate(['/resume']);
  }
}