const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const usb = require('usb');
const HID = require('node-hid');
const fs = require('fs');

let MainWindow;
let tray;

function createWindow() {
  const win = new BrowserWindow({
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    frame: false,
    transparent: true,
    devTools: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: false,
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  win.removeMenu();
  Menu.setApplicationMenu(null);
  if (process.platform === 'darwin') {
    //Menu.setApplicationMenu(Menu.buildFromTemplate([]));
  }

  const indexPath = path.join(__dirname, 'dist/phunder-flow/browser/index.html');
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
    return false;
  });
  win.loadFile(indexPath);
  //win.openDevTools();
  MainWindow = win;
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'public/media/icons/devices/Numpad.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        MainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('PhunderFlow');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (MainWindow.isVisible()) {
      MainWindow.hide();
    } else {
      MainWindow.show();
    }
  });
}

ipcMain.handle('MinimizeApp', () => {
  MainWindow.minimize();
});

ipcMain.handle('MaximizeApp', () => {

  /*if (process.platform === 'darwin') {
    MainWindow.setFullScreen(!MainWindow.isFullScreen());
  }*/

  if(!MainWindow.isMaximized()) MainWindow.maximize();
  else MainWindow.unmaximize();
});

ipcMain.handle('CloseApp', () => {
  app.quit();
});


ipcMain.handle('SendDataToDevice', (event, PID, VID, InterfaceNum, Data) => {
  const devices = HID.devices();

  const targetDevice = devices.find(device => 
      device.vendorId === VID && 
      device.productId === PID &&
      device.interface === InterfaceNum
  );

  if (!targetDevice) {
      console.error('Error: Communication Interface not found');
      return;
  }

  try {
    const device = new HID.HID(targetDevice.path);

    for(let i = 0; i < Data.length; i++) {
      const dataWithId = Buffer.alloc(65); 
      Buffer.from(Data[i]).copy(dataWithId, 1); // Dummy Byte to Avoid The Shift Due to The Lack Of Report ID
      //console.log("Raw Data: " + Data[i]);
      //console.log('Sending: ', Array.from(dataWithId));
      device.write(dataWithId);
    }
    device.close();


    device.on('error', err => {
      console.error('Error:', err);
      device.close();
    });


  } catch (err) {
      console.error('Error:', err);
  }
});



ipcMain.handle('GetDevices', async () => {
  try {
    const devices = usb.getDeviceList();
    const deviceList = devices.map(device => ({
      vendorId: device.deviceDescriptor.idVendor,
      productId: device.deviceDescriptor.idProduct,
      manufacturer: device.deviceDescriptor.iManufacturer || 'Unknown',
      product: device.deviceDescriptor.iProduct || 'Unknown',
      serialNumber: device.deviceDescriptor.iSerialNumber || 'Unknown',
      deviceAddress: device.deviceAddress
    }));

    //console.log(deviceList);


    let SupportedDevices = [];


    const data = await fs.promises.readFile("./SupportedDevices.json", 'utf8');
    const jsonData = JSON.parse(data);
    if (!Array.isArray(jsonData)) {
      console.error("The JSON file's structure is incorrect")
      return;
    }
    SupportedDevices = jsonData;

    //console.log(SupportedDevices);

    let ConnectedSupportedDevices = [];
    for(let e = 0; e < SupportedDevices.length; e++) {
      for(let i = 0; i < deviceList.length; i++) {
        if(SupportedDevices[e].VID == deviceList[i].vendorId && SupportedDevices[e].PID == deviceList[i].productId) {
          let NewSupportedConnectedDevice = SupportedDevices[e];
          NewSupportedConnectedDevice.USBDetails = deviceList[i];
          ConnectedSupportedDevices.push(NewSupportedConnectedDevice);
        }
      }
    }


    return ConnectedSupportedDevices;
  } catch (err) {
    console.error('Error Getting Devices:', err);
    throw err;
  }
});

ipcMain.handle('GetDeviceVisualizationConfig', async (event, FileName) => {
  const data = await fs.promises.readFile(`./DeviceConfigs/${FileName}`, 'utf8');
  const jsonData = JSON.parse(data);
  return jsonData;
});

ipcMain.handle('GetCurrentDeviceSettings', () => {
  // Retreive Current LED Settings
});



usb.on('attach', (device) => {
  if (MainWindow) {
    MainWindow.webContents.send('USBUpdate');
  }
});

usb.on('detach', (device) => {
  if (MainWindow) {
    MainWindow.webContents.send('USBUpdate');
  }
});






app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});