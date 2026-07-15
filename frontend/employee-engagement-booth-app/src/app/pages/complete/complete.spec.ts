import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Complete } from './complete';

describe('Complete', () => {
  let component: Complete;
  let fixture: ComponentFixture<Complete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Complete],
    }).compileComponents();

    fixture = TestBed.createComponent(Complete);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
