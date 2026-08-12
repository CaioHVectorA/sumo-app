#include "motors.h"

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
