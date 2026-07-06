import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';
import { API_BASE_URL } from '../../constants';

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz.html',
  styleUrl: './quiz.scss'
})
export class Quiz implements OnInit {
  userId: number = 0;
  contentId: number = 0;
  topicId: string | null = null;

  questions: any[] = [];
  currentIndex: number = 0;
  selectedOption: string | null = null;
  submitting: boolean = false;
  result: any = null;
  error: string = '';

  stats: { total_score: number; rank: number; total_users: number } | null = null;

  constructor(
    private route: ActivatedRoute,
    private api: Api,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.contentId = Number(this.route.snapshot.paramMap.get('contentId'));
    this.topicId = this.route.snapshot.queryParamMap.get('topic');
    this.loadQuiz();
    this.loadStats();
  }

  loadStats() {
    this.api.getUserStats(this.userId).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.cdr.detectChanges();
      },
      error: () => {
        // Non-fatal — the quiz still works without the stats bar.
        this.cdr.detectChanges();
      }
    });
  }

  loadQuiz() {
    this.api.startQuiz(this.contentId, this.userId, this.topicId || undefined).subscribe({
      next: (questions: any[]) => {
        this.questions = questions;
        // Resume at the first unanswered question, in case the window was reopened mid-quiz
        const firstUnanswered = questions.findIndex(q => !q.answered_at);
        this.currentIndex = firstUnanswered === -1 ? 0 : firstUnanswered;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err.error?.detail || 'Could not load quiz';
        this.cdr.detectChanges();
      }
    });
  }

  get currentQuestion() {
    return this.questions[this.currentIndex];
  }

  selectOption(option: string) {
    if (this.currentQuestion.answered_at) return; // locked
    this.selectedOption = option;
  }

  submitAnswer() {
    if (!this.selectedOption || this.submitting) return;
    this.submitting = true;

    this.api.submitAnswer(this.userId, this.currentQuestion.question_id, this.selectedOption).subscribe({
      next: (updated) => {
        this.questions[this.currentIndex] = updated;
        this.submitting = false;
        this.selectedOption = null;

        if (this.currentIndex < this.questions.length - 1) {
          this.currentIndex++;
          this.cdr.detectChanges();
        } else {
          this.finishQuiz();
        }
      },
      error: (err) => {
        this.error = err.error?.detail || 'Could not submit answer';
        this.submitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  finishQuiz() {
    this.api.submitQuiz(this.userId, this.contentId).subscribe({
      next: (result) => {
        this.result = result;
        this.cdr.detectChanges();

        // Reflect the new score immediately in the stats bar, then refresh
        // rank from the backend since other users' scores may have moved too.
        if (this.stats) {
          this.stats = { ...this.stats, total_score: result.total_score };
        }
        this.loadStats();

        // Tell the kiosk (main) window the quiz is done — it owns the
        // actual reset-to-login behavior, not this window.
        if (window.opener) {
          window.opener.postMessage(
            { type: 'quiz-complete', userId: this.userId, contentId: this.contentId, result },
            '*'
          );
        }

        // After showing the score for a bit, this (second monitor) window
        // reverts to the static welcome/display screen — NOT the login page.
        setTimeout(() => {
          window.location.href = `${API_BASE_URL}/test-display`;
        }, 4000);
      },
      error: (err) => {
        this.error = err.error?.detail || 'Could not submit quiz';
        this.cdr.detectChanges();
      }
    });
  }
}