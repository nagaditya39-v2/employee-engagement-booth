import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';

interface MythQuestion {
  type: 'myth';
  statement: string;
  isMyth: boolean;
  funFact: string;
}

interface EmojiQuestion {
  type: 'emoji';
  emojis: string[];
  answer: string;
  hint: string;
}

interface MatchPair {
  id: string;
  term: string;
  imageUrl: string;
  description: string;
}

interface MatchRound {
  pairs: MatchPair[];
}

type Question = MythQuestion | EmojiQuestion;

interface CardQuizConfig {
  contentId: number;
  quizType: 'myth' | 'emoji' | 'match';
  title: string;
  subtitle: string;
  accent: string;
  questions?: Question[];
  matchRound?: MatchRound;
}

@Component({
  selector: 'app-graphic-quiz',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './graphic-quiz.html',
  styleUrl: './graphic-quiz.scss',
})
export class GraphicQuiz implements OnInit {
  userId = 0;
  contentId = 0;

  config: CardQuizConfig | null = null;
  loading = true;

  currentIndex = 0;
  score = 0;
  answered = false;
  wasCorrect = false;

  emojiInput = '';
  showHint = false;

  // Match-type state
  selectedTermId: string | null = null;
  matchedPairs: Record<string, string> = {};
  matchedDescIds = new Set<string>();
  shuffledDescriptions: MatchPair[] = [];

  stats: { total_score: number; rank: number; total_users: number } | null = null;
  complete = false;

  private readonly matchColors = ['#4b9dff', '#c084fc', '#f97316', '#22c55e'];

  constructor(
    private route: ActivatedRoute,
    private api: Api,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.contentId = Number(this.route.snapshot.paramMap.get('contentId'));
    this.loadConfig();
    this.loadStats();
  }

  loadStats() {
    this.api.getUserStats(this.userId).subscribe({
      next: (s) => {
        this.stats = s;
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges(),
    });
  }

  loadConfig() {
    this.api.getCardQuizzes().subscribe({
      next: (all: CardQuizConfig[]) => {
        this.config = all.find((c) => c.contentId === this.contentId) ?? null;
        if (this.config?.quizType === 'match' && this.config.matchRound) {
          this.shuffledDescriptions = [...this.config.matchRound.pairs].sort(() => Math.random() - 0.5);
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  get currentQuestion(): Question | null {
    if (!this.config?.questions) return null;
    return this.config.questions[this.currentIndex] ?? null;
  }

  get totalQuestions(): number {
    return this.config?.questions?.length ?? 0;
  }

  asMyth(q: Question | null): MythQuestion {
    return q as MythQuestion;
  }

  asEmoji(q: Question | null): EmojiQuestion {
    return q as EmojiQuestion;
  }

  // ---- Myth / Real ----
  answerMyth(choseMyth: boolean) {
    if (this.answered) return;
    const q = this.asMyth(this.currentQuestion);
    this.wasCorrect = choseMyth === q.isMyth;
    if (this.wasCorrect) this.score += 10;
    this.answered = true;
    this.cdr.detectChanges();
  }

  // ---- Emoji ----
  submitEmojiAnswer() {
    if (this.answered || !this.emojiInput.trim()) return;
    const q = this.asEmoji(this.currentQuestion);
    this.wasCorrect = this.emojiInput.trim().toLowerCase() === q.answer.trim().toLowerCase();
    if (this.wasCorrect) this.score += 10;
    this.answered = true;
    this.cdr.detectChanges();
  }

  toggleHint() {
    this.showHint = !this.showHint;
  }

  // ---- Match ----
  selectTerm(termId: string) {
    if (this.matchedPairs[termId]) return;
    this.selectedTermId = this.selectedTermId === termId ? null : termId;
  }

  selectDescription(descId: string) {
    if (!this.selectedTermId || this.matchedDescIds.has(descId)) return;

    this.matchedPairs[this.selectedTermId] = descId;
    this.matchedDescIds.add(descId);
    this.selectedTermId = null;

    const round = this.config?.matchRound;
    if (round && Object.keys(this.matchedPairs).length === round.pairs.length) {
      const allCorrect = round.pairs.every((p) => this.matchedPairs[p.id] === p.id);
      this.wasCorrect = allCorrect;
      if (allCorrect) this.score += 10 * round.pairs.length;
      // Submit score and perform the same end-of-quiz flow as other quiz types
      this.finish();
      return;
    }
    this.cdr.detectChanges();
  }

  isTermMatched(termId: string): boolean {
    return !!this.matchedPairs[termId];
  }

  isDescMatched(descId: string): boolean {
    return this.matchedDescIds.has(descId);
  }

  matchColor(termId: string): string | null {
    const round = this.config?.matchRound;
    if (!round) return null;
    const idx = round.pairs.findIndex((p) => p.id === termId);
    return this.matchColors[idx % this.matchColors.length];
  }

  onImageError(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  // ---- Shared progression ----
  next() {
    if (this.currentIndex < this.totalQuestions - 1) {
      this.currentIndex++;
      this.answered = false;
      this.emojiInput = '';
      this.showHint = false;
      this.cdr.detectChanges();
    } else {
      this.finish();
    }
  }

  private finish() {
    this.complete = true;
    this.cdr.detectChanges();

    this.api.submitCardQuiz(this.contentId, this.userId, this.score).subscribe({
      next: () => {
        this.loadStats();                 // refresh points/rank from DB
        this.notifyKioskAndReset();
      },
      error: () => {
        this.loadStats();                 // still refresh on error path
        this.notifyKioskAndReset();
      },
    });
}

  private notifyKioskAndReset() {
    if (window.opener) {
      window.opener.postMessage(
        { type: 'quiz-complete', userId: this.userId, contentId: this.contentId, result: { score_earned: this.score } },
        '*'
      );
    }

    setTimeout(() => {
      window.location.href = this.api.getTestContentUrl();
    }, 4000);
  }
  
}