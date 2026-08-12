/*
 * ROBÔ SUMÔ - ARDUINO FIRMWARE V2 (SINGLE FILE VERSION)
 * -----------------------------------------------------
 * Extensão completa do firmware robo-with-manual.ino.
 * Contém TODAS as funcionalidades originais (PID, Sensores LUT_4, Microstart,
 * Controle Manual, Telemetria STATUS/SENSORES, Estratégias A-E com Variância)
 * MAIS os novos comandos de teste de movimentos e estratégias customizadas (v2).
 */

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// --- DEFINIÇÕES DE PARÂMETROS E HARDWARE ---
#define KP 300
#define KD 3000
#define alpha 0.85

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

// --- VARIÁVEIS GLOBAIS DE CONTROLE E CONFIGURAÇÃO ---
uint8_t PWM_MAX_DELTA = 4;
uint16_t PWM_BASE = 1200;
uint16_t BREAK_TIME_1 = 250;
uint16_t BREAK_TIME_3 = 250;
uint16_t TIME_BEFORE_MOVING = 2000;
uint8_t ALREADY_FLAG_ATTACK = 0;

uint8_t delay_1 = 70;
uint8_t delay_2 = 0;
uint8_t PWM_DIR = 0;

uint8_t ESTRATEGIA = 0;
uint8_t VARIANCIA = 0;
uint8_t CONFIG_ENABLE = 1;

volatile uint8_t rx_buf[RX_BUF_SIZE];
volatile uint8_t rx_head = 0, rx_tail = 0;

char cmd_buf[CMD_BUF_SIZE];
uint8_t cmd_len = 0;
uint8_t cmd_ready = 0;

volatile uint8_t READY_FLAG = 1;
volatile uint8_t TIME_FLAG = 0;
volatile unsigned long int TIME = 0;
unsigned int BREAK_COUNT = 0;

unsigned int PWM_BASE_ATUAL = 0;
unsigned int PWM_BASE_DESEJADO = 1200;

uint8_t IS_FLAG = 1;

// LUT de 4 bits para os sensores
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
  /* 1111 */ 0,
};

uint8_t CODIGO_ERRO = 0;
int8_t ERRO = 0;
int8_t ERRO_ANTIGO = 0;
int derivativo = 0;
int DELTA_SPEED = 0;

volatile uint8_t MANUAL_MODE = 0;
volatile int manual_left = 0;
volatile int manual_right = 0;

volatile unsigned long ms_ticks = 0;

unsigned long get_ms(void) {
  unsigned long m;
  uint8_t oldSREG = SREG;
  cli();
  m = ms_ticks;
  SREG = oldSREG;
  return m;
}

// ESTRUTURA PARA TESTES DE STEPS E ESTRATÉGIAS CUSTOMIZADAS (V2 EXTENSION)
struct StrategyStep {
  int motorEsq;
  int motorDir;
  unsigned long timeMs;
  int accelStep;
};

#define MAX_CUSTOM_STEPS 16
StrategyStep customSteps[MAX_CUSTOM_STEPS];
uint8_t customStepCount = 0;
uint8_t currentStepIdx = 0;
unsigned long stepStartTime = 0;
uint8_t TEST_MODE_ACTIVE = 0;

// --- PROTÓTIPOS ---
void SET_MOTORS(int PWM_ESQ, int PWM_DIR);
void printString(const char myString[]);
void printNumero(uint16_t word);
void transmitByte(uint8_t data);
void EXECUTA_ESTRATEGIA(int EST);

// --- CONFIGURAÇÃO ISR MICROSTART ---
void MICROSTART_ISR_CONFIG(void) {
  PCICR |= (1 << PCIE0);
  PCMSK0 |= (1 << MICROSTART);
}

ISR(PCINT0_vect) {
  if (MANUAL_MODE) return;

  if ((PINB & (1 << MICROSTART)) == 0) { // STOP
    PORTD &= ~(1 << STBY);
    SET_MOTORS(0, 0);
    cli();
  } else { // START
    READY_FLAG = 0;
    PORTB &= ~(1 << LED_READY);
    PORTD |= (1 << STBY);
    TIMSK2 = (1 << OCIE2A);
  }
}

