#include "uart_comm.h"
#include "motors.h"
#include "movements.h"

// Buffers circulares de UART
volatile uint8_t rx_buf[RX_BUF_SIZE];
volatile uint8_t rx_head = 0, rx_tail = 0;

char cmd_buf[CMD_BUF_SIZE];
uint8_t cmd_len = 0;
uint8_t cmd_ready = 0;

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

void config(void) {
  uart_process();
  if (cmd_ready) {
    cmd_ready = 0;

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
