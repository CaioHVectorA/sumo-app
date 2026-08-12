#include "communication.h"

static volatile uint8_t rx_buf[RX_BUF_SIZE];
static volatile uint8_t rx_head = 0, rx_tail = 0;
static char cmd_buf[CMD_BUF_SIZE];
static uint8_t cmd_len = 0;
static uint8_t cmd_ready = 0;

void init_UART_ISR(void) {
  UCSR0A |= (1 << U2X0);
  UBRR0H = 0b00000000;
  UBRR0L = 0b00010000;

  UCSR0B = (1 << TXEN0) | (1 << RXEN0) | (1 << RXCIE0);
  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
}

ISR(USART_RX_vect) {
  uint8_t next = (rx_head + 1) % RX_BUF_SIZE;
  if (next != rx_tail) {
    rx_buf[rx_head] = UDR0;
    rx_head = next;
  }
}

static uint8_t uart_available(void) {
  return (rx_head != rx_tail);
}

static uint8_t uart_read(void) {
  uint8_t data = 0;
  if (rx_head != rx_tail) {
    data = rx_buf[rx_tail];
    rx_tail = (rx_tail + 1) % RX_BUF_SIZE;
  }
  return data;
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
  if (!cmd_ready) return;
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
  } else if (strcmp(cmd_buf, "MANUAL_ON") == 0) {
    MANUAL_MODE = 1;
    manual_left = 0;
    manual_right = 0;
    PORTD |= (1 << STBY);
    PORTB &= ~(1 << LED_READY);
    printString("MANUAL_ON_OK\n");
  } else if (strcmp(cmd_buf, "MANUAL_OFF") == 0) {
    MANUAL_MODE = 0;
    manual_left = 0;
    manual_right = 0;
    SET_MOTORS(0, 0);
    PORTD &= ~(1 << STBY);
    PORTB |= (1 << LED_READY);
    printString("MANUAL_OFF_OK\n");
  } else if (strncmp(cmd_buf, "M,", 2) == 0) {
    int left_val = 0, right_val = 0;
    char *comma1 = strchr(cmd_buf + 2, ',');
    if (comma1 != NULL) {
      *comma1 = '\0';
      left_val = atoi(cmd_buf + 2);
      right_val = atoi(comma1 + 1);
      *comma1 = ',';
    }
    PORTD |= (1 << STBY);
    manual_left = left_val;
    manual_right = right_val;
    SET_MOTORS(left_val, right_val);

    printString("TEL;");
    printNumero(CODIGO_ERRO);
    printString(";");
    if (left_val < 0) { transmitByte('-'); printNumero(-left_val); }
    else { printNumero(left_val); }
    printString(";");
    if (right_val < 0) { transmitByte('-'); printNumero(-right_val); }
    else { printNumero(right_val); }
    printString("\n");
  } else if (strncmp(cmd_buf, "TEST_STEP,", 10) == 0) {
    int esq = 0, dir = 0, accel = 0;
    unsigned long t = 0;
    int parsed = sscanf(cmd_buf + 10, "%d,%d,%lu,%d", &esq, &dir, &t, &accel);
    if (parsed < 4) accel = 0;

    StrategyStep step;
    step.motorEsq = esq;
    step.motorDir = dir;
    step.timeMs = t;
    step.accelStep = accel;

    strategy_load_custom_steps(1, &step);
    printString("STEP_OK\n");
  } else if (strncmp(cmd_buf, "TEST_STRAT,", 11) == 0) {
    char *ptr = cmd_buf + 11;
    int count = atoi(ptr);
    ptr = strchr(ptr, ';');

    StrategyStep steps[MAX_CUSTOM_STEPS];
    int parsedCount = 0;

    while (ptr && parsedCount < count && parsedCount < MAX_CUSTOM_STEPS) {
      ptr++;
      int esq = 0, dir = 0, accel = 0;
      unsigned long t = 0;
      int parsed = sscanf(ptr, "%d,%d,%lu,%d", &esq, &dir, &t, &accel);
      if (parsed < 4) accel = 0;

      steps[parsedCount].motorEsq = esq;
      steps[parsedCount].motorDir = dir;
      steps[parsedCount].timeMs = t;
      steps[parsedCount].accelStep = accel;
      parsedCount++;

      ptr = strchr(ptr, ';');
    }

    if (parsedCount > 0) {
      strategy_load_custom_steps(parsedCount, steps);
      printString("STRAT_OK\n");
    }
  } else if (strcmp(cmd_buf, "STATUS") == 0) {
    printString("STATUS;PWM_BASE="); printNumero(PWM_BASE);
    printString(";PWM_MAX_DELTA="); printNumero(PWM_MAX_DELTA);
    printString(";BREAK_TIME_1="); printNumero(BREAK_TIME_1);
    printString(";BREAK_TIME_3="); printNumero(BREAK_TIME_3);
    printString(";TIME_BEFORE_MOVING="); printNumero(TIME_BEFORE_MOVING);
    printString(";VARIANCIA="); printNumero(VARIANCIA);
    printString(";ESTRATEGIA="); printNumero(ESTRATEGIA);
    printString("\n");
  } else if (strncmp(cmd_buf, "ESTRATEGIA_", 11) == 0) {
    char modo = cmd_buf[11];
    switch (modo) {
      case '0': printString("ESTRATEGIA_0\n"); ESTRATEGIA = 0; break;
      case 'A': printString("ESTRATEGIA_A\n"); ESTRATEGIA = 1; break;
      case 'B': printString("ESTRATEGIA_B\n"); ESTRATEGIA = 2; break;
      case 'C': printString("ESTRATEGIA_C\n"); ESTRATEGIA = 3; break;
      case 'D': printString("ESTRATEGIA_D\n"); ESTRATEGIA = 4; break;
      case 'E': printString("ESTRATEGIA_E\n"); ESTRATEGIA = 5; break;
      default: printString("ESTRATEGIA INVALIDA\n"); ESTRATEGIA = 0; break;
    }
  } else if (strncmp(cmd_buf, "PWM_MAX_DELTA = ", 16) == 0) {
    PWM_MAX_DELTA = atoi(cmd_buf + 16);
    printString("PWM_MAX_DELTA = "); printNumero(PWM_MAX_DELTA); printString("\n");
  } else if (strncmp(cmd_buf, "PWM_BASE = ", 11) == 0) {
    PWM_BASE = atoi(cmd_buf + 11);
    PWM_BASE_DESEJADO = PWM_BASE;
    printString("PWM_BASE = "); printNumero(PWM_BASE); printString("\n");
  } else if (strncmp(cmd_buf, "BREAK_TIME_1 = ", 15) == 0) {
    BREAK_TIME_1 = atoi(cmd_buf + 15);
    printString("BREAK_TIME_1 = "); printNumero(BREAK_TIME_1); printString("\n");
  } else if (strncmp(cmd_buf, "BREAK_TIME_3 = ", 15) == 0) {
    BREAK_TIME_3 = atoi(cmd_buf + 15);
    printString("BREAK_TIME_3 = "); printNumero(BREAK_TIME_3); printString("\n");
  } else if (strncmp(cmd_buf, "VARIANCIA = ", 12) == 0) {
    uint8_t modo = atoi(cmd_buf + 12);
    switch (modo) {
      case 0: VARIANCIA = 0; printString("VARIANCIA_0_OK\n"); break;
      case 1: VARIANCIA = 1; printString("VARIANCIA_1_OK\n"); break;
      case 2: VARIANCIA = 2; printString("VARIANCIA_2_OK\n"); break;
      default: printString("VARIANCIA_INVALIDA\n"); break;
    }
  } else if (strncmp(cmd_buf, "TIME_BEFORE_MOVING = ", 21) == 0) {
    TIME_BEFORE_MOVING = atoi(cmd_buf + 21);
    printString("TIME_BEFORE_MOVING = "); printNumero(TIME_BEFORE_MOVING); printString("\n");
  } else if (strcmp(cmd_buf, "END_OF_CONFIG") == 0) {
    UCSR0B &= ~(1 << RXCIE0);
    CONFIG_ENABLE = 0;
  }
}
