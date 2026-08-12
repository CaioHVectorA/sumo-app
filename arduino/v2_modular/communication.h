#ifndef COMMUNICATION_H
#define COMMUNICATION_H

#include "config.h"
#include "motors.h"
#include "strategy.h"

void init_UART_ISR(void);
void printString(const char myString[]);
void printNumero(uint16_t word);
void transmitByte(uint8_t data);
void uart_process(void);
void config(void);

#endif // COMMUNICATION_H
