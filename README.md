# Sumô Control

App de controle e configuração de robô de sumô, em React Native / Expo 54, com firmware Arduino/AVR no mesmo repositório.

## Usar a interface

- **Início:** conectar um dispositivo Bluetooth pareado, acessar os atalhos e abrir a demonstração.
- **Controle:** ativar o modo manual, escolher a potência e pilotar com joystick ou direcionais. Segure para mover e solte para parar. O botão fixo **Parar e desativar** bloqueia novos movimentos até a reativação.
- **Estratégias:** selecionar a abertura, ajustar a variação, conferir as etapas e aplicar. Sequências personalizadas têm até 10 etapas; o botão **Executar** envia a sequência para execução imediata.
- **Ajustes:** consultar sensores, ajustar potência, aceleração e tempos. O envio aguarda a resposta correspondente do robô.
- **Editor:** adicionar movimentos calibrados com um toque, reordenar etapas e editar potência/duração. Ajustes individuais de uma etapa ficam independentes da calibração dos presets.

No controle, o ícone de opções revela ajuste fino de potência, valores solicitados aos motores e resposta tátil. O botão de expandir abre a apresentação em tela cheia, com menos detalhes. A parada fica fixa mesmo quando o conteúdo precisa rolar em telas pequenas ou na horizontal.

A navegação respeita a área inferior reservada pelo sistema. Controles têm rótulos de acessibilidade e estados selecionados. A resposta tátil usa a vibração do dispositivo; intensidade e disponibilidade dependem do aparelho.

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run android
```

A conexão real usa `react-native-bluetooth-classic` e requer o app com o módulo nativo, via build de desenvolvimento ou APK. Pareie o robô nas configurações do Android e use **Buscar dispositivos**. O Expo Go não inclui esse módulo.

Para gerar e usar o cliente nativo de desenvolvimento Android:

```sh
bun run build:development
bun run start:development
```

Instale o APK gerado pelo EAS no celular e abra o projeto pelo QR code do Metro. O perfil `development` usa o ambiente `development`, distribuição interna e inclui os módulos nativos de Bluetooth e o cliente de desenvolvimento do Expo.

Em **Início**, **Experimentar demonstração** permite apresentar os controles no próprio app sem conectar um robô. O cabeçalho mostra **DEMO** e as respostas/sensores são simulados. Essa sessão não envia comandos Bluetooth.

```sh
bun run typecheck
bun test
bun run lint
npx expo export --platform android --output-dir /tmp/sumo-android-export
```

Os testes cobrem mistura dos motores no joystick, zona morta, limites, confirmação de ativação, potência atualizada, cancelamento de movimentos pendentes, desativação durante ativação, falhas de escrita e limites dos comandos de estratégias.

## Comunicação e firmware

O controle aguarda `MANUAL_ON_OK` antes de liberar os gestos. Ao sair da tela ou colocar o app em segundo plano, tenta enviar parada e `MANUAL_OFF`. Movimentos são agrupados em intervalos de 60 ms; comandos que ficaram obsoletos são descartados antes do envio. A parada cancela movimentos pendentes.

Essas paradas dependem da conexão. Não foi acrescentado um watchdog ao firmware: o tratamento de perda física do link continua sendo uma responsabilidade do robô.

- `robo/`: firmware básico.
- `robo-with-manual/`: variante com modo manual.
- `robo-estrategias-v2/`: versões modular e de arquivo único, com movimentos e estratégias personalizadas.
- `test-motors.ino`: sketch de teste de motores.
