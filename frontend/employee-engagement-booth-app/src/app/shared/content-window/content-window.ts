import { ChangeDetectorRef, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-content-window',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './content-window.html',
  styleUrl: './content-window.scss',
})
export class ContentWindow {
  topics: any[] = [];
  activeTopicId = 1;
  selectedTitle = '';
  selectedVideoUrl = '';

  showTopicPopup = true;
  selectedTopicId: number | null = null;

  safeVideoUrl!: SafeResourceUrl;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: Api,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
  ) { }

  selectTopic(id: number): void {
    this.selectedTopicId = id;
  }

  ngOnInit() {
    this.api.getSideTopics().subscribe((topics: any[]) => {
      this.topics = topics;
      this.showTopicPopup = true;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    // Clean up
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

  startLearning(): void {
    if (!this.selectedTopicId) {
      return;
    }
    this.activeTopicId = this.selectedTopicId;
    const topic = this.topics.find((t) => t.id === this.activeTopicId);
    this.selectedTitle = topic?.title || '';
    this.selectedVideoUrl = topic?.videoUrl || '';
    this.showTopicPopup = false;
    this.cdr.detectChanges();
  }
}