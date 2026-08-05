#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// DEFINIÇÕES

#define KP 300
#define KD 3000
#define alpha 0.85

#define MICROSTART PB4  // PCINT4 // D12
#define LED_READY PB5   // D13

#define SENSOR_LAT_DIR PC0                                                                                           // A0
#define SENSOR_CEN_DIR PC1                                                                                           // A1
#define SENSOR_CENTRAL PC2                                                                                           // A2
#define SENSOR_CEN_ESQ PC3                                                                                           // A3
#define SENSOR_LAT_ESQ PC4                                                                                           // A4
#define SENSOR_MASK ((1 << SENSOR_CEN_DIR) | (1 << SENSOR_CENTRAL) | (1 << SENSOR_CEN_ESQ) | (1 << SENSOR_LAT_ESQ))  // Right sensor (SENSOR_LAT_DIR) ignored due to instability

#define DIR_IN1 PD5  // D5
#define DIR_IN2 PD4  // D4
#define DIR_PWM PB2  // D10
#define ESQ_IN1 PD7  // D7
#define ESQ_IN2 PB0  // D8
#define ESQ_PWM PB1  // D9
#define STBY PD6     // D6

#define PWM_MAX 1599
#define PWM_DEADZONE 30

#define RX_BUF_SIZE 32   // buffer da UART
#define CMD_BUF_SIZE 32  // buffer da leitura de string

// VARIÁVEIS GLOBAIS CONTROLADAS POR BLUETOOTH
uint8_t PWM_MAX_DELTA = 4;           // Máximo valor que o PWM de velocidade pode variar durante a aceleração
uint16_t PWM_BASE = 1200;            // Valor base de PWM de velocidade no modo de busca
uint16_t BREAK_TIME_1 = 250;         // Tempo que o robô deve ficar no modo de freio quando os sensores estão em 00100
uint16_t BREAK_TIME_3 = 250;         // Tempo que o robô deve ficar no modo de freio quando os sensores estão em 01110
uint16_t TIME_BEFORE_MOVING = 2000;  // Tempo que o robô aguarda o ataque do oponente antes de se mover na arena.
uint8_t ALREADY_FLAG_ATTACK = 0;
// VARIÁVEIS GLOBAIS
uint8_t delay_1 = 70;
uint8_t delay_2 = 0;
uint8_t PWM_DIR = 0;


uint8_t ESTRATEGIA = 0;

uint8_t CONFIG_ENABLE = 1;

volatile uint8_t rx_buf[RX_BUF_SIZE];       // para o buffer da UART
volatile uint8_t rx_head = 0, rx_tail = 0;  // para o buffer da UART

char cmd_buf[CMD_BUF_SIZE];  // para a leitura de string armazenada no buffer da uart
uint8_t cmd_len = 0;         // para a leitura de string armazenada no buffer da uart
uint8_t cmd_ready = 0;       // para a leitura de string armazenada no buffer da uart

volatile uint8_t READY_FLAG = 1;      // indicador de que está pronto para receber o sinal de START do controle remoto
volatile uint8_t TIME_FLAG = 0;       // variável que indica que ocorreu uma entrada na ISR temporizada
volatile unsigned long int TIME = 0;  // variável que marca o tempo de batalha
unsigned int BREAK_COUNT = 0;         // marcador do tempo que o robô está no modo de freio

unsigned int PWM_BASE_ATUAL = 0;            // Valor atual do PWM de velocidade (diferente do valor base, pois PWM_MAX_DELTA não deixa a aceleração ocorrer de forma instantânea)
unsigned int PWM_BASE_DESEJADO = PWM_BASE;  // O PWM desejado por ser igual ao PWM_BASE ou nulo, no caso de uma situação e freio


