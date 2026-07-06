import { ChangeDetectorRef, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface Topic {
  id: string;
  title: string;
  videoId: string;
  description: string;
}

@Component({
  selector: 'app-content-window',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './content-window.html',
  styleUrl: './content-window.scss',
})
export class ContentWindow {
  userId: number = 0;
  contentId: number = 0;

  topics: Topic[] = [];
  loadingTopics = true;

  // True while we're checking the backend for an existing topic lock —
  // guards against briefly flashing the pick-a-topic grid before we know
  // whether this user already chose one (possibly on a different kiosk).
  checkingProgress = true;

  // Topic the user is currently previewing (not locked in yet)
  previewTopicId: string | null = null;

  // Topic locked in — once set, this is the only content the user can see.
  // Can be set either by confirmSelection() (fresh pick) or by
  // resolveLockedTopicFromBackend() (returning to an already-locked session).
  lockedTopic: Topic | null = null;
  safeVideoUrl: SafeResourceUrl | null = null;

  // True if the backend says this user already finished the quiz for this
  // topic — in that case we don't offer "take the quiz" again.
  alreadyCompleted = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: Api,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
  ) { }

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.contentId = Number(this.route.snapshot.paramMap.get('contentId'));

    this.api.getSideTopics().subscribe({
      next: (topics: Topic[]) => {
        this.topics = topics;
        this.loadingTopics = false;
        this.checkExistingLock();
      },
      error: () => {
        this.loadingTopics = false;
        this.checkExistingLock();
      }
    });
  }

  // Looks up this user's Progress row for this content item. If they've
  // already moved past "picking a topic" (quiz_assigned or quiz_completed),
  // we must not show the topic grid again — a topic choice, once locked, is
  // final, matching the same "no reroll" rule the quiz itself already
  // enforces. Resolves which topic via the already-assigned questions'
  // topic_key, since that's stored server-side and works from any kiosk.
  private checkExistingLock() {
    this.api.getUserProgress(this.userId).subscribe({
      next: (progressList: any[]) => {
        const progress = progressList.find((p) => p.content_id === this.contentId);

        if (progress && (progress.status === 'quiz_assigned' || progress.status === 'quiz_completed')) {
          this.resolveLockedTopicFromBackend(progress.status);
        } else {
          this.checkingProgress = false;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.checkingProgress = false;
        this.cdr.detectChanges();
      }
    });
  }

  // Safe to call here specifically because attempts are already guaranteed
  // to exist (status check above) — start-quiz is idempotent and will
  // return the existing assigned questions rather than drawing a fresh,
  // untagged batch. Calling this BEFORE a topic is picked would be unsafe.
  private resolveLockedTopicFromBackend(status: string) {
    this.api.startQuiz(this.contentId, this.userId).subscribe({
      next: (assigned: any[]) => {
        const topicKey = assigned?.[0]?.topic_key;
        const topic = this.topics.find((t) => t.id === topicKey) ?? null;

        if (topic) {
          this.lockedTopic = topic;
          this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            `https://www.youtube-nocookie.com/embed/${topic.videoId}?rel=0&modestbranding=1`
          );
        }
        this.alreadyCompleted = status === 'quiz_completed';
        this.checkingProgress = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.checkingProgress = false;
        this.cdr.detectChanges();
      }
    });
  }

  thumbnailUrl(topic: Topic): string {
    return `https://img.youtube.com/vi/${topic.videoId}/hqdefault.jpg`;
  }

  previewTopic(topic: Topic): void {
    this.previewTopicId = topic.id;
  }

  isPreviewed(topic: Topic): boolean {
    return this.previewTopicId === topic.id;
  }

  // Locks the choice in — after this, the user can only see this one topic.
  confirmSelection(): void {
    const topic = this.topics.find(t => t.id === this.previewTopicId);
    if (!topic) return;

    this.lockedTopic = topic;
    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${topic.videoId}?rel=0&modestbranding=1`
    );
    this.cdr.detectChanges();
  }

  backButton() {
    // Tell the menu (opener) window to go back to the resume/idle screen.
    if (window.opener) {
      window.opener.postMessage(
        { type: 'BACK_TO_RESUME' },
        window.location.origin
      );
    }

    // This IS the second-monitor window — revert itself to the static
    // idle display, same pattern as quiz.ts's finishQuiz().
    window.location.href = this.api.getTestContentUrl();
  }

  // Exit the content view and go attempt the quiz for the topic just picked.
  goToQuiz(): void {
    if (!this.lockedTopic) return;

    this.router.navigate(['/quiz', this.userId, this.contentId], {
      queryParams: { topic: this.lockedTopic.id }
    });
  }
}