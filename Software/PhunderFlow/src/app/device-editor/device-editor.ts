import { NgClass } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule, NgModel} from '@angular/forms';
import { ConnectedDevice, DevicesServiceService } from '../services/devicesservice/devices-service.service';
import { Subscription } from 'rxjs';
import { ElectonServiceService } from '../services/electronservice/electon-service.service';
import { ColorPickerComponent } from "../color-picker/color-picker.component";
import { GradientSliderComponent } from "../gradient-slider/gradient-slider.component";

@Component({
  selector: 'app-device-editor',
  imports: [NgClass, FormsModule, ColorPickerComponent, GradientSliderComponent],
  templateUrl: './device-editor.html',
  styleUrl: './device-editor.css'
})

export class DeviceEditor implements OnInit, OnDestroy{
  CurrentlyEditedDevice:ConnectedDevice = {} as ConnectedDevice;
  private EditedDeviceSubscription:Subscription;

  VisualizationRefreshRate:number = 125;
  private VisualizationDeltaTime:number;
  FixedSpeedMultiplier:number = 20;

  VisualizationUpdateInterval:any;
  LoadedVisualizationConfig:DeviceVisualizationConfig = {} as DeviceVisualizationConfig;
  GlobalLEDSettings:LEDSetting = {
    StartingColor: { H: 0, S: 100, L: 100 } as Color,
    Mode: Mode.Wave,
    Color: { H: 0, S: 100, L: 100 } as Color,
    InheritColor: false,
    Speed: 5,
    Brightness: 10,
    Direction: Direction.Right,
    CurrentColor: { H: 0, S: 100, L: 100 } as Color,
  }

  CurrentlySelectedKey:Coordinates = {Col: -1, Row: -1};
  ExtraSelectedKeys:Coordinates[] = [];
  CurrentlySelectedLEDSettings:LEDSetting = {} as LEDSetting;

  LightingModes:LightingMode[] = [
    // Inherit
    {
      ID: Mode.Inherit,
      Name: ModeName.Inherit,
      Init(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number) {
        return {} as Color;
      },
      Update(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number) {
        return Settings.CurrentColor as Color;
      }
    },
    // Off
    {
      ID: Mode.Off,
      Name: ModeName.Off,
      Init(col, row, Settings) {
        return {H: 0, S: 0, L: 0} as Color;
      },
      Update(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number) {
        return Settings.CurrentColor as Color;
      }
    },
    // Static
    {
      ID: Mode.Static,
      Name: ModeName.Static,
      Init(col, row, Settings) {
        let StartColor = {...Settings.Color};
        StartColor.L = StartColor.L/10 * Settings.Brightness;
        return StartColor;
      },
      Update(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number) {
        return Settings.CurrentColor;
      }
    },
    // Wave
    {
      ID: Mode.Wave,
      Name: ModeName.Wave,
      Init(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number, FixedSpeedMultiplier:number) {
        let StartColor = {H: 0, S: 100, L: 50} as Color;
        if(Settings.Direction == Direction.Left || Settings.Direction == Direction.Right) {
          StartColor = CycleHSL(StartColor, Settings.Direction == Direction.Left ? Settings.Speed * col : Settings.Speed * (4 - col));
        } else {
          StartColor = CycleHSL(StartColor, Settings.Direction == Direction.Up ? Settings.Speed * row : Settings.Speed * (5 - row));
        }
        StartColor.L = StartColor.L/10 * Settings.Brightness;
        return StartColor;
      },
      Update(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number, DeltaTime:number, SpeedMultiplier:number) {
        return CycleHSL(Settings.CurrentColor, Settings.Speed * DeltaTime * SpeedMultiplier);
      }
    },
    // Ring
    {
      ID: Mode.Ring,
      Name: ModeName.Ring,
      Init(col, row, Settings, CentralX, CentralY, SpeedMultiplier) {

        let StartColor = {H: 0, S: 100, L: 50} as Color;
        StartColor.S = 100;
        StartColor.L = 50;
        let DistanceX = Math.abs(col - CentralX);
        let DistanceY = Math.abs(row - CentralY);
        let Distance = Math.sqrt((DistanceX * DistanceX) + (DistanceY + DistanceY));
        StartColor = CycleHSL(StartColor, Settings.Direction == Direction.Right || Settings.Direction == Direction.Down ? (-Settings.Speed * Distance * 2) : (Settings.Speed * Distance * 2));
        StartColor.L = StartColor.L/10 * Settings.Brightness;
        return StartColor;
      },
      Update(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number, DeltaTime:number, SpeedMultiplier:number) {
        return CycleHSL(Settings.CurrentColor, (Settings.Speed * DeltaTime * SpeedMultiplier));
      }
    },
  ]