uint8_t VARIANCIA = 0;
uint8_t IS_FLAG = 1;
// LUT de 4 bits. Após >> 1 a disposição dos bits fica:
//   bit3 = LE (Lateral Esquerda, PC4)
//   bit2 = CE (Centro-Esquerda, PC3)   ← sensor LENTO
//   bit1 = C  (Central, PC2)
//   bit0 = CD (Centro-Direita, PC1)    ← sensor LENTO
//
// Convenção de sinal:
//   ERRO negativo → alvo à ESQUERDA → girar à esquerda
//   ERRO positivo → alvo à DIREITA  → girar à direita
//   10 = valor especial (alvo perdido / padrão ambíguo)
//
// CE e CD são mais lentos, então seus erros são MENORES (±1)
// para evitar overshoot causado pela latência desses sensores.
const int8_t ERRO_LUT_4[16] = {
  /* 0000  Nenhum sensor        */ 10,
  /* 0001  CD                   */ 1,   // lento → correção suave à direita
  /* 0010  C                    */ 0,   // alvo à frente e longe → reto
  /* 0011  C + CD               */ 1,   // alvo levemente à direita
  /* 0100  CE                   */ -1,  // lento → correção suave à esquerda
  /* 0101  CE + CD              */ 10,  // ambíguo (lados opostos sem centro)
  /* 0110  CE + C               */ -1,  // alvo levemente à esquerda
  /* 0111  CE + C + CD          */ 0,   // alvo centralizado (3 sensores) → reto
  /* 1000  LE                   */ -3,  // alvo à esquerda → correção moderada
  /* 1001  LE + CD              */ 10,  // ambíguo (extremos sem centro)
  /* 1010  LE + C               */ -2,  // alvo esquerda-centro
  /* 1011  LE + C + CD          */ -1,  // alvo amplo, leve viés esquerda
  /* 1100  LE + CE              */ -3,  // alvo claramente à esquerda
  /* 1101  LE + CE + CD         */ 10,  // ambíguo
  /* 1110  LE + CE + C          */ -1,  // alvo esquerda mas quase centrado
  /* 1111  Todos                */ 0,   // muito perto, todos ativados → reto
};

uint8_t CODIGO_ERRO = 0;
int8_t ERRO = 0;
int8_t ERRO_ANTIGO = 0;
int derivativo = 0;

int DELTA_SPEED = 0;  // Valor do PWM a ser somado/subtraído de cada motor para efeito de alinhamento com o alvo

volatile uint8_t MANUAL_MODE = 0;  // Modo de controle manual ativo
volatile int manual_left = 0;
volatile int manual_right = 0;

// CONFIGURA A ISR DO MICROSTART (MUDANÇA DE ESTADO)

void MICROSTART_ISR_CONFIG(void) {
  PCICR |= (1 << PCIE0);
  PCMSK0 |= (1 << MICROSTART);
}

// ISR DO MICROSTART

ISR(PCINT0_vect) {
  if (MANUAL_MODE) return;  // Ignora os botões do controle remoto/start físico no modo manual

  if ((PINB & (1 << MICROSTART)) == 0) {  // STOP
    PORTD &= ~(1 << STBY);                // AQUI DESABILITA O STANDBY DOS MOTORES
    SET_MOTORS(0, 0);
    cli();  // DESABILITA TODAS AS INTERRUPÇÕES
  } else {  // START
    READY_FLAG = 0;
    PORTB &= ~(1 << LED_READY);
    PORTD |= (1 << STBY);  // AQUI HABILITA O STANDBY DOS MOTORES

    TIMSK2 = (1 << OCIE2A);  // habilita interrupção temporizada a cada 1 ms (outros parâmetros já foram configurados)
  }
}

// CONFIGURAÇÃO DOS MOTORES

void MOTORS_CONFIG(void) {
  DDRB |= ((1 << ESQ_IN2) | (1 << ESQ_PWM) | (1 << DIR_PWM));
  DDRD |= ((1 << DIR_IN1) | (1 << DIR_IN2) | (1 << STBY) | (1 << ESQ_IN1));

  // FAST PWM COM TOPO EM ICR1
  // MODO NÃO INVERTIDO
  // PRESCALE = 1
  // f_pwm = 10 kHz
  TCCR1A = ((1 << COM1A1) | (1 << COM1B1) | (1 << WGM11));
  TCCR1B = ((1 << WGM13) | (1 << WGM12) | (1 << CS10));
  ICR1 = 1599;  // 10 kHz

  OCR1A = 0;  // Motor da Esquerda
  OCR1B = 0;  // Motor da Direita
}

// AJUSTE DE POTÊNCIA DOS MOTORES

