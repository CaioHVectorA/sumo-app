#ifndef UART_COMM_H
#define UART_COMM_H

#include "config.h"

void init_UART_ISR(void);
void transmitByte(uint8_t data);
void printString(const char myString[]);
void printNumero(uint16_t word);
uint8_t uart_available(void);
uint8_t uart_read(void);
void uart_process(void);
void config(void);

#endif // UART_COMM_H
