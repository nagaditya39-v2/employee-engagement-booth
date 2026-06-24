import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE_URL = 'http://127.0.0.1:8000';

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private http: HttpClient) {}

  register(name: string): Observable<any> {
    return this.http.post(`${BASE_URL}/register`, { name });
  }

  resumeByQr(qrCode: string): Observable<any> {
    return this.http.get(`${BASE_URL}/resume/${qrCode}`);
  }

  resumeById(userId: number): Observable<any> {
    return this.http.get(`${BASE_URL}/users/${userId}`);
  }

  getContent(): Observable<any[]> {
    return this.http.get<any[]>(`${BASE_URL}/content`);
  }

  markViewed(contentId: number, userId: number): Observable<any> {
    return this.http.post(`${BASE_URL}/content/${contentId}/view?user_id=${userId}`, {});
  }

  getUserProgress(userId: number): Observable<any[]> {
    return this.http.get<any[]>(`${BASE_URL}/progress/${userId}`);
  }
}