#include <avr/io.h>
#include <util/delay.h>

#define DIR_IN1 PD5  // D5
#define DIR_IN2 PD4  // D4
#define DIR_PWM PB2  // D10
#define ESQ_IN1 PD7  // D7
#define ESQ_IN2 PB0  // D8
#define ESQ_PWM PB1  // D9
#define STBY PD6     // D6

#define PWM_SPEED 1200  // Velocidade dos motores (máximo 1599)

void MOTORS_CONFIG(void) {
  // Configura pinos como saída
  DDRB |= ((1 << ESQ_IN2) | (1 << ESQ_PWM) | (1 << DIR_PWM));
  DDRD |= ((1 << DIR_IN1) | (1 << DIR_IN2) | (1 << STBY) | (1 << ESQ_IN1));

  // Configuração do Timer 1 para Fast PWM (10 kHz)
  TCCR1A = ((1 << COM1A1) | (1 << COM1B1) | (1 << WGM11));
  TCCR1B = ((1 << WGM13) | (1 << WGM12) | (1 << CS10));
  ICR1 = 1599;  // 10 kHz
}

int main(void) {
  MOTORS_CONFIG();

  // Habilita a ponte H (tira do standby)
  PORTD |= (1 << STBY);

  // Configura direção dos motores para FRENTE
  // Motor Esquerdo (ESQ): IN1 = 0, IN2 = 1
  PORTD &= ~(1 << ESQ_IN1);
  PORTB |= (1 << ESQ_IN2);

  // Motor Direito (DIR): IN1 = 0, IN2 = 1
  PORTD &= ~(1 << DIR_IN1);
  PORTD |= (1 << DIR_IN2);

  // Define velocidade dos motores
  OCR1A = PWM_SPEED; // Esquerda
  OCR1B = PWM_SPEED; // Direita

  while (1) {
    // Apenas mantém os motores rodando
    _delay_ms(100);
  }

  return 0;
}
