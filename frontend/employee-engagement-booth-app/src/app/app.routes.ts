import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Menu } from './pages/menu/menu';
import { Leaderboard } from './pages/leaderboard/leaderboard';
import { QrDisplay } from './pages/qr-display/qr-display';
import { Quiz } from './pages/quiz/quiz';


export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'menu/:userId', component: Menu },
  { path: 'leaderboard', component: Leaderboard },
  { path: 'qr/:userId/:qrCode', component: QrDisplay },
  { path: 'quiz/:userId/:contentId', component: Quiz },

];