  SelectedColor: Color = {H: 0, S: 100, L: 50};
  CurrentSettingsState:number = 0;


  constructor(private DevicesService:DevicesServiceService, private ElectronService:ElectonServiceService, private CDR: ChangeDetectorRef) {
    this.VisualizationDeltaTime = 1/this.VisualizationRefreshRate;
    this.EditedDeviceSubscription = DevicesService.CurrentlyEditedDevice$.subscribe(val => {
      this.CurrentlyEditedDevice = val;
      if(this.CurrentlyEditedDevice.VisualizationConfig == undefined) return;
      this.LoadVisualizationData();
    });
  }

  ngOnInit(): void {
    if(this.CurrentlyEditedDevice.RGBControl) this.SetSettingsState(0);
    else if(this.CurrentlyEditedDevice.KeybindControl) this.SetSettingsState(1);
    else this.SetSettingsState(2);
  }

  ngOnDestroy(): void {
    if(this.EditedDeviceSubscription) this.EditedDeviceSubscription.unsubscribe();
  }

  async LoadVisualizationData() {
    try {
      this.LoadedVisualizationConfig = await this.DevicesService.GetDeviceVisualizationConfig(this.CurrentlyEditedDevice.VisualizationConfig);
      let SumY = 0;
      for(let i = 0; i < this.LoadedVisualizationConfig.Rows.length; i++) {
        SumY += this.LoadedVisualizationConfig.Rows[i].Margin_Y;
        this.LoadedVisualizationConfig.Rows[i].SumMarginY = SumY;


        let SumX = 0;
        let SmallestSizeY = 1;
        for(let e = 0; e < this.LoadedVisualizationConfig.Rows[i].Keys.length; e++) {
          SumX += this.LoadedVisualizationConfig.Rows[i].Keys[e].Margin_X;
          this.LoadedVisualizationConfig.Rows[i].Keys[e].SumMarginX = SumX;
          SumX += (this.LoadedVisualizationConfig.Rows[i].Keys[e].Size_X * this.LoadedVisualizationConfig.DefaultKeySize);
          SumX += this.LoadedVisualizationConfig.Gap_X;
          if(this.LoadedVisualizationConfig.Rows[i].Keys[e].Size_Y < SmallestSizeY) SmallestSizeY = this.LoadedVisualizationConfig.Rows[i].Keys[e].Size_Y;


          this.LoadedVisualizationConfig.Rows[i].Keys[e].LEDSettings = {
            StartingColor: {H: 0, S: 100, L: 100} as Color,
            CurrentColor: { H: 0, S: 100, L: 100 } as Color,
            Mode: Mode.Inherit,
            Color: {H: 0, S: 100, L: 100} as Color,
            InheritColor: true,
            Speed: -1,
            Brightness: -1,
            Direction: Direction.Inherit
          } as LEDSetting

        }


        SumY += SmallestSizeY * this.LoadedVisualizationConfig.DefaultKeySize;
        SumY += this.LoadedVisualizationConfig.Gap_Y;
      }

      this.CurrentlySelectedLEDSettings = {...this.GlobalLEDSettings};
      this.InitVisualizationLighting();
      this.SelectKey(-1, -1, undefined);
    } catch (error) {}
  }

