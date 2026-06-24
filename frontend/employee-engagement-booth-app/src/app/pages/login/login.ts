import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Api } from '../../services/api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  name = '';
  userId: number | null = null;
  error = '';

  constructor(private api: Api, private router: Router) {}

  register() {
    if (!this.name.trim()) return;
    this.api.register(this.name.trim()).subscribe({
      next: (user) => {
        this.router.navigate(['/menu', user.id]);
      },
      error: () => {
        this.error = 'Registration failed. Please try again.';
      }
    });
  }

  resumeById() {
    if (!this.userId) return;
    this.api.resumeById(this.userId).subscribe({
      next: (user) => {
        this.router.navigate(['/menu', user.id]);
      },
      error: () => {
        this.error = 'User not found. Please register.';
      }
    });
  }
}