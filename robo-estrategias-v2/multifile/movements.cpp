#include "movements.h"
#include "motors.h"

void TESTAR_PASSO(int esq, int dir, uint16_t ms) {
  PORTD |= (1 << STBY);
  SET_MOTORS(esq, dir);
  for (uint16_t i = 0; i < ms; i++) {
    _delay_ms(1);
  }
  SET_MOTORS(0, 0);
  PORTD &= ~(1 << STBY);
}
