import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConnectedDevice, DevicesServiceService } from '../services/devicesservice/devices-service.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  
  Devices: ConnectedDevice[] = [];
  private DevicesUpdateSubscription:Subscription | undefined;
  
  constructor(private DevicesService:DevicesServiceService, private cdr: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.DevicesUpdateSubscription = this.DevicesService.ConnectedDevices$.subscribe(val => {
      this.Devices = val;
      console.log(val);
      this.cdr.detectChanges();
    });
    this.DevicesService.UpdateDevices();
  }

  ngOnDestroy(): void {
    if(this.DevicesUpdateSubscription != undefined) this.DevicesUpdateSubscription.unsubscribe();
  }



}
