import { Component, ElementRef, ViewChild, AfterViewInit, Output, EventEmitter, Input, SimpleChanges } from '@angular/core';
import { FormsModule } from "@angular/forms";
import { GradientSliderComponent } from "../gradient-slider/gradient-slider.component";
import { Color } from '../device-editor/device-editor';

@Component({
  selector: 'app-color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.css'],
  imports: [FormsModule, GradientSliderComponent]
})
export class ColorPickerComponent implements AfterViewInit {
  @ViewChild('canvas') CanvasRef!: ElementRef<HTMLCanvasElement>;
    private ctx!: CanvasRenderingContext2D;

  @Output() colorChange = new EventEmitter<Color>();
  @Input({ required: true }) SelectedColor!: Color;


  private IsDragging: boolean = false;

  ngAfterViewInit() {
    const canvas = this.CanvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.DrawColorWheel();

    canvas.addEventListener('mousedown', this.HandleMouseDown.bind(this));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['SelectedColor']) {
      this.SelectedColor = changes['SelectedColor'].currentValue;
      this.DrawColorWheel();
    }
  }

  DrawColorWheel() {
    const CenterX = this.CanvasRef.nativeElement.width / 2;
    const CenterY = this.CanvasRef.nativeElement.height / 2;
    const OuterRadius = CenterX - 10;
    const InnerRadius = OuterRadius - 30;

    this.ctx.clearRect(0, 0, this.CanvasRef.nativeElement.width, this.CanvasRef.nativeElement.height);

    // Draw The Hue Ring
    const gradient = this.ctx.createConicGradient(0, CenterX, CenterY);
    for (let i = 0; i <= 360; i += 10) gradient.addColorStop(i / 360, `hsl(${i}, ${this.SelectedColor.S}%, ${this.SelectedColor.L}%)`);


    this.ctx.beginPath();
    this.ctx.arc(CenterX, CenterY, OuterRadius, 0, 2 * Math.PI);
    this.ctx.arc(CenterX, CenterY, InnerRadius, 2 * Math.PI, 0, true);
    this.ctx.closePath();
    this.ctx.fillStyle = gradient;
    this.ctx.fill();


    // Draw The Center Preview
    this.ctx.beginPath();
    this.ctx.arc(CenterX, CenterY, InnerRadius - 30, 0, 2 * Math.PI);
    this.ctx.fillStyle = `hsl(${this.SelectedColor.H}, ${this.SelectedColor.S}%, ${this.SelectedColor.L}%)`;
    this.ctx.fill();


    // Draw The Outer Select Circle
    const CircleAngle = (this.SelectedColor.H * Math.PI) / 180;
    const CircleRadius = (OuterRadius + InnerRadius) / 2;
    this.ctx.beginPath();
    this.ctx.arc(
      CenterX + Math.cos(CircleAngle) * CircleRadius,
      CenterY + Math.sin(CircleAngle) * CircleRadius,
      10,
      0,
      2 * Math.PI
    );
    this.ctx.strokeStyle = '#d0d0d0';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();


    // Draw The Inner Select Circle
    const CircleAngle2 = (this.SelectedColor.H * Math.PI) / 180;
    const CircleRadius2 = (OuterRadius + InnerRadius) / 2;
    this.ctx.beginPath();
    this.ctx.arc(
      CenterX + Math.cos(CircleAngle2) * CircleRadius2,
      CenterY + Math.sin(CircleAngle2) * CircleRadius2,
      8,
      0,
      2 * Math.PI
    );
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }

  HandleMouseDown(event: MouseEvent) {
    const Rect = this.CanvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - Rect.left - this.CanvasRef.nativeElement.width / 2;
    const y = event.clientY - Rect.top - this.CanvasRef.nativeElement.height / 2;
    const distance = Math.sqrt(x * x + y * y);
    const outerRadius = this.CanvasRef.nativeElement.width / 2 - 10;
    const innerRadius = outerRadius - 30;

    // Check If the Click is Inside of the Picker
    if (distance >= innerRadius && distance <= outerRadius) {
      this.IsDragging = true;
      this.UpdateHueFromMouse(event);

      document.addEventListener('mousemove', this.HandleMouseMove.bind(this));
      document.addEventListener('mouseup', this.HandleMouseUp.bind(this));
    }
  }

  HandleMouseMove(event: MouseEvent) {
    if (this.IsDragging) this.UpdateHueFromMouse(event);
  }


  HandleMouseUp() {
    if (!this.IsDragging) return;

    this.IsDragging = false;
    document.removeEventListener('mousemove', this.HandleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.HandleMouseUp.bind(this));
  }


  UpdateHueFromMouse(event: MouseEvent) {
    const canvas = this.CanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - canvas.width / 2;
    const y = event.clientY - rect.top - canvas.height / 2;

    // Calculate Hue From Mouse Position
    this.SelectedColor.H = Math.atan2(y, x) * (180 / Math.PI);
    if (this.SelectedColor.H < 0) this.SelectedColor.H += 360;
    this.SelectedColor.H = Math.round(this.SelectedColor.H);
    this.SelectedColor = {H: this.SelectedColor.H, S: 100, L: this.SelectedColor.L};
    this.DrawColorWheel();
    this.colorChange.emit(this.SelectedColor);
  }

  ChangeLightness(val: any) { 
    this.SelectedColor.L = parseInt(val.value);
    this.SelectedColor = {H: this.SelectedColor.H, S: 100, L: this.SelectedColor.L};
    this.DrawColorWheel();
    this.colorChange.emit(this.SelectedColor);
  }
}