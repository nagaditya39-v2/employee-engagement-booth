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
      title: 'The Anatomy of a Shop Visit: Managing Costs, Invoicing & Data Availability',
      description: 'Alok Kumar',
      time: '11:20 AM - 11:40 AM',
      room: 'Bekal - Room 9',
      status: 'upcoming',
    },
    {
      icon: '👥',
      title: 'Power Automate: Automate, Innovate, Elevate - Stop Repeating. Start Automating',
      description: 'Yashawini Velraj / Nivas G E',
      time: '11:50 AM - 12:10 PM',
      room: 'Ellora - Room 10',
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