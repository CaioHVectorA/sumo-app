#ifndef MOTORS_H
#define MOTORS_H

#include "config.h"

void MOTORS_CONFIG(void);
void SET_MOTORS(int PWM_ESQ, int PWM_DIR);
int RAMP_DELTA(int atual, int alvo);

#endif // MOTORS_H
