#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <pico/stdio.h>
#include <pico/bootrom.h>
#include <hardware/gpio.h>

#include "bsp/board_api.h"
#include "tusb.h"
#include "usb_descriptors.h"

#include "WS2812.hpp"

#include "hardware/flash.h"
#include <tuple>
#include <algorithm>
#include <cmath>

// Start Address For Save Files In Flash
#define USER_DATA_FLASH_TARGET_OFFSET (PICO_FLASH_SIZE_BYTES - FLASH_SECTOR_SIZE)


#define LED_PIN 22
#define LED_LENGTH 26
#define ENCODER_SW 18
#define ENCODER_A 20
#define ENCODER_B 21
#define LEDMatrixWidth 5
#define LEDMatrixHeight 6
#define ConstantLEDSpeedMultiplier 20
#define ReverseKnob true
const int LEDDataLength = (LED_LENGTH * 7) + std::ceil((LED_LENGTH * 7) / (double)CFG_TUD_HID_EP_BUFSIZE);


//////////////////////////////////////////////////////
/// Wiring Config
//////////////////////////////////////////////////////
const int Columns[LEDMatrixWidth] = {6, 5, 4, 3, 2};
const int Rows[LEDMatrixHeight] = {7, 8, 9, 10, 11, 12};
const int DebounceTime = 10;
const int Knob_RotateDebounceTime = 10;
const int ConsumerDebounceTime = 300;
const int ConsumerEmptyDebounceTime = 50;
bool ConsumerEmptySent = false;
const int LEDRefreshTime = 20;
bool IsAsleep = false;

const int LEDMatrixIndexConfiguration[LEDMatrixHeight][LEDMatrixWidth] = {
  {0, 10, 11, 20, -1},
  {1, 9, 12, 19, 21},
  {2, 8, 13, 18, 22},
  {3, 7, 14, -1, 23},
  {4, 6, 15, 17, 24},
  {5, -1, 16, -1, 25}
}; 

bool CurrentReportMatrix[LEDMatrixHeight][LEDMatrixWidth] = {
  {false, false, false, false, false},
  {false, false, false, false, false},
  {false, false, false, false, false},
  {false, false, false, false, false},
  {false, false, false, false, false},
  {false, false, false, false, false}
};

int PreviousReportMatrix[LEDMatrixHeight][LEDMatrixWidth] = {
  {-1, -1, -1, -1, -1},
  {-1, -1, -1, -1, -1},
  {-1, -1, -1, -1, -1},
  {-1, -1, -1, -1, -1},
  {-1, -1, -1, -1, -1},
  {-1, -1, -1, -1, -1}
};

//////////////////////////////////////////////////////
/// Firmware Variables
//////////////////////////////////////////////////////
uint32_t DeltaTime = 0;
uint32_t LastTimeUpdated = 0;


//////////////////////////////////////////////////////
/// Keyboard Loop Variables
//////////////////////////////////////////////////////
uint32_t SwitchMatrix_DeltaTime = 0;
int CurrentColIndex = 0;
bool WaitingForDebounce = false;


uint32_t ReportSend_DeltaTime = 0;
uint32_t Knob_DeltaTime = 0;
uint32_t Knob_DebounceTime = Knob_RotateDebounceTime;
bool LastStateA = false;
bool ShouldDebounceKnob = false;




//////////////////////////////////////////////////////
/// LED Variables
//////////////////////////////////////////////////////
class LEDSettings {
  public:
  uint8_t StartColor_R;
  uint8_t StartColor_G;
  uint8_t StartColor_B;
  uint8_t Brightness;
  uint8_t Mode;
  uint8_t Speed;
  uint8_t Direction;

  uint8_t CurrentColor_R;
  uint8_t CurrentColor_G;
  uint8_t CurrentColor_B;
};
WS2812* ledStrip = nullptr;
int LastLEDSet = 0;
int LastLEDSettingsModified = 0;
uint32_t LED_DeltaTime = 0;
uint8_t LEDDataToSave[LEDDataLength];
int LastLEDDataToSaveIndex = 0;
LEDSettings LEDSettingsArray[LED_LENGTH];





