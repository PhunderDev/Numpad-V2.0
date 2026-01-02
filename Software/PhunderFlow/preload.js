const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ElectronAPI', {
  MinimizeApp: () => ipcRenderer.invoke("MinimizeApp"),
  MaximizeApp: () => ipcRenderer.invoke("MaximizeApp"),
  CloseApp: () => ipcRenderer.invoke("CloseApp"),
  GetDevices: () => ipcRenderer.invoke("GetDevices"),
  SendDataToDevice: (PID, VID, InterfaceNum, Data) => ipcRenderer.invoke("SendDataToDevice", PID, VID, InterfaceNum, Data),
  GetDeviceVisualizationConfig: (FileName) => ipcRenderer.invoke("GetDeviceVisualizationConfig", FileName),
  onUSBEvent: (callback) => {
    ipcRenderer.on('USBUpdate', (event, data) => {
      callback(data);
    });
  }
});