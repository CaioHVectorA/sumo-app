#include "strategy.h"

// Definição das variáveis globais compartilhadas
uint8_t PWM_MAX_DELTA = 4;
uint16_t PWM_BASE = 1200;
uint16_t BREAK_TIME_1 = 250;
uint16_t BREAK_TIME_3 = 250;
uint16_t TIME_BEFORE_MOVING = 2000;
uint8_t ALREADY_FLAG_ATTACK = 0;

uint8_t delay_1 = 70;
uint8_t delay_2 = 0;
uint8_t PWM_DIR = 0;
uint8_t IS_FLAG = 1;

uint8_t ESTRATEGIA = 0;
uint8_t VARIANCIA = 0;
uint8_t CONFIG_ENABLE = 1;

volatile uint8_t READY_FLAG = 1;
volatile uint8_t TIME_FLAG = 0;
volatile unsigned long int TIME = 0;
unsigned int BREAK_COUNT = 0;

unsigned int PWM_BASE_ATUAL = 0;
unsigned int PWM_BASE_DESEJADO = 1200;

const int8_t ERRO_LUT_4[16] = {
  10, 1, 0, 1, -1, 10, -1, 0, -3, 10, -2, -1, -3, 10, -1, 0
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

static StrategyStep customSteps[MAX_CUSTOM_STEPS];
static uint8_t customStepCount = 0;
static uint8_t currentStepIdx = 0;
static unsigned long stepStartTime = 0;
uint8_t TEST_MODE_ACTIVE = 0;

void strategy_init(void) {
  TEST_MODE_ACTIVE = 0;
  customStepCount = 0;
  currentStepIdx = 0;
}

int giro_eixo_time = 75;
void EXECUTA_ESTRATEGIA(int EST) {
  if (EST == 0) {
    // Sem estratégia pré-programada
  } else if (EST == 1) { // ESTRATÉGIA A PARAMETRIZADA
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

void strategy_load_custom_steps(int count, StrategyStep* steps) {
  customStepCount = 0;
  for (int i = 0; i < count && i < MAX_CUSTOM_STEPS; i++) {
    customSteps[i] = steps[i];
    customStepCount++;
  }

  if (customStepCount > 0) {
    PORTD |= (1 << STBY); // Ativa ponte H
    PORTB &= ~(1 << LED_READY);
    currentStepIdx = 0;
    stepStartTime = get_ms();
    TEST_MODE_ACTIVE = 1;
    if (customSteps[0].accelStep <= 0) {
      SET_MOTORS(customSteps[0].motorEsq, customSteps[0].motorDir);
    } else {
      SET_MOTORS(0, 0);
    }
  }
}

static int currentTestPwmEsq = 0;
static int currentTestPwmDir = 0;

void update_test_mode(void) {
  if (!TEST_MODE_ACTIVE) return;

  unsigned long now = get_ms();
  if (currentStepIdx < customStepCount) {
    unsigned long duration = customSteps[currentStepIdx].timeMs;
    if (duration == 0) duration = 50;

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
        PORTD &= ~(1 << STBY);
        PORTB |= (1 << LED_READY);
        TEST_MODE_ACTIVE = 0;
        currentTestPwmEsq = 0;
        currentTestPwmDir = 0;
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

void run_pid_battle_loop(void) {
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
      } else {
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
  }

  ERRO_ANTIGO = ERRO;

  if (TIME < TIME_BEFORE_MOVING) {
    SET_MOTORS(DELTA_SPEED, -DELTA_SPEED);
  } else {
    SET_MOTORS(PWM_BASE_ATUAL + DELTA_SPEED, PWM_BASE_ATUAL - DELTA_SPEED);
  }
}
