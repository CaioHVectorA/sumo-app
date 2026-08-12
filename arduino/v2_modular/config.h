#ifndef CONFIG_H
#define CONFIG_H

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <Arduino.h>

// --- PARÂMETROS PID DA ARENA ---
#define KP 300
#define KD 3000
#define alpha 0.85

// --- PINAGEM HARDWARE ---
#define MICROSTART PB4  // PCINT4 // D12
#define LED_READY  PB5  // D13

#define SENSOR_LAT_DIR PC0  // A0
#define SENSOR_CEN_DIR PC1  // A1
#define SENSOR_CENTRAL PC2  // A2
#define SENSOR_CEN_ESQ PC3  // A3
#define SENSOR_LAT_ESQ PC4  // A4
#define SENSOR_MASK ((1 << SENSOR_CEN_DIR) | (1 << SENSOR_CENTRAL) | (1 << SENSOR_CEN_ESQ) | (1 << SENSOR_LAT_ESQ))

#define DIR_IN1 PD5  // D5
#define DIR_IN2 PD4  // D4
#define DIR_PWM PB2  // D10
#define ESQ_IN1 PD7  // D7
#define ESQ_IN2 PB0  // D8
#define ESQ_PWM PB1  // D9
#define STBY    PD6  // D6

#define PWM_MAX 1599
#define PWM_DEADZONE 30

#define RX_BUF_SIZE 128
#define CMD_BUF_SIZE 128

// Estrutura de Etapa de Estratégia
struct StrategyStep {
  int motorEsq;
  int motorDir;
  unsigned long timeMs;
  int accelStep;
};

#define MAX_CUSTOM_STEPS 16

// LUT de 4 bits para sensores
extern const int8_t ERRO_LUT_4[16];

// Variáveis Globais de Controle
extern uint8_t PWM_MAX_DELTA;
extern uint16_t PWM_BASE;
extern uint16_t BREAK_TIME_1;
extern uint16_t BREAK_TIME_3;
extern uint16_t TIME_BEFORE_MOVING;
extern uint8_t ALREADY_FLAG_ATTACK;

extern uint8_t delay_1;
extern uint8_t delay_2;
extern uint8_t PWM_DIR;
extern uint8_t IS_FLAG;

extern uint8_t ESTRATEGIA;
extern uint8_t VARIANCIA;
extern uint8_t CONFIG_ENABLE;

extern volatile uint8_t READY_FLAG;
extern volatile uint8_t TIME_FLAG;
extern volatile unsigned long int TIME;
extern unsigned int BREAK_COUNT;

extern unsigned int PWM_BASE_ATUAL;
extern unsigned int PWM_BASE_DESEJADO;

extern uint8_t CODIGO_ERRO;
extern int8_t ERRO;
extern int8_t ERRO_ANTIGO;
extern int derivativo;
extern int DELTA_SPEED;

extern volatile uint8_t MANUAL_MODE;
extern volatile int manual_left;
extern volatile int manual_right;

extern uint8_t TEST_MODE_ACTIVE;
extern volatile unsigned long ms_ticks;
unsigned long get_ms(void);

#endif // CONFIG_H
