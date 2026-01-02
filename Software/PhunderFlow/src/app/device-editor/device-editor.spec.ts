import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeviceEditor } from './device-editor';

describe('DeviceEditor', () => {
  let component: DeviceEditor;
  let fixture: ComponentFixture<DeviceEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeviceEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeviceEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
