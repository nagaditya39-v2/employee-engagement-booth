import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ScheduleItem {
  icon: string;
  title: string;
  description: string;
  time: string;
  room: string;
  status: 'live' | 'upcoming';
}

@Component({
  selector: 'app-itinerary-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './itinerary-modal.html',
  styleUrl: './itinerary-modal.scss',
})
export class ItineraryModal {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  // Swap these two for your real schedule items
  scheduleItems: ScheduleItem[] = [
    {
      icon: '🖥️',
      title: 'Effective Communication',
      description: 'Enhance your communication skills in the workplace.',
      time: '09:30 AM – 10:30 AM',
      room: 'Innovation Hub',
      status: 'upcoming',
    },
    {
      icon: '👥',
      title: 'Leadership in Action',
      description: 'Practical strategies for impactful leadership.',
      time: '11:00 AM – 12:00 PM',
      room: 'Engine Room',
      status: 'upcoming',
    },
  ];

  close() {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) this.close();
  }
}