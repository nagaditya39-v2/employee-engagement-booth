import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';
import { DISPLAY_CONFIG } from '../../screen_config';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu.html',
  styleUrl: './menu.scss'
})
export class Menu implements OnInit, OnDestroy {
  userId: number = 0;
  contentItems: any[] = [];
  progressMap: { [contentId: number]: string } = {};
  contentWindow: Window | null = null;

  // Set while a quiz is running on the second monitor, so this (main) window
  // can show "in progress" and ignore other clicks until it resolves.
  quizContentId: number | null = null;
  quizJustCompleted: boolean = false;

  private messageHandler = (event: MessageEvent) => this.handleSecondScreenMessage(event);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: Api,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.loadMenu();
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.messageHandler);
  }

  loadMenu() {
    this.api.getContent().subscribe((items: any[]) => {
      this.contentItems = items;
      this.cdr.detectChanges();
    });

    this.api.getUserProgress(this.userId).subscribe((progress: any[]) => {
      progress.forEach((p: any) => {
        this.progressMap[p.content_id] = p.status;
      });
      this.cdr.detectChanges();
    });
  }

  // Content (video/webpage/interactive) still opens on the second monitor.
  // The menu itself does not change pages or navigate away.
  openContent(item: any) {
    this.api.markViewed(item.id, this.userId).subscribe(() => {
      this.progressMap[item.id] = 'viewed';
      this.cdr.detectChanges();
      const url = `${window.location.origin}/content-window/${this.userId}/${item.id}`;
      this.openSecondScreen(url);
    });
  }

  // Quiz also opens on the second monitor (as a second instance of this SPA,
  // routed to /quiz/:userId/:contentId) — never in the main kiosk window/router.
  startQuiz(item: any) {
    this.quizContentId = item.id;
    this.quizJustCompleted = false;
    this.progressMap[item.id] = 'quiz_assigned';
    this.cdr.detectChanges();

    const quizUrl = `${window.location.origin}/quiz/${this.userId}/${item.id}`;
    this.openSecondScreen(quizUrl);
  }

  private openSecondScreen(url: string) {
    if (!this.contentWindow || this.contentWindow.closed) {
      const { secondScreenX, secondScreenY, displayWidth, displayHeight } = DISPLAY_CONFIG;
      const windowFeatures = `left=${secondScreenX},top=${secondScreenY},width=${displayWidth},height=${displayHeight}`;
      this.contentWindow = window.open(url, 'content-window', windowFeatures);
    } else {
      this.contentWindow.location.href = url;
      this.contentWindow.focus();
    }
  }

  launchContentWindow() {
    const { secondScreenX, secondScreenY, displayWidth, displayHeight } = DISPLAY_CONFIG;
    const windowFeatures = `left=${secondScreenX},top=${secondScreenY},width=${displayWidth},height=${displayHeight}`;
    const url = this.api.getTestContentUrl();
    this.contentWindow = window.open(url, 'content-window', windowFeatures);
    this.cdr.detectChanges();
  }

  // The quiz page (running in the second-monitor window) posts this when
  // the user finishes. The MAIN window is what reacts — updates status,
  // shows the result briefly, then resets itself to the login screen
  // (Phase 7). The second-monitor window separately reverts itself to the
  // static welcome/display page; the two are independent.
  private handleSecondScreenMessage(event: MessageEvent) {
    const data = event.data;

    if (event.data.type === 'BACK_TO_RESUME') {
      this.router.navigate(['/resume']);
      return;
    }

    if (!data || data.type !== 'quiz-complete' || data.userId !== this.userId) return;

    this.progressMap[data.contentId] = 'quiz_completed';
    this.quizContentId = null;
    this.quizJustCompleted = true;
    this.cdr.detectChanges();

    // Give the kiosk a moment to show "Completed" before resetting for the next person.
    setTimeout(() => {
      this.router.navigate(['/resume']);
    }, 4000);
  }

  getStatusLabel(contentId: number): string {
    const status = this.progressMap[contentId];
    if (status === 'quiz_completed') return '✅ Completed';
    if (status === 'quiz_assigned') return '📺 Quiz in progress on display screen';
    if (status === 'viewed') return '👁 Viewed';
    return '🔵 Not started';
  }

  // Drives the "X of N completed" pill in the header.
  completedCount(): number {
    return Object.values(this.progressMap).filter(s => s === 'quiz_completed').length;
  }
}