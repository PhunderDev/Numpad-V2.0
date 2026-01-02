import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-gradient-slider',
  imports: [],
  templateUrl: './gradient-slider.component.html',
  styleUrl: './gradient-slider.component.css'
})
export class GradientSliderComponent implements OnChanges {
  @Input() min: number = 0;
  @Input() max: number = 100;
  @Input() step: number = 1;
  @Input() value: number = 0;
  @Input() disabled: boolean = false;

  @Output() input = new EventEmitter<Event>();

  GradientPercent:number = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && changes['value'].currentValue !== changes['value'].previousValue) {
      this.value = Math.min(Math.max(this.value, this.min), this.max);
      this.GradientPercent = ((this.value - this.min) / (this.max - this.min));
    }
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = parseInt(target.value);
    this.GradientPercent = ((this.value - this.min) / (this.max - this.min));
    this.input.emit(event);
  }
}
