import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';
import { API_BASE_URL, QUIZ_TIMER_SECONDS } from '../../constants';

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz.html',
  styleUrl: './quiz.scss'
})
export class Quiz implements OnInit, OnDestroy {
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

  // Timer fields
  timerSeconds = QUIZ_TIMER_SECONDS;
  timeLeft = 0;
  private timerInterval: number | null = null;

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

  ngOnDestroy() {
    this.stopTimer();
  }

  loadStats() {
    this.api.getUserStats(this.userId).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      }
    });
  }

  loadQuiz() {
    this.api.startQuiz(this.contentId, this.userId, this.topicId || undefined).subscribe({
      next: (questions: any[]) => {
        this.questions = questions;
        const firstUnanswered = questions.findIndex(q => !q.answered_at);
        this.currentIndex = firstUnanswered === -1 ? 0 : firstUnanswered;
        this.cdr.detectChanges();
        this.startTimerForCurrentQuestion();
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
    if (this.currentQuestion?.answered_at) return;
    this.selectedOption = option;
  }

  // allow force submission on timeout
  submitAnswer(force = false) {
    if (!force && (!this.selectedOption || this.submitting)) return;
    if (this.submitting) return;
    this.submitting = true;

    // choose an explicit value for forced timeout (empty string means "no answer")
    const selected = this.selectedOption ?? '';

    this.api.submitAnswer(this.userId, this.currentQuestion.question_id, selected).subscribe({
      next: (updated) => {
        this.questions[this.currentIndex] = updated;
        this.submitting = false;
        this.selectedOption = null;
        this.stopTimer();

        if (this.currentIndex < this.questions.length - 1) {
          this.currentIndex++;
          this.cdr.detectChanges();
          this.startTimerForCurrentQuestion();
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
    this.stopTimer();
    this.api.submitQuiz(this.userId, this.contentId).subscribe({
      next: (result) => {
        this.result = result;
        this.cdr.detectChanges();
        if (this.stats) {
          this.stats = { ...this.stats, total_score: result.total_score };
        }
        this.loadStats();
        if (window.opener) {
          window.opener.postMessage(
            { type: 'quiz-complete', userId: this.userId, contentId: this.contentId, result },
            '*'
          );
        }
        setTimeout(() => {
          window.location.href = `${API_BASE_URL}/test-display`;
        }, 4000);
      },
      error: (err) => {
        this.error = err.error?.detail || 'Could not submit quiz';
        this.cdr.detectChanges();
        if (window.opener) {
          window.opener.postMessage(
            { type: 'quiz-complete', userId: this.userId, contentId: this.contentId, result: { score_earned: 0 } },
            '*'
          );
        }
        setTimeout(() => {
          window.location.href = `${API_BASE_URL}/test-display`;
        }, 4000);
      }
    });
  }

  // Timer helpers
  private startTimerForCurrentQuestion() {
    this.stopTimer();
    // don't start if question is already answered
    if (!this.currentQuestion || this.currentQuestion.answered_at) return;
    this.timeLeft = this.timerSeconds;
    this.timerInterval = window.setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.onTimerExpired();
      } else {
        this.cdr.detectChanges();
      }
    }, 1000) as unknown as number;
    this.cdr.detectChanges();
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private onTimerExpired() {
    this.stopTimer();
    // auto-submit even if no option selected (force=true)
    this.submitAnswer(true);
  }
}