//////////////////////////////////////////////////////
/// Device Settings
//////////////////////////////////////////////////////

uint8_t SwitchMatrixKeyBindConfiguration[LEDMatrixHeight][LEDMatrixWidth] = {
  {0x68, 0x69, 0x6A, 0x6B, 0x00},   // F13, F14, F15, F16, null
  {0x53, 0x54, 0x55, 0x56, 0x6C},   // NumLock, /, *, -, F17
  {0x5F, 0x60, 0x61, 0x57, 0x6D},   // 7, 8, 9, +, F18
  {0x5C, 0x5D, 0x5E, 0x00, 0x6E},   // 4, 5, 6, null, F19
  {0x59, 0x5A, 0x5B, 0x58, 0x6F},   // 1, 2, 3, ENTER, F20
  {0x62, 0x00, 0x63, 0x00, 0x70}    // 0, null, ., null, F21
};

uint32_t KeyboardPollingTime = 8;




//////////////////////////////////////////////////////
/// Flash Save & Load LEDs
//////////////////////////////////////////////////////

bool ProcessLEDSettings(uint8_t const* buffer, uint16_t bufsize) {
  
  LEDDataToSave[LastLEDDataToSaveIndex] = buffer[0];
  LastLEDDataToSaveIndex++;
  for(int i = 1; i < bufsize; i+=7) {

    int YInArray = LastLEDSet/LEDMatrixWidth;
    int XInArray = LastLEDSet%LEDMatrixWidth;
    while(LEDMatrixIndexConfiguration[YInArray][XInArray] == -1 && !(YInArray == LEDMatrixHeight -1 && XInArray == LEDMatrixWidth - 1)) {
      LastLEDSet++;
      YInArray = LastLEDSet/LEDMatrixWidth;
      XInArray = LastLEDSet%LEDMatrixWidth;
    }

    LEDSettings NewLEDSettings;
    NewLEDSettings.StartColor_R = buffer[i];
    NewLEDSettings.StartColor_G = buffer[i+1];
    NewLEDSettings.StartColor_B = buffer[i+2];
    NewLEDSettings.Mode = buffer[i+3];
    NewLEDSettings.Speed = buffer[i+4];
    NewLEDSettings.Brightness = (buffer[i+5]);
    NewLEDSettings.Direction = buffer[i+6];


    for(int e = 0; e < 7; e++) LEDDataToSave[LastLEDDataToSaveIndex+e] = buffer[i+e];
    LastLEDDataToSaveIndex+=7;


    NewLEDSettings.CurrentColor_R = NewLEDSettings.StartColor_R;
    NewLEDSettings.CurrentColor_G = NewLEDSettings.StartColor_G;
    NewLEDSettings.CurrentColor_B = NewLEDSettings.StartColor_B;

    LEDSettingsArray[LastLEDSettingsModified] = NewLEDSettings;

    float Brightness = NewLEDSettings.Brightness/10.0;

    (*ledStrip).setPixelColor(LEDMatrixIndexConfiguration[YInArray][XInArray], WS2812::RGB(NewLEDSettings.CurrentColor_R * Brightness, NewLEDSettings.CurrentColor_G * Brightness, NewLEDSettings.CurrentColor_B * Brightness));
    LastLEDSet++;
    LastLEDSettingsModified++;
    if(LEDMatrixIndexConfiguration[YInArray][XInArray] == LED_LENGTH - 1) {
      (*ledStrip).show();
      LastLEDSet = 0;
      LastLEDSettingsModified = 0;
      LastLEDDataToSaveIndex = 0;
      return true;
      break;
    }
  }
  return false;
}

void SaveLEDSettings(const uint8_t* data) {
    if (data == nullptr || LEDDataLength > FLASH_PAGE_SIZE) {
        return;
    }

    uint8_t buffer[FLASH_PAGE_SIZE];
    memset(buffer, 0xFF, sizeof(buffer)); // Erase the Buffer
    memcpy(buffer, data, LEDDataLength); // Set the Buffer

    flash_range_erase(USER_DATA_FLASH_TARGET_OFFSET, FLASH_SECTOR_SIZE);
    flash_range_program(USER_DATA_FLASH_TARGET_OFFSET, buffer, FLASH_PAGE_SIZE);
}

