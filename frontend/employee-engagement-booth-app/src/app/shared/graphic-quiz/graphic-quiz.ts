import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { QUIZ_TIMER_SECONDS } from '../../constants';

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
  roundTitle?: string;
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
  // Legacy: a single match round.
  matchRound?: MatchRound;
  // Multiple categories to draw a locked round from (applies to quizType 'match').
  matchRounds?: MatchRound[];
}

// How many questions/pairs a locked draw contains for any card-quiz type.
const CARD_QUIZ_DRAW_COUNT = 5;

// ---- Deterministic seeded RNG helpers ----------------------------------
// Same (userId, contentId, quizType) always produces the same seed, so the
// same user always gets the same drawn questions in the same order — this
// IS the "lock" mechanism for cards 2-4, without needing any backend state.
// Mirrors the "no reroll once assigned" rule used for card 1's MCQ pool,
// just implemented as a pure function of identity instead of a DB row.

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle driven by a supplied RNG function, so multiple draws
// from the same seeded generator stay consistent with each other in one pass.
function seededShuffle<T>(rand: () => number, arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
// -------------------------------------------------------------------------

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

  // The locked, drawn subset actually played this session — for myth/emoji
  // this is CARD_QUIZ_DRAW_COUNT questions out of the full pool.
  activeQuestions: Question[] = [];

  // The locked, drawn round + subset of pairs actually played this session
  // (for quizType 'match').
  activeMatchRound: MatchRound | null = null;

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

  timerSeconds = QUIZ_TIMER_SECONDS;
  timeLeft = 0;
  private timerInterval: number | null = null;

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

        if (this.config) {
          this.prepareLockedDraw();
        }

        this.loading = false;

        if (this.config?.quizType === 'myth' || this.config?.quizType === 'emoji') {
          this.startTimerForCurrentQuestion();
        } else if (this.config?.quizType === 'match' && this.activeMatchRound) {
          this.startTimerForMatchRound();
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  // Draws (and locks) this user's fixed subset of questions/pairs for this
  // card. Same userId + contentId + quizType => same seed => same draw,
  // every time they open this card, on any kiosk.
  private prepareLockedDraw() {
    if (!this.config) return;
    const seed = hashSeed(`${this.userId}-${this.contentId}-${this.config.quizType}`);
    const rand = mulberry32(seed);

    if (this.config.quizType === 'myth' || this.config.quizType === 'emoji') {
      const pool = this.config.questions ?? [];
      const drawCount = Math.min(CARD_QUIZ_DRAW_COUNT, pool.length);
      this.activeQuestions = seededShuffle(rand, pool).slice(0, drawCount);
    } else if (this.config.quizType === 'match') {
      const rounds = this.config.matchRounds ?? (this.config.matchRound ? [this.config.matchRound] : []);
      if (rounds.length) {
        // Lock which category/round this user gets...
        const roundIndex = Math.floor(rand() * rounds.length);
        const chosenRound = rounds[roundIndex];
        // ...then lock which 5 pairs from that round, using continued draws
        // from the same generator so the whole session is one deterministic sequence.
        const drawCount = Math.min(CARD_QUIZ_DRAW_COUNT, chosenRound.pairs.length);
        const pairs = seededShuffle(rand, chosenRound.pairs).slice(0, drawCount);
        this.activeMatchRound = { roundTitle: chosenRound.roundTitle, pairs };
        this.setupMatchRoundState(rand);
      }
    }
  }

  private setupMatchRoundState(rand: () => number) {
    this.matchedPairs = {};
    this.matchedDescIds = new Set<string>();
    this.selectedTermId = null;
    const pairs = this.activeMatchRound?.pairs ?? [];
    this.shuffledDescriptions = seededShuffle(rand, pairs);
  }

  get currentQuestion(): Question | null {
    return this.activeQuestions[this.currentIndex] ?? null;
  }

  get totalQuestions(): number {
    return this.activeQuestions.length;
  }

  get currentRound(): MatchRound | null {
    return this.activeMatchRound;
  }

  asMyth(q: Question | null): MythQuestion {
    return q as MythQuestion;
  }

  asEmoji(q: Question | null): EmojiQuestion {
    return q as EmojiQuestion;
  }

  normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

  // ---- Myth / Real ----
  answerMyth(choseMyth: boolean) {
    if (this.answered) return;
    const q = this.asMyth(this.currentQuestion);
    this.wasCorrect = choseMyth === q.isMyth;
    if (this.wasCorrect) this.score += 10;
    this.answered = true;
    this.stopTimer();
    this.cdr.detectChanges();
  }

  // ---- Emoji ----
  submitEmojiAnswer() {
    if (this.answered || !this.emojiInput.trim()) return;
    const q = this.asEmoji(this.currentQuestion);
    const normalizedEntry = this.normalizeAnswer(this.emojiInput);
    const normalizedAnswer = this.normalizeAnswer(q.answer);
    this.wasCorrect = normalizedEntry === normalizedAnswer;
    if (this.wasCorrect) this.score += 10;
    this.answered = true;
    this.stopTimer();
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

    const round = this.activeMatchRound;
    if (round && Object.keys(this.matchedPairs).length === round.pairs.length) {
      const allCorrect = round.pairs.every((p) => this.matchedPairs[p.id] === p.id);
      this.wasCorrect = allCorrect;
      if (allCorrect) this.score += 10 * round.pairs.length;

      this.stopTimer();
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
    const round = this.activeMatchRound;
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
      this.startTimerForCurrentQuestion();
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

  // timer helpers:
  private startTimerForCurrentQuestion() {
    this.stopTimer();
    if (!this.activeQuestions.length) return;
    const q = this.currentQuestion;
    if (!q || (q as any).answered_at) return;
    this.timeLeft = this.timerSeconds;
    this.timerInterval = window.setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.onTimerExpiredForQuestion();
      } else {
        this.cdr.detectChanges();
      }
    }, 1000) as unknown as number;
    this.cdr.detectChanges();
  }

  private startTimerForMatchRound() {
    this.stopTimer();
    this.timeLeft = this.timerSeconds;
    this.timerInterval = window.setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.onTimerExpiredForMatch();
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

  private onTimerExpiredForQuestion() {
    this.stopTimer();
    this.answered = true;
    this.wasCorrect = false;
    this.cdr.detectChanges();
    setTimeout(() => this.next(), 1500);
  }

  private onTimerExpiredForMatch() {
    this.stopTimer();
    this.wasCorrect = false;
    this.finish();
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