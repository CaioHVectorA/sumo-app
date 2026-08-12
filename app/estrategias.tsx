import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { Container } from '@/components/Container';
import { useRobot } from '@/src/hooks/useRobot';
import { onData, send } from '@/src/services/bluetooth';
import {
  CustomStrategy,
  deleteCustomStrategy,
  exportStrategyToJSON,
  getCustomStrategies,
  importStrategyFromJSON,
  StrategyStep,
} from '@/src/services/strategyStorage';

type StrategyOption = {
  id: string;
  numId?: number;
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge: string;
  description: string;
  hasVariancia?: boolean;
  isCustom?: boolean;
  steps?: StrategyStep[];
};

const BUILTIN_STRATEGIES: StrategyOption[] = [
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

const BUILTIN_MOVEMENT_DETAILS: Record<string, Record<number, StrategyStep[]>> = {
  '0': {
    0: [{ id: '0_1', stepNumber: 1, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Busca direta por sensores' }],
  },
  A: {
    0: [
      { id: 'A0_1', stepNumber: 1, motorEsq: 1599, motorDir: -1599, timeMs: 100, action: 'Giro no eixo à DIREITA' },
      { id: 'A0_2', stepNumber: 2, motorEsq: 300, motorDir: 1599, timeMs: 550, action: 'Curva aberta à esquerda' },
    ],
    1: [
      { id: 'A1_1', stepNumber: 1, motorEsq: 1599, motorDir: -1599, timeMs: 70, action: 'Giro no eixo à DIREITA' },
      { id: 'A1_2', stepNumber: 2, motorEsq: 700, motorDir: 1599, timeMs: 400, action: 'Curva média à esquerda' },
    ],
    2: [
      { id: 'A2_1', stepNumber: 1, motorEsq: 1599, motorDir: -1599, timeMs: 70, action: 'Giro no eixo à DIREITA' },
      { id: 'A2_2', stepNumber: 2, motorEsq: 850, motorDir: 1599, timeMs: 580, action: 'Avanço longo (fundo da arena)' },
    ],
  },
  B: {
    0: [
      { id: 'B_1', stepNumber: 1, motorEsq: 1100, motorDir: -1100, timeMs: 48, action: 'Giro curto à DIREITA' },
      { id: 'B_2', stepNumber: 2, motorEsq: 1500, motorDir: 1500, timeMs: 120, action: 'Avanço reto rápido' },
      { id: 'B_3', stepNumber: 3, motorEsq: 200, motorDir: 1400, timeMs: 182, action: 'Curva diagonal fechada' },
      { id: 'B_4', stepNumber: 4, motorEsq: 1500, motorDir: 1500, timeMs: 500, action: 'Sprint final' },
    ],
  },
  C: {
    0: [
      { id: 'C_1', stepNumber: 1, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Imóvel (aguarda oponente)' },
      { id: 'C_2', stepNumber: 2, motorEsq: 1599, motorDir: 1599, timeMs: 160, action: 'Contra-ataque 100%' },
    ],
  },
  D: {
    0: [
      { id: 'D_1', stepNumber: 1, motorEsq: 1599, motorDir: 1599, timeMs: 180, action: 'Impulso inicial' },
      { id: 'D_2', stepNumber: 2, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Pausa completa' },
      { id: 'D_3', stepNumber: 3, motorEsq: 1599, motorDir: 1599, timeMs: 160, action: 'Segundo avanço 100%' },
      { id: 'D_4', stepNumber: 4, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Início do loop PID' },
    ],
  },
  E: {
    0: [{ id: 'E_1', stepNumber: 1, motorEsq: 0, motorDir: 0, timeMs: 0, action: 'Reservado no firmware' }],
  },
};

const VARIANCIA_LABELS = [
  { value: 0, label: 'Curto', desc: 'Giro 100ms + Curva Rápida' },
  { value: 1, label: 'Médio', desc: 'Giro 70ms + Curva Média' },
  { value: 2, label: 'Fundo', desc: 'Giro 70ms + Avanço Longo' },
];

const CONFIRM_TIMEOUT_MS = 3000;

export default function EstrategiasScreen() {
  const router = useRouter();
  const [selectedStrat, setSelectedStrat] = useState<string>('A');
  const [selectedVariancia, setSelectedVariancia] = useState<number>(1);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'waiting' | 'success' | 'error'>(
    'idle'
  );
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { status } = useRobot();

  const [customStrats, setCustomStrats] = useState<CustomStrategy[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [exportJsonText, setExportJsonText] = useState('');

  const loadCustomStrategiesList = async () => {
    const list = await getCustomStrategies();
    setCustomStrats(list || []);
  };

  useFocusEffect(
    useCallback(() => {
      loadCustomStrategiesList();
    }, [])
  );

  const allStrategies: StrategyOption[] = [
    ...BUILTIN_STRATEGIES,
    ...customStrats.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      badge: c.badge || 'Customizada',
      iconName: (c.iconName as any) || 'construct-outline',
      description: c.description,
      isCustom: true,
      steps: c.steps,
    })),
  ];

  const activeStratObj = allStrategies.find((s) => s.id === selectedStrat) || BUILTIN_STRATEGIES[1];

  let stepsList: StrategyStep[] = [];
  if (activeStratObj.isCustom && activeStratObj.steps) {
    stepsList = activeStratObj.steps;
  } else {
    stepsList =
      BUILTIN_MOVEMENT_DETAILS[selectedStrat]?.[selectedStrat === 'A' ? selectedVariancia : 0] || [];
  }

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
      if (activeStratObj.isCustom && activeStratObj.steps) {
        const payload = `RUN_STRAT,${activeStratObj.steps.length};` +
          activeStratObj.steps.map((s) => `${s.motorEsq},${s.motorDir},${s.timeMs}`).join(';');
        await send(payload);
        triggerHapticSuccess();
        setFeedbackMsg(`✓ Estratégia customizada "${activeStratObj.title}" enviada com sucesso!`);
        setSendState('success');
        return;
      }

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

  const handleExport = (stratObj: StrategyOption) => {
    if (stratObj.isCustom) {
      const customItem = customStrats.find((c) => c.id === stratObj.id);
      if (customItem) {
        setExportJsonText(exportStrategyToJSON(customItem));
        setExportModalVisible(true);
        return;
      }
    }

    const stepsToExport =
      BUILTIN_MOVEMENT_DETAILS[stratObj.id]?.[stratObj.id === 'A' ? selectedVariancia : 0] || [];

    const json = JSON.stringify(
      {
        version: '1.0',
        type: 'sumo_strategy',
        strategy: {
          title: stratObj.title,
          subtitle: stratObj.subtitle,
          badge: stratObj.badge,
          iconName: stratObj.iconName,
          description: stratObj.description,
          steps: stepsToExport.map((s) => ({
            step: s.stepNumber,
            action: s.action,
            motorEsq: s.motorEsq,
            motorDir: s.motorDir,
            timeMs: s.timeMs,
          })),
        },
      },
      null,
      2
    );

    setExportJsonText(json);
    setExportModalVisible(true);
  };

  const handleImportJSON = async () => {
    if (!jsonText.trim()) {
      Alert.alert('JSON Vazio', 'Cole o texto JSON da estratégia no campo.');
      return;
    }

    try {
      const imported = await importStrategyFromJSON(jsonText);
      await loadCustomStrategiesList();
      setSelectedStrat(imported.id);
      setImportModalVisible(false);
      setJsonText('');
      Alert.alert('Sucesso!', `Estratégia "${imported.title}" importada e salva com sucesso.`);
    } catch (err: any) {
      Alert.alert('Erro ao Importar', err.message || 'Formato JSON inválido.');
    }
  };

  const handleDeleteCustom = async (id: string, name: string) => {
    Alert.alert(
      'Remover Estratégia',
      `Deseja apagar permanentemente a estratégia "${name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await deleteCustomStrategy(id);
            await loadCustomStrategiesList();
            if (selectedStrat === id) {
              setSelectedStrat('A');
            }
          },
        },
      ]
    );
  };

  const isBusy = sendState === 'sending' || sendState === 'waiting';

  const buttonLabel =
    sendState === 'sending'
      ? 'Enviando...'
      : sendState === 'waiting'
        ? 'Aguardando confirmação (até 3s)...'
        : `Aplicar ${activeStratObj.title}${
            selectedStrat === 'A' ? ` (${VARIANCIA_LABELS[selectedVariancia].label})` : ''
          }`;

  const robotActiveStrat = status?.ESTRATEGIA ?? 'Desconhecida';
  const robotActiveVar = status?.VARIANCIA ?? '-';

  return (
    <View style={styles.container}>
      <Container>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Status Ativo no Robô & Atalho de Edição */}
          <View style={styles.robotStatusCard}>
            <View style={styles.rowBetween}>
              <View style={styles.rowCenterGap}>
                <View style={styles.activeDot} />
                <Text style={styles.statusText}>
                  Robô: Estratégia {robotActiveStrat}
                  {robotActiveVar !== '-' ? ` (Var: ${robotActiveVar})` : ''}
                </Text>
              </View>
              <Text style={styles.firmwareBadge}>Firmware OK</Text>
            </View>

            {/* Barra de Ações: Nova Estratégia & Importar/Exportar */}
            <View style={styles.actionsBar}>
              <TouchableOpacity
                onPress={() => router.push('/editar-estrategia' as any)}
                style={styles.btnActionPrimary}>
                <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.btnActionPrimaryText}>Nova / Calibrar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setImportModalVisible(true)}
                style={styles.btnActionSecondary}>
                <Ionicons name="download-outline" size={16} color="#334155" />
                <Text style={styles.btnActionSecondaryText}>Importar JSON</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Grid de Escolha de Estratégias */}
          <View style={styles.sectionGap}>
            <Text style={styles.sectionTitle}>
              Selecione a Estratégia ({allStrategies.length})
            </Text>

            <View style={styles.strategiesList}>
              {allStrategies.map((strat) => {
                const isSelected = selectedStrat === strat.id;

                return (
                  <TouchableOpacity
                    key={strat.id}
                    onPress={() => setSelectedStrat(strat.id)}
                    activeOpacity={0.7}
                    style={[
                      styles.stratCard,
                      isSelected ? styles.stratCardSelected : styles.stratCardUnselected,
                    ]}>
                    <View style={styles.rowBetween}>
                      <View style={styles.stratCardLeft}>
                        <View
                          style={[
                            styles.stratIconBox,
                            isSelected ? styles.stratIconBoxSelected : styles.stratIconBoxUnselected,
                          ]}>
                          <Ionicons
                            name={strat.iconName}
                            size={18}
                            color={isSelected ? '#ffffff' : '#475569'}
                          />
                        </View>
                        <View style={styles.flexOne}>
                          <View style={styles.rowCenterGap}>
                            <Text style={styles.stratTitleText}>{strat.title}</Text>
                            {strat.isCustom && (
                              <View style={styles.customBadgeBox}>
                                <Text style={styles.customBadgeText}>Custom</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.stratSubtitleText}>{strat.subtitle}</Text>
                        </View>
                      </View>

                      <View style={styles.rowCenterGap}>
                        {strat.isCustom && (
                          <TouchableOpacity
                            onPress={() =>
                              router.push({
                                pathname: '/editar-estrategia' as any,
                                params: { id: strat.id },
                              })
                            }
                            style={styles.iconPadding}>
                            <Ionicons name="create-outline" size={16} color="#0284c7" />
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity onPress={() => handleExport(strat)} style={styles.iconPadding}>
                          <Ionicons name="share-outline" size={16} color="#475569" />
                        </TouchableOpacity>

                        {strat.isCustom && (
                          <TouchableOpacity
                            onPress={() => handleDeleteCustom(strat.id, strat.title)}
                            style={styles.iconPadding}>
                            <Ionicons name="trash-outline" size={16} color="#e11d48" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Sub-seletor de Variância (Estratégia A Nactiva) */}
          {activeStratObj.hasVariancia && (
            <View style={styles.varianciaCard}>
              <Text style={styles.sectionTitle}>
                Variância / Distância de Ataque (Estratégia A)
              </Text>
              <View style={styles.rowGap}>
                {VARIANCIA_LABELS.map((item) => {
                  const isVarSelected = selectedVariancia === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      onPress={() => setSelectedVariancia(item.value)}
                      style={[
                        styles.varButton,
                        isVarSelected ? styles.varButtonSelected : styles.varButtonUnselected,
                      ]}>
                      <Text
                        style={[
                          styles.varButtonText,
                          isVarSelected ? styles.varButtonTextSelected : styles.varButtonTextUnselected,
                        ]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.varDescText}>
                {VARIANCIA_LABELS[selectedVariancia].desc}
              </Text>
            </View>
          )}

          {/* Trajetória Visual Interativa (Linha do Tempo) */}
          <View style={styles.trajectoryCard}>
            <View style={styles.rowBetweenBorder}>
              <Text style={styles.sectionTitle}>
                Trajetória Programada ({activeStratObj.title})
              </Text>
              <Text style={styles.stepsCountText}>{stepsList.length} Etapas</Text>
            </View>

            <View style={styles.stepsListGap}>
              {stepsList.map((st, index) => (
                <View key={st.id || index} style={styles.trajectoryStepItem}>
                  <View style={styles.stepCircleDark}>
                    <Text style={styles.stepCircleText}>{st.stepNumber || index + 1}</Text>
                  </View>

                  <View style={styles.flexOne}>
                    <Text style={styles.trajectoryActionText}>{st.action}</Text>
                    <Text style={styles.trajectoryMotorText}>
                      Motor Esq: {st.motorEsq > 0 ? `+${st.motorEsq}` : st.motorEsq} | Motor Dir:{' '}
                      {st.motorDir > 0 ? `+${st.motorDir}` : st.motorDir}
                    </Text>
                  </View>

                  <View style={styles.timeBadgeBox}>
                    <Text style={styles.timeBadgeText}>
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
            style={[
              styles.btnApply,
              { backgroundColor: isBusy ? '#94a3b8' : '#0f172a' },
            ]}>
            <Text style={styles.btnApplyText}>{buttonLabel}</Text>
          </TouchableOpacity>

          {/* Feedback Msg */}
          {feedbackMsg ? (
            <View
              style={[
                styles.feedbackContainer,
                sendState === 'error' ? styles.feedbackError : styles.feedbackSuccess,
              ]}>
              <Text
                style={[
                  styles.feedbackMsgText,
                  sendState === 'error' ? styles.feedbackErrorText : styles.feedbackSuccessText,
                ]}>
                {feedbackMsg}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Modal de Importação JSON */}
        <Modal visible={importModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Importar Estratégia (JSON)</Text>
              <Text style={styles.modalSubText}>
                Cole o conteúdo JSON da estratégia para salvar e usar imediatamente:
              </Text>

              <TextInput
                value={jsonText}
                onChangeText={setJsonText}
                placeholder={`{\n  "version": "1.0",\n  "strategy": { ... }\n}`}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                style={styles.modalJsonInput}
              />

              <View style={styles.rowButtons}>
                <TouchableOpacity
                  onPress={() => setImportModalVisible(false)}
                  style={styles.btnModalCancel}>
                  <Text style={styles.btnModalCancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleImportJSON}
                  style={styles.btnModalConfirm}>
                  <Text style={styles.btnModalConfirmText}>Importar Estratégia</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal de Exportação JSON */}
        <Modal visible={exportModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>Exportar Estratégia (JSON)</Text>
                <TouchableOpacity onPress={() => setExportModalVisible(false)}>
                  <Ionicons name="close-circle-outline" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubText}>
                Copie o JSON abaixo para compartilhar ou salvar em arquivo:
              </Text>

              <TextInput
                value={exportJsonText}
                editable={false}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                style={styles.modalJsonExportInput}
              />

              <TouchableOpacity
                onPress={() => {
                  Vibration.vibrate(30);
                  Alert.alert('Copiado!', 'Conteúdo JSON gerado com sucesso.');
                }}
                style={styles.btnCopyModal}>
                <Text style={styles.btnCopyModalText}>Copiar Conteúdo JSON</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 32,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  robotStatusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCenterGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  firmwareBadge: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#94a3b8',
  },
  actionsBar: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 4,
  },
  btnActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
  },
  btnActionPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  btnActionSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
  },
  btnActionSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  sectionGap: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#64748b',
  },
  strategiesList: {
    gap: 8,
  },
  stratCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  stratCardSelected: {
    borderColor: '#0f172a',
    borderWidth: 2,
  },
  stratCardUnselected: {
    borderColor: '#e2e8f0',
    borderWidth: 1,
  },
  stratCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  stratIconBox: {
    height: 34,
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  stratIconBoxSelected: {
    backgroundColor: '#0f172a',
  },
  stratIconBoxUnselected: {
    backgroundColor: '#f1f5f9',
  },
  stratTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  customBadgeBox: {
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  customBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0369a1',
  },
  stratSubtitleText: {
    fontSize: 12,
    color: '#64748b',
  },
  iconPadding: {
    padding: 4,
  },
  flexOne: {
    flex: 1,
  },
  varianciaCard: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
  },
  varButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
  },
  varButtonSelected: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  varButtonUnselected: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  varButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  varButtonTextSelected: {
    color: '#ffffff',
  },
  varButtonTextUnselected: {
    color: '#475569',
  },
  varDescText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#64748b',
  },
  trajectoryCard: {
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  rowBetweenBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  stepsCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  stepsListGap: {
    gap: 8,
  },
  trajectoryStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    padding: 10,
  },
  stepCircleDark: {
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  stepCircleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  trajectoryActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  trajectoryMotorText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#94a3b8',
  },
  timeBadgeBox: {
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  btnApply: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnApplyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  feedbackContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  feedbackSuccess: {
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  feedbackError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  feedbackMsgText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackSuccessText: {
    color: '#047857',
  },
  feedbackErrorText: {
    color: '#b91c1c',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubText: {
    fontSize: 12,
    color: '#64748b',
  },
  modalJsonInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#0f172a',
    height: 160,
  },
  modalJsonExportInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#334155',
    height: 190,
  },
  btnModalCancel: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
  },
  btnModalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  btnModalConfirm: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
  },
  btnModalConfirmText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  btnCopyModal: {
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    marginTop: 4,
  },
  btnCopyModalText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
