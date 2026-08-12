#include "sensors.h"

// Tabela de Lookup de Erro de 4 bits
const int8_t ERRO_LUT_4[16] = {
  /* 0000 */ 10,
  /* 0001 */ 1,
  /* 0010 */ 0,
  /* 0011 */ 1,
  /* 0100 */ -1,
  /* 0101 */ 10,
  /* 0110 */ -1,
  /* 0111 */ 0,
  /* 1000 */ -3,
  /* 1001 */ 10,
  /* 1010 */ -2,
  /* 1011 */ -1,
  /* 1100 */ -3,
  /* 1101 */ 10,
  /* 1110 */ -1,
  /* 1111 */ 0
};

uint8_t SENSORS_READ_RAW(void) {
  return PINC & SENSOR_MASK;
}

int8_t SENSORS_GET_ERROR(uint8_t rawCode) {
  return ERRO_LUT_4[rawCode >> 1];
}
