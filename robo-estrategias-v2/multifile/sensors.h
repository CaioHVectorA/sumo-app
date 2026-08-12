#ifndef SENSORS_H
#define SENSORS_H

#include "config.h"

uint8_t SENSORS_READ_RAW(void);
int8_t SENSORS_GET_ERROR(uint8_t rawCode);

#endif // SENSORS_H
