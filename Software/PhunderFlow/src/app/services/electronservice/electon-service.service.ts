import { Injectable } from '@angular/core';
import { ConnectedDevice } from '../devicesservice/devices-service.service';


@Injectable({
  providedIn: 'root'
})
export class ElectonServiceService {
  ElectronAPI: ElectronAPI | undefined;

  constructor() {
    //console.log('window.electronAPI Exists:', typeof (window as any).ElectronAPI);
    if ((window as any).ElectronAPI) {
      this.ElectronAPI = (window as any).ElectronAPI;
      //console.log('ElectronAPI Initialized:', !!this.ElectronAPI);
    }
  }
  



  MinimizeApp() {
    this.ElectronAPI?.MinimizeApp();
  }

  MaximizeApp() {
    this.ElectronAPI?.MaximizeApp();
  }

  CloseApp() {
    this.ElectronAPI?.CloseApp();
  }

}




export interface ElectronAPI {
  MinimizeApp: () => Promise<void>;
  MaximizeApp: () => Promise<void>;
  CloseApp: () => Promise<void>;
  GetDevices: () => Promise<ConnectedDevice[]>;
  GetDeviceVisualizationConfig: (FileName:string) => Promise<Object>;
  SendDataToDevice: (PID:number, VID:number, InterfaceNum:number, Data:number[][]) => Promise<void>;
  onUSBEvent: (callback: () => void) => void;
}