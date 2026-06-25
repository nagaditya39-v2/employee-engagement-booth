import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  name: string = '';
  userId: number | null = null;
  errorMessage: string = '';
  mode: 'register' | 'resume' = 'register';

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

  resume() {
    if (!this.userId) {
      this.errorMessage = 'Please enter your ID.';
      return;
    }
    this.api.resumeById(this.userId).subscribe({
      next: (user) => {
        this.router.navigate(['/menu', user.id]);
      },
      error: () => {
        this.errorMessage = 'User not found. Please register instead.';
      }
    });
  }
}