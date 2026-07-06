import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GraphicQuiz } from './graphic-quiz';

describe('GraphicQuiz', () => {
  let component: GraphicQuiz;
  let fixture: ComponentFixture<GraphicQuiz>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphicQuiz],
    }).compileComponents();

    fixture = TestBed.createComponent(GraphicQuiz);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
