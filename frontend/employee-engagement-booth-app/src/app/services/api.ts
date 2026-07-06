import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../constants';

const BASE_URL = API_BASE_URL;

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

  startQuiz(contentId: number, userId: number, topicId?: string): Observable<any[]> {
    const topicParam = topicId ? `&topic=${encodeURIComponent(topicId)}` : '';
    return this.http.post<any[]>(`${BASE_URL}/content/${contentId}/start-quiz?user_id=${userId}${topicParam}`, {});
  }

  submitAnswer(userId: number, questionId: number, selectedOption: string): Observable<any> {
    return this.http.post(`${BASE_URL}/quiz/answer`, {
      user_id: userId,
      question_id: questionId,
      selected_option: selectedOption
    });
  }

  submitQuiz(userId: number, contentId: number): Observable<any> {
    return this.http.post(`${BASE_URL}/quiz/submit?user_id=${userId}&content_id=${contentId}`, {});
  }

  getUserStats(userId: number): Observable<any> {
    return this.http.get(`${BASE_URL}/users/${userId}/stats`);
  }

  getTestContentUrl(): string {
    return `${BASE_URL}/test-display`;
  }

  getSideTopics(): Observable<any[]> {
    return this.http.get<any[]>('assets/json/topics.json');
  }

  getCardQuizzes(): Observable<any[]> {
    return this.http.get<any[]>('assets/json/card-quizzes.json');
  }

  submitCardQuiz(contentId: number, userId: number, scoreEarned: number): Observable<any> {
  return this.http.post(
    `${BASE_URL}/content/${contentId}/submit-card-quiz?user_id=${userId}&score_earned=${scoreEarned}`,
    {}
  );
}
}