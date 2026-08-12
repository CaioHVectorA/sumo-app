/*
  ================================================================================
  PROJETO: Robô Sumô - Firmware Versão 2 (Arquivo Único: Arduino.ino)
  ================================================================================
  Descrição:
    Firmware completo para robô de sumô com microcontrolador ATmega328P.
    Inclui controle PWM 10kHz nos motores, leitura de sensores IV via LUT de 4 bits,
    controle PID de alinhamento/busca, interrupções UART (115200 baud) via Bluetooth,
    controle manual, calibração de parâmetros, suporte às estratégias nativas (0, A, B, C, D, E)
    e suporte a EXECUÇÃO DINÂMICA DE MOVIMENTOS E ESTRATÉGIAS PERSONALIZADAS (TEST_STEP e RUN_STRAT).
  ================================================================================
*/

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// -----------------------------------------------------------------------------
// DEFINIÇÕES DE PINOS E CONSTANTES DE HARDWARE
// -----------------------------------------------------------------------------

#define KP 300
#define KD 3000
#define ALPHA 0.85

#define MICROSTART PB4  // D12 - Entrada do botão de start/stop
#define LED_READY PB5   // D13 - LED indicador de prontidão

// Sensores de linha/oponente em PORTC (A0 a A4)
#define SENSOR_LAT_DIR PC0                                                                                           // A0 (Ignorado por instabilidade)
#define SENSOR_CEN_DIR PC1                                                                                           // A1
#define SENSOR_CENTRAL PC2                                                                                           // A2
#define SENSOR_CEN_ESQ PC3                                                                                           // A3
#define SENSOR_LAT_ESQ PC4                                                                                           // A4
#define SENSOR_MASK ((1 << SENSOR_CEN_DIR) | (1 << SENSOR_CENTRAL) | (1 << SENSOR_CEN_ESQ) | (1 << SENSOR_LAT_ESQ))

// Driver de Motores (Ponte H / TB6612FNG ou similar)
#define DIR_IN1 PD5  // D5
#define DIR_IN2 PD4  // D4
#define DIR_PWM PB2  // D10 (OC1B)
#define ESQ_IN1 PD7  // D7
#define ESQ_IN2 PB0  // D8
#define ESQ_PWM PB1  // D9 (OC1A)
#define STBY PD6     // D6

#define PWM_MAX 1599
#define PWM_DEADZONE 30

#define RX_BUF_SIZE 128  // Buffer circular estendido para comandos de estratégia dinâmica
#define CMD_BUF_SIZE 128

// -----------------------------------------------------------------------------
// VARIÁVEIS GLOBAIS DE CALIBRAÇÃO E CONFIGURAÇÃO
// -----------------------------------------------------------------------------

uint8_t PWM_MAX_DELTA = 4;
uint16_t PWM_BASE = 1200;
uint16_t BREAK_TIME_1 = 250;
uint16_t BREAK_TIME_3 = 250;
uint16_t TIME_BEFORE_MOVING = 2000;
uint8_t ALREADY_FLAG_ATTACK = 0;

uint8_t giro_eixo_time = 75;
uint8_t ESTRATEGIA = 0;
uint8_t VARIANCIA = 0;
uint8_t CONFIG_ENABLE = 1;

// Buffer circular de UART para recepção Bluetooth via ISR
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
unsigned int PWM_BASE_DESEJADO = PWM_BASE;

volatile uint8_t MANUAL_MODE = 0;
volatile int manual_left = 0;
volatile int manual_right = 0;

// ESTRUTURA PARA PASSOS DINÂMICOS DE ESTRATÉGIA CUSTOMIZADA
typedef struct {
  int motorEsq;
  int motorDir;
  uint16_t timeMs;
} CustomStep;

#define MAX_CUSTOM_STEPS 10
CustomStep customStrategySteps[MAX_CUSTOM_STEPS];
uint8_t customStepCount = 0;
uint8_t USE_CUSTOM_STRATEGY = 0;

// LUT para mapeamento do erro de centralização conforme sensores
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

uint8_t CODIGO_ERRO = 0;
int8_t ERRO = 0;
int8_t ERRO_ANTIGO = 0;
int derivativo = 0;
int DELTA_SPEED = 0;

// -----------------------------------------------------------------------------
// PROTÓTIPOS DE FUNÇÕES
// -----------------------------------------------------------------------------
void MOTORS_CONFIG(void);
void SET_MOTORS(int PWM_ESQ, int PWM_DIR);
void MICROSTART_ISR_CONFIG(void);
void TEMPORIZADOR_ISR_CONFIG(void);
void init_UART_ISR(void);
void transmitByte(uint8_t data);
void printString(const char myString[]);
void printNumero(uint16_t word);
uint8_t uart_available(void);
uint8_t uart_read(void);
void uart_process(void);
void config(void);
void EXECUTA_ESTRATEGIA(int EST);
void EXECUTA_ESTRATEGIA_CUSTOM(void);
void TESTAR_PASSO(int esq, int dir, uint16_t ms);

// -----------------------------------------------------------------------------
// INTERRUPÇÕES (ISRs)
// -----------------------------------------------------------------------------

// ISR do Microstart (Chave de Partida D12)
ISR(PCINT0_vect) {
  if (MANUAL_MODE) return;

  if ((PINB & (1 << MICROSTART)) == 0) {  // STOP
    PORTD &= ~(1 << STBY);                // Desabilita motores
    SET_MOTORS(0, 0);
    cli();                                // Desabilita interrupções
  } else {                                // START
    READY_FLAG = 0;
    PORTB &= ~(1 << LED_READY);
    PORTD |= (1 << STBY);                 // Habilita ponte H

    TIMSK2 = (1 << OCIE2A);               // Interrupção de 1ms
  }
}

// ISR do Temporizador 2 (1 ms)
ISR(TIMER2_COMPA_vect) {
  TIME_FLAG = 1;
}

// ISR da UART (Recepção de bytes Bluetooth)
ISR(USART_RX_vect) {
  uint8_t next = (rx_head + 1) % RX_BUF_SIZE;
  if (next != rx_tail) {
    rx_buf[rx_head] = UDR0;
    rx_head = next;
  }
}

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO DOS MOTORES E PWM (TIMER 1 - 10 kHz)
// -----------------------------------------------------------------------------

void MOTORS_CONFIG(void) {
  DDRB |= ((1 << ESQ_IN2) | (1 << ESQ_PWM) | (1 << DIR_PWM));
  DDRD |= ((1 << DIR_IN1) | (1 << DIR_IN2) | (1 << STBY) | (1 << ESQ_IN1));

  // Fast PWM com ICR1 como TOP, 10 kHz
  TCCR1A = ((1 << COM1A1) | (1 << COM1B1) | (1 << WGM11));
  TCCR1B = ((1 << WGM13) | (1 << WGM12) | (1 << CS10));
  ICR1 = 1599;

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

// -----------------------------------------------------------------------------
// CONFIGURAÇÕES DE INTERRUPÇÃO E UART
// -----------------------------------------------------------------------------

void MICROSTART_ISR_CONFIG(void) {
  PCICR |= (1 << PCIE0);
  PCMSK0 |= (1 << MICROSTART);
}

void TEMPORIZADOR_ISR_CONFIG(void) {
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22);  // Prescaler 64
  OCR2A = 249;           // 1ms
}

void init_UART_ISR(void) {
  UCSR0A |= (1 << U2X0);  // Double Speed
  UBRR0H = 0;
  UBRR0L = 16;            // 115200 Baud

  UCSR0B = (1 << TXEN0) | (1 << RXEN0) | (1 << RXCIE0);
  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
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

// -----------------------------------------------------------------------------
// PROCESSAMENTO DE COMANDOS BLUETOOTH E CALIBRAÇÃO
// -----------------------------------------------------------------------------

void TESTAR_PASSO(int esq, int dir, uint16_t ms) {
  PORTD |= (1 << STBY);  // Habilita ponte H para o teste
  SET_MOTORS(esq, dir);
  for (uint16_t i = 0; i < ms; i++) {
    _delay_ms(1);
  }
  SET_MOTORS(0, 0);
  PORTD &= ~(1 << STBY); // Retorna ao standby após o teste
}

void config(void) {
  uart_process();
  if (cmd_ready) {
    cmd_ready = 0;

    // Telemetria dos Sensores e Motores
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
    // Controle Manual
    else if (strcmp(cmd_buf, "MANUAL_ON") == 0) {
      MANUAL_MODE = 1;
      manual_left = 0;
      manual_right = 0;
      PORTD |= (1 << STBY);
      PORTB &= ~(1 << LED_READY);
      printString("MANUAL_ON_OK\n");
    }
    else if (strcmp(cmd_buf, "MANUAL_OFF") == 0) {
      MANUAL_MODE = 0;
      manual_left = 0;
      manual_right = 0;
      SET_MOTORS(0, 0);
      PORTD &= ~(1 << STBY);
      PORTB |= (1 << LED_READY);
      printString("MANUAL_OFF_OK\n");
    }
    else if (strncmp(cmd_buf, "M,", 2) == 0) {
      if (MANUAL_MODE) {
        int left_val = 0, right_val = 0;
        char *comma1 = strchr(cmd_buf + 2, ',');
        if (comma1 != NULL) {
          *comma1 = '\0';
          left_val = atoi(cmd_buf + 2);
          right_val = atoi(comma1 + 1);
          *comma1 = ',';
        }
        manual_left = left_val;
        manual_right = right_val;
        SET_MOTORS(left_val, right_val);

        printString("TEL;");
        printNumero(CODIGO_ERRO);
        printString(";");
        if (left_val < 0) { transmitByte('-'); printNumero(-left_val); } else { printNumero(left_val); }
        printString(";");
        if (right_val < 0) { transmitByte('-'); printNumero(-right_val); } else { printNumero(right_val); }
        printString("\n");
      }
    }
    // STATUS dos parâmetros
    else if (strcmp(cmd_buf, "STATUS") == 0) {
      printString("STATUS;PWM_BASE=");
      printNumero(PWM_BASE);
      printString(";PWM_MAX_DELTA=");
      printNumero(PWM_MAX_DELTA);
      printString(";BREAK_TIME_1=");
      printNumero(BREAK_TIME_1);
      printString(";BREAK_TIME_3=");
      printNumero(BREAK_TIME_3);
      printString(";TIME_BEFORE_MOVING=");
      printNumero(TIME_BEFORE_MOVING);
      printString(";VARIANCIA=");
      printNumero(VARIANCIA);
      printString(";ESTRATEGIA=");
      printNumero(ESTRATEGIA);
      printString("\n");
    }
    // COMANDO DE TESTE INDIVIDUAL DE MOVIMENTO (CALIBRAÇÃO)
    // Formato: TEST_STEP,pwmL,pwmR,timeMs
    else if (strncmp(cmd_buf, "TEST_STEP,", 10) == 0) {
      int esq = 0, dir = 0;
      uint16_t ms = 0;
      char *p1 = strchr(cmd_buf + 10, ',');
      if (p1 != NULL) {
        *p1 = '\0';
        esq = atoi(cmd_buf + 10);
        char *p2 = strchr(p1 + 1, ',');
        if (p2 != NULL) {
          *p2 = '\0';
          dir = atoi(p1 + 1);
          ms = atoi(p2 + 1);
        }
      }
      TESTAR_PASSO(esq, dir, ms);
      printString("TEST_STEP_OK\n");
    }
    // COMANDO DE EXECUÇÃO DE ESTRATÉGIA DINÂMICA COMPLETA
    // Formato: RUN_STRAT,COUNT;esq1,dir1,ms1;esq2,dir2,ms2...
    else if (strncmp(cmd_buf, "RUN_STRAT,", 10) == 0) {
      char *token = strtok(cmd_buf + 10, ";");
      if (token != NULL) {
        uint8_t count = atoi(token);
        if (count > MAX_CUSTOM_STEPS) count = MAX_CUSTOM_STEPS;
        customStepCount = 0;

        while ((token = strtok(NULL, ";")) != NULL && customStepCount < count) {
          int esq = 0, dir = 0;
          uint16_t ms = 0;
          char *c1 = strchr(token, ',');
          if (c1 != NULL) {
            *c1 = '\0';
            esq = atoi(token);
            char *c2 = strchr(c1 + 1, ',');
            if (c2 != NULL) {
              *c2 = '\0';
              dir = atoi(c1 + 1);
              ms = atoi(c2 + 1);
            }
          }
          customStrategySteps[customStepCount].motorEsq = esq;
          customStrategySteps[customStepCount].motorDir = dir;
          customStrategySteps[customStepCount].timeMs = ms;
          customStepCount++;
        }
        USE_CUSTOM_STRATEGY = 1;
        printString("RUN_STRAT_OK\n");
      }
    }
    // Seleção de Estratégias Nativas
    else if (strncmp(cmd_buf, "ESTRATEGIA_", 11) == 0) {
      USE_CUSTOM_STRATEGY = 0;
      char modo = cmd_buf[11];
      switch (modo) {
        case '0': printString("ESTRATEGIA_0\n"); ESTRATEGIA = 0; break;
        case 'A': printString("ESTRATEGIA_A\n"); ESTRATEGIA = 1; break;
        case 'B': printString("ESTRATEGIA_B\n"); ESTRATEGIA = 2; break;
        case 'C': printString("ESTRATEGIA_C\n"); ESTRATEGIA = 3; break;
        case 'D': printString("ESTRATEGIA_D\n"); ESTRATEGIA = 4; break;
        case 'E': printString("ESTRATEGIA_E\n"); ESTRATEGIA = 5; break;
        default:  printString("ESTRATEGIA INVALIDA\n"); ESTRATEGIA = 0; break;
      }
    }
    // Calibração dos parâmetros globais
    else if (strncmp(cmd_buf, "PWM_MAX_DELTA = ", 16) == 0) {
      PWM_MAX_DELTA = atoi(cmd_buf + 16);
      printString("PWM_MAX_DELTA = "); printNumero(PWM_MAX_DELTA); printString("\n");
    }
    else if (strncmp(cmd_buf, "PWM_BASE = ", 11) == 0) {
      PWM_BASE = atoi(cmd_buf + 11);
      printString("PWM_BASE = "); printNumero(PWM_BASE); printString("\n");
    }
    else if (strncmp(cmd_buf, "BREAK_TIME_1 = ", 15) == 0) {
      BREAK_TIME_1 = atoi(cmd_buf + 15);
      printString("BREAK_TIME_1 = "); printNumero(BREAK_TIME_1); printString("\n");
    }
    else if (strncmp(cmd_buf, "BREAK_TIME_3 = ", 15) == 0) {
      BREAK_TIME_3 = atoi(cmd_buf + 15);
      printString("BREAK_TIME_3 = "); printNumero(BREAK_TIME_3); printString("\n");
    }
    else if (strncmp(cmd_buf, "VARIANCIA = ", 12) == 0) {
      uint8_t modo = atoi(cmd_buf + 12);
      if (modo <= 2) {
        VARIANCIA = modo;
        printString("VARIANCIA_"); printNumero(VARIANCIA); printString("_OK\n");
      } else {
        printString("VARIANCIA_INVALIDA\n");
      }
    }
    else if (strncmp(cmd_buf, "TIME_BEFORE_MOVING = ", 21) == 0) {
      TIME_BEFORE_MOVING = atoi(cmd_buf + 21);
      printString("TIME_BEFORE_MOVING = "); printNumero(TIME_BEFORE_MOVING); printString("\n");
    }
  }
}

// -----------------------------------------------------------------------------
// EXECUÇÃO DAS ESTRATÉGIAS NATIVAS E CUSTOMIZADAS
// -----------------------------------------------------------------------------

void EXECUTA_ESTRATEGIA_CUSTOM(void) {
  for (uint8_t i = 0; i < customStepCount; i++) {
    SET_MOTORS(customStrategySteps[i].motorEsq, customStrategySteps[i].motorDir);
    for (uint16_t t = 0; t < customStrategySteps[i].timeMs; t++) {
      _delay_ms(1);
    }
  }
}

void EXECUTA_ESTRATEGIA(int EST) {
  if (USE_CUSTOM_STRATEGY) {
    EXECUTA_ESTRATEGIA_CUSTOM();
    return;
  }

  if (EST == 0) {
    // Sem pré-movimento (entra direto no PID de busca)
  }
  else if (EST == 1) { // Estratégia A
    if (VARIANCIA == 0) {       // CURTO
      SET_MOTORS(1599, -1599); _delay_ms(100 + giro_eixo_time);
      SET_MOTORS(450, 1599);   _delay_ms(550 + giro_eixo_time);
    } else if (VARIANCIA == 1) { // MÉDIO
      SET_MOTORS(1599, -1599); _delay_ms(80 + giro_eixo_time);
      SET_MOTORS(600, 1599);   _delay_ms(500);
      SET_MOTORS(800, 1599);   _delay_ms(500);
    } else if (VARIANCIA == 2) { // FUNDO
      SET_MOTORS(1599, -1599); _delay_ms(100 + giro_eixo_time);
      SET_MOTORS(700, 1599);   _delay_ms(740);
    }
  }
  else if (EST == 2) { // Estratégia B
    SET_MOTORS(1100, -1100); _delay_ms(48 + giro_eixo_time);
    SET_MOTORS(1500, 1500);  _delay_ms(260);
    SET_MOTORS(200, 1400);   _delay_ms(230);
    SET_MOTORS(1500, 1500);  _delay_ms(300);
  }
  else if (EST == 3) { // Estratégia C (Defensiva)
    SET_MOTORS(0, 0);        _delay_ms(400);
    SET_MOTORS(1599, 1599);  _delay_ms(160);
  }
  else if (EST == 4) { // Estratégia D (Finta)
    SET_MOTORS(1599, 1599);  _delay_ms(180);
    SET_MOTORS(0, 0);        _delay_ms(400);
    SET_MOTORS(1599, 1599);  _delay_ms(160);
    SET_MOTORS(0, 0);
  }
}

// -----------------------------------------------------------------------------
// MAIN LOOP
// -----------------------------------------------------------------------------

int main(void) {
  init_UART_ISR();
  printString("RESET\n");

  MOTORS_CONFIG();
  MICROSTART_ISR_CONFIG();
  TEMPORIZADOR_ISR_CONFIG();

  sei(); // Habilita todas as ISRs

  DDRB |= (1 << LED_READY);
  PORTB |= (1 << LED_READY);

  // Aguarda sinal de START (Botão microstart físico ou remoto)
  while (READY_FLAG) {
    CODIGO_ERRO = PINC & SENSOR_MASK;
    ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];
    ERRO_ANTIGO = ERRO;

    if (CONFIG_ENABLE) {
      config();
    }
  }

  // Executa estratégia (nativa ou customizada)
  EXECUTA_ESTRATEGIA(ESTRATEGIA);

  // Malha principal de batalha com PID
  while (1) {
    if (TIME_FLAG) {
      TIME_FLAG = 0;
      TIME++;

      CODIGO_ERRO = PINC & SENSOR_MASK;
      ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];

      if (ERRO == 10) { // Alvo perdido ou ambíguo
        PWM_BASE_ATUAL = 0;
        if (ERRO_ANTIGO >= 0) {
          ERRO = 3; DELTA_SPEED = 400;
        } else {
          ERRO = -3; DELTA_SPEED = -400;
        }
      } else {
        if ((abs(ERRO) >= 3) && !ALREADY_FLAG_ATTACK) {
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

        derivativo = ALPHA * derivativo + (1 - ALPHA) * KD * (ERRO - ERRO_ANTIGO);
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
}
