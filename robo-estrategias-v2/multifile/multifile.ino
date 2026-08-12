/*
  ================================================================================
  PROJETO: Robô Sumô - Firmware Versão 2 (Modular: multifile.ino)
  ================================================================================
  Descrição:
    Arquivo principal da versão modular. Integra os módulos:
    - config.h (Definições e variáveis globais)
    - motors (Configuração PWM 10kHz e acionamento H-Bridge)
    - sensors (Leitura de sensores infravermelhos e LUT)
    - uart_comm (Comunicação Bluetooth ISR e calibração)
    - movements (Execução individual de passos e testes)
    - strategies (Estratégias nativas e dinâmicas)
  ================================================================================
*/

#include "config.h"
#include "motors.h"
#include "sensors.h"
#include "uart_comm.h"
#include "movements.h"
#include "strategies.h"

// -----------------------------------------------------------------------------
// DEFINIÇÃO DAS VARIÁVEIS GLOBAIS DECLARADAS EM CONFIG.H
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

volatile uint8_t READY_FLAG = 1;
volatile uint8_t TIME_FLAG = 0;
volatile unsigned long int TIME = 0;
unsigned int BREAK_COUNT = 0;

unsigned int PWM_BASE_ATUAL = 0;
unsigned int PWM_BASE_DESEJADO = PWM_BASE;

volatile uint8_t MANUAL_MODE = 0;
volatile int manual_left = 0;
volatile int manual_right = 0;

CustomStep customStrategySteps[MAX_CUSTOM_STEPS];
uint8_t customStepCount = 0;
uint8_t USE_CUSTOM_STRATEGY = 0;

uint8_t CODIGO_ERRO = 0;
int8_t ERRO = 0;
int8_t ERRO_ANTIGO = 0;
int derivativo = 0;
int DELTA_SPEED = 0;

// -----------------------------------------------------------------------------
// INTERRUPÇÕES DA PLACA PRINCIPAL
// -----------------------------------------------------------------------------

// ISR do Botão Microstart (PCINT0 / D12)
ISR(PCINT0_vect) {
  if (MANUAL_MODE) return;

  if ((PINB & (1 << MICROSTART)) == 0) {  // STOP
    PORTD &= ~(1 << STBY);                // Desabilita ponte H
    SET_MOTORS(0, 0);
    cli();                                // Desabilita interrupções
  } else {                                // START
    READY_FLAG = 0;
    PORTB &= ~(1 << LED_READY);
    PORTD |= (1 << STBY);                 // Habilita ponte H

    TIMSK2 = (1 << OCIE2A);               // Interrupção temporizada de 1ms
  }
}

// ISR do Temporizador 2 (1 ms)
ISR(TIMER2_COMPA_vect) {
  TIME_FLAG = 1;
}

// -----------------------------------------------------------------------------
// FUNÇÕES DE CONFIGURAÇÃO DE INTERRUPÇÃO LOCAL
// -----------------------------------------------------------------------------

static void MICROSTART_ISR_CONFIG(void) {
  PCICR |= (1 << PCIE0);
  PCMSK0 |= (1 << MICROSTART);
}

static void TEMPORIZADOR_ISR_CONFIG(void) {
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22);  // Prescaler 64
  OCR2A = 249;           // 1 ms
}

// -----------------------------------------------------------------------------
// MAIN / SETUP
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

  // Aguarda sinal de START (Botão 2 ou Start remoto)
  while (READY_FLAG) {
    CODIGO_ERRO = SENSORS_READ_RAW();
    ERRO = SENSORS_GET_ERROR(CODIGO_ERRO);
    ERRO_ANTIGO = ERRO;

    if (CONFIG_ENABLE) {
      config();
    }
  }

  // Executa a estratégia pré-programada ou customizada recebida do App
  EXECUTA_ESTRATEGIA(ESTRATEGIA);

  // Malha principal de busca e alinhamento PID
  while (1) {
    if (TIME_FLAG) {
      TIME_FLAG = 0;
      TIME++;

      CODIGO_ERRO = SENSORS_READ_RAW();
      ERRO = SENSORS_GET_ERROR(CODIGO_ERRO);

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
