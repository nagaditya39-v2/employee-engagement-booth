import { ChangeDetectorRef, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';

interface Topic {
  id: string;
  title: string;
  description: string;
  videoFile: string;
  comingSoon?: boolean;
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
  checkingProgress = true;

  previewTopicId: string | null = null;

  lockedTopic: Topic | null = null;
  localVideoUrl: string | null = null;

  alreadyCompleted = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: Api,
    private cdr: ChangeDetectorRef,
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

  private resolveLockedTopicFromBackend(status: string) {
    this.api.startQuiz(this.contentId, this.userId).subscribe({
      next: (assigned: any[]) => {
        const topicKey = assigned?.[0]?.topic_key;
        const topic = this.topics.find((t) => t.id === topicKey) ?? null;
        if (topic) {
          this.lockTopic(topic);
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
    // will add actuals late, mayb in public/assets/thumbs
    return 'assets/img/turbine-fan-icon.png';
  }

  previewTopic(topic: Topic): void {
    if (topic.comingSoon) return;
    this.previewTopicId = topic.id;
  }

  isPreviewed(topic: Topic): boolean {
    return this.previewTopicId === topic.id;
  }

  confirmSelection(): void {
    const topic = this.topics.find(t => t.id === this.previewTopicId);
    if (!topic || topic.comingSoon) return;
    this.lockTopic(topic);
    this.cdr.detectChanges();
  }

  private lockTopic(topic: Topic) {
    this.lockedTopic = topic;
    this.localVideoUrl = `assets/videos/${topic.videoFile}`;
  }

  backButton() {
    if (window.opener) {
      window.opener.postMessage({ type: 'BACK_TO_RESUME' }, window.location.origin);
    }
    window.location.href = this.api.getTestContentUrl();
  }

  goToQuiz(): void {
    if (!this.lockedTopic) return;
    this.router.navigate(['/quiz', this.userId, this.contentId], {
      queryParams: { topic: this.lockedTopic.id }
    });
  }
}