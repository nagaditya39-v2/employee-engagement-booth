import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { API_BASE_URL } from '../../constants';

@Component({
  selector: 'app-qr-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr-display.html',
  styleUrl: './qr-display.scss'
})
export class QrDisplay implements OnInit {
  userId: number = 0;
  qrCode: string = '';
  qrImageUrl: string = '';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.qrCode = this.route.snapshot.paramMap.get('qrCode') || '';
    this.qrImageUrl = `${API_BASE_URL}/qr/${this.qrCode}`;
  }

  goToMenu() {
    this.router.navigate(['/register']);
  }
}