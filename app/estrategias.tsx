import React, { useState, useRef } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Container } from '@/components/Container';
import { send, onData } from '@/src/services/bluetooth';
import { useRobot } from '@/src/hooks/useRobot';

type StrategyOption = {
  id: string; // '0', 'A', 'B', 'C', 'D', 'E'
  numId: number;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  description: string;
  hasVariancia?: boolean;
};

const STRATEGIES: StrategyOption[] = [
  {
    id: '0',
    numId: 0,
    title: 'Estratégia 0',
    subtitle: 'Nenhuma / Padrão (Sem Movimento Inicial)',
    badge: 'Direto na Busca',
    badgeColor: 'bg-slate-600',
    description: 'Sem movimento inicial pré-programado. O robô entra imediatamente no ciclo de alinhamento PID e busca pelos sensores na arena.',
  },
  {
    id: 'A',
    numId: 1,
    title: 'Estratégia A',
    subtitle: 'Giro de Eixo + Curva de Fuga e Ataque',
    badge: 'Parametrizável por Variância',
    badgeColor: 'bg-amber-600',
    description: 'Gira no próprio eixo à DIREITA (sensor lateral esquerdo ativo) e engata uma curva acelerada para contornar ou flanquear o oponente conforme a distância (Variância).',
    hasVariancia: true,
  },
  {
    id: 'B',
    numId: 2,
    title: 'Estratégia B',
    subtitle: 'Giro Curto à Direita + Avanço Diagonal Sequencial',
    badge: 'Flanqueamento Rápido',
    badgeColor: 'bg-indigo-600',
    description: 'Giro rápido de 48ms à DIREITA, avança reto por 120ms, faz uma curva diagonal fechada e acelera em linha reta por 500ms.',
  },
  {
    id: 'C',
    numId: 3,
    title: 'Estratégia C',
    subtitle: 'Estratégia Parada (Contra Robô Agressivo)',
    badge: 'Defesa & Esquiva',
    badgeColor: 'bg-rose-600',
    description: 'Permanece imóvel por 400ms esperando o oponente passar/atacar em falso, e em seguida arranca com potência máxima (100%).',
  },
  {
    id: 'D',
    numId: 4,
    title: 'Estratégia D',
    subtitle: 'Passo e Espera (Arranca - Para - Arranca)',
    badge: 'Enganação de Leitura',
    badgeColor: 'bg-emerald-600',
    description: 'Dá um impulso inicial reto (180ms), para bruscamente por 400ms para desestabilizar a leitura do adversário, e faz um novo avanço.',
  },
  {
    id: 'E',
    numId: 5,
    title: 'Estratégia E',
    subtitle: 'Modo Reservado / Customizado',
    badge: 'Em Desenvolvimento',
    badgeColor: 'bg-zinc-600',
    description: 'Slot de estratégia reservado no firmware Arduino para futuras expansões e rotinas personalizadas.',
  },
];

type MovementStep = {
  step: number;
  motorEsq: number;
  motorDir: number;
  timeMs: number;
  action: string;
};

