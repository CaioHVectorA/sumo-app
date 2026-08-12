#include "strategies.h"
#include "motors.h"

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
    // Sem movimento inicial
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