void SET_MOTORS(int PWM_ESQ, int PWM_DIR) {
  if (abs(PWM_ESQ) < PWM_DEADZONE) {
    OCR1A = 0;
    PORTD &= ~(1 << ESQ_IN1);
    PORTB &= ~(1 << ESQ_IN2);
  } else if (PWM_ESQ > 0) {
    if (PWM_ESQ > PWM_MAX)
      PWM_ESQ = PWM_MAX;
    OCR1A = PWM_ESQ;
    PORTD &= ~(1 << ESQ_IN1);
    PORTB |= (1 << ESQ_IN2);
  } else {
    if (PWM_ESQ < -PWM_MAX)
      PWM_ESQ = -PWM_MAX;
    OCR1A = -PWM_ESQ;
    PORTD |= (1 << ESQ_IN1);
    PORTB &= ~(1 << ESQ_IN2);
  }

  if (abs(PWM_DIR) < PWM_DEADZONE) {
    OCR1B = 0;
    PORTD &= ~(1 << DIR_IN1);
    PORTD &= ~(1 << DIR_IN2);
  } else if (PWM_DIR > 0) {
    if (PWM_DIR > PWM_MAX)
      PWM_DIR = PWM_MAX;
    OCR1B = PWM_DIR;
    PORTD &= ~(1 << DIR_IN1);
    PORTD |= (1 << DIR_IN2);
  } else {
    if (PWM_DIR < -PWM_MAX)
      PWM_DIR = -PWM_MAX;
    OCR1B = -PWM_DIR;
    PORTD |= (1 << DIR_IN1);
    PORTD &= ~(1 << DIR_IN2);
  }
}

// RAMPA DE ACELERACAO

int RAMP_DELTA(int atual, int alvo) {
  int delta = alvo - atual;

  if (delta > PWM_MAX_DELTA) delta = PWM_MAX_DELTA;
  if (delta < -PWM_MAX_DELTA) delta = -PWM_MAX_DELTA;

  return atual + delta;
}

// CONFIGURAÇÃO DA ISR TEMPORIZADA

void TEMPORIZADOR_ISR_CONFIG(void) {
  // CTC mode
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22);  // prescaler = 64

  OCR2A = 249;  // 1 ms
  //TIMSK2 = (1 << OCIE2A);  // habilita interrupção temporizada a cada 1 ms
  // vai ser habilitada somente após o START
}

// ISR TEMPORIZADA

ISR(TIMER2_COMPA_vect) {
  TIME_FLAG = 1;
}

// CONFIGURACAÇÃO DA UART COM ISR EM RX

void init_UART_ISR(void) {
  UCSR0A |= (1 << U2X0);  // ("Double the USART Transmission Speed. This bit only has effect for the asynchronous operation.")

  // Configurando o BAUD em 115200 no modo Double Speed
  UBRR0H = 0b00000000;
  UBRR0L = 0b00010000;

  /* Enable USART transmitter/receiver */
  UCSR0B = (1 << TXEN0) | (1 << RXEN0);

  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00); /* 8 data bits, 1 stop bit */

  UCSR0B |= (1 << RXCIE0);  //Habilita ISR ao receber 1 byte pela UART
}

// ISR DA UART

ISR(USART_RX_vect) {
  uint8_t next = (rx_head + 1) % RX_BUF_SIZE;
  if (next != rx_tail) {  // evita overflow
    rx_buf[rx_head] = UDR0;
    rx_head = next;
  }
}

// FUNÇÃO PARA AVALIAR SE EXISTEM DADOS DISPONÍVEIS NA UART

uint8_t uart_available(void) {
  return (rx_head != rx_tail);
}

// FUNÇÃO PARA LER DADOS DA UART

uint8_t uart_read(void) {
  uint8_t data = 0;

  if (rx_head != rx_tail) {
    data = rx_buf[rx_tail];
    rx_tail = (rx_tail + 1) % RX_BUF_SIZE;
  }

  return data;
}

// Função para enviar STRING pela UART

void printString(const char myString[]) {
  uint8_t i = 0;
  while (myString[i]) {
    transmitByte(myString[i]);
    i++;
  }
}

// FUNÇÃO PARA PROCESSAMENTO DOS DADOS DA UART

void uart_process(void) {
  while (uart_available()) {
    char c = uart_read();

    if (c == '\r') continue;  // Ignora Carriage Return (\r)

    if (c == '\n') {
      cmd_buf[cmd_len] = '\0';  // finaliza string
      cmd_ready = 1;
      cmd_len = 0;
      return;
    }

    if (cmd_len < CMD_BUF_SIZE - 1) {
      cmd_buf[cmd_len++] = c;
    } else {
      // overflow → descarta comando
      cmd_len = 0;
    }
  }
}

// FUNÇÃO PARA ENVIAR NÚMERO PELA UART

