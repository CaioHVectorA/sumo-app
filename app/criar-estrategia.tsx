import React, { useEffect, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';

import {
  getCalibratedMovements,
  getCustomStrategies,
  saveCalibratedMovement,
  saveCustomStrategy,
} from '../src/services/strategyStorage';
import {
  testMovementOnRobot,
  testStrategyOnRobot,
} from '../src/services/robotCommunication';
import { CalibratedMovement, CustomStrategy, StrategyStep } from '../src/types/strategy';
import { calculateCurvePWM, clampPWM } from '../src/utils/movementMath';

const ACCEL_OPTIONS = [
  { value: 0, label: 'Off (0)' },
  { value: 20, label: 'Suave (+20)' },
  { value: 50, label: 'Média (+50)' },
  { value: 100, label: 'Rápida (+100)' },
];

const PRESET_STRATEGY_DEFAULTS: Record<string, { title: string; subtitle: string; badge: string; desc: string; steps: StrategyStep[] }> = {
  A: {
    title: 'Estratégia A',
    subtitle: 'Giro de Eixo + Curva de Fuga',
    badge: 'Preset A',
    desc: 'Gira no próprio eixo e executa curva acelerada para flanquear o oponente.',
    steps: [
      { id: 'step_a_1', movementId: 'VIRA_DIREITA', name: 'Giro no Eixo (Direita)', motorEsq: 1599, motorDir: -1599, timeMs: 100, accelStep: 0, visualType: 'turn_right', actionDescription: 'Giro inicial de despiste' },
      { id: 'step_a_2', movementId: 'CURVA', name: 'Curva Aberta à Esquerda', motorEsq: 450, motorDir: 1599, timeMs: 550, accelStep: 50, visualType: 'curve_left', actionDescription: 'Curva para contorno' },
    ],
  },
  B: {
    title: 'Estratégia B',
    subtitle: 'Giro Curto + Arranque Diagonal',
    badge: 'Preset B',
    desc: 'Giro de 48ms à direita, avança reto, curva diagonal fechada e acelera.',
    steps: [
      { id: 'step_b_1', movementId: 'VIRA_DIREITA', name: 'Giro Curto Direita', motorEsq: 1100, motorDir: -1100, timeMs: 48, accelStep: 0, visualType: 'turn_right', actionDescription: 'Ajuste de ângulo' },
      { id: 'step_b_2', movementId: 'FRENTE', name: 'Avanço Reto Rápido', motorEsq: 1500, motorDir: 1500, timeMs: 120, accelStep: 50, visualType: 'forward', actionDescription: 'Sprint rápido' },
      { id: 'step_b_3', movementId: 'CURVA', name: 'Curva Diagonal Fechada', motorEsq: 200, motorDir: 1400, timeMs: 182, accelStep: 0, visualType: 'curve_left', actionDescription: 'Desvio diagonal' },
      { id: 'step_b_4', movementId: 'FRENTE', name: 'Sprint Final', motorEsq: 1500, motorDir: 1500, timeMs: 500, accelStep: 100, visualType: 'forward', actionDescription: 'Aceleração de impacto' },
    ],
  },
  C: {
    title: 'Estratégia C',
    subtitle: 'Modo Defensivo / Esquiva',
    badge: 'Preset C',
    desc: 'Permanece imóvel aguardando o oponente e engata contra-ataque a 100%.',
    steps: [
      { id: 'step_c_1', movementId: 'PARAR', name: 'Imóvel (Aguardar Oponente)', motorEsq: 0, motorDir: 0, timeMs: 400, accelStep: 0, visualType: 'stop', actionDescription: 'Espera tática' },
      { id: 'step_c_2', movementId: 'FRENTE', name: 'Contra-ataque 100%', motorEsq: 1599, motorDir: 1599, timeMs: 160, accelStep: 100, visualType: 'forward', actionDescription: 'Ataque frontal máximo' },
    ],
  },
  D: {
    title: 'Estratégia D',
    subtitle: 'Finta (Arranca - Para - Arranca)',
    badge: 'Preset D',
    desc: 'Impulso reto por 180ms, para por 400ms para enganar adversário e avança.',
    steps: [
      { id: 'step_d_1', movementId: 'FRENTE', name: 'Impulso Inicial', motorEsq: 1599, motorDir: 1599, timeMs: 180, accelStep: 50, visualType: 'forward', actionDescription: 'Finta de arranque' },
      { id: 'step_d_2', movementId: 'PARAR', name: 'Pausa Completa', motorEsq: 0, motorDir: 0, timeMs: 400, accelStep: 0, visualType: 'stop', actionDescription: 'Pausa para engodo' },
      { id: 'step_d_3', movementId: 'FRENTE', name: 'Segundo Avanço 100%', motorEsq: 1599, motorDir: 1599, timeMs: 160, accelStep: 100, visualType: 'forward', actionDescription: 'Arrancada decisiva' },
    ],
  },
};

export default function CriarEstrategiaScreen() {
  const params = useLocalSearchParams<{ editId?: string; presetId?: string }>();
  const editId = params.editId;
  const presetId = params.presetId;

  // Tab ativa: 'EDIT_STRATEGY' (Montar) ou 'CALIBRATE' (Calibrar)
  const [activeTab, setActiveTab] = useState<'EDIT_STRATEGY' | 'CALIBRATE'>('EDIT_STRATEGY');

  // --- ESTADO DE CALIBRAÇÃO ---
  const [calibrations, setCalibrations] = useState<CalibratedMovement[]>([]);
  const [selectedCalibId, setSelectedCalibId] = useState<string>('FRENTE');
  const [calibMotorEsq, setCalibMotorEsq] = useState<number>(1500);
  const [calibMotorDir, setCalibMotorDir] = useState<number>(1500);
  const [calibTimeMs, setCalibTimeMs] = useState<number>(300);
  const [calibAccelStep, setCalibAccelStep] = useState<number>(0);
  const [calibCurveAngle, setCalibCurveAngle] = useState<number>(45);
  const [calibBasePwm, setCalibBasePwm] = useState<number>(1500);

  // Modal para criação de Movimento Customizado
  const [showCustomMovementModal, setShowCustomMovementModal] = useState(false);
  const [customMovName, setCustomMovName] = useState('');
  const [customMovDesc, setCustomMovDesc] = useState('');
  const [customMovEsq, setCustomMovEsq] = useState(1200);
  const [customMovDir, setCustomMovDir] = useState(1200);
  const [customMovTime, setCustomMovTime] = useState(300);
  const [customMovAccel, setCustomMovAccel] = useState(0);

  // Modal para Adicionar Passo à Estratégia
  const [showAddStepModal, setShowAddStepModal] = useState(false);

  // --- ESTADO DA ESTRATÉGIA ---
  const [strategyId, setStrategyId] = useState<string>('');
  const [strategyTitle, setStrategyTitle] = useState('Minha Estratégia');
  const [strategySubtitle, setStrategySubtitle] = useState('Sequência tática customizada');
  const [strategyBadge, setStrategyBadge] = useState('Customizada');
  const [strategyDesc, setStrategyDesc] = useState('Sequência de movimentos configurada pelo usuário.');
  const [steps, setSteps] = useState<StrategyStep[]>([]);

  // Feedback e Testes
  const [testingStepId, setTestingStepId] = useState<string | null>(null);
  const [isTestingFull, setIsTestingFull] = useState(false);
  const [isTestingCalib, setIsTestingCalib] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [editId, presetId]);

  const loadData = async () => {
    const loadedCalibs = await getCalibratedMovements();
    setCalibrations(loadedCalibs);

    const initialCalib = loadedCalibs.find((c) => c.id === 'FRENTE') || loadedCalibs[0];
    if (initialCalib) {
      updateCalibForm(initialCalib);
    }

    if (presetId && PRESET_STRATEGY_DEFAULTS[presetId]) {
      const preset = PRESET_STRATEGY_DEFAULTS[presetId];
      setStrategyId(`custom_from_${presetId}_${Date.now()}`);
      setStrategyTitle(`${preset.title} (Personalizada)`);
      setStrategySubtitle(preset.subtitle);
      setStrategyBadge(preset.badge);
      setStrategyDesc(preset.desc);
      setSteps(preset.steps);
    } else if (editId) {
      const allStrats = await getCustomStrategies();
      const found = allStrats.find((s) => s.id === editId);
      if (found) {
        setStrategyId(found.id);
        setStrategyTitle(found.title);
        setStrategySubtitle(found.subtitle);
        setStrategyBadge(found.badge || 'Customizada');
        setStrategyDesc(found.description);
        setSteps(found.steps || []);
      }
    } else {
      setStrategyId(`custom_${Date.now()}`);
      setSteps([
        {
          id: `step_1_${Date.now()}`,
          movementId: 'FRENTE',
          name: 'Andar para Frente',
          motorEsq: initialCalib ? initialCalib.motorEsq : 1500,
          motorDir: initialCalib ? initialCalib.motorDir : 1500,
          timeMs: 300,
          accelStep: 0,
          visualType: 'forward',
          actionDescription: 'Avanço reto inicial',
        },
      ]);
    }
  };

  const updateCalibForm = (calib: CalibratedMovement) => {
    setSelectedCalibId(calib.id);
    setCalibMotorEsq(calib.motorEsq);
    setCalibMotorDir(calib.motorDir);
    setCalibTimeMs(calib.timeMs);
    setCalibAccelStep(calib.accelStep ?? 0);
    setCalibCurveAngle(calib.curveAngle ?? 45);
    setCalibBasePwm(
      calib.basePwm ?? (Math.max(Math.abs(calib.motorEsq), Math.abs(calib.motorDir)) || 1500)
    );
  };

  const handleSelectCalib = (calib: CalibratedMovement) => {
    updateCalibForm(calib);
  };

  const handleCurveAngleChange = (angleDeg: number) => {
    setCalibCurveAngle(angleDeg);
    const { motorEsq, motorDir } = calculateCurvePWM(calibBasePwm, angleDeg);
    setCalibMotorEsq(motorEsq);
    setCalibMotorDir(motorDir);
  };

  const handleSaveCalib = async () => {
    const current = calibrations.find((c) => c.id === selectedCalibId);
    if (!current) return;

    const updated: CalibratedMovement = {
      ...current,
      motorEsq: calibMotorEsq,
      motorDir: calibMotorDir,
      timeMs: calibTimeMs,
      accelStep: calibAccelStep,
      curveAngle: current.type === 'CURVA' ? calibCurveAngle : current.curveAngle,
      basePwm: current.type === 'CURVA' ? calibBasePwm : current.basePwm,
    };

    const newList = await saveCalibratedMovement(updated);
    setCalibrations(newList);
    triggerHaptic();
    showBanner('success', `✓ Calibração de "${updated.name}" salva!`);
  };

  const handleTestCalibMovement = async () => {
    setIsTestingCalib(true);
    triggerHaptic();
    showBanner('info', `▶ Executando "${selectedCalibId}" por ${calibTimeMs}ms...`);

    try {
      await testMovementOnRobot(calibMotorEsq, calibMotorDir, calibTimeMs, calibAccelStep);
      showBanner('success', `✓ Movimento executado no robô!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro no envio Bluetooth';
      showBanner('error', `✗ ${msg}`);
    } finally {
      setIsTestingCalib(false);
    }
  };

  const handleSaveCustomMovement = async () => {
    if (!customMovName.trim()) {
      Alert.alert('Atenção', 'Digite o nome do movimento customizado.');
      return;
    }

    const newId = `custom_mov_${Date.now()}`;
    const newCalib: CalibratedMovement = {
      id: newId,
      type: 'CUSTOM',
      name: customMovName,
      description: customMovDesc || 'Movimento personalizado',
      motorEsq: customMovEsq,
      motorDir: customMovDir,
      timeMs: customMovTime,
      accelStep: customMovAccel,
      icon: 'extension-puzzle-outline',
      visualType: 'custom',
      isCustom: true,
    };

    const newList = await saveCalibratedMovement(newCalib);
    setCalibrations(newList);
    updateCalibForm(newCalib);
    setShowCustomMovementModal(false);
    setCustomMovName('');
    setCustomMovDesc('');
    triggerHaptic();
    showBanner('success', `✓ Movimento "${newCalib.name}" criado com sucesso!`);
  };

  const handleAddStep = (calib: CalibratedMovement) => {
    const newStep: StrategyStep = {
      id: `step_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      movementId: calib.id,
      name: calib.name,
      motorEsq: calib.motorEsq,
      motorDir: calib.motorDir,
      timeMs: calib.timeMs,
      accelStep: calib.accelStep ?? 0,
      curveAngle: calib.curveAngle,
      visualType: calib.visualType,
      actionDescription: calib.description,
    };

    setSteps([...steps, newStep]);
    setShowAddStepModal(false);
    triggerHaptic();
    showBanner('success', `+ Passo "${calib.name}" adicionado!`);
  };

  const handleUpdateStepField = (index: number, field: keyof StrategyStep, value: any) => {
    const updated = [...steps];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setSteps(updated);
  };

  const handleMoveStepUp = (index: number) => {
    if (index === 0) return;
    const updated = [...steps];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setSteps(updated);
  };

  const handleMoveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    const updated = [...steps];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setSteps(updated);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleTestSingleStep = async (step: StrategyStep) => {
    setTestingStepId(step.id);
    triggerHaptic();
    showBanner('info', `▶ Executando "${step.name}" (${step.timeMs}ms)...`);

    try {
      await testMovementOnRobot(step.motorEsq, step.motorDir, step.timeMs, step.accelStep);
      showBanner('success', `✓ Passo "${step.name}" executado!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro Bluetooth';
      showBanner('error', `✗ ${msg}`);
    } finally {
      setTestingStepId(null);
    }
  };

  const handleTestFullStrategy = async () => {
    if (steps.length === 0) {
      Alert.alert('Atenção', 'Adicione movimentos antes de testar.');
      return;
    }

    const totalTimeMs = steps.reduce((sum, s) => sum + s.timeMs, 0);
    setIsTestingFull(true);
    triggerHaptic();
    showBanner('info', `▶ Executando sequência (${steps.length} passos / ~${totalTimeMs}ms)...`);

    try {
      await testStrategyOnRobot(steps);
      showBanner('success', `✓ Teste da sequência concluído!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro Bluetooth';
      showBanner('error', `✗ ${msg}`);
    } finally {
      setIsTestingFull(false);
    }
  };

  const handleSaveStrategy = async () => {
    if (!strategyTitle.trim()) {
      Alert.alert('Atenção', 'Digite um nome para a estratégia.');
      return;
    }
    if (steps.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos 1 movimento à estratégia.');
      return;
    }

    const strategyObj: CustomStrategy = {
      id: strategyId || `custom_${Date.now()}`,
      title: strategyTitle,
      subtitle: strategySubtitle,
      badge: strategyBadge,
      description: strategyDesc,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true,
    };

    await saveCustomStrategy(strategyObj);
    triggerHaptic();
    Alert.alert('Sucesso', 'Estratégia salva com sucesso!', [
      { text: 'OK', onPress: () => router.replace('/estrategias' as any) },
    ]);
  };

  const triggerHaptic = () => {
    try { Vibration.vibrate(30); } catch {}
  };

  const showBanner = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusBanner({ type, text });
  };

  const selectedCalib = calibrations.find((c) => c.id === selectedCalibId) || calibrations[0];

  return (
    <View style={styles.container}>
      {/* CABEÇALHO SUPERIOR (VOLTA EXPLICITAMENTE PARA A TELA DE ESTRATÉGIAS) */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/estrategias' as any)}
          style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Criar / Editar Estratégia</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* TABS CONVENCIONAIS SEM ÍCONES (INTERFACE LIMPA E DIRETA) */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'EDIT_STRATEGY' && styles.tabButtonActive]}
          onPress={() => setActiveTab('EDIT_STRATEGY')}
          activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'EDIT_STRATEGY' && styles.tabTextActive]}>
            Montar Estratégia
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'CALIBRATE' && styles.tabButtonActive]}
          onPress={() => setActiveTab('CALIBRATE')}
          activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'CALIBRATE' && styles.tabTextActive]}>
            Calibrar Movimentos
          </Text>
        </TouchableOpacity>
      </View>

      {/* BANNER DE STATUS */}
      {statusBanner && (
        <View
          style={[
            styles.banner,
            statusBanner.type === 'error' && styles.bannerError,
            statusBanner.type === 'success' && styles.bannerSuccess,
            statusBanner.type === 'info' && styles.bannerInfo,
          ]}>
          <Text
            style={[
              styles.bannerText,
              statusBanner.type === 'error' && styles.bannerTextError,
              statusBanner.type === 'success' && styles.bannerTextSuccess,
              statusBanner.type === 'info' && styles.bannerTextInfo,
            ]}>
            {statusBanner.text}
          </Text>
        </View>
      )}

      {/* TAB 1: MONTAR ESTRATÉGIA */}
      {activeTab === 'EDIT_STRATEGY' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dados da Estratégia</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nome da Estratégia</Text>
              <TextInput
                style={styles.input}
                value={strategyTitle}
                onChangeText={setStrategyTitle}
                placeholder="Ex: Ataque Flanqueado Rápido"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Descrição Tática</Text>
              <TextInput
                style={styles.input}
                value={strategyDesc}
                onChangeText={setStrategyDesc}
                placeholder="Ex: Gira 90° à direita e contorna o adversário"
              />
            </View>
          </View>

          {/* LISTA DE ETAPAS EDITÁVEIS EM TEMPO REAL */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Sequência de Passos</Text>
                <Text style={styles.cardSubtitle}>{steps.length} passo(s) configurado(s)</Text>
              </View>

              <TouchableOpacity
                onPress={() => setShowAddStepModal(true)}
                style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Adicionar Passo</Text>
              </TouchableOpacity>
            </View>

            {steps.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>Nenhum passo adicionado ainda.</Text>
                <Text style={styles.emptyStateSubtext}>Clique no botão acima para escolher os movimentos.</Text>
              </View>
            ) : (
              <View style={styles.stepsList}>
                {steps.map((step, idx) => {
                  const isSingleTesting = testingStepId === step.id;

                  return (
                    <View key={step.id} style={styles.stepCard}>
                      {/* CABEÇALHO DO PASSO COM AÇÕES */}
                      <View style={styles.stepHeader}>
                        <View style={styles.stepBadgeNum}>
                          <Text style={styles.stepBadgeNumText}>#{idx + 1}</Text>
                        </View>

                        <Text style={styles.stepName}>{step.name}</Text>

                        <View style={styles.stepActionsRow}>
                          <TouchableOpacity
                            onPress={() => handleTestSingleStep(step)}
                            disabled={isSingleTesting || isTestingFull}
                            style={[
                              styles.testSingleBtn,
                              isSingleTesting && styles.testSingleBtnActive,
                            ]}>
                            <Text style={styles.testSingleBtnText}>
                              {isSingleTesting ? 'Testando...' : 'Testar'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleMoveStepUp(idx)}
                            disabled={idx === 0}
                            style={styles.iconActionBtn}>
                            <Text style={{ fontSize: 12, color: idx === 0 ? '#cbd5e1' : '#475569' }}>▲</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleMoveStepDown(idx)}
                            disabled={idx === steps.length - 1}
                            style={styles.iconActionBtn}>
                            <Text style={{ fontSize: 12, color: idx === steps.length - 1 ? '#cbd5e1' : '#475569' }}>▼</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleRemoveStep(idx)}
                            style={[styles.iconActionBtn, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
                            <Text style={{ fontSize: 12, color: '#e11d48', fontWeight: 'bold' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* CAMPOS DE EDIÇÃO EM TEMPO REAL: PWM ESQUERDO, PWM DIREITO, DURAÇÃO E ACELERAÇÃO */}
                      <View style={styles.stepInputsRow}>
                        <View style={styles.stepInputCol}>
                          <Text style={styles.fieldLabel}>PWM Esq (-1599..1599)</Text>
                          <TextInput
                            style={styles.stepNumericInput}
                            keyboardType="numeric"
                            value={String(step.motorEsq)}
                            onChangeText={(val) =>
                              handleUpdateStepField(idx, 'motorEsq', clampPWM(parseInt(val) || 0))
                            }
                          />
                        </View>

                        <View style={styles.stepInputCol}>
                          <Text style={styles.fieldLabel}>PWM Dir (-1599..1599)</Text>
                          <TextInput
                            style={styles.stepNumericInput}
                            keyboardType="numeric"
                            value={String(step.motorDir)}
                            onChangeText={(val) =>
                              handleUpdateStepField(idx, 'motorDir', clampPWM(parseInt(val) || 0))
                            }
                          />
                        </View>

                        <View style={styles.stepInputCol}>
                          <Text style={styles.fieldLabel}>Duração (ms)</Text>
                          <TextInput
                            style={styles.stepNumericInput}
                            keyboardType="numeric"
                            value={String(step.timeMs)}
                            onChangeText={(val) =>
                              handleUpdateStepField(idx, 'timeMs', Math.max(0, parseInt(val) || 0))
                            }
                          />
                        </View>
                      </View>

                      {/* SELETOR DE ACELERAÇÃO/RAMPA NO PASSO */}
                      <View style={{ gap: 4, marginTop: 4 }}>
                        <Text style={styles.fieldLabel}>Aceleração / Rampa PWM:</Text>
                        <View style={styles.accelOptionsRow}>
                          {ACCEL_OPTIONS.map((opt) => {
                            const isAccSelected = (step.accelStep || 0) === opt.value;
                            return (
                              <TouchableOpacity
                                key={opt.value}
                                onPress={() => handleUpdateStepField(idx, 'accelStep', opt.value)}
                                style={[
                                  styles.accelOptionBtn,
                                  isAccSelected && styles.accelOptionBtnActive,
                                ]}>
                                <Text
                                  style={[
                                    styles.accelOptionText,
                                    isAccSelected && styles.accelOptionTextActive,
                                  ]}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* BOTÕES DE AÇÃO INFERIORES DA ESTRATÉGIA */}
          <View style={styles.actionsFooter}>
            <TouchableOpacity
              onPress={handleTestFullStrategy}
              disabled={isTestingFull || steps.length === 0}
              style={[styles.primaryButton, styles.testFullButton]}>
              <Text style={styles.primaryButtonText}>
                {isTestingFull ? 'Executando no Robô...' : 'Testar Estratégia Completa no Robô'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSaveStrategy} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Salvar Estratégia</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* TAB 2: CALIBRAR E CRIAR MOVIMENTOS */
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Movimentos Calibrados</Text>

              {/* BOTÃO PARA CRIAR NOVO MOVIMENTO CUSTOMIZADO */}
              <TouchableOpacity
                onPress={() => setShowCustomMovementModal(true)}
                style={styles.createMovBtn}>
                <Text style={styles.createMovBtnText}>+ Criar Movimento</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calibListScroll}>
              {calibrations.map((calib) => {
                const isSelected = calib.id === selectedCalibId;
                return (
                  <TouchableOpacity
                    key={calib.id}
                    onPress={() => handleSelectCalib(calib)}
                    style={[styles.calibTabItem, isSelected && styles.calibTabItemActive]}>
                    <Text
                      style={[
                        styles.calibTabItemText,
                        isSelected && styles.calibTabItemTextActive,
                      ]}>
                      {calib.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {selectedCalib && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Calibrar: {selectedCalib.name}</Text>
              <Text style={styles.cardSubtitle}>{selectedCalib.description}</Text>

              {/* SE FOR CURVA: CONTROLE DE ÂNGULO INTUITIVO */}
              {selectedCalib.type === 'CURVA' && (
                <View style={styles.curveBox}>
                  <Text style={styles.curveTitle}>Ângulo da Curva / Razão entre Motores</Text>

                  <View style={styles.angleRow}>
                    {[-90, -45, 0, 45, 90].map((angle) => (
                      <TouchableOpacity
                        key={angle}
                        onPress={() => handleCurveAngleChange(angle)}
                        style={[
                          styles.angleBtn,
                          calibCurveAngle === angle && styles.angleBtnActive,
                        ]}>
                        <Text
                          style={[
                            styles.angleBtnText,
                            calibCurveAngle === angle && styles.angleBtnTextActive,
                          ]}>
                          {angle > 0 ? `+${angle}°` : `${angle}°`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* INPUTS MANUAIS DE PWM E TEMPO */}
              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.label}>PWM Motor Esquerdo (-1599..1599)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(calibMotorEsq)}
                    onChangeText={(v) => setCalibMotorEsq(clampPWM(parseInt(v) || 0))}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.label}>PWM Motor Direito (-1599..1599)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(calibMotorDir)}
                    onChangeText={(v) => setCalibMotorDir(clampPWM(parseInt(v) || 0))}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.label}>Duração (ms)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(calibTimeMs)}
                    onChangeText={(v) => setCalibTimeMs(Math.max(0, parseInt(v) || 0))}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.label}>Aceleração Progressiva (Rampa)</Text>
                  <View style={styles.accelOptionsRow}>
                    {ACCEL_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setCalibAccelStep(opt.value)}
                        style={[
                          styles.accelOptionBtn,
                          calibAccelStep === opt.value && styles.accelOptionBtnActive,
                        ]}>
                        <Text
                          style={[
                            styles.accelOptionText,
                            calibAccelStep === opt.value && styles.accelOptionTextActive,
                          ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* BOTÕES DA TAB DE CALIBRAÇÃO */}
              <View style={styles.actionsFooter}>
                <TouchableOpacity
                  onPress={handleTestCalibMovement}
                  disabled={isTestingCalib}
                  style={[styles.primaryButton, styles.testFullButton]}>
                  <Text style={styles.primaryButtonText}>
                    {isTestingCalib ? 'Testando...' : 'Testar Movimento Calibrado'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSaveCalib} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Salvar Calibração</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* MODAL 1: SELECIONAR MOVIMENTO A ADICIONAR NA ESTRATÉGIA */}
      <Modal visible={showAddStepModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar Movimento</Text>
              <TouchableOpacity onPress={() => setShowAddStepModal(false)}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {calibrations.map((calib) => (
                <TouchableOpacity
                  key={calib.id}
                  onPress={() => handleAddStep(calib)}
                  style={styles.addStepOptionItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addStepOptionName}>{calib.name}</Text>
                    <Text style={styles.addStepOptionDesc}>
                      PWM: Esq {calib.motorEsq} | Dir {calib.motorDir} ({calib.timeMs}ms)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#0f172a', fontWeight: 'bold' }}>+</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => {
                setShowAddStepModal(false);
                setShowCustomMovementModal(true);
              }}
              style={styles.createCustomStepBtn}>
              <Text style={styles.createCustomStepBtnText}>+ Criar Novo Movimento Customizado...</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: UI DEDICADA PARA CRIAR NOVO MOVIMENTO CUSTOMIZADO */}
      <Modal visible={showCustomMovementModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Criar Novo Movimento Customizado</Text>
              <TouchableOpacity onPress={() => setShowCustomMovementModal(false)}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nome do Movimento</Text>
              <TextInput
                style={styles.input}
                value={customMovName}
                onChangeText={setCustomMovName}
                placeholder="Ex: Arrancada Curva 30°"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Descrição (Opcional)</Text>
              <TextInput
                style={styles.input}
                value={customMovDesc}
                onChangeText={setCustomMovDesc}
                placeholder="Ex: Curva fechada com rampa de potência"
              />
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>PWM Motor Esq</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(customMovEsq)}
                  onChangeText={(v) => setCustomMovEsq(clampPWM(parseInt(v) || 0))}
                />
              </View>

              <View style={styles.inputHalf}>
                <Text style={styles.label}>PWM Motor Dir</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(customMovDir)}
                  onChangeText={(v) => setCustomMovDir(clampPWM(parseInt(v) || 0))}
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Duração (ms)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(customMovTime)}
                  onChangeText={(v) => setCustomMovTime(Math.max(0, parseInt(v) || 0))}
                />
              </View>

              <View style={styles.inputHalf}>
                <Text style={styles.label}>Aceleração / Rampa</Text>
                <View style={styles.accelOptionsRow}>
                  {ACCEL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setCustomMovAccel(opt.value)}
                      style={[
                        styles.accelOptionBtn,
                        customMovAccel === opt.value && styles.accelOptionBtnActive,
                      ]}>
                      <Text
                        style={[
                          styles.accelOptionText,
                          customMovAccel === opt.value && styles.accelOptionTextActive,
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setShowCustomMovementModal(false)}
                style={[styles.primaryButton, { flex: 1, backgroundColor: '#cbd5e1' }]}>
                <Text style={[styles.primaryButtonText, { color: '#0f172a' }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveCustomMovement}
                style={[styles.primaryButton, { flex: 1, backgroundColor: '#0284c7' }]}>
                <Text style={styles.primaryButtonText}>Salvar Movimento</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  banner: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
  },
  bannerSuccess: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  bannerError: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  bannerInfo: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bannerTextSuccess: { color: '#065f46' },
  bannerTextError: { color: '#9f1239' },
  bannerTextInfo: { color: '#075985' },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  createMovBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  createMovBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  emptyStateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  emptyStateSubtext: {
    fontSize: 11,
    color: '#94a3b8',
  },
  stepsList: {
    gap: 10,
  },
  stepCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepBadgeNum: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stepBadgeNumText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  stepName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  stepActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  testSingleBtn: {
    backgroundColor: '#d97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  testSingleBtnActive: {
    backgroundColor: '#b45309',
  },
  testSingleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  iconActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  stepInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepInputCol: {
    flex: 1,
    gap: 2,
  },
  stepNumericInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#0f172a',
  },
  actionsFooter: {
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 10,
  },
  testFullButton: {
    backgroundColor: '#d97706',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  calibListScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  calibTabItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
  },
  calibTabItemActive: {
    backgroundColor: '#0f172a',
  },
  calibTabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  calibTabItemTextActive: {
    color: '#ffffff',
  },
  curveBox: {
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 8,
  },
  curveTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  angleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  angleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  angleBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  angleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
  },
  angleBtnTextActive: {
    color: '#ffffff',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputHalf: {
    flex: 1,
    gap: 4,
  },
  accelOptionsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  accelOptionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  accelOptionBtnActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  accelOptionText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  accelOptionTextActive: {
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  addStepOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  addStepOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  addStepOptionDesc: {
    fontSize: 11,
    color: '#64748b',
  },
  createCustomStepBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  createCustomStepBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
});
