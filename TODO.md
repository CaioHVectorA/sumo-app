# TODO.md - Roadmap de Melhorias & Estudo de Robótica

Este documento descreve as próximas especificações técnicas, estudos de desempenho de microcontroladores e melhorias de interface para o aplicativo **Sumô App** e firmware **Arduino (ATmega328P)**.

---

## 1. Coeficiente de Ângulo e Calibração de Curvas (Razão de PWM)

- [ ] **Indicador de Razão de Potência ($R = \frac{PWM_{Esq}}{PWM_{Dir}}$)**:
  - Adicionar o cálculo e exibição em tempo real do coeficiente da curva:
    - $R = 1.0$: Linha reta perfeita.
    - $R > 1.0$ (ou $R < -1.0$): Curva fechada / giro rápido em torno do eixo.
    - $0.3 < R < 0.8$: Curva suave / aberta de flanqueamento.
- [ ] **Controle Intuitivo de Ângulo de Curva**:
  - Slider/Seletor visual de "Abertura da Curva" que ajusta a proporção entre os motores em vez de exigir a digitação manual de dois valores soltos de PWM.
  - Classificação visual: *Giro Fechado*, *Curva Média*, *Curva Aberta / Fuga*.

---

## 2. Estudo do Impacto das Interrupções Bluetooth no Desempenho em Batalha

- [ ] **Análise de Overhead da ISR UART (`USART_RX_vect`) no ATmega328P**:
  - **Problema**: O microcontrolador opera a 16 MHz. Interrupções seriais a 115200 Baud disparam a cada ~86 µs durante a recepção de dados, o que pode causar *jitter* ou pequenos atrasos no ciclo temporizado de 1 ms do Timer 2 (malha PID).
  - **Solução Recomendada**:
    - Durante o estado de prontidão/calibração: Manter a ISR habilitada (`UCSR0B |= (1 << RXCIE0)`).
    - **No momento do START da batalha / `END_OF_CONFIG`**: Desabilitar a recepção serial (`UCSR0B &= ~(1 << RXCIE0)`). Isso garante 100% da capacidade do processador dedicada ao loop PID e cálculo de sensores durante a luta contra o oponente.
- [ ] **Medição de Jitter**:
  - Documentar os tempos de execução do loop principal com e sem tráfego Bluetooth.

---

## 3. Robustez da Conexão e Gerenciamento do Estado Manual

- [ ] **Trava de Segurança no Modo Manual (`MANUAL_ON` / `MANUAL_OFF`)**:
  - Garantir tratamento visual do estado no aplicativo para impedir comandos manuais quando o modo manual estiver inativo no firmware.
  - Implementar *heartbeat* ou reconexão transparente sem perda do estado ativo do robô.
- [ ] **Proteção de Desconexão Abrupta**:
  - Se a conexão Bluetooth for perdida durante o modo manual, o robô deve entrar automaticamente em emergência (motores `0, 0` e Standby `PD6` desativado).

---

## 4. Robustez na Montagem e Teste de Estratégias (UI Simples & Intuitiva)

- [ ] **Simplicidade na Interface de Criação**:
  - Simplificar o fluxo de montagem de passos (`StrategyStep[]`) reduzindo a quantidade de cliques.
  - Confirmação imediata e feedback tátil (Vibration) ao enviar comandos de teste (`TEST_STEP` e `RUN_STRAT`).
- [ ] **Validação de Limites de Execução**:
  - Impedir criação de estratégias com mais de 10 passos (limite do buffer da RAM do Arduino).
  - Validar valores de tempo de execução para evitar tempos mortos ou travamentos durante a partida.

---

## 5. Passos Customizados e Canvas Mínimo de Desenho

- [ ] **Canvas Mínimo de Trajetória / Desenho Visual (2D)**:
  - Adicionar um pequeno canvas interativo (SVG/Canvas em React Native) que desenha visualmente o caminho estimado do robô com base na sequência de passos (ex: linha reta, giro de 90°, curva aberta).
- [ ] **Criador de Passos Personalizados**:
  - Permitir salvar qualquer combinação customizada de Motor Esquerdo, Motor Direito e Tempo como um novo "Preset do Usuário", além dos presets padrão de fábrica.

---

*Arquivo criado para acompanhamento das próximas fases de desenvolvimento.*