void printNumero(uint16_t word) {
  uint8_t started = 0;

  if (word / 10000) {
    transmitByte('0' + (word / 10000));
    started = 1;
  }
  if (started || (word / 1000) % 10) {
    transmitByte('0' + ((word / 1000) % 10));
    started = 1;
  }
  if (started || (word / 100) % 10) {
    transmitByte('0' + ((word / 100) % 10));
    started = 1;
  }
  if (started || (word / 10) % 10) {
    transmitByte('0' + ((word / 10) % 10));
    started = 1;
  }

  transmitByte('0' + (word % 10));
}

// FUNÇÃO PARA ENVIAR 1 BYTE PELA UART

void transmitByte(uint8_t data) {
  /* Wait for empty transmit buffer */
  loop_until_bit_is_set(UCSR0A, UDRE0);
  UDR0 = data; /* send data */
}

// FUNÇÃO PARA CONFIGURAR O ROBO POR BLUETTOH

void config(void) {
  uart_process();
  if (cmd_ready) {
    cmd_ready = 0;

    if (strcmp(cmd_buf, "SENSORES") == 0) {
      printString("TEL;");
      printNumero(CODIGO_ERRO);
      printString(";");
      if (MANUAL_MODE) {
        if (manual_left < 0) {
          transmitByte('-');
          printNumero(-manual_left);
        } else {
          printNumero(manual_left);
        }
        printString(";");
        if (manual_right < 0) {
          transmitByte('-');
          printNumero(-manual_right);
        } else {
          printNumero(manual_right);
        }
      } else {
        printNumero(PWM_BASE_ATUAL);
        printString(";");
        if (DELTA_SPEED < 0) {
          transmitByte('-');
          printNumero(-DELTA_SPEED);
        } else {
          printNumero(DELTA_SPEED);
        }
      }
      printString("\n");
    } else if (strcmp(cmd_buf, "MANUAL_ON") == 0) {
      MANUAL_MODE = 1;
      manual_left = 0;
      manual_right = 0;
      PORTD |= (1 << STBY);        // HABILITA A PONTE H (SAI DO STANDBY)
      PORTB &= ~(1 << LED_READY);  // Desliga o LED indicando que saiu do modo pronto
      printString("MANUAL_ON_OK\n");
    } else if (strcmp(cmd_buf, "MANUAL_OFF") == 0) {
      MANUAL_MODE = 0;
      manual_left = 0;
      manual_right = 0;
      SET_MOTORS(0, 0);
      PORTD &= ~(1 << STBY);      // DESABILITA A PONTE H (VOLTA PRO STANDBY)
      PORTB |= (1 << LED_READY);  // Acende o LED_READY de prontidão
      printString("MANUAL_OFF_OK\n");
    } else if (strncmp(cmd_buf, "M,", 2) == 0) {
      if (MANUAL_MODE) {
        int left_val = 0;
        int right_val = 0;
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

        // Retorna a telemetria atualizada para atualização instantânea na tela manual do App
        printString("TEL;");
        printNumero(CODIGO_ERRO);
        printString(";");
        if (left_val < 0) {
          transmitByte('-');
          printNumero(-left_val);
        } else {
          printNumero(left_val);
        }
        printString(";");
        if (right_val < 0) {
          transmitByte('-');
          printNumero(-right_val);
        } else {
          printNumero(right_val);
        }
        printString("\n");
      }
    } else if (strcmp(cmd_buf, "STATUS") == 0) {
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
    } else if (strncmp(cmd_buf, "ESTRATEGIA_", 11) == 0) {
      char modo = cmd_buf[11];

      switch (modo) {
        case '0':
          printString("ESTRATEGIA_0\n");
          ESTRATEGIA = 0;
          break;
        case 'A':
          printString("ESTRATEGIA_A\n");
          ESTRATEGIA = 1;
          break;
        case 'B':
          printString("ESTRATEGIA_B\n");
          ESTRATEGIA = 2;
          break;
        case 'C':
          printString("ESTRATEGIA_C\n");
          ESTRATEGIA = 3;
          break;
        case 'D':
          printString("ESTRATEGIA_D\n");
          ESTRATEGIA = 4;
          break;
        case 'E':
          printString("ESTRATEGIA_E\n");
          ESTRATEGIA = 5;
          break;
        default:
          printString("ESTRATEGIA INVALIDA\n");
          ESTRATEGIA = 0;
          break;
      }
    } else if (strncmp(cmd_buf, "PWM_MAX_DELTA = ", 16) == 0) {
      PWM_MAX_DELTA = atoi(cmd_buf + 16);
      printString("PWM_MAX_DELTA = ");
      printNumero(PWM_MAX_DELTA);
      printString("\n");
    } else if (strncmp(cmd_buf, "PWM_BASE = ", 11) == 0) {
      PWM_BASE = atoi(cmd_buf + 11);
      printString("PWM_BASE = ");
      printNumero(PWM_BASE);
      printString("\n");
    } else if (strncmp(cmd_buf, "BREAK_TIME_1 = ", 15) == 0) {
      BREAK_TIME_1 = atoi(cmd_buf + 15);
      printString("BREAK_TIME_1 = ");
      printNumero(BREAK_TIME_1);
      printString("\n");
    } else if (strncmp(cmd_buf, "BREAK_TIME_3 = ", 15) == 0) {
      BREAK_TIME_3 = atoi(cmd_buf + 15);
      printString("BREAK_TIME_3 = ");
      printNumero(BREAK_TIME_3);
      printString("\n");
    } else if (strncmp(cmd_buf, "VARIANCIA = ", 12) == 0) {
      uint8_t modo = atoi(cmd_buf + 12);

      switch (modo) {
        case 0:  // Curto
          VARIANCIA = 0;
          printString("VARIANCIA_0_OK\n");
          break;
        case 1:  // Medio
          VARIANCIA = 1;
          printString("VARIANCIA_1_OK\n");
          break;
        case 2:  // Fundo
          VARIANCIA = 2;
          printString("VARIANCIA_2_OK\n");
          break;
        default:
          printString("VARIANCIA_INVALIDA\n");
          break;
      }
    } else if (strncmp(cmd_buf, "TIME_BEFORE_MOVING = ", 21) == 0) {
      TIME_BEFORE_MOVING = atoi(cmd_buf + 21);
      printString("TIME_BEFORE_MOVING = ");
      printNumero(TIME_BEFORE_MOVING);
      printString("\n");
    } else if (strcmp(cmd_buf, "END_OF_CONFIG") == 0) {
      UCSR0B &= ~(1 << RXCIE0);  //Desabilita ISR ao receber 1 byte pela UART
      CONFIG_ENABLE = 0;
    }
  }
}
void stop(int test) {
  _delay_ms(test);
  SET_MOTORS(0, 0);
  _delay_ms(10000000000000);
}
// FUNÇÃO PARA EXECUTAR AS ESTRATEGIAS
int giro_eixo_time = 75;
void EXECUTA_ESTRATEGIA(int EST) {

  if (EST == 0) {
    // Sem estratégia
  }

  else if (EST == 1) {
    // ESTRATÉGIA A PARAMETRIZADA CONFORME VARIANCIA
    // Gira à DIREITA (sensor ativo é o da ESQUERDA)

    if (VARIANCIA == 0) {       // CURTO
      SET_MOTORS(1599, -1599);  // giro à direita
      _delay_ms(100 + giro_eixo_time);
      SET_MOTORS(450, 1599);  // curva à esquerda (saída para a esquerda)
      _delay_ms(550 + giro_eixo_time);
    }

    else if (VARIANCIA == 1) {  // MÉDIO
      SET_MOTORS(1599, -1599);  // giro à direita
      _delay_ms(80 + giro_eixo_time);
      SET_MOTORS(600, 1599);  // curva suave à esquerda
      _delay_ms(500);
      SET_MOTORS(800, 1599);  // curva suave à esquerda
      _delay_ms(500);
    }

    else if (VARIANCIA == 2) {  // FUNDO
      SET_MOTORS(1599, -1599);  // giro à direita
      _delay_ms(100 + giro_eixo_time);
      SET_MOTORS(700, 1599);  // curva suave à esquerda
      _delay_ms(740);
      // SET_MOTORS(800, 1599);  // curva suave à esquerda
      // _delay_ms(400);
    }
  }

  else if (EST == 2) {
    // Gira à DIREITA (sensor ativo é o da ESQUERDA)

    SET_MOTORS(1100, -1100);  // giro parado à direita
    _delay_ms(48 + giro_eixo_time);
    SET_MOTORS(1500, 1500);  // anda reto
    _delay_ms(260);
    SET_MOTORS(200, 1400);  // diagonal (viés à esquerda na saída)
    _delay_ms(230);
    SET_MOTORS(1500, 1500);
    _delay_ms(300);
  }

  else if (EST == 3) {
    // Estratégia C — Parada - Contra robô muito agressivo
    SET_MOTORS(0, 0);
    _delay_ms(400);

    SET_MOTORS(1599, 1599);
    _delay_ms(160);
  }

  else if (EST == 4) {
    // Estratégia D Anda pra frente, para, anda de novo

    SET_MOTORS(1599, 1599);
    _delay_ms(180);

    SET_MOTORS(0, 0);
    _delay_ms(400);

    SET_MOTORS(1599, 1599);
    _delay_ms(160);

    SET_MOTORS(0, 0);
  }
}

