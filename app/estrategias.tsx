import React, { useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Container } from '@/components/Container';
import { useRobot } from '@/src/hooks/useRobot';
import { onData, send } from '@/src/services/bluetooth';

type StrategyOption = {
  id: string; // '0', 'A', 'B', 'C', 'D', 'E'
  numId: number;
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge: string;
  description: string;
  hasVariancia?: boolean;
};

const STRATEGIES: StrategyOption[] = [
  {
    id: '0',
    numId: 0,
    iconName: 'flash-outline',
    title: 'Estratégia 0',
    subtitle: 'Nenhuma / Entrada Direta no PID',
    badge: 'Direto na Busca',
    description:
      'Sem movimento inicial pré-programado. O robô ativa imediatamente a busca por sensores e alinhamento PID na arena.',
  },
  {
    id: 'A',
    numId: 1,
    iconName: 'sync-outline',
    title: 'Estratégia A',
    subtitle: 'Giro de Eixo + Curva de Fuga',
    badge: 'Parametrizável',
    description:
      'Gira no próprio eixo e executa curva acelerada para flanquear o oponente conforme a distância (Variância).',
    hasVariancia: true,
  },
  {
    id: 'B',
    numId: 2,
    iconName: 'speedometer-outline',
    title: 'Estratégia B',
    subtitle: 'Giro Curto + Arranque Diagonal',
    badge: 'Flanqueamento',
    description:
      'Giro de 48ms à direita, avança reto por 120ms, curva diagonal fechada e acelera em linha reta.',
  },
  {
    id: 'C',
    numId: 3,
    iconName: 'shield-checkmark-outline',
    title: 'Estratégia C',
    subtitle: 'Modo Defensivo / Esquiva',
    badge: 'Defesa & Ataque',
    description:
      'Permanece imóvel por 400ms aguardando o oponente passar em falso e engata contra-ataque com 100% de potência.',
  },
  {
    id: 'D',
    numId: 4,
    iconName: 'play-forward-outline',
    title: 'Estratégia D',
    subtitle: 'Finta (Arranca - Para - Arranca)',
    badge: 'Desestabilização',
    description:
      'Impulso inicial reto por 180ms, para por 400ms para enganar a leitura do adversário e faz segundo avanço.',
  },
  {
    id: 'E',
    numId: 5,
    iconName: 'construct-outline',
    title: 'Estratégia E',
    subtitle: 'Modo Customizado / Reservado',
    badge: 'Reservado',
    description: 'Slot de estratégia reservado no firmware Arduino para expansões futuras.',
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
    0: [{ step: 1, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Busca direta por sensores' }],
  },
  A: {
    0: [
      { step: 1, motorEsq: 1599, motorDir: -1599, timeMs: 100, action: 'Giro no eixo à DIREITA' },
      { step: 2, motorEsq: 300, motorDir: 1599, timeMs: 550, action: 'Curva aberta à esquerda' },
    ],
    1: [
      { step: 1, motorEsq: 1599, motorDir: -1599, timeMs: 70, action: 'Giro no eixo à DIREITA' },
      { step: 2, motorEsq: 700, motorDir: 1599, timeMs: 400, action: 'Curva média à esquerda' },
    ],
    2: [
      { step: 1, motorEsq: 1599, motorDir: -1599, timeMs: 70, action: 'Giro no eixo à DIREITA' },
      {
        step: 2,
        motorEsq: 850,
        motorDir: 1599,
        timeMs: 580,
        action: 'Avanço longo (fundo da arena)',
      },
    ],
  },
  B: {
    0: [
      { step: 1, motorEsq: 1100, motorDir: -1100, timeMs: 48, action: 'Giro curto à DIREITA' },
      { step: 2, motorEsq: 1500, motorDir: 1500, timeMs: 120, action: 'Avanço reto rápido' },
      { step: 3, motorEsq: 200, motorDir: 1400, timeMs: 182, action: 'Curva diagonal fechada' },
      { step: 4, motorEsq: 1500, motorDir: 1500, timeMs: 500, action: 'Sprint final' },
    ],
  },
  C: {
    0: [
      { step: 1, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Imóvel (aguarda oponente)' },
      { step: 2, motorEsq: 1599, motorDir: 1599, timeMs: 160, action: 'Contra-ataque 100%' },
    ],
  },
  D: {
    0: [
      { step: 1, motorEsq: 1599, motorDir: 1599, timeMs: 180, action: 'Impulso inicial' },
      { step: 2, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Pausa completa' },
      { step: 3, motorEsq: 1599, motorDir: 1599, timeMs: 160, action: 'Segundo avanço 100%' },
      { step: 4, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Início do loop PID' },
    ],
  },
  E: {
    0: [{ step: 1, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Reservado no firmware' }],
  },
};

const VARIANCIA_LABELS = [
  { value: 0, label: 'Curto', desc: 'Giro 100ms + Curva Rápida' },
  { value: 1, label: 'Médio', desc: 'Giro 70ms + Curva Média' },
  { value: 2, label: 'Fundo', desc: 'Giro 70ms + Avanço Longo' },
];

const CONFIRM_TIMEOUT_MS = 3000; // Timeout estrito de 3 segundos

export default function EstrategiasScreen() {
  const [selectedStrat, setSelectedStrat] = useState<string>('A');
  const [selectedVariancia, setSelectedVariancia] = useState<number>(1);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'waiting' | 'success' | 'error'>(
    'idle'
  );
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { status } = useRobot();

  const handleSelectStrategy = (id: string) => {
    setSelectedStrat(id);
  };

  const triggerHapticSuccess = () => {
    try {
      Vibration.vibrate([0, 40, 40, 40]);
    } catch {}
  };

  const triggerHapticError = () => {
    try {
      Vibration.vibrate([0, 100, 50, 100]);
    } catch {}
  };

  const handleApplyStrategy = async () => {
    setSendState('sending');
    setFeedbackMsg(null);

    try {
      await send(`ESTRATEGIA_${selectedStrat}`);
      setSendState('waiting');

      const expectedStratConfirm = `ESTRATEGIA_${selectedStrat}`;
      const expectVariancia = selectedStrat === 'A';
      let stratConfirmed = false;
      let varConfirmed = !expectVariancia;

      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        unsubscribe?.();
      };

      await new Promise<void>((resolve, reject) => {
        // Timeout rígido de 3 segundos
        timeoutRef.current = setTimeout(() => {
          cleanup();
          reject(new Error('Sem resposta do robô (Timeout de 3s). Solicitação cancelada.'));
        }, CONFIRM_TIMEOUT_MS);

        unsubscribe = onData((line) => {
          if (!stratConfirmed && line === expectedStratConfirm) {
            stratConfirmed = true;
            if (expectVariancia) {
              send(`VARIANCIA = ${selectedVariancia}`).catch(() => {});
            }
          }

          if (!varConfirmed && line.startsWith('VARIANCIA_') && line.endsWith('_OK')) {
            varConfirmed = true;
          }

          if (stratConfirmed && varConfirmed) {
            cleanup();
            resolve();
          }
        });
      });

      const varLabel = expectVariancia
        ? ` · Variância: ${VARIANCIA_LABELS[selectedVariancia].label}`
        : '';
      triggerHapticSuccess();
      setFeedbackMsg(`✓ Estratégia ${selectedStrat}${varLabel} confirmada pelo robô!`);
      setSendState('success');
    } catch (err: unknown) {
      triggerHapticError();
      const msg = err instanceof Error ? err.message : 'Erro ao enviar estratégia';
      setFeedbackMsg(`✗ ${msg}`);
      setSendState('error');
    }
  };

  const isBusy = sendState === 'sending' || sendState === 'waiting';

  const buttonLabel =
    sendState === 'sending'
      ? 'Enviando...'
      : sendState === 'waiting'
        ? 'Aguardando confirmação (até 3s)...'
        : `Aplicar Estratégia ${selectedStrat}${
            selectedStrat === 'A' ? ` (${VARIANCIA_LABELS[selectedVariancia].label})` : ''
          }`;

  const activeStratObj = STRATEGIES.find((s) => s.id === selectedStrat) || STRATEGIES[1];
  const stepsList =
    MOVEMENT_DETAILS[selectedStrat]?.[selectedStrat === 'A' ? selectedVariancia : 0] || [];

  const robotActiveStrat = status?.ESTRATEGIA ?? 'Desconhecida';
  const robotActiveVar = status?.VARIANCIA ?? '-';

  return (
    <View className="flex-1 bg-slate-50">
      <Container>
        <ScrollView
          contentContainerStyle={{
            gap: 16,
            paddingBottom: 32,
            paddingHorizontal: 16,
            paddingTop: 0,
          }}>
          {/* Status Ativo no Robô */}
          <View className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <Text className="text-xs font-semibold text-slate-700">
                  Robô: Estratégia {robotActiveStrat}
                  {robotActiveVar !== '-' ? ` (Var: ${robotActiveVar})` : ''}
                </Text>
              </View>
              <Text className="text-[10px] font-semibold uppercase text-slate-400">
                Firmware OK
              </Text>
            </View>
          </View>

          {/* Grid Intuitivo de Escolha de Estratégia */}
          <View className="gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Selecione a Estratégia
            </Text>

            <View className="gap-2">
              {STRATEGIES.map((strat) => {
                const isSelected = selectedStrat === strat.id;

                return (
                  <TouchableOpacity
                    key={strat.id}
                    onPress={() => handleSelectStrategy(strat.id)}
                    activeOpacity={0.7}
                    className="rounded-xl border p-3.5 transition-all"
                    style={{
                      backgroundColor: isSelected ? '#ffffff' : '#ffffff',
                      borderColor: isSelected ? '#0f172a' : '#e2e8f0',
                      borderWidth: isSelected ? 2 : 1,
                    }}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2.5">
                        <View
                          className="h-8 w-8 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#0f172a' : '#f1f5f9',
                          }}>
                          <Ionicons
                            name={strat.iconName}
                            size={18}
                            color={isSelected ? '#ffffff' : '#475569'}
                          />
                        </View>
                        <View>
                          <Text className="text-sm font-bold text-slate-900">{strat.title}</Text>
                          <Text className="text-xs text-slate-500">{strat.subtitle}</Text>
                        </View>
                      </View>

                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{
                          backgroundColor: isSelected ? '#e2e8f0' : '#f1f5f9',
                        }}>
                        <Text className="text-[10px] font-bold text-slate-700">{strat.badge}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Sub-seletor de Variância (Estratégia A) */}
          {activeStratObj.hasVariancia && (
            <View className="gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Variância / Distância de Ataque (Estratégia A)
              </Text>
              <View className="flex-row gap-2">
                {VARIANCIA_LABELS.map((item) => {
                  const isVarSelected = selectedVariancia === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      onPress={() => setSelectedVariancia(item.value)}
                      className="flex-1 items-center rounded-lg border py-2"
                      style={{
                        backgroundColor: isVarSelected ? '#0f172a' : '#f8fafc',
                        borderColor: isVarSelected ? '#0f172a' : '#e2e8f0',
                      }}>
                      <Text
                        className="text-xs font-bold"
                        style={{ color: isVarSelected ? '#ffffff' : '#475569' }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className="text-xs italic text-slate-500">
                {VARIANCIA_LABELS[selectedVariancia].desc}
              </Text>
            </View>
          )}

          {/* Trajetória Visual Interativa (Linha do Tempo) */}
          <View className="gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Trajetória Programada ({activeStratObj.title})
              </Text>
              <Text className="text-xs font-bold text-slate-700">{stepsList.length} Etapas</Text>
            </View>

            {/* Linha do Tempo dos Passos */}
            <View className="gap-2">
              {stepsList.map((st) => (
                <View
                  key={st.step}
                  className="flex-row items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-slate-900">
                    <Text className="text-xs font-bold text-white">{st.step}</Text>
                  </View>

                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-slate-800">{st.action}</Text>
                    <Text className="font-mono text-[10px] text-slate-400">
                      Motor Esq: {st.motorEsq > 0 ? `+${st.motorEsq}` : st.motorEsq} | Motor Dir:{' '}
                      {st.motorDir > 0 ? `+${st.motorDir}` : st.motorDir}
                    </Text>
                  </View>

                  <View className="rounded bg-slate-200 px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-slate-700">
                      {st.timeMs > 0 ? `${st.timeMs}ms` : 'Loop PID'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Botão de Envio de Estratégia */}
          <TouchableOpacity
            onPress={handleApplyStrategy}
            disabled={isBusy}
            activeOpacity={0.8}
            className="items-center justify-center rounded-xl py-3.5 shadow-sm"
            style={{
              backgroundColor: isBusy ? '#94a3b8' : '#0f172a',
            }}>
            <Text className="text-sm font-bold text-white">{buttonLabel}</Text>
          </TouchableOpacity>

          {/* Notificação de Sucesso ou Error (Timeout de 3s) */}
          {feedbackMsg ? (
            <View
              className={`rounded-xl border p-3 ${
                sendState === 'error'
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}>
              <Text
                className={`text-center text-xs font-semibold ${
                  sendState === 'error' ? 'text-rose-700' : 'text-emerald-700'
                }`}>
                {feedbackMsg}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </Container>
    </View>
  );
}
