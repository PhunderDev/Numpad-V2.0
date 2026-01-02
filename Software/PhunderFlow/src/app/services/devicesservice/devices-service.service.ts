import { Injectable } from '@angular/core';
import { ElectonServiceService, ElectronAPI } from '../electronservice/electon-service.service';
import { BehaviorSubject } from 'rxjs/internal/BehaviorSubject';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceVisualizationConfig } from '../../device-editor/device-editor';

@Injectable({
  providedIn: 'root'
})
export class DevicesServiceService {

  private ConnectedDevices = new BehaviorSubject<ConnectedDevice[]>([]);
  ConnectedDevices$ = this.ConnectedDevices.asObservable();

  private CurrentlyEditedDevice = new BehaviorSubject<ConnectedDevice>({} as ConnectedDevice);
  CurrentlyEditedDevice$ = this.CurrentlyEditedDevice.asObservable();

  constructor(
    private ElectronService: ElectonServiceService,
    private router:Router
  ) {
    if(ElectronService.ElectronAPI) {
      ElectronService.ElectronAPI.onUSBEvent(() => {
        this.UpdateDevices();
      })
    }


  }

  UpdateDevices() {
    //console.log("Updating USB")
    this.ElectronService.ElectronAPI?.GetDevices().then(
      val => {
        this.ConnectedDevices.next(val);
        //console.log(this.router.url);
        if(this.router.url.split("?")[0] != "/editor") return;
        //console.log(this.router.url.split("?")[1] == `DeviceAddress=${this.CurrentlyEditedDevice.value.USBDetails.deviceAddress}`)
        if(this.router.url.split("?")[1] == `DeviceAddress=${this.CurrentlyEditedDevice.value.USBDetails.deviceAddress}`) this.router.navigateByUrl("");
      }
    );
  }

  SendDataToDevice(PID:number, VID:number, InterfaceNum:number, Data:number[][]) {
    this.ElectronService.ElectronAPI?.SendDataToDevice(PID, VID, InterfaceNum, Data);
  }

  SetEditedDevice(deviceAddress:number) {
    console.log("Editing Device: " + deviceAddress);
    if(deviceAddress == -1) {
      this.CurrentlyEditedDevice.next({} as ConnectedDevice);
      return;
    }

    for(let i = 0; i < this.ConnectedDevices.value.length; i++) {
      if(this.ConnectedDevices.value[i].USBDetails.deviceAddress == deviceAddress) {
        this.CurrentlyEditedDevice.next(this.ConnectedDevices.value[i]);
        break;
      }
    }
  }

  GetDeviceVisualizationConfig(FileName:string):Promise<DeviceVisualizationConfig> {
    //console.log("DevicesService Opening: " + FileName);
    return this.ElectronService.ElectronAPI?.GetDeviceVisualizationConfig(FileName) as Promise<DeviceVisualizationConfig>;
  }


}

export interface UsbDevice {
  vendorId: number;
  productId: number;
  manufacturer: string;
  product: string;
  serialNumber: string;
  deviceAddress: number;
}

export interface ConnectedDevice {
  DisplayName:string,
  VID:number,
  PID:number,
  Icon:string,
  Preview:string,
  Transparent:string,
  PreviewSize:string,
  RGBControl:boolean,
  KeybindControl:boolean,
  VisualizationConfig:string,
  USBDetails:UsbDevice
}