// --- CONFIGURAÇÃO MOTORES ---
void MOTORS_CONFIG(void) {
  DDRB |= ((1 << ESQ_IN2) | (1 << ESQ_PWM) | (1 << DIR_PWM));
  DDRD |= ((1 << DIR_IN1) | (1 << DIR_IN2) | (1 << STBY) | (1 << ESQ_IN1));

  TCCR1A = ((1 << COM1A1) | (1 << COM1B1) | (1 << WGM11));
  TCCR1B = ((1 << WGM13) | (1 << WGM12) | (1 << CS10));
  ICR1 = PWM_MAX;

  OCR1A = 0;
  OCR1B = 0;
}

void SET_MOTORS(int PWM_ESQ, int PWM_DIR) {
  if (abs(PWM_ESQ) < PWM_DEADZONE) {
    OCR1A = 0;
    PORTD &= ~(1 << ESQ_IN1);
    PORTB &= ~(1 << ESQ_IN2);
  } else if (PWM_ESQ > 0) {
    if (PWM_ESQ > PWM_MAX) PWM_ESQ = PWM_MAX;
    OCR1A = PWM_ESQ;
    PORTD &= ~(1 << ESQ_IN1);
    PORTB |= (1 << ESQ_IN2);
  } else {
    if (PWM_ESQ < -PWM_MAX) PWM_ESQ = -PWM_MAX;
    OCR1A = -PWM_ESQ;
    PORTD |= (1 << ESQ_IN1);
    PORTB &= ~(1 << ESQ_IN2);
  }

  if (abs(PWM_DIR) < PWM_DEADZONE) {
    OCR1B = 0;
    PORTD &= ~(1 << DIR_IN1);
    PORTD &= ~(1 << DIR_IN2);
  } else if (PWM_DIR > 0) {
    if (PWM_DIR > PWM_MAX) PWM_DIR = PWM_MAX;
    OCR1B = PWM_DIR;
    PORTD &= ~(1 << DIR_IN1);
    PORTD |= (1 << DIR_IN2);
  } else {
    if (PWM_DIR < -PWM_MAX) PWM_DIR = -PWM_MAX;
    OCR1B = -PWM_DIR;
    PORTD |= (1 << DIR_IN1);
    PORTD &= ~(1 << DIR_IN2);
  }
}

int RAMP_DELTA(int atual, int alvo) {
  int delta = alvo - atual;
  if (delta > PWM_MAX_DELTA) delta = PWM_MAX_DELTA;
  if (delta < -PWM_MAX_DELTA) delta = -PWM_MAX_DELTA;
  return atual + delta;
}

void TEMPORIZADOR_ISR_CONFIG(void) {
  TCCR2A = (1 << WGM21); // CTC Mode
  TCCR2B = (1 << CS22);  // Prescaler 64
  OCR2A = 249;           // 1 ms a 16 MHz
  TIMSK2 |= (1 << OCIE2A); // Habilita a interrupção temporizada imediatamente na inicialização
}

ISR(TIMER2_COMPA_vect) {
  ms_ticks++;
  TIME_FLAG = 1;
}

// --- UART DA ISR ---
void init_UART_ISR(void) {
  UCSR0A |= (1 << U2X0);
  UBRR0H = 0b00000000;
  UBRR0L = 0b00010000; // 115200 baud em U2X0

  UCSR0B = (1 << TXEN0) | (1 << RXEN0) | (1 << RXCIE0);
  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
}

ISR(USART_RX_vect) {
  uint8_t next = (rx_head + 1) % RX_BUF_SIZE;
  if (next != rx_tail) {
    rx_buf[rx_head] = UDR0;
    rx_head = next;
  }
}

uint8_t uart_available(void) {
  return (rx_head != rx_tail);
}

uint8_t uart_read(void) {
  uint8_t data = 0;
  if (rx_head != rx_tail) {
    data = rx_buf[rx_tail];
    rx_tail = (rx_tail + 1) % RX_BUF_SIZE;
  }
  return data;
}

void transmitByte(uint8_t data) {
  loop_until_bit_is_set(UCSR0A, UDRE0);
  UDR0 = data;
}

void printString(const char myString[]) {
  uint8_t i = 0;
  while (myString[i]) {
    transmitByte(myString[i]);
    i++;
  }
}

void printNumero(uint16_t word) {
  uint8_t started = 0;
  if (word / 10000) { transmitByte('0' + (word / 10000)); started = 1; }
  if (started || (word / 1000) % 10) { transmitByte('0' + ((word / 1000) % 10)); started = 1; }
  if (started || (word / 100) % 10) { transmitByte('0' + ((word / 100) % 10)); started = 1; }
  if (started || (word / 10) % 10) { transmitByte('0' + ((word / 10) % 10)); started = 1; }
  transmitByte('0' + (word % 10));
}

