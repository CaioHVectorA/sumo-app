#include "movements.h"

void calculate_curve_pwm(int basePwm, int angleDeg, int &outEsq, int &outDir) {
  if (angleDeg < -90) angleDeg = -90;
  if (angleDeg > 90) angleDeg = 90;

  if (angleDeg == 0) {
    outEsq = basePwm;
    outDir = basePwm;
    return;
  }

  // Ratio intuitiva: 0 deg = 1.0, 90 deg = 0.0 (parada), >90 deg = invertido
  float factor = 1.0f - (abs(angleDeg) / 90.0f);
  int innerPwm = (int)(basePwm * factor);

  if (angleDeg > 0) {
    // Curva para a direita: motor esquerdo é o externo (100%), motor direito é o interno (reduzido)
    outEsq = basePwm;
    outDir = innerPwm;
  } else {
    // Curva para a esquerda: motor direito é o externo (100%), motor esquerdo é o interno (reduzido)
    outEsq = innerPwm;
    outDir = basePwm;
  }
}

void execute_single_step(int motorEsq, int motorDir, unsigned long timeMs) {
  set_motors(motorEsq, motorDir);
  if (timeMs > 0) {
    delay(timeMs);
    brake_motors();
  }
}
