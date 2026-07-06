import { Routes } from '@angular/router';
import { Resume } from './pages/resume/resume';
import { Register } from './pages/register/register';
import { Menu } from './pages/menu/menu';
import { Leaderboard } from './pages/leaderboard/leaderboard';
import { QrDisplay } from './pages/qr-display/qr-display';
import { Quiz } from './pages/quiz/quiz';
import { ContentWindow } from './shared/content-window/content-window';
import { GraphicQuiz } from './shared/graphic-quiz/graphic-quiz';


export const routes: Routes = [
  { path: '', redirectTo: 'resume', pathMatch: 'full' },
  { path: 'resume', component: Resume },
  { path: 'register', component: Register },
  { path: 'menu/:userId', component: Menu },
  { path: 'leaderboard', component: Leaderboard },
  { path: 'qr/:userId/:qrCode', component: QrDisplay },
  { path: 'quiz/:userId/:contentId', component: Quiz },
  { path: 'content-window/:userId/:contentId', component: ContentWindow },
  { path: 'card-quiz/:userId/:contentId', component: GraphicQuiz },
];