const MOVEMENT_DETAILS: Record<string, Record<number, MovementStep[]>> = {
  '0': {
    0: [{ step: 1, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Entrada direta na busca por sensores' }],
  },
  A: {
    0: [
      { step: 1, motorEsq: 1599, motorDir: -1599, timeMs: 100, action: 'Giro rápido no próprio eixo à DIREITA' },
      { step: 2, motorEsq: 300, motorDir: 1599, timeMs: 550, action: 'Curva aberta acelerada para a esquerda' },
    ],
    1: [
      { step: 1, motorEsq: 1599, motorDir: -1599, timeMs: 70, action: 'Giro médio no próprio eixo à DIREITA' },
      { step: 2, motorEsq: 700, motorDir: 1599, timeMs: 400, action: 'Curva suave para a esquerda' },
    ],
    2: [
      { step: 1, motorEsq: 1599, motorDir: -1599, timeMs: 70, action: 'Giro no próprio eixo à DIREITA' },
      { step: 2, motorEsq: 850, motorDir: 1599, timeMs: 580, action: 'Avanço longo com viés à esquerda (fundo da arena)' },
    ],
  },
  B: {
    0: [
      { step: 1, motorEsq: 1100, motorDir: -1100, timeMs: 48, action: 'Giro no próprio eixo à DIREITA' },
      { step: 2, motorEsq: 1500, motorDir: 1500, timeMs: 120, action: 'Avanço reto rápido' },
      { step: 3, motorEsq: 200, motorDir: 1400, timeMs: 182, action: 'Curva diagonal fechada à esquerda' },
      { step: 4, motorEsq: 1500, motorDir: 1500, timeMs: 500, action: 'Sprint final em linha reta' },
    ],
  },
  C: {
    0: [
      { step: 1, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Imóvel aguardando investida do oponente' },
      { step: 2, motorEsq: 1599, motorDir: 1599, timeMs: 160, action: 'Contra-ataque com 100% de potência' },
    ],
  },
  D: {
    0: [
      { step: 1, motorEsq: 1599, motorDir: 1599, timeMs: 180, action: 'Impulso inicial reto para frente' },
      { step: 2, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Pausa / Parada completa no lugar' },
      { step: 3, motorEsq: 1599, motorDir: 1599, timeMs: 160, action: 'Segundo avanço com potência total' },
      { step: 4, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Parada dos motores para início do loop PID' },
    ],
  },
  E: {
    0: [{ step: 1, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Sem rotina programada no firmware' }],
  },
};

const VARIANCIA_LABELS = [
  { value: 0, label: 'Curto', desc: 'Giro 100ms + Curva Rápida (1599/300, 550ms)' },
  { value: 1, label: 'Médio', desc: 'Giro 70ms + Curva Média (1599/700, 400ms)' },
  { value: 2, label: 'Fundo', desc: 'Giro 70ms + Avanço Longo (1599/850, 580ms)' },
];

// Tempo máximo de espera pela confirmação do Arduino (ms)
const CONFIRM_TIMEOUT_MS = 5000;

export default function EstrategiasScreen() {
  const [selectedStrat, setSelectedStrat] = useState<string>('A');
  const [selectedVariancia, setSelectedVariancia] = useState<number>(1); // 0, 1, 2
  // 'idle' | 'sending' | 'waiting' | 'success' | 'error'
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'waiting' | 'success' | 'error'>('idle');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status } = useRobot();

  const handleSelectStrategy = (id: string) => {
    setSelectedStrat(id);
  };

  const handleApplyStrategy = async () => {
    setSendState('sending');
    setFeedbackMsg(null);

    try {
      // Envia o comando de estratégia (ex: ESTRATEGIA_A)
      await send(`ESTRATEGIA_${selectedStrat}`);

      // Muda para estado de espera pela confirmação do Arduino
      setSendState('waiting');

      // Constrói a lista de confirmações esperadas
      // O Arduino responde "ESTRATEGIA_X" (maiúsculo) após receber o comando
      const expectedStratConfirm = `ESTRATEGIA_${selectedStrat}`;
      // Se for A, também aguarda confirmação da VARIANCIA
      const expectVariancia = selectedStrat === 'A';
      let stratConfirmed = false;
      let varConfirmed = !expectVariancia; // se não for A, já está confirmado

      // Registra listener temporário
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        unsubscribe?.();
      };

      await new Promise<void>((resolve, reject) => {
        // Timeout de segurança
        timeoutRef.current = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout: Arduino não confirmou em 5 segundos'));
        }, CONFIRM_TIMEOUT_MS);

        unsubscribe = onData((line) => {
          // Confirmação da estratégia
          if (!stratConfirmed && line === expectedStratConfirm) {
            stratConfirmed = true;
            // Se era A, agora envia a variância
            if (expectVariancia) {
              send(`VARIANCIA = ${selectedVariancia}`).catch(() => {});
            }
          }

          // Confirmação da variância (ex: "VARIANCIA_1_OK")
          if (!varConfirmed && line.startsWith('VARIANCIA_') && line.endsWith('_OK')) {
            varConfirmed = true;
          }

          // Ambos confirmados → sucesso
          if (stratConfirmed && varConfirmed) {
            cleanup();
            resolve();
          }
        });
      });

      const varLabel = expectVariancia ? ` · Variância: ${VARIANCIA_LABELS[selectedVariancia].label}` : '';
      setFeedbackMsg(`✓ Estratégia ${selectedStrat}${varLabel} confirmada pelo robô!`);
      setSendState('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar estratégia';
      setFeedbackMsg(`✗ ${msg}`);
      setSendState('error');
    }
  };

  const isBusy = sendState === 'sending' || sendState === 'waiting';

  const buttonLabel =
    sendState === 'sending' ? 'Enviando ao robô...' :
    sendState === 'waiting' ? 'Aguardando confirmação...' :
    `Aplicar Estratégia ${selectedStrat}`;

  const activeStratObj = STRATEGIES.find((s) => s.id === selectedStrat) || STRATEGIES[1];
  const stepsList =
    MOVEMENT_DETAILS[selectedStrat]?.[selectedStrat === 'A' ? selectedVariancia : 0] || [];

  const robotActiveStrat = status?.ESTRATEGIA ?? 'Desconhecida';
  const robotActiveVar = status?.VARIANCIA ?? '-';

  return (
    <View className="flex-1 bg-white">
      <Container>
        <ScrollView
          contentContainerStyle={{
            gap: 18,
            paddingBottom: 32,
            paddingHorizontal: 16,
            paddingTop: 0,
          }}>

          {/* Banner de Status do Robô */}
          <View className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                  Estratégia no Robô
                </Text>
                <Text className="text-lg font-bold text-slate-900">
                  {robotActiveStrat === '1' ? 'Estratégia A' :
                   robotActiveStrat === '2' ? 'Estratégia B' :
                   robotActiveStrat === '3' ? 'Estratégia C' :
                   robotActiveStrat === '4' ? 'Estratégia D' :
                   robotActiveStrat === '5' ? 'Estratégia E' :
                   robotActiveStrat === '0' ? 'Estratégia 0 (Nenhuma)' :
                   `Estratégia ${robotActiveStrat}`}
                </Text>
              </View>
              {robotActiveVar !== '-' && (
                <View className="rounded-lg bg-sky-200 px-3 py-1.5">
                  <Text className="text-xs font-bold text-sky-900">
                    Variância: {robotActiveVar === '0' ? 'Curto' : robotActiveVar === '1' ? 'Médio' : robotActiveVar === '2' ? 'Fundo' : robotActiveVar}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Seletor de Estratégias */}
          <View className="gap-3">
            <Text className="text-base font-bold text-slate-800">
              Selecione a Estratégia (`EXECUTA_ESTRATEGIA`)
            </Text>

            <View className="gap-2.5">
              {STRATEGIES.map((strat) => {
                const isSelected = selectedStrat === strat.id;
                return (
                  <TouchableOpacity
                    key={strat.id}
                    onPress={() => handleSelectStrategy(strat.id)}
                    activeOpacity={0.7}
                    className={`rounded-xl border p-4 shadow-sm transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/70 shadow-md ring-2 ring-sky-400'
                        : 'border-slate-200 bg-white'
                    }`}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2.5">
                        <View
                          className={`h-4 w-4 rounded-full border-2 items-center justify-center ${
                            isSelected ? 'border-sky-600 bg-sky-600' : 'border-slate-400 bg-transparent'
                          }`}>
                          {isSelected && <View className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </View>
                        <Text className="text-base font-bold text-slate-900">{strat.title}</Text>
                      </View>
                      <View className={`rounded-full px-2.5 py-0.5 ${strat.badgeColor}`}>
                        <Text className="text-[11px] font-bold text-white">{strat.badge}</Text>
                      </View>
                    </View>

                    <Text className="mt-1.5 text-xs font-semibold text-slate-600">{strat.subtitle}</Text>
                    <Text className="mt-2 text-xs text-slate-500">{strat.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Sub-seletor de Variância (Apenas para Estratégia A) */}
          {activeStratObj.hasVariancia && (
            <View className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 gap-3">
              <Text className="text-sm font-bold text-amber-900">
                Selecione a Variância (Distância de Ataque para Estratégia A)
              </Text>
              <View className="flex-row gap-2">
                {VARIANCIA_LABELS.map((item) => {
                  const isVarSelected = selectedVariancia === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      onPress={() => setSelectedVariancia(item.value)}
                      className={`flex-1 rounded-lg border py-2.5 px-2 items-center ${
                        isVarSelected
                          ? 'border-amber-600 bg-amber-500 shadow-sm'
                          : 'border-amber-200 bg-white'
                      }`}>
                      <Text
                        className={`text-xs font-bold ${
                          isVarSelected ? 'text-white' : 'text-amber-900'
                        }`}>
                        {item.label} ({item.value})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className="text-xs italic text-amber-800">
                {VARIANCIA_LABELS[selectedVariancia].desc}
              </Text>
            </View>
          )}

          {/* Botão de Envio */}
          <TouchableOpacity
            onPress={handleApplyStrategy}
            disabled={isBusy}
            activeOpacity={0.8}
            className={`rounded-xl py-3.5 px-6 shadow-md items-center justify-center ${
              isBusy ? 'bg-slate-400' : 'bg-slate-900 active:bg-slate-800'
            }`}>
            <Text className="text-base font-bold text-white">{buttonLabel}</Text>
          </TouchableOpacity>

          {feedbackMsg ? (
            <Text
              className={`text-center text-xs font-semibold ${
                sendState === 'success' ? 'text-emerald-600' : 'text-rose-600'
              }`}>
              {feedbackMsg}
            </Text>
          ) : null}

          {/* Tabelinha Detalhada dos Movimentos da Estratégia Selecionada */}
          <View className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm gap-3">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <Text className="text-sm font-bold text-slate-800">
                Movimentação em EXECUTA_ESTRATEGIA({activeStratObj.numId})
              </Text>
              <Text className="text-xs font-semibold text-sky-600">
                {activeStratObj.title}
              </Text>
            </View>

            {/* Tabela de Passos de Movimento */}
            <View className="overflow-hidden rounded-lg border border-slate-200">
              {/* Header da Tabela */}
              <View className="flex-row bg-slate-900 py-2 px-3">
                <Text className="w-10 text-[11px] font-bold text-white text-center">Passo</Text>
                <Text className="flex-1 text-[11px] font-bold text-white text-center">Motor Esq</Text>
                <Text className="flex-1 text-[11px] font-bold text-white text-center">Motor Dir</Text>
                <Text className="w-16 text-[11px] font-bold text-white text-center">Tempo</Text>
                <Text className="flex-[2] text-[11px] font-bold text-white">Ação / Movimento</Text>
              </View>

              {/* Linhas da Tabela */}
              {stepsList.map((st, idx) => (
                <View
                  key={st.step}
                  className={`flex-row items-center py-2.5 px-3 border-b border-slate-100 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  }`}>
                  <Text className="w-10 text-xs font-bold text-slate-700 text-center">#{st.step}</Text>
                  <Text className={`flex-1 text-xs font-mono font-bold text-center ${
                    st.motorEsq > 0 ? 'text-emerald-600' : st.motorEsq < 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}>
                    {st.motorEsq}
                  </Text>
                  <Text className={`flex-1 text-xs font-mono font-bold text-center ${
                    st.motorDir > 0 ? 'text-emerald-600' : st.motorDir < 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}>
                    {st.motorDir}
                  </Text>
                  <Text className="w-16 text-xs font-semibold text-slate-600 text-center">
                    {st.timeMs > 0 ? `${st.timeMs}ms` : 'Loop'}
                  </Text>
                  <Text className="flex-[2] text-xs font-medium text-slate-800">{st.action}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Tabelinha Resumo Geral de Todas as Estratégias */}
          <View className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm gap-3 mt-2">
            <Text className="text-sm font-bold text-slate-800">
              Tabela Resumo de Todas as Estratégias do Firmware
            </Text>

            <View className="overflow-hidden rounded-lg border border-slate-200">
              <View className="flex-row bg-slate-100 py-2 px-2 border-b border-slate-200">
                <Text className="w-12 text-[11px] font-bold text-slate-700 text-center">Cód.</Text>
                <Text className="w-24 text-[11px] font-bold text-slate-700">Nome</Text>
                <Text className="flex-1 text-[11px] font-bold text-slate-700">Resumo da Sequência de Motores</Text>
              </View>

              <View className="flex-row py-2 px-2 border-b border-slate-100 bg-white items-center">
                <Text className="w-12 text-xs font-bold text-slate-900 text-center">0</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">Estratégia 0</Text>
                <Text className="flex-1 text-xs text-slate-600">Sem delay inicial, busca direta por sensores</Text>
              </View>

              <View className="flex-row py-2 px-2 border-b border-slate-100 bg-slate-50 items-center">
                <Text className="w-12 text-xs font-bold text-amber-700 text-center">A (0)</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">A - Curto</Text>
                <Text className="flex-1 text-xs text-slate-600">(1599,-1599 100ms) → (300,1599 550ms)</Text>
              </View>

              <View className="flex-row py-2 px-2 border-b border-slate-100 bg-white items-center">
                <Text className="w-12 text-xs font-bold text-amber-700 text-center">A (1)</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">A - Médio</Text>
                <Text className="flex-1 text-xs text-slate-600">(1599,-1599 70ms) → (700,1599 400ms)</Text>
              </View>

              <View className="flex-row py-2 px-2 border-b border-slate-100 bg-slate-50 items-center">
                <Text className="w-12 text-xs font-bold text-amber-700 text-center">A (2)</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">A - Fundo</Text>
                <Text className="flex-1 text-xs text-slate-600">(1599,-1599 70ms) → (850,1599 580ms)</Text>
              </View>

              <View className="flex-row py-2 px-2 border-b border-slate-100 bg-white items-center">
                <Text className="w-12 text-xs font-bold text-indigo-700 text-center">B</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">Estratégia B</Text>
                <Text className="flex-1 text-xs text-slate-600">(1100,-1100 48ms) → (1500,1500 120ms) → (200,1400 182ms) → (1500,1500 500ms)</Text>
              </View>

              <View className="flex-row py-2 px-2 border-b border-slate-100 bg-slate-50 items-center">
                <Text className="w-12 text-xs font-bold text-rose-700 text-center">C</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">Estratégia C</Text>
                <Text className="flex-1 text-xs text-slate-600">(0,0 400ms) → (1599,1599 160ms)</Text>
              </View>

              <View className="flex-row py-2 px-2 bg-white items-center">
                <Text className="w-12 text-xs font-bold text-emerald-700 text-center">D</Text>
                <Text className="w-24 text-xs font-semibold text-slate-800">Estratégia D</Text>
                <Text className="flex-1 text-xs text-slate-600">(1599,1599 180ms) → (0,0 400ms) → (1599,1599 160ms) → (0,0)</Text>
              </View>
            </View>
          </View>

        </ScrollView>
      </Container>
    </View>
  );
}
