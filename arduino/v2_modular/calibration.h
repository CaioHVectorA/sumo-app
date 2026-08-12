#ifndef CALIBRATION_H
#define CALIBRATION_H

#include "config.h"

struct MovementCalibration {
  char id[16];
  int motorEsq;
  int motorDir;
  unsigned long timeMs;
  int curveAngle;
};

void calibration_init_defaults(void);
MovementCalibration* get_calibration(const char* id);
void update_calibration(const char* id, int motorEsq, int motorDir, unsigned long timeMs, int curveAngle);

#endif // CALIBRATION_H