void uart_process(void) {
  while (uart_available()) {
    char c = uart_read();
    if (c == '\r') continue;
    if (c == '\n') {
      cmd_buf[cmd_len] = '\0';
      cmd_ready = 1;
      cmd_len = 0;
      return;
    }
    if (cmd_len < CMD_BUF_SIZE - 1) {
      cmd_buf[cmd_len++] = c;
    } else {
      cmd_len = 0;
    }
  }
}

// --- COMANDOS BLUETOOTH (CONFIG & EXTENSÃO V2) ---
void config(void) {
  uart_process();
  if (!cmd_ready) return;
  cmd_ready = 0;

  // 1. TELEMETRIA DOS SENSORES
  if (strcmp(cmd_buf, "SENSORES") == 0) {
    printString("TEL;");
    printNumero(CODIGO_ERRO);
    printString(";");
    if (MANUAL_MODE) {
      if (manual_left < 0) { transmitByte('-'); printNumero(-manual_left); }
      else { printNumero(manual_left); }
      printString(";");
      if (manual_right < 0) { transmitByte('-'); printNumero(-manual_right); }
      else { printNumero(manual_right); }
    } else {
      printNumero(PWM_BASE_ATUAL);
      printString(";");
      if (DELTA_SPEED < 0) { transmitByte('-'); printNumero(-DELTA_SPEED); }
      else { printNumero(DELTA_SPEED); }
    }
    printString("\n");
  }
  // 2. MODO MANUAL ON/OFF
  else if (strcmp(cmd_buf, "MANUAL_ON") == 0) {
    MANUAL_MODE = 1;
    manual_left = 0;
    manual_right = 0;
    PORTD |= (1 << STBY); // Sai do STBY
    PORTB &= ~(1 << LED_READY);
    printString("MANUAL_ON_OK\n");
  }
  else if (strcmp(cmd_buf, "MANUAL_OFF") == 0) {
    MANUAL_MODE = 0;
    manual_left = 0;
    manual_right = 0;
    SET_MOTORS(0, 0);
    PORTD &= ~(1 << STBY); // Volta pro STBY
    PORTB |= (1 << LED_READY);
    printString("MANUAL_OFF_OK\n");
  }
  // 3. COMANDO MANUAL / MOTORES: M,<esq>,<dir>
  else if (strncmp(cmd_buf, "M,", 2) == 0) {
    int left_val = 0, right_val = 0;
    char *comma1 = strchr(cmd_buf + 2, ',');
    if (comma1 != NULL) {
      *comma1 = '\0';
      left_val = atoi(cmd_buf + 2);
      right_val = atoi(comma1 + 1);
      *comma1 = ',';
    }
    
    // Habilita a ponte H se estiver em comando de drive
    PORTD |= (1 << STBY);
    manual_left = left_val;
    manual_right = right_val;
    SET_MOTORS(left_val, right_val);

    printString("TEL;");
    printNumero(CODIGO_ERRO);
    printString(";");
    if (left_val < 0) { transmitByte('-'); printNumero(-left_val); }
    else { printNumero(left_val); }
    printString(";");
    if (right_val < 0) { transmitByte('-'); printNumero(-right_val); }
    else { printNumero(right_val); }
    printString("\n");
  }
  // 4. TESTAR PASSO DE MOVIMENTO V2: TEST_STEP,<esq>,<dir>,<tempoMs>
  else if (strncmp(cmd_buf, "TEST_STEP,", 10) == 0) {
    int esq = 0, dir = 0, accel = 0;
    unsigned long t = 0;
    int parsed = sscanf(cmd_buf + 10, "%d,%d,%lu,%d", &esq, &dir, &t, &accel);
    if (parsed < 4) accel = 0;

    PORTD |= (1 << STBY); // Habilita a ponte H (sai do standby)
    PORTB &= ~(1 << LED_READY);

    customStepCount = 1;
    customSteps[0].motorEsq = esq;
    customSteps[0].motorDir = dir;
    customSteps[0].timeMs = t;
    customSteps[0].accelStep = accel;

    currentStepIdx = 0;
    stepStartTime = get_ms();
    TEST_MODE_ACTIVE = 1;
    if (accel <= 0) {
      SET_MOTORS(esq, dir);
    } else {
      SET_MOTORS(0, 0);
    }

    printString("STEP_OK\n");
  }
  // 5. TESTAR ESTRATÉGIA COMPLETA V2: TEST_STRAT,<count>;<esq1>,<dir1>,<t1>;...
  else if (strncmp(cmd_buf, "TEST_STRAT,", 11) == 0) {
    char *ptr = cmd_buf + 11;
    int count = atoi(ptr);
    ptr = strchr(ptr, ';');

    customStepCount = 0;
    while (ptr && customStepCount < count && customStepCount < MAX_CUSTOM_STEPS) {
      ptr++;
      int esq = 0, dir = 0, accel = 0;
      unsigned long t = 0;
      int parsed = sscanf(ptr, "%d,%d,%lu,%d", &esq, &dir, &t, &accel);
      if (parsed < 4) accel = 0;

      customSteps[customStepCount].motorEsq = esq;
      customSteps[customStepCount].motorDir = dir;
      customSteps[customStepCount].timeMs = t;
      customSteps[customStepCount].accelStep = accel;
      customStepCount++;

      ptr = strchr(ptr, ';');
    }

    if (customStepCount > 0) {
      PORTD |= (1 << STBY);
      PORTB &= ~(1 << LED_READY);
      currentStepIdx = 0;
      stepStartTime = get_ms();
      TEST_MODE_ACTIVE = 1;
      if (customSteps[0].accelStep <= 0) {
        SET_MOTORS(customSteps[0].motorEsq, customSteps[0].motorDir);
      } else {
        SET_MOTORS(0, 0);
      }
      printString("STRAT_OK\n");
    }
  }
  // 6. COMANDO DE STATUS COMPLETO
  else if (strcmp(cmd_buf, "STATUS") == 0) {
    printString("STATUS;PWM_BASE="); printNumero(PWM_BASE);
    printString(";PWM_MAX_DELTA="); printNumero(PWM_MAX_DELTA);
    printString(";BREAK_TIME_1="); printNumero(BREAK_TIME_1);
    printString(";BREAK_TIME_3="); printNumero(BREAK_TIME_3);
    printString(";TIME_BEFORE_MOVING="); printNumero(TIME_BEFORE_MOVING);
    printString(";VARIANCIA="); printNumero(VARIANCIA);
    printString(";ESTRATEGIA="); printNumero(ESTRATEGIA);
    printString("\n");
  }
  // 7. SELEÇÃO DE ESTRATÉGIA
  else if (strncmp(cmd_buf, "ESTRATEGIA_", 11) == 0) {
    char modo = cmd_buf[11];
    switch (modo) {
      case '0': printString("ESTRATEGIA_0\n"); ESTRATEGIA = 0; break;
      case 'A': printString("ESTRATEGIA_A\n"); ESTRATEGIA = 1; break;
      case 'B': printString("ESTRATEGIA_B\n"); ESTRATEGIA = 2; break;
      case 'C': printString("ESTRATEGIA_C\n"); ESTRATEGIA = 3; break;
      case 'D': printString("ESTRATEGIA_D\n"); ESTRATEGIA = 4; break;
      case 'E': printString("ESTRATEGIA_E\n"); ESTRATEGIA = 5; break;
      default: printString("ESTRATEGIA INVALIDA\n"); ESTRATEGIA = 0; break;
    }
  }
  // 8. PARÂMETROS
  else if (strncmp(cmd_buf, "PWM_MAX_DELTA = ", 16) == 0) {
    PWM_MAX_DELTA = atoi(cmd_buf + 16);
    printString("PWM_MAX_DELTA = "); printNumero(PWM_MAX_DELTA); printString("\n");
  } else if (strncmp(cmd_buf, "PWM_BASE = ", 11) == 0) {
    PWM_BASE = atoi(cmd_buf + 11);
    PWM_BASE_DESEJADO = PWM_BASE;
    printString("PWM_BASE = "); printNumero(PWM_BASE); printString("\n");
  } else if (strncmp(cmd_buf, "BREAK_TIME_1 = ", 15) == 0) {
    BREAK_TIME_1 = atoi(cmd_buf + 15);
    printString("BREAK_TIME_1 = "); printNumero(BREAK_TIME_1); printString("\n");
  } else if (strncmp(cmd_buf, "BREAK_TIME_3 = ", 15) == 0) {
    BREAK_TIME_3 = atoi(cmd_buf + 15);
    printString("BREAK_TIME_3 = "); printNumero(BREAK_TIME_3); printString("\n");
  } else if (strncmp(cmd_buf, "VARIANCIA = ", 12) == 0) {
    uint8_t modo = atoi(cmd_buf + 12);
    switch (modo) {
      case 0: VARIANCIA = 0; printString("VARIANCIA_0_OK\n"); break;
      case 1: VARIANCIA = 1; printString("VARIANCIA_1_OK\n"); break;
      case 2: VARIANCIA = 2; printString("VARIANCIA_2_OK\n"); break;
      default: printString("VARIANCIA_INVALIDA\n"); break;
    }
  } else if (strncmp(cmd_buf, "TIME_BEFORE_MOVING = ", 21) == 0) {
    TIME_BEFORE_MOVING = atoi(cmd_buf + 21);
    printString("TIME_BEFORE_MOVING = "); printNumero(TIME_BEFORE_MOVING); printString("\n");
  } else if (strcmp(cmd_buf, "END_OF_CONFIG") == 0) {
    UCSR0B &= ~(1 << RXCIE0);
    CONFIG_ENABLE = 0;
  }
}