void LoadLEDSettings(void) {
    memcpy(LEDDataToSave, reinterpret_cast<const uint8_t*>(XIP_BASE + USER_DATA_FLASH_TARGET_OFFSET), LEDDataLength);
}



//////////////////////////////////////////////////////
/// USB HID
//////////////////////////////////////////////////////

void tud_hid_set_report_cb(uint8_t itf, uint8_t report_id, hid_report_type_t report_type, uint8_t const* buffer, uint16_t bufsize) {

    // buffer[0] => Type of update
    if (itf == ITF_NUM_HID2 && buffer[0] == 1 && bufsize == CFG_TUD_HID_EP_BUFSIZE){
      bool Finished = ProcessLEDSettings(buffer, bufsize);
      if(Finished) {
        SaveLEDSettings(LEDDataToSave);
      }

    }
}

uint16_t tud_hid_get_report_cb(uint8_t itf, uint8_t report_id, hid_report_type_t report_type, uint8_t* buffer, uint16_t reqlen) {
    return 0;
}


// PC Sleep
void tud_suspend_cb(bool remote_wakeup_en) {
  IsAsleep = true;
  (*ledStrip).fill(WS2812::RGB(0, 0, 0));
  (*ledStrip).show();
}
int InitLEDSettings();
// PC Wakey Wakey
void tud_resume_cb(void) {
  IsAsleep = false;
  InitLEDSettings();
}



//////////////////////////////////////////////////////
/// Keyboard Functionalities
//////////////////////////////////////////////////////
void send_keyboard_report(uint8_t modifier, uint8_t keycodes[6])
{
  if (!tud_ready()) return;

  // [modifier, reserved, keycode1, keycode2, ...]
  uint8_t report[8] = {0}; 
  report[0] = modifier;
  report[1] = 0x00;
  report[2] = keycodes[0];
  report[3] = keycodes[1];
  report[4] = keycodes[2];
  report[5] = keycodes[3];
  report[6] = keycodes[4];
  report[7] = keycodes[5];

  tud_hid_n_report(ITF_NUM_HID1, REPORT_ID_KEYBOARD, report, sizeof(report));
}

void send_consumer_report(uint16_t consumer_code)
{
  if (!tud_ready()) return;
  
  tud_hid_n_report(ITF_NUM_HID1, REPORT_ID_CONSUMER_CONTROL, &consumer_code, 2);
}

void SwitchMatrixLoop() {
  //Wait For The Right Time To Update

  if(!WaitingForDebounce) {
  
    gpio_put(Columns[CurrentColIndex], 1);
    WaitingForDebounce = true;
    return;
  }

  

  if(SwitchMatrix_DeltaTime >= DebounceTime) {
    // Register The Rows
    for(int row = 0; row < sizeof(Rows) / sizeof(Rows[0]); row++) {

      if(gpio_get(Rows[row]) != 0 && SwitchMatrixKeyBindConfiguration[row][CurrentColIndex] == 0x69) {
        if(ShouldDebounceKnob && Knob_DeltaTime < Knob_DebounceTime) continue;
        send_consumer_report(HID_USAGE_CONSUMER_SCAN_PREVIOUS);
        Knob_DebounceTime = ConsumerDebounceTime;
        ShouldDebounceKnob = true;
        ConsumerEmptySent = false;
        continue;
      }
      if(gpio_get(Rows[row]) != 0 && SwitchMatrixKeyBindConfiguration[row][CurrentColIndex] == 0x6A) {
        if(ShouldDebounceKnob && Knob_DeltaTime < Knob_DebounceTime) continue;
        send_consumer_report(HID_USAGE_CONSUMER_PLAY_PAUSE);
        Knob_DebounceTime = ConsumerDebounceTime;
        ShouldDebounceKnob = true;
        ConsumerEmptySent = false;
        continue;
      }
      if(gpio_get(Rows[row]) != 0 && SwitchMatrixKeyBindConfiguration[row][CurrentColIndex] == 0x6B) {
        if(ShouldDebounceKnob && Knob_DeltaTime < Knob_DebounceTime) continue;
        send_consumer_report(HID_USAGE_CONSUMER_SCAN_NEXT);
        Knob_DebounceTime = ConsumerDebounceTime;
        ShouldDebounceKnob = true;
        ConsumerEmptySent = false;
        continue;
      }

      CurrentReportMatrix[row][CurrentColIndex] = gpio_get(Rows[row]) != 0;
    }
    gpio_put(Columns[CurrentColIndex], 0);
    
    // Shift To The Next Column and/or Row if necessary
    CurrentColIndex += 1;
    if(CurrentColIndex == sizeof(Columns)/sizeof(Columns[0])) {CurrentColIndex = 0;}

    // Reset Timer
    SwitchMatrix_DeltaTime = 0;
    WaitingForDebounce = false;
  }



}

