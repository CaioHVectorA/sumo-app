#ifndef MOVEMENTS_H
#define MOVEMENTS_H

#include "config.h"
#include "motors.h"

void calculate_curve_pwm(int basePwm, int angleDeg, int &outEsq, int &outDir);
void execute_single_step(int motorEsq, int motorDir, unsigned long timeMs);

#endif // MOVEMENTS_H
