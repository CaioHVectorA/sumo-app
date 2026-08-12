import React, { useCallback, useState } from 'react';
import {
  Alert,
  Clipboard,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Container } from '@/components/Container';
import { getConnectedDevice } from '@/src/services/bluetooth';
import {
  exportStrategyToJSON,
  getCustomStrategies,
  importStrategyFromJSON,
  saveCustomStrategy,
} from '@/src/services/strategyStorage';
import {
  applyPresetStrategyOnRobot,
  testStrategyOnRobot,
} from '@/src/services/robotCommunication';
import { CustomStrategy } from '@/src/types/strategy';

type StrategyOption = {
  id: string; // '0', 'A', 'B', 'C', 'D', 'E' or custom_...
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  description: string;
  hasVariancia?: boolean;
  isCustom?: boolean;
  customData?: CustomStrategy;
};

const BASE_STRATEGIES: StrategyOption[] = [
  {
    id: '0',
    iconName: 'flash-outline',
    title: 'Estratégia 0',
    subtitle: 'Busca Direta por Sensores',
    description:
      'Sem movimento inicial pré-programado. O robô ativa imediatamente a busca por sensores e alinhamento PID na arena.',
  },
  {
    id: 'A',
    iconName: 'sync-outline',
    title: 'Estratégia A',
    subtitle: 'Giro de Eixo + Curva de Fuga',
    description:
      'Gira no próprio eixo e executa curva acelerada para flanquear o oponente conforme a distância ajustada.',
    hasVariancia: true,
  },
  {
    id: 'B',
    iconName: 'speedometer-outline',
    title: 'Estratégia B',
    subtitle: 'Giro Curto + Arranque Diagonal',
    description:
      'Giro de 48ms à direita, avança reto, curva diagonal fechada e acelera em linha reta.',
  },
  {
    id: 'C',
    iconName: 'shield-checkmark-outline',
    title: 'Estratégia C',
    subtitle: 'Modo Defensivo / Esquiva',
    description:
      'Permanece imóvel por 400ms aguardando o oponente passar em falso e engata contra-ataque a 100%.',
  },
  {
    id: 'D',
    iconName: 'play-forward-outline',
    title: 'Estratégia D',
    subtitle: 'Finta (Arranca - Para - Arranca)',
    description:
      'Impulso inicial reto por 180ms, para por 400ms para enganar o adversário e faz segundo avanço.',
  },
  {
    id: 'E',
    iconName: 'construct-outline',
    title: 'Estratégia E',
    subtitle: 'Modo Customizado / Reservado',
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
      { step: 2, motorEsq: 450, motorDir: 1599, timeMs: 550, action: 'Curva aberta à esquerda' },
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

export default function EstrategiasScreen() {
  const [strategiesList, setStrategiesList] = useState<StrategyOption[]>(BASE_STRATEGIES);
  const [selectedStrat, setSelectedStrat] = useState<string>('A');
  const [selectedVariancia, setSelectedVariancia] = useState<number>(1);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'testing' | 'success' | 'error'>('idle');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // JSON Import/Export State
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonMode, setJsonMode] = useState<'IMPORT' | 'EXPORT'>('EXPORT');

  useFocusEffect(
    useCallback(() => {
      loadCustomStrats();
    }, [])
  );

  const loadCustomStrats = async () => {
    const customStrats = await getCustomStrategies();
    const formattedCustoms: StrategyOption[] = customStrats.map((c) => ({
      id: c.id,
      iconName: 'extension-puzzle-outline',
      title: c.title,
      subtitle: c.subtitle || 'Estratégia Customizada',
      description: c.description || 'Estratégia personalizada configurada pelo usuário.',
      isCustom: true,
      customData: c,
    }));

    setStrategiesList([...BASE_STRATEGIES, ...formattedCustoms]);
  };

  const handleSelectStrategy = (id: string) => {
    setSelectedStrat(id);
    setFeedbackMsg(null);
    setSendState('idle');
  };

  const triggerHapticSuccess = () => {
    try { Vibration.vibrate([0, 40, 40, 40]); } catch {}
  };

  const triggerHapticError = () => {
    try { Vibration.vibrate([0, 100, 50, 100]); } catch {}
  };

  const handleApplyStrategy = async () => {
    setSendState('sending');
    setFeedbackMsg(null);

    const isCustom = selectedStrat.startsWith('custom_');

    try {
      if (isCustom) {
        const activeObj = strategiesList.find((s) => s.id === selectedStrat);
        const steps = activeObj?.customData?.steps || [];
        await testStrategyOnRobot(steps);
        triggerHapticSuccess();
        setFeedbackMsg(`✓ Estratégia "${activeObj?.title}" enviada com sucesso!`);
        setSendState('success');
        return;
      }

      await applyPresetStrategyOnRobot(
        selectedStrat,
        selectedStrat === 'A' ? selectedVariancia : undefined
      );

      const varLabel = selectedStrat === 'A'
        ? ` (${VARIANCIA_LABELS[selectedVariancia].label})`
        : '';
      triggerHapticSuccess();
      setFeedbackMsg(`✓ Estratégia ${selectedStrat}${varLabel} ativada no robô!`);
      setSendState('success');
    } catch (err: unknown) {
      triggerHapticError();
      const msg = err instanceof Error ? err.message : 'Não foi possível conectar ao robô.';
      setFeedbackMsg(`✗ ${msg}`);
      setSendState('error');
    }
  };

  const handleTestSequence = async () => {
    setSendState('testing');
    setFeedbackMsg(null);

    const activeObj = strategiesList.find((s) => s.id === selectedStrat);
    let stepsToTest: any[] = [];

    if (activeObj?.customData) {
      stepsToTest = activeObj.customData.steps;
    } else {
      const rawSteps = MOVEMENT_DETAILS[selectedStrat]?.[selectedStrat === 'A' ? selectedVariancia : 0] || [];
      stepsToTest = rawSteps.map((st) => ({
        motorEsq: st.motorEsq,
        motorDir: st.motorDir,
        timeMs: st.timeMs,
      }));
    }

    try {
      await testStrategyOnRobot(stepsToTest);
      triggerHapticSuccess();
      setFeedbackMsg('✓ Teste da sequência concluído!');
      setSendState('success');
    } catch (err: unknown) {
      triggerHapticError();
      const msg = err instanceof Error ? err.message : 'Erro durante o teste.';
      setFeedbackMsg(`✗ ${msg}`);
      setSendState('error');
    }
  };

  const handleEditStrategy = (strat: StrategyOption) => {
    if (strat.isCustom) {
      router.push({
        pathname: '/criar-estrategia' as any,
        params: { editId: strat.id },
      });
    } else {
      router.push({
        pathname: '/criar-estrategia' as any,
        params: { presetId: strat.id },
      });
    }
  };

  const handleOpenExport = (strat: StrategyOption) => {
    if (strat.customData) {
      setJsonText(exportStrategyToJSON(strat.customData));
    } else {
      const json = JSON.stringify(
        {
          title: strat.title,
          subtitle: strat.subtitle,
          description: strat.description,
          steps: MOVEMENT_DETAILS[strat.id]?.[0] || [],
        },
        null,
        2
      );
      setJsonText(json);
    }
    setJsonMode('EXPORT');
    setShowJsonModal(true);
  };

  const handleConfirmImport = async () => {
    try {
      const imported = importStrategyFromJSON(jsonText);
      await saveCustomStrategy(imported);
      await loadCustomStrats();
      setSelectedStrat(imported.id);
      setShowJsonModal(false);
      triggerHapticSuccess();
      setFeedbackMsg(`✓ Estratégia "${imported.title}" importada e salva!`);
      setSendState('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Formato de JSON inválido.';
      Alert.alert('Erro na Importação', msg);
    }
  };

  const isConnected = !!getConnectedDevice();
  const isBusy = sendState === 'sending' || sendState === 'testing';

  return (
    <View className="flex-1 bg-slate-50">
      <Container>
        <ScrollView
          contentContainerStyle={{
            gap: 12,
            paddingBottom: 32,
            paddingHorizontal: 16,
            paddingTop: 8,
          }}>

          {/* BARRA SUPERIOR LIMPA E DIRETA */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View
                className={`h-3 w-3 rounded-full ${
                  isConnected ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              />
              <Text className="text-xs font-bold text-slate-700">
                {isConnected ? 'Robô Conectado' : 'Robô Desconectado'}
              </Text>
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => router.push('/criar-estrategia' as any)}
                activeOpacity={0.8}
                className="flex-row items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 shadow-sm">
                <Ionicons name="add" size={16} color="#ffffff" />
                <Text className="text-xs font-bold text-white">Nova Estratégia</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setJsonText('');
                  setJsonMode('IMPORT');
                  setShowJsonModal(true);
                }}
                activeOpacity={0.8}
                className="flex-row items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm">
                <Ionicons name="download-outline" size={16} color="#0f172a" />
                <Text className="text-xs font-bold text-slate-800">Importar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* LISTA DE CARDS DE ESTRATÉGIAS */}
          <View className="gap-2.5">
            {strategiesList.map((strat) => {
              const isSelected = selectedStrat === strat.id;

              let stepsList: MovementStep[] = [];
              if (strat.customData) {
                stepsList = strat.customData.steps.map((st, i) => ({
                  step: i + 1,
                  motorEsq: st.motorEsq,
                  motorDir: st.motorDir,
                  timeMs: st.timeMs,
                  action: st.name,
                }));
              } else {
                stepsList =
                  MOVEMENT_DETAILS[strat.id]?.[strat.id === 'A' ? selectedVariancia : 0] || [];
              }

              return (
                <TouchableOpacity
                  key={strat.id}
                  onPress={() => handleSelectStrategy(strat.id)}
                  activeOpacity={0.9}
                  className="rounded-2xl border p-4 shadow-sm transition-all"
                  style={{
                    backgroundColor: isSelected ? '#ffffff' : '#ffffff',
                    borderColor: isSelected ? '#0f172a' : '#e2e8f0',
                    borderWidth: isSelected ? 2 : 1,
                  }}>
                  {/* CABEÇALHO DO CARD */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1">
                      <View
                        className="h-10 w-10 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: isSelected ? '#0f172a' : '#f1f5f9',
                        }}>
                        <Ionicons
                          name={strat.iconName}
                          size={20}
                          color={isSelected ? '#ffffff' : '#475569'}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-bold text-slate-900">{strat.title}</Text>
                        <Text className="text-xs text-slate-500" numberOfLines={1}>
                          {strat.subtitle}
                        </Text>
                      </View>
                    </View>

                    {/* Botão de Exportar ou Editar no Card Não Selecionado */}
                    {!isSelected && (
                      <TouchableOpacity
                        onPress={() => handleEditStrategy(strat)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5"
                        activeOpacity={0.7}>
                        <Text className="text-[11px] font-bold text-slate-700">Personalizar</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* CONTEÚDO EXPANDIDO INTERNO DA ESTRATÉGIA SELECIONADA */}
                  {isSelected && (
                    <View className="mt-3.5 border-t border-slate-100 pt-3 gap-3">
                      <Text className="text-xs text-slate-600 leading-relaxed">
                        {strat.description}
                      </Text>

                      {/* PARAMETRO DE VARIÂNCIA (EMBUTIDO DIRETAMENTE NO CARD DA ESTRATÉGIA A) */}
                      {strat.hasVariancia && (
                        <View className="gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200">
                          <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Distância de Ataque / Variância:
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
                                    backgroundColor: isVarSelected ? '#0f172a' : '#ffffff',
                                    borderColor: isVarSelected ? '#0f172a' : '#cbd5e1',
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
                        </View>
                      )}

                      {/* RESUMO DOS PASSOS DE MOVIMENTO */}
                      <View className="gap-1.5 rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Sequência ({stepsList.length} etapas):
                        </Text>
                        {stepsList.map((st) => (
                          <View key={st.step} className="flex-row items-center justify-between py-0.5">
                            <Text className="text-xs font-semibold text-slate-800">
                              #{st.step} {st.action}
                            </Text>
                            <Text className="text-[11px] font-bold text-slate-500">
                              {st.timeMs > 0 ? `${st.timeMs}ms` : 'Busca PID'}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* PAINEL DE BOTÕES DE AÇÃO DENTRO DO PRÓPRIO CARD */}
                      <View className="flex-row gap-2 pt-1">
                        <TouchableOpacity
                          onPress={handleApplyStrategy}
                          disabled={isBusy}
                          activeOpacity={0.8}
                          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 shadow-sm">
                          <Ionicons name="send" size={16} color="#ffffff" />
                          <Text className="text-xs font-bold text-white">
                            {sendState === 'sending' ? 'Enviando...' : 'Enviar para o Robô'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handleTestSequence}
                          disabled={isBusy}
                          activeOpacity={0.8}
                          className="flex-row items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-3 shadow-sm">
                          <Ionicons name="flash" size={16} color="#ffffff" />
                          <Text className="text-xs font-bold text-white">
                            {sendState === 'testing' ? 'Testando...' : 'Testar'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleEditStrategy(strat)}
                          activeOpacity={0.8}
                          className="flex-row items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-3">
                          <Ionicons name="create-outline" size={16} color="#0f172a" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleOpenExport(strat)}
                          activeOpacity={0.8}
                          className="flex-row items-center justify-center rounded-xl border border-slate-300 bg-white px-2.5 py-3">
                          <Ionicons name="share-social-outline" size={16} color="#0284c7" />
                        </TouchableOpacity>
                      </View>

                      {/* NOTIFICAÇÃO DE FEEDBACK NO CARD ATIVO */}
                      {feedbackMsg && (
                        <View
                          className={`rounded-xl border p-3 ${
                            sendState === 'error'
                              ? 'border-rose-200 bg-rose-50'
                              : 'border-emerald-200 bg-emerald-50'
                          }`}>
                          <Text
                            className={`text-center text-xs font-bold ${
                              sendState === 'error' ? 'text-rose-700' : 'text-emerald-700'
                            }`}>
                            {feedbackMsg}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </Container>

      {/* MODAL IMPORT / EXPORT JSON */}
      <Modal visible={showJsonModal} animationType="fade" transparent>
        <View className="flex-1 items-center justify-center bg-slate-900/60 p-4">
          <View className="w-full rounded-2xl bg-white p-5 gap-4 shadow-xl">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3">
              <Text className="text-base font-bold text-slate-900">
                {jsonMode === 'EXPORT' ? 'Exportar JSON' : 'Importar JSON'}
              </Text>
              <TouchableOpacity onPress={() => setShowJsonModal(false)}>
                <Ionicons name="close-circle" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={{
                fontFamily: 'monospace',
                backgroundColor: '#0f172a',
                color: '#38bdf8',
                fontSize: 12,
                padding: 12,
                borderRadius: 8,
                minHeight: 180,
                textAlignVertical: 'top',
              }}
              multiline
              numberOfLines={10}
              value={jsonText}
              onChangeText={setJsonText}
              placeholder="Cole o JSON da estratégia aqui..."
              editable={jsonMode === 'IMPORT'}
            />

            <View className="flex-row gap-2">
              {jsonMode === 'EXPORT' ? (
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(jsonText);
                    Vibration.vibrate(30);
                    setFeedbackMsg('✓ JSON copiado para a área de transferência!');
                    setShowJsonModal(false);
                  }}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-sky-600 py-3">
                  <Ionicons name="copy-outline" size={18} color="#ffffff" />
                  <Text className="text-xs font-bold text-white">Copiar JSON</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleConfirmImport}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3">
                  <Ionicons name="download-outline" size={18} color="#ffffff" />
                  <Text className="text-xs font-bold text-white">Salvar Estratégia</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
