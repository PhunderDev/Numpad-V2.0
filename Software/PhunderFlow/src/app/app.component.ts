import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ElectonServiceService } from './services/electronservice/electon-service.service';
import { ConnectedDevice, DevicesServiceService } from './services/devicesservice/devices-service.service';
import { RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgClass],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  Devices: ConnectedDevice[] = [];
  CurrentUrl:string = "";
  
  constructor(private ElectronService: ElectonServiceService, private DevicesService: DevicesServiceService, private cdr: ChangeDetectorRef, private router:Router, private activatedRoute:ActivatedRoute) {
  

    router.events.forEach((event) => {
      if(event instanceof NavigationEnd) {
        let Subpages = event.url.split("/");
        let Subpage = Subpages[Subpages.length - 1];
        //console.log(event.url);
        //console.log(Subpage);
        this.CurrentUrl = Subpage
        if(Subpage.startsWith("editor")) {
          let queryParams = this.activatedRoute.snapshot.queryParams;
          this.DevicesService.SetEditedDevice(queryParams['DeviceAddress']);
        } else {
          this.DevicesService.SetEditedDevice(-1);
        }
      }
    });

  }

  ngOnInit() {
    this.DevicesService.ConnectedDevices$.subscribe(val => {
      this.Devices = val;
      console.log(val);
      this.cdr.detectChanges();
    });
    this.DevicesService.UpdateDevices()
  }

  title = 'PhunderFlow';


  MinimizeApp() {this.ElectronService.MinimizeApp();}

  MaximizeApp() {this.ElectronService.MaximizeApp();}

  CloseApp() {this.ElectronService.CloseApp();}


}