// MAIN

int main(void) {
  init_UART_ISR();  // habilita também a ISR
  printString("RESET\n");

  MOTORS_CONFIG();  // Configura os pinos e os PWMs dos Motores

  MICROSTART_ISR_CONFIG();    // CONFIGURA A ISR DO MICROSTART (MUDANÇA DE ESTADO)
  TEMPORIZADOR_ISR_CONFIG();  // CONFIGURAÇÃO DA ISR TEMPORIZADA

  sei();  // Habilita todas ISRs

  DDRB |= (1 << LED_READY);
  PORTB |= (1 << LED_READY);              // Indica que o microcontrolador está pronto para
                                          // receber o sinal de START (botão 2) do controle remoto
  while (READY_FLAG) {                    // Aguarda o botão 2 (sinal de START) ser pressionado para entrar no loop.
    CODIGO_ERRO = PINC & SENSOR_MASK;     // valor cru para telemetria
    ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];  // >> 1 para indexar 0-15
    ERRO_ANTIGO = ERRO;

    if (CONFIG_ENABLE)
      config();
  }

  EXECUTA_ESTRATEGIA(ESTRATEGIA);
  while (1) {
    if (TIME_FLAG) {
      TIME_FLAG = 0;
      TIME++;

      CODIGO_ERRO = PINC & SENSOR_MASK;     // valor cru para telemetria
      ERRO = ERRO_LUT_4[CODIGO_ERRO >> 1];  // >> 1 para indexar 0-15

      if (ERRO == 10) {  // 10 indica alvo perdido ou padrão ambíguo
        PWM_BASE_ATUAL = 0;
        if (ERRO_ANTIGO >= 0) {  // continua girando na última direção conhecida
          ERRO = 3;
          DELTA_SPEED = 400;
        } else {
          ERRO = -3;
          DELTA_SPEED = -400;
        }
      } else {  // se os sensores estiverem com configuração válida
        if ((abs(ERRO) >= 3) && !ALREADY_FLAG_ATTACK && IS_FLAG) {

          int direcao = ERRO / abs(ERRO);

          // Ré controlada
          SET_MOTORS(-800, -800);
          _delay_ms(100);

          // Giro mais suave
          SET_MOTORS(1000 * direcao, -1000 * direcao);
          _delay_ms(35);

          // Assentar
          SET_MOTORS(0, 0);
          _delay_ms(20);

          // Avanço progressivo
          for (int i = 0; i < 80; i++) {
            int pwm = i * 12;
            SET_MOTORS(pwm, pwm);
            _delay_ms(1);
          }

          ALREADY_FLAG_ATTACK = 1;
          continue;
        }
        derivativo = alpha * derivativo + (1 - alpha) * KD * (ERRO - ERRO_ANTIGO);
        DELTA_SPEED = KP * ERRO + derivativo;

        // LÓGICA DE FREIO AO SE APROXIMAR DO INIMIGO
        if (CODIGO_ERRO == (1 << SENSOR_CENTRAL)) {  // Apenas sensor Central ativo (PC2) → freio
          BREAK_COUNT++;
          if (BREAK_COUNT <= BREAK_TIME_1) {
            PWM_BASE_ATUAL = 0;
          } else {
            PWM_BASE_ATUAL = RAMP_DELTA(PWM_BASE_ATUAL, 1599);  // Modo de ataque
          }
        } else {
          BREAK_COUNT = 0;
          PWM_BASE_ATUAL = RAMP_DELTA(PWM_BASE_ATUAL, PWM_BASE_DESEJADO);  // Modo de busca
        }
      }
    }
    ERRO_ANTIGO = ERRO;

    if (TIME < TIME_BEFORE_MOVING) {  // no início da batalha não ataca, só alinha
      SET_MOTORS(DELTA_SPEED, -DELTA_SPEED);
    } else {
      SET_MOTORS(PWM_BASE_ATUAL + DELTA_SPEED, PWM_BASE_ATUAL - DELTA_SPEED);
    }
  }
}