  InitVisualizationLighting() {
    for(let row = 0; row < this.LoadedVisualizationConfig.Rows.length; row++) {
      for(let col = 0; col < this.LoadedVisualizationConfig.Rows[row].Keys.length; col++) {
        
        let key = this.LoadedVisualizationConfig.Rows[row].Keys[col];

        let Settings:LEDSetting = { ...key.LEDSettings };

        if(Settings.Mode == Mode.Inherit) Settings.Mode = this.GlobalLEDSettings.Mode;
        if(Settings.InheritColor) Settings.Color = this.GlobalLEDSettings.Color;
        if(Settings.Speed == -1) Settings.Speed = this.GlobalLEDSettings.Speed;
        if(Settings.Brightness == -1) Settings.Brightness = this.GlobalLEDSettings.Brightness;
        if(Settings.Direction == Direction.Inherit) Settings.Direction = this.GlobalLEDSettings.Direction;

        let NewStartingColor = this.LightingModes[Settings.Mode + 1].Init(
          key.FigurativePosX == -1 ? col : key.FigurativePosX,
          key.FigurativePosY == -1 ? row : key.FigurativePosY,
          Settings,
          this.LoadedVisualizationConfig.Center_X,
          this.LoadedVisualizationConfig.Center_Y,
          this.FixedSpeedMultiplier
        );
        this.LoadedVisualizationConfig.Rows[row].Keys[col].LEDSettings.StartingColor = {...NewStartingColor};
        this.LoadedVisualizationConfig.Rows[row].Keys[col].LEDSettings.CurrentColor = {...NewStartingColor};

        //console.log(this.LoadedVisualizationConfig.Rows[row].Keys[col].LEDSettings)
      }
    }

    if (this.VisualizationUpdateInterval) {
      clearInterval(this.VisualizationUpdateInterval);
      this.VisualizationUpdateInterval = null;
    }
    this.VisualizationUpdateInterval = setInterval(() => 
      {
        this.UpdateVisualizationLighting()
      }, 1000 * this.VisualizationDeltaTime);
  }

  UpdateVisualizationLighting() {
    for(let row = 0; row < this.LoadedVisualizationConfig.Rows.length; row++) {
      for(let col = 0; col < this.LoadedVisualizationConfig.Rows[row].Keys.length; col++) {
        
        let key = this.LoadedVisualizationConfig.Rows[row].Keys[col];

        let Settings:LEDSetting = { ...key.LEDSettings };

        if(Settings.Mode == Mode.Inherit) Settings.Mode = this.GlobalLEDSettings.Mode;
        if(Settings.InheritColor) Settings.Color = this.GlobalLEDSettings.Color;

        if(Settings.Speed == -1) Settings.Speed = this.GlobalLEDSettings.Speed;

        if(Settings.Brightness == -1) Settings.Brightness = this.GlobalLEDSettings.Brightness;
        if(Settings.Direction == Direction.Inherit) Settings.Direction = this.GlobalLEDSettings.Direction;


        this.LoadedVisualizationConfig.Rows[row].Keys[col].LEDSettings.CurrentColor = this.LightingModes[Settings.Mode + 1].Update(
          key.FigurativePosX == -1 ? col : key.FigurativePosX,
          key.FigurativePosY == -1 ? row : key.FigurativePosY,
          Settings,
          this.LoadedVisualizationConfig.Center_X,
          this.LoadedVisualizationConfig.Center_Y,
          this.VisualizationDeltaTime,
          this.FixedSpeedMultiplier
        );

      }
    }
  }

  SelectKey(col:number, row:number, event:MouseEvent | undefined) {

    let NewSelected:Coordinates = {Col: col, Row:row};

    if(col == -1 || row == -1) {
      this.CurrentlySelectedLEDSettings = this.GlobalLEDSettings;
      this.CurrentlySelectedKey = NewSelected;
      this.ExtraSelectedKeys = [];
      return;
    }
    
    let IsControlHeld:boolean = (event != undefined && (event.ctrlKey || event.metaKey));
    let IsNothingSelected = (this.CurrentlySelectedKey.Col == -1 || this.CurrentlySelectedKey.Row == -1);


    if(IsNothingSelected || !IsControlHeld) {

      this.CurrentlySelectedKey = NewSelected; 
      this.CurrentlySelectedLEDSettings = this.LoadedVisualizationConfig.Rows[row].Keys[col].LEDSettings;
      this.ExtraSelectedKeys = [];

    } else if(IsControlHeld) {

      if(this.CurrentlySelectedKey.Col != NewSelected.Col || this.CurrentlySelectedKey.Row != NewSelected.Row) {
        let IncludesIndex = this.ExtraSelectedKeys.findIndex(k => k.Col === NewSelected.Col && k.Row === NewSelected.Row);
        if(IncludesIndex > -1) this.ExtraSelectedKeys.splice(IncludesIndex, 1);
        else this.ExtraSelectedKeys.push(NewSelected);
      }

    }
  }

