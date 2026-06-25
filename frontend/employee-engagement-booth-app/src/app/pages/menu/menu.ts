import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
export class Menu implements OnInit {
  userId: number = 0;
  contentItems: any[] = [];
  progressMap: { [contentId: number]: string } = {};
  contentWindow: Window | null = null;

  constructor(
    private route: ActivatedRoute,
    private api: Api,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.loadMenu();
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

  openContent(item: any) {
    this.api.markViewed(item.id, this.userId).subscribe(() => {
      this.progressMap[item.id] = 'viewed';
      this.cdr.detectChanges();

      if (!this.contentWindow || this.contentWindow.closed) {
        // Reopen if user closed it
        const { secondScreenX, secondScreenY, displayWidth, displayHeight } = DISPLAY_CONFIG;
        const windowFeatures = `left=${secondScreenX},top=${secondScreenY},width=${displayWidth},height=${displayHeight}`;
        this.contentWindow = window.open(item.url, 'content-window', windowFeatures);
      } else {
        this.contentWindow.location.href = item.url;
        this.contentWindow.focus();
      }
    });
  }

  launchContentWindow() {
    const { secondScreenX, secondScreenY, displayWidth, displayHeight } = DISPLAY_CONFIG;
    const windowFeatures = `left=${secondScreenX},top=${secondScreenY},width=${displayWidth},height=${displayHeight}`;
    this.contentWindow = window.open('http://127.0.0.1:8000/test-display', 'content-window', windowFeatures);
    this.cdr.detectChanges();
  }

  getStatusLabel(contentId: number): string {
    const status = this.progressMap[contentId];
    if (status === 'quiz_completed') return '✅ Completed';
    if (status === 'viewed' || status === 'quiz_assigned') return '👁 Viewed';
    return '🔵 Not Started';
  }
}