// --- EXECUÇÃO DAS ESTRATÉGIAS PREDEFINIDAS ---
int giro_eixo_time = 75;
void EXECUTA_ESTRATEGIA(int EST) {
  if (EST == 0) {
    // Sem estratégia
  } else if (EST == 1) { // ESTRATÉGIA A (PARAMETRIZADA)
    if (VARIANCIA == 0) {
      SET_MOTORS(1599, -1599); _delay_ms(100 + giro_eixo_time);
      SET_MOTORS(450, 1599);  _delay_ms(550 + giro_eixo_time);
    } else if (VARIANCIA == 1) {
      SET_MOTORS(1599, -1599); _delay_ms(80 + giro_eixo_time);
      SET_MOTORS(600, 1599);  _delay_ms(500);
      SET_MOTORS(800, 1599);  _delay_ms(500);
    } else if (VARIANCIA == 2) {
      SET_MOTORS(1599, -1599); _delay_ms(100 + giro_eixo_time);
      SET_MOTORS(700, 1599);  _delay_ms(740);
    }
  } else if (EST == 2) { // ESTRATÉGIA B
    SET_MOTORS(1100, -1100); _delay_ms(48 + giro_eixo_time);
    SET_MOTORS(1500, 1500);  _delay_ms(260);
    SET_MOTORS(200, 1400);   _delay_ms(230);
    SET_MOTORS(1500, 1500);  _delay_ms(300);
  } else if (EST == 3) { // ESTRATÉGIA C
    SET_MOTORS(0, 0);       _delay_ms(400);
    SET_MOTORS(1599, 1599); _delay_ms(160);
  } else if (EST == 4) { // ESTRATÉGIA D
    SET_MOTORS(1599, 1599); _delay_ms(180);
    SET_MOTORS(0, 0);       _delay_ms(400);
    SET_MOTORS(1599, 1599); _delay_ms(160);
    SET_MOTORS(0, 0);
  }
}