void KeyboardReportLoop() {
  if(ReportSend_DeltaTime < KeyboardPollingTime) return;
  
  uint8_t report[6] = {0, 0, 0, 0, 0, 0};

  int amount = 0;
  for(int col = 0; col < sizeof(Columns) / sizeof(Columns[0]); col++) {
    for(int row = 0; row < sizeof(Rows) / sizeof(Rows[0]); row++) {

      if(amount >= 6) break;

      if(!CurrentReportMatrix[row][col] && PreviousReportMatrix[row][col] != -1) {
        report[PreviousReportMatrix[row][col]] = 0x00;
        // Set as Sent/Released
        PreviousReportMatrix[row][col] = -1;
        amount += 1;
      }
      else if(CurrentReportMatrix[row][col] && PreviousReportMatrix[row][col] == -1) {
        report[amount] = SwitchMatrixKeyBindConfiguration[row][col];
        // Set as Pressed
        PreviousReportMatrix[row][col] = amount;
        amount += 1;
      }
    }

    if(amount == 6) break;
  }

  if(amount != 0) {
    if(IsAsleep) {
      tud_remote_wakeup();
      return;
    }
    send_keyboard_report(0, report);
  }
}


void KnobReportLoop() {
  if(ShouldDebounceKnob && Knob_DeltaTime < Knob_DebounceTime) {
    if(Knob_DeltaTime >= ConsumerEmptyDebounceTime && !ConsumerEmptySent) {
      ConsumerEmptySent = true;
      send_consumer_report(0);
    }
    return;
  }
  ShouldDebounceKnob = false;
  Knob_DeltaTime = 0;

  if(gpio_get(ENCODER_SW) == 0) {
    send_consumer_report(HID_USAGE_CONSUMER_MUTE);
    Knob_DebounceTime = ConsumerDebounceTime;
    ShouldDebounceKnob = true;
    ConsumerEmptySent = false;
    return;
  }

  Knob_DebounceTime = Knob_RotateDebounceTime;

  int StateA = gpio_get(ENCODER_A);
  int StateB = gpio_get(ENCODER_B);

  if (StateA != LastStateA) {
    if ((ReverseKnob && StateA == StateB) || (!ReverseKnob && StateA != StateB)) send_consumer_report(HID_USAGE_CONSUMER_VOLUME_INCREMENT);
    else send_consumer_report(HID_USAGE_CONSUMER_VOLUME_DECREMENT);

    Knob_DebounceTime = Knob_RotateDebounceTime;
    ShouldDebounceKnob = true;
    ConsumerEmptySent = false;
  }
  LastStateA = StateA;


}