  IsKeySelected(col:number, row:number):boolean {
    let CheckKey:Coordinates = {Col:col, Row: row};
    return this.ExtraSelectedKeys.some(k => k.Col === CheckKey.Col && k.Row === CheckKey.Row) || (CheckKey.Col == this.CurrentlySelectedKey.Col && CheckKey.Row == this.CurrentlySelectedKey.Row);
  }

  SetSettingsState(State:number) {
    this.CurrentSettingsState = State;
  }

  onColorChange(color: Color) {
    this.SelectedColor = {...color};
    this.CurrentlySelectedLEDSettings.Color = {...color};
    if(this.CurrentlySelectedKey.Col != -1 && this.CurrentlySelectedKey.Row != -1) this.CurrentlySelectedLEDSettings.InheritColor = false;
    let Inheritance = this.CurrentlySelectedLEDSettings.InheritColor;
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Color = {...color};
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.InheritColor = Inheritance;
    }
    this.InitVisualizationLighting();
  }

  ColorInputFieldChange(Value:any, ValueIndex:number) {
    let NewColor = {...this.SelectedColor};
    if(Value == null || Value == "") Value = 0;

    if(ValueIndex == 0) NewColor.H = Math.min(Math.max(Value, 0), 359);
    else if(ValueIndex == 1) NewColor.S = Math.min(Math.max(Value, 0), 100);
    else if(ValueIndex == 2) NewColor.L = Math.min(Math.max(Value, 50), 100);

    this.onColorChange(NewColor);
  }

  onColorInheritanceChange() {
    let Inheritance = this.CurrentlySelectedLEDSettings.InheritColor;
    if(!this.CurrentlySelectedLEDSettings.InheritColor) {
      this.SelectedColor = this.GlobalLEDSettings.Color;
    }

    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.InheritColor = Inheritance;
    }

    this.InitVisualizationLighting()
  }

  SetMode(NewValue:string) {
    this.CurrentlySelectedLEDSettings.Mode = parseInt(NewValue);
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Mode = parseInt(NewValue);
    }
  }

  OnSpeedInput(Value:number) {
    Value = Math.min(Math.max(Math.round(Value), this.CurrentlySelectedKey.Col == -1 || this.CurrentlySelectedKey.Row == -1 ? 0 : -1), 10);
    this.CurrentlySelectedLEDSettings.Speed = Value;
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Speed = Value;
    }
    this.InitVisualizationLighting();
  }

  OnSpeedSliderInput(event:any) {
    this.CurrentlySelectedLEDSettings.Speed = parseInt(event.value);
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Speed = parseInt(event.value);
    }
    this.InitVisualizationLighting();
  }

  OnBrightnessInput(Value:number) {
    Value = Math.min(Math.max(Math.round(Value), this.CurrentlySelectedKey.Col == -1 || this.CurrentlySelectedKey.Row == -1 ? 0 : -1), 10);
    this.CurrentlySelectedLEDSettings.Brightness = Value;
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Brightness = Value;
    }
    this.InitVisualizationLighting();
  }

  OnBrightnessSliderInput(event:any) {
    this.CurrentlySelectedLEDSettings.Brightness = parseInt(event.value);
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Brightness = parseInt(event.value);
    }
    this.InitVisualizationLighting();
  }

  SetDirection(Dir:Direction) {
    this.CurrentlySelectedLEDSettings.Direction = Dir;
    for(let i = 0; i < this.ExtraSelectedKeys.length; i++) {
      this.LoadedVisualizationConfig.Rows[this.ExtraSelectedKeys[i].Row].Keys[this.ExtraSelectedKeys[i].Col].LEDSettings.Direction = Dir;
    }
  }





  ApplyLEDSettingsToTheDevice() {
    let Data:number[][] = [];
    let CurrentData:number[] = [1];

    for(let row = 0; row < this.LoadedVisualizationConfig.Rows.length; row++) {
      for(let col = 0; col < this.LoadedVisualizationConfig.Rows[row].Keys.length; col++) {

        const Settings = {...this.LoadedVisualizationConfig.Rows[row].Keys[col].LEDSettings}
        const TempGlobalSettings = {...this.GlobalLEDSettings}

        let ColorAsRGB = HSLtoRGB(Settings.StartingColor);
        
        let Mode = Settings.Mode;
        if(Mode == -1) Mode = TempGlobalSettings.Mode;
        Mode = Mode > 1 ? 1 : 0;

        let Speed = Settings.Speed;
        Speed = Speed == -1 ? TempGlobalSettings.Speed : Speed;

        let Brightness = Settings.Brightness;
        Brightness = Brightness == -1 ? TempGlobalSettings.Brightness : Brightness;

        let Direction = Settings.Direction;
        Direction = Direction == -1 ? TempGlobalSettings.Direction : Direction;



        CurrentData.push(ColorAsRGB.H);
        CurrentData.push(ColorAsRGB.S);
        CurrentData.push(ColorAsRGB.L);
        CurrentData.push(Mode);
        CurrentData.push(Speed);
        CurrentData.push(Brightness);
        CurrentData.push(Direction);


        if(CurrentData.length > 64 - 7 || (row == this.LoadedVisualizationConfig.Rows.length - 1 && col == this.LoadedVisualizationConfig.Rows[row].Keys.length - 1)) {
          Data.push(CurrentData);
          CurrentData = [1];
        }

      }
    }
    //console.log(Data);
    this.DevicesService.SendDataToDevice(this.CurrentlyEditedDevice.PID, this.CurrentlyEditedDevice.VID, 1, Data);
    this.InitVisualizationLighting();
  }
}


