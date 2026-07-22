import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ItineraryModal } from './itinerary-modal';

describe('ItineraryModal', () => {
  let component: ItineraryModal;
  let fixture: ComponentFixture<ItineraryModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItineraryModal],
    }).compileComponents();

    fixture = TestBed.createComponent(ItineraryModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