std::tuple<int, int, int> CycleRGB(int r, int g, int b, float step) {
    float NewR = (float)(r);
    float NewG = (float)(g);
    float NewB = (float)(b);

    // Detect Part
    float MaxVal = std::max({NewR, NewG, NewB});
    float MinVal = std::min({NewR, NewG, NewB});
    float DeltaVal = MaxVal - MinVal;

    // 1530 = All Values in a Hue Cycle
    // Calculate the Starting Position
    float Position = 0.0f;
    if (DeltaVal > 0.0f) {
        if (MaxVal == NewR) {
            Position = (NewG - NewB) / DeltaVal * 60.0f;
            if (Position < 0.0f) Position += 360.0f;
        } else if (MaxVal == NewG) {
            Position = ((NewB - NewR) / DeltaVal + 2.0f) * 60.0f;
        } else {
            Position = ((NewR - NewG) / DeltaVal + 4.0f) * 60.0f;
        }
        // 1530 => 360deg
        Position = Position / 360.0f * 1530.0f;
    }

    // Progress Through the Cycle Radially
    float RadialStep = step * (1530.0f / 360.0f);
    Position = std::fmod(Position + RadialStep, 1530.0f);
    if (Position < 0.0f) Position += 1530.0f;

    // Find Current Stage
    int Stage = (int)(Position / 255.0f);
    float FractionValue = std::fmod(Position, 255.0f);

    switch (Stage) {
        case 0:
            NewR = 255.0f;
            NewG = FractionValue;
            NewB = 0.0f;
            break;
        case 1:
            NewR = 255.0f - FractionValue;
            NewG = 255.0f;
            NewB = 0.0f;
            break;
        case 2:
            NewR = 0.0f;
            NewG = 255.0f;
            NewB = FractionValue;
            break;
        case 3:
            NewR = 0.0f;
            NewG = 255.0f - FractionValue;
            NewB = 255.0f;
            break;
        case 4:
            NewR = FractionValue;
            NewG = 0.0f;
            NewB = 255.0f;
            break;
        case 5:
            NewR = 255.0f;
            NewG = 0.0f;
            NewB = 255.0f - FractionValue;
            break;
    }

    int ResultR = std::clamp((int)(std::round(NewR)), 0, 255);
    int ResultG = std::clamp((int)(std::round(NewG)), 0, 255);
    int ResultB = std::clamp((int)(std::round(NewB)), 0, 255);

    return {ResultR, ResultG, ResultB};
}

void LEDLoop() {

  if(LED_DeltaTime < LEDRefreshTime) return;
  
  int CurrentLEDInMatrix = 0;
  for(int LEDIndex = 0; LEDIndex < LED_LENGTH; LEDIndex++) {
    int YInArray = CurrentLEDInMatrix/LEDMatrixWidth;
    int XInArray = CurrentLEDInMatrix%LEDMatrixWidth;
    while(LEDMatrixIndexConfiguration[YInArray][XInArray] == -1 && !(YInArray == LEDMatrixHeight - 1 && XInArray == LEDMatrixWidth - 1)) {
      CurrentLEDInMatrix++;
      YInArray = CurrentLEDInMatrix/LEDMatrixWidth;
      XInArray = CurrentLEDInMatrix%LEDMatrixWidth;
    }

    if(LEDSettingsArray[LEDIndex].Mode == 1) {
      auto [NewR, NewG, NewB] = CycleRGB(LEDSettingsArray[LEDIndex].CurrentColor_R, LEDSettingsArray[LEDIndex].CurrentColor_G, LEDSettingsArray[LEDIndex].CurrentColor_B, ((float)(LEDSettingsArray[LEDIndex].Speed) * ((float)LED_DeltaTime/1000.0) * ConstantLEDSpeedMultiplier));
      LEDSettingsArray[LEDIndex].CurrentColor_R = NewR;
      LEDSettingsArray[LEDIndex].CurrentColor_G = NewG;
      LEDSettingsArray[LEDIndex].CurrentColor_B = NewB;
    }

    float Brightness = LEDSettingsArray[LEDIndex].Brightness / 10.0f;
    (*ledStrip).setPixelColor(LEDMatrixIndexConfiguration[YInArray][XInArray], WS2812::RGB(LEDSettingsArray[LEDIndex].CurrentColor_R * Brightness, LEDSettingsArray[LEDIndex].CurrentColor_G * Brightness, LEDSettingsArray[LEDIndex].CurrentColor_B * Brightness));

    

    CurrentLEDInMatrix++;
  }
  (*ledStrip).show();
  LED_DeltaTime = 0;
}

//////////////////////////////////////////////////////
/// Firmware Updates
//////////////////////////////////////////////////////
void EnterBootselMode() {
  (*ledStrip).fill(WS2812::RGB(255, 255, 255));
  (*ledStrip).show();
  reset_usb_boot(0, 0);
}

void UpdateTimers() {
  // Update Global DeltaTimes
  uint32_t TimeNow = to_ms_since_boot(get_absolute_time());
  DeltaTime = TimeNow - LastTimeUpdated;
  LastTimeUpdated = TimeNow;

  // Update Local DeltaTimes
  SwitchMatrix_DeltaTime += DeltaTime;
  ReportSend_DeltaTime += DeltaTime;
  LED_DeltaTime += DeltaTime;
  if(ShouldDebounceKnob) Knob_DeltaTime += DeltaTime;
}

int InitLEDSettings() {
  LoadLEDSettings();
  uint8_t DataToProcess[CFG_TUD_HID_EP_BUFSIZE];
  for(int i = 0; i < LEDDataLength; i++) {
    DataToProcess[i % CFG_TUD_HID_EP_BUFSIZE] = LEDDataToSave[i];
    if((i+1) % CFG_TUD_HID_EP_BUFSIZE == 0 || i == 184) {
      ProcessLEDSettings(DataToProcess, CFG_TUD_HID_EP_BUFSIZE);
    }
  }
 return 0;
}


int Init() {

  
    try {
      ledStrip = new WS2812(
        LED_PIN,
        LED_LENGTH,
        pio0,
        0,
        WS2812::FORMAT_GRB
      );
    } catch(...) {
        return 1;
    }



    (*ledStrip).fill(WS2812::RGB(255, 0, 255));
    (*ledStrip).show();

    //Init Rows & Columns
    for(int i = 0; i < sizeof(Columns) / sizeof(Columns[0]); i++) {
      gpio_init(Columns[i]);
      gpio_set_dir(Columns[i], GPIO_OUT);
    }

    for(int i = 0; i < sizeof(Rows) / sizeof(Rows[0]); i++) {
      gpio_init(Rows[i]);
      gpio_set_dir(Rows[i], GPIO_IN);
    }

    // Init Knob
    gpio_init(ENCODER_SW);
    gpio_set_dir(ENCODER_SW, GPIO_IN);
    gpio_pull_up(ENCODER_SW);

    gpio_init(ENCODER_A);
    gpio_init(ENCODER_B);
    gpio_set_dir(ENCODER_A, GPIO_IN);
    gpio_set_dir(ENCODER_B, GPIO_IN);
    gpio_pull_up(ENCODER_A);
    gpio_pull_up(ENCODER_B);


    return 0;
}


int main(void)
{
  board_init();
  int initResult = Init();

  // Enter Bootsel If 1/0 Is Pressed
  gpio_put(Columns[1], 1);
  sleep_ms(DebounceTime);
  if(gpio_get(Rows[0]) != 0) {
      EnterBootselMode();
      return 0; 
  }
  gpio_put(Columns[1], 0);

  if(initResult != 0) {
    return 0;
  }


  tusb_rhport_init_t dev_init = {
    .role = TUSB_ROLE_DEVICE,
    .speed = TUSB_SPEED_AUTO
  };
  tusb_init(BOARD_TUD_RHPORT, &dev_init);
  board_init_after_tusb();

  InitLEDSettings();

  // Disable OnBoard LED
  board_led_write(false);

  while (true)
  {
    tud_task();
    if (!tud_suspended() && tud_mounted() && IsAsleep) {
      IsAsleep = false;
      InitLEDSettings();
      continue;
    }

    UpdateTimers();
    SwitchMatrixLoop();
    KeyboardReportLoop();
    if(!IsAsleep) LEDLoop();
    KnobReportLoop();
  }
}