// --- ATUALIZAÇÃO DE TESTES V2 ---
static int currentTestPwmEsq = 0;
static int currentTestPwmDir = 0;

void update_test_mode(void) {
  if (!TEST_MODE_ACTIVE) return;

  unsigned long now = get_ms();
  if (currentStepIdx < customStepCount) {
    unsigned long duration = customSteps[currentStepIdx].timeMs;
    if (duration == 0) duration = 50; // Duração mínima de segurança se tempo for 0

    int targetEsq = customSteps[currentStepIdx].motorEsq;
    int targetDir = customSteps[currentStepIdx].motorDir;
    int accel = customSteps[currentStepIdx].accelStep;

    if (accel > 0) {
      if (currentTestPwmEsq < targetEsq) {
        currentTestPwmEsq += accel;
        if (currentTestPwmEsq > targetEsq) currentTestPwmEsq = targetEsq;
      } else if (currentTestPwmEsq > targetEsq) {
        currentTestPwmEsq -= accel;
        if (currentTestPwmEsq < targetEsq) currentTestPwmEsq = targetEsq;
      }

      if (currentTestPwmDir < targetDir) {
        currentTestPwmDir += accel;
        if (currentTestPwmDir > targetDir) currentTestPwmDir = targetDir;
      } else if (currentTestPwmDir > targetDir) {
        currentTestPwmDir -= accel;
        if (currentTestPwmDir < targetDir) currentTestPwmDir = targetDir;
      }

      SET_MOTORS(currentTestPwmEsq, currentTestPwmDir);
    }

    if (now - stepStartTime >= duration) {
      currentStepIdx++;
      currentTestPwmEsq = 0;
      currentTestPwmDir = 0;
      if (currentStepIdx < customStepCount) {
        stepStartTime = now;
        if (customSteps[currentStepIdx].accelStep <= 0) {
          SET_MOTORS(customSteps[currentStepIdx].motorEsq, customSteps[currentStepIdx].motorDir);
        }
      } else {
        SET_MOTORS(0, 0);
        PORTD &= ~(1 << STBY); // Volta pro STBY após o teste (desativa ponte H)
        PORTB |= (1 << LED_READY);
        TEST_MODE_ACTIVE = 0;
        printString("TEST_FINISHED\n");
      }
    }
  } else {
    SET_MOTORS(0, 0);
    PORTD &= ~(1 << STBY);
    PORTB |= (1 << LED_READY);
    TEST_MODE_ACTIVE = 0;
    currentTestPwmEsq = 0;
    currentTestPwmDir = 0;
    printString("TEST_FINISHED\n");
  }
}

// MAIN ENTRY POINT
int main(void) {
  init_UART_ISR();
  printString("RESET_V2_SINGLE\n");

  MOTORS_CONFIG();
  MICROSTART_ISR_CONFIG();
  TEMPORIZADOR_ISR_CONFIG();

  sei(); // Habilita interrupções globais

  DDRB |= (1 << LED_READY);
  PORTB |= (1 << LED_READY);

  // Loop de configuração / comandos do app antes do START do Microstart
  while (READY_FLAG) {
    CODIGO_ERRO = PINC & SENSOR_MASK;
    ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];
    ERRO_ANTIGO = ERRO;

    if (CONFIG_ENABLE) {
      config();
    }
    update_test_mode();
  }

  // Ao receber o sinal físico de START do Microstart:
  EXECUTA_ESTRATEGIA(ESTRATEGIA);

  // Loop Principal de Batalha Arena (Busca PID por Sensores)
  while (1) {
    if (TIME_FLAG) {
      TIME_FLAG = 0;
      TIME++;

      CODIGO_ERRO = PINC & SENSOR_MASK;
      ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];

      if (ERRO == 10) {
        PWM_BASE_ATUAL = 0;
        if (ERRO_ANTIGO >= 0) {
          ERRO = 3;
          DELTA_SPEED = 400;
        } else {
          ERRO = -3;
          DELTA_SPEED = -400;
        }
      } else {
        if ((abs(ERRO) >= 3) && !ALREADY_FLAG_ATTACK && IS_FLAG) {
          int direcao = ERRO / abs(ERRO);
          SET_MOTORS(-800, -800); _delay_ms(100);
          SET_MOTORS(1000 * direcao, -1000 * direcao); _delay_ms(35);
          SET_MOTORS(0, 0); _delay_ms(20);

          for (int i = 0; i < 80; i++) {
            int pwm = i * 12;
            SET_MOTORS(pwm, pwm);
            _delay_ms(1);
          }
          ALREADY_FLAG_ATTACK = 1;
          continue;
        }

        derivativo = alpha * derivativo + (1 - alpha) * KD * (ERRO - ERRO_ANTIGO);
        DELTA_SPEED = KP * ERRO + derivativo;

        if (CODIGO_ERRO == (1 << SENSOR_CENTRAL)) {
          BREAK_COUNT++;
          if (BREAK_COUNT <= BREAK_TIME_1) {
            PWM_BASE_ATUAL = 0;
          } else {
            PWM_BASE_ATUAL = RAMP_DELTA(PWM_BASE_ATUAL, 1599);
          }
        } else {
          BREAK_COUNT = 0;
          PWM_BASE_ATUAL = RAMP_DELTA(PWM_BASE_ATUAL, PWM_BASE_DESEJADO);
        }
      }
    }

    ERRO_ANTIGO = ERRO;

    if (TIME < TIME_BEFORE_MOVING) {
      SET_MOTORS(DELTA_SPEED, -DELTA_SPEED);
    } else {
      SET_MOTORS(PWM_BASE_ATUAL + DELTA_SPEED, PWM_BASE_ATUAL - DELTA_SPEED);
    }
  }

  return 0;
}