export function CycleHSL(Value:Color, Speed:number):Color {
  Value.H = (Value.H + Speed) % 360;
  if (Value.H < 0) Value.H += 360;
  return Value;
}

export function HSLtoRGB(Value:Color):Color {
  Value.S /= 100;
  Value.L /= 100;

  const c = (1 - Math.abs(2 * Value.L - 1)) * Value.S;
  const x = c * (1 - Math.abs(((Value.H / 60) % 2) - 1));
  const m = Value.L - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;

  if (Value.H >= 0 && Value.H < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (Value.H >= 60 && Value.H < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (Value.H >= 120 && Value.H < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (Value.H >= 180 && Value.H < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (Value.H >= 240 && Value.H < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else if (Value.H >= 300 && Value.H < 360) {
    r1 = c; g1 = 0; b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  return {
    H:r,
    S:g,
    L:b
  } as Color
}

export function RGBtoHSL(rgb: Color): Color {
    const r = rgb.H / 255;
    const g = rgb.S / 255;
    const b = rgb.L / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
    }

    return {
      H: Math.round(h),
      S: Math.round(s * 100),
      L: Math.round(l * 100)
    };
}

export interface DeviceVisualizationKey {
  Margin_X:number,
  Margin_Y:number,
  SumMarginX:number,
  Size_X:number,
  Size_Y:number,
  FigurativePosX:number,
  FigurativePosY:number,
  LEDSettings:LEDSetting,
}

export interface DeviceVisualizationRow {
  Margin_X:number,
  Margin_Y:number,
  SumMarginY:number,
  Keys:DeviceVisualizationKey[]
}

export interface DeviceVisualizationConfig {
  Margin_X:number,
  Margin_Y:number,
  Gap_X:number,
  Gap_Y:number,
  Center_X:number,
  Center_Y:number,
  DefaultKeySize:number,
  Rows:DeviceVisualizationRow[],
}

export enum Direction {
  Inherit = -1,
  Left,
  Up,
  Right,
  Down
}

export enum Mode {
  Inherit = -1,
  Off,
  Static,
  Wave,
  Ring,
}

export enum ModeName {
  Inherit = "Inherit",
  Off = "Off",
  Static = "Static",
  Wave = "Wave",
  Ring = "Ring",
}


export interface LightingMode {
  ID:Mode,
  Name:ModeName,
  Init(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number, FixedSpeedMultiplier:number):Color,
  Update(col:number, row:number, Settings:LEDSetting, CentralX:number, CentralY:number, DeltaTime:number, FixedSpeedMultiplier:number):Color,
}

export interface Color {
  H:number,
  S:number,
  L:number
}

export interface LEDSetting {
  StartingColor:Color, // This sets the color at the init stage
  CurrentColor:Color, // This is what is being displayed

  Mode:Mode,
  Color:Color,
  InheritColor:boolean,
  Speed:number,
  Brightness:number
  Direction:Direction
}

export interface Coordinates {
  Row:number,
  Col:number
}