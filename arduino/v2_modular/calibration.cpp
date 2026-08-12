#include "calibration.h"

#define NUM_CALIBRATED_MOVEMENTS 7

static MovementCalibration calibTable[NUM_CALIBRATED_MOVEMENTS];

void calibration_init_defaults(void) {
  // 0: FRENTE
  strcpy(calibTable[0].id, "FRENTE");
  calibTable[0].motorEsq = 1500;
  calibTable[0].motorDir = 1500;
  calibTable[0].timeMs = 300;
  calibTable[0].curveAngle = 0;

  // 1: PARAR
  strcpy(calibTable[1].id, "PARAR");
  calibTable[1].motorEsq = 0;
  calibTable[1].motorDir = 0;
  calibTable[1].timeMs = 250;
  calibTable[1].curveAngle = 0;

  // 2: VIRA_DIREITA
  strcpy(calibTable[2].id, "VIRA_DIREITA");
  calibTable[2].motorEsq = 1200;
  calibTable[2].motorDir = -1200;
  calibTable[2].timeMs = 150;
  calibTable[2].curveAngle = 0;

  // 3: VIRA_ESQUERDA
  strcpy(calibTable[3].id, "VIRA_ESQUERDA");
  calibTable[3].motorEsq = -1200;
  calibTable[3].motorDir = 1200;
  calibTable[3].timeMs = 150;
  calibTable[3].curveAngle = 0;

  // 4: ROT_90
  strcpy(calibTable[4].id, "ROT_90");
  calibTable[4].motorEsq = 1400;
  calibTable[4].motorDir = -1400;
  calibTable[4].timeMs = 120;
  calibTable[4].curveAngle = 0;

  // 5: ROT_180
  strcpy(calibTable[5].id, "ROT_180");
  calibTable[5].motorEsq = 1500;
  calibTable[5].motorDir = -1500;
  calibTable[5].timeMs = 220;
  calibTable[5].curveAngle = 0;

  // 6: CURVA
  strcpy(calibTable[6].id, "CURVA");
  calibTable[6].motorEsq = 1500;
  calibTable[6].motorDir = 750;
  calibTable[6].timeMs = 400;
  calibTable[6].curveAngle = 45;
}

MovementCalibration* get_calibration(const char* id) {
  for (int i = 0; i < NUM_CALIBRATED_MOVEMENTS; i++) {
    if (strcmp(calibTable[i].id, id) == 0) {
      return &calibTable[i];
    }
  }
  return nullptr;
}

void update_calibration(const char* id, int motorEsq, int motorDir, unsigned long timeMs, int curveAngle) {
  MovementCalibration* calib = get_calibration(id);
  if (calib) {
    calib->motorEsq = motorEsq;
    calib->motorDir = motorDir;
    calib->timeMs = timeMs;
    calib->curveAngle = curveAngle;
  }
}
