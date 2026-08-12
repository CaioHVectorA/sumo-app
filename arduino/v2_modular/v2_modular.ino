/*
 * ROBÔ SUMÔ - ARDUINO FIRMWARE V2 (MODULAR VERSION)
 * --------------------------------------------------
 * Versão modular e estendida do firmware robo-with-manual.ino.
 * Organizada em módulos de responsabilidade única:
 * - config.h         : Constantes de hardware, definições e pinagem
 * - motors.h/cpp     : Controle dos motores, ponte H e rampa de PWM
 * - movements.h/cpp  : Rotinas de movimentos e cálculo de razões de curva por ângulo
 * - calibration.h/cpp: Gerenciamento da tabela de movimentos calibrados
 * - strategy.h/cpp   : Estratégias predefinidas (A-E), teste de steps e loop PID
 * - communication.h/cpp: Parser UART não-bloqueante e comandos Bluetooth
 */

#include "config.h"
#include "motors.h"
#include "movements.h"
#include "calibration.h"
#include "strategy.h"
#include "communication.h"

// --- ISR DO MICROSTART (HARDWARE PIN INTERRUPT) ---
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

// --- ISR TEMPORIZADA DE 1 MS ---
void TEMPORIZADOR_ISR_CONFIG(void) {
  TCCR2A = (1 << WGM21); // CTC Mode
  TCCR2B = (1 << CS22);  // Prescaler 64
  OCR2A = 249;           // 1 ms a 16 MHz
  TIMSK2 |= (1 << OCIE2A); // Habilita interrupção por comparação imediatamente
}

ISR(TIMER2_COMPA_vect) {
  ms_ticks++;
  TIME_FLAG = 1;
}

// MAIN ENTRY POINT
int main(void) {
  init_UART_ISR();
  printString("RESET_V2_MODULAR\n");

  MOTORS_CONFIG();
  MICROSTART_ISR_CONFIG();
  TEMPORIZADOR_ISR_CONFIG();
  calibration_init_defaults();
  strategy_init();

  sei(); // Habilita interrupções globais

  DDRB |= (1 << LED_READY);
  PORTB |= (1 << LED_READY);

  // Loop de Configuração & Testes do App antes do START
  while (READY_FLAG) {
    CODIGO_ERRO = PINC & SENSOR_MASK;
    ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];
    ERRO_ANTIGO = ERRO;

    if (CONFIG_ENABLE) {
      config();
    }
    update_test_mode();
  }

  // Ao acionar o START do Microstart:
  EXECUTA_ESTRATEGIA(ESTRATEGIA);

  // Loop Principal de Busca PID na Arena
  while (1) {
    run_pid_battle_loop();
  }

  return 0;
}
