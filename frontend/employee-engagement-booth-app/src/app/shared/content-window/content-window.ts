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

  // Topic the user is currently previewing (not locked in yet)
  previewTopicId: string | null = null;

  // Topic locked in — once set, this is the only content the user can see
  lockedTopic: Topic | null = null;
  safeVideoUrl: SafeResourceUrl | null = null;

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
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingTopics = false;
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