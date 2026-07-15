import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../../services/api';

interface ContentItem {
  id: number;
  title: string;
  content_type: string;
}

interface ProgressItem {
  content_id: number;
  status: string;
  score_till_now: number;
}

@Component({
  selector: 'app-complete',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './complete.html',
  styleUrl: './complete.scss'
})
export class Complete implements OnInit {
  userId = 0;
  loading = true;

  stats: { total_score: number; rank: number; total_users: number } | null = null;
  contentItems: ContentItem[] = [];
  progressMap: Record<number, ProgressItem> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: Api,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.loadCompleteState();
  }

  loadCompleteState() {
    this.loading = true;

    this.api.getUserStats(this.userId).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.cdr.detectChanges();
      },
      error: () => {
        this.stats = null;
        this.cdr.detectChanges();
      }
    });

    this.api.getContent().subscribe((items: ContentItem[]) => {
      this.contentItems = items;
      this.cdr.detectChanges();
    });

    this.api.getUserProgress(this.userId).subscribe((progress: ProgressItem[]) => {
      progress.forEach((p) => {
        this.progressMap[p.content_id] = p;
      });
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  get progressRows() {
    return this.contentItems.map((item) => {
      const progress = this.progressMap[item.id] ?? {
        content_id: item.id,
        status: 'not_started',
        score_till_now: 0
      };
      return { item, progress };
    });
  }

  goBackToResume() {
    this.router.navigate(['/resume']);
  }

  goToMenu() {
    this.router.navigate(['/menu', this.userId]);
  }
}