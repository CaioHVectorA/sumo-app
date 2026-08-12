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
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Container } from '@/components/Container';
import { send } from '@/src/services/bluetooth';
import {
  CustomStrategy,
  DEFAULT_MOVEMENT_PRESETS,
  getCustomStrategies,
  getMovementPresets,
  MovementPreset,
  resetMovementPresets,
  saveCustomStrategy,
  saveMovementPreset,
  StrategyStep,
} from '@/src/services/strategyStorage';

export default function EditarEstrategiaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const [activeTab, setActiveTab] = useState<'calibracao' | 'estrategia'>('calibracao');

  // Estado de Presets de Movimento Calibrados
  const [presets, setPresets] = useState<MovementPreset[]>(DEFAULT_MOVEMENT_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState<MovementPreset | null>(
    DEFAULT_MOVEMENT_PRESETS[0]
  );
  const [presetEsq, setPresetEsq] = useState<string>('1599');
  const [presetDir, setPresetDir] = useState<string>('-1599');
  const [presetTime, setPresetTime] = useState<string>('120');

  // Estado de Teste de Movimento
  const [testingPreset, setTestingPreset] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  // Estado de Estratégia Customizada
  const [strategyId, setStrategyId] = useState<string>('');
  const [title, setTitle] = useState<string>('Nova Estratégia');
  const [subtitle, setSubtitle] = useState<string>('Descrição rápida da tática');
  const [badge, setBadge] = useState<string>('Customizada');
  const [description, setDescription] = useState<string>('Estratégia configurada manualmente.');
  const [iconName, setIconName] = useState<string>('flash-outline');
  const [steps, setSteps] = useState<StrategyStep[]>([]);

  // Modal para adicionar/editar etapa da estratégia
  const [stepModalVisible, setStepModalVisible] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [stepAction, setStepAction] = useState('');
  const [stepEsq, setStepEsq] = useState('1599');
  const [stepDir, setStepDir] = useState('1599');
  const [stepTime, setStepTime] = useState('300');
  const [stepMovementId, setStepMovementId] = useState<string>('');

  // Carrega dados iniciais com segurança
  useEffect(() => {
    loadInitialData();
  }, [params.id]);

  const loadInitialData = async () => {
    try {
      const loadedPresets = await getMovementPresets();
      const validPresets = loadedPresets && loadedPresets.length > 0 ? loadedPresets : DEFAULT_MOVEMENT_PRESETS;
      setPresets(validPresets);

      selectPresetToEdit(validPresets[0]);

      if (params.id) {
        const strats = await getCustomStrategies();
        const existing = strats.find((s) => s.id === params.id);
        if (existing) {
          setStrategyId(existing.id);
          setTitle(existing.title);
          setSubtitle(existing.subtitle);
          setBadge(existing.badge);
          setDescription(existing.description);
          setIconName(existing.iconName);
          setSteps(existing.steps || []);
          setActiveTab('estrategia');
        }
      } else {
        setStrategyId(`CUST_${Date.now()}`);
      }
    } catch (e) {
      console.error('Erro ao carregar dados iniciais:', e);
    }
  };

  const selectPresetToEdit = (preset: MovementPreset | null) => {
    if (!preset) return;
    setSelectedPreset(preset);
    setPresetEsq(preset.motorEsq.toString());
    setPresetDir(preset.motorDir.toString());
    setPresetTime(preset.timeMs.toString());
    setTestFeedback(null);
  };

  const handleTabSwitch = (tab: 'calibracao' | 'estrategia') => {
    setActiveTab(tab);
    setTestFeedback(null);
  };

  // --- CALIBRAÇÃO & TESTE DE MOVIMENTO ---

  const handleTestPreset = async () => {
    if (!selectedPreset) return;
    setTestingPreset(true);
    setTestFeedback(null);
    try {
      Vibration.vibrate(30);
      const esq = parseInt(presetEsq, 10) || 0;
      const dir = parseInt(presetDir, 10) || 0;
      const ms = parseInt(presetTime, 10) || 0;

      await send(`TEST_STEP,${esq},${dir},${ms}`);
      setTestFeedback(`✓ Movimento enviado! (${esq} / ${dir} por ${ms}ms)`);
    } catch (err: any) {
      setTestFeedback(`✗ Erro ao testar: ${err.message || 'Falha no Bluetooth'}`);
    } finally {
      setTestingPreset(false);
    }
  };

  const handleSavePreset = async () => {
    if (!selectedPreset) return;
    const esq = parseInt(presetEsq, 10);
    const dir = parseInt(presetDir, 10);
    const ms = parseInt(presetTime, 10);

    if (isNaN(esq) || isNaN(dir) || isNaN(ms)) {
      Alert.alert('Valores Inválidos', 'Preencha valores numéricos para motores e tempo.');
      return;
    }

    const updated: MovementPreset = {
      ...selectedPreset,
      motorEsq: Math.max(-1599, Math.min(1599, esq)),
      motorDir: Math.max(-1599, Math.min(1599, dir)),
      timeMs: Math.max(0, ms),
    };

    const newPresetsList = await saveMovementPreset(updated);
    setPresets(newPresetsList);
    setSelectedPreset(updated);
    Alert.alert(
      'Calibração Salva!',
      `O movimento "${updated.name}" foi atualizado e recalibrado nas estratégias vinculadas.`
    );
  };

  const handleResetPresets = async () => {
    Alert.alert(
      'Restaurar Padrões',
      'Deseja restaurar as calibrações de movimento para os valores de fábrica?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            const restored = await resetMovementPresets();
            setPresets(restored);
            if (restored.length > 0) selectPresetToEdit(restored[0]);
          },
        },
      ]
    );
  };

  // --- MONTAGEM & TESTE DA ESTRATÉGIA ---

  const handleOpenAddStepModal = () => {
    setEditingStepIndex(null);
    if (presets.length > 0) {
      const defaultP = presets[0];
      setStepMovementId(defaultP.id);
      setStepAction(defaultP.name);
      setStepEsq(defaultP.motorEsq.toString());
      setStepDir(defaultP.motorDir.toString());
      setStepTime(defaultP.timeMs.toString());
    } else {
      setStepMovementId('');
      setStepAction('Nova Etapa');
      setStepEsq('1599');
      setStepDir('1599');
      setStepTime('300');
    }
    setStepModalVisible(true);
  };

  const handleSelectPresetForStep = (pId: string) => {
    setStepMovementId(pId);
    const p = presets.find((item) => item.id === pId);
    if (p) {
      setStepAction(p.name);
      setStepEsq(p.motorEsq.toString());
      setStepDir(p.motorDir.toString());
      setStepTime(p.timeMs.toString());
    }
  };

  const handleSaveStep = () => {
    const esq = parseInt(stepEsq, 10);
    const dir = parseInt(stepDir, 10);
    const ms = parseInt(stepTime, 10);

    if (isNaN(esq) || isNaN(dir) || isNaN(ms) || !stepAction.trim()) {
      Alert.alert('Campos Inválidos', 'Preencha o nome da ação e os parâmetros dos motores.');
      return;
    }

    const stepData: StrategyStep = {
      id: editingStepIndex !== null && steps[editingStepIndex] ? steps[editingStepIndex].id : `step_${Date.now()}`,
      stepNumber: editingStepIndex !== null ? editingStepIndex + 1 : steps.length + 1,
      movementId: stepMovementId || undefined,
      action: stepAction.trim(),
      motorEsq: Math.max(-1599, Math.min(1599, esq)),
      motorDir: Math.max(-1599, Math.min(1599, dir)),
      timeMs: Math.max(0, ms),
    };

    if (editingStepIndex !== null) {
      const updated = [...steps];
      updated[editingStepIndex] = stepData;
      setSteps(updated);
    } else {
      setSteps([...steps, stepData]);
    }

    setStepModalVisible(false);
  };

  const handleRemoveStep = (index: number) => {
    const updated = steps.filter((_, idx) => idx !== index).map((st, idx) => ({
      ...st,
      stepNumber: idx + 1,
    }));
    setSteps(updated);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === steps.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    const reindexed = updated.map((st, idx) => ({ ...st, stepNumber: idx + 1 }));
    setSteps(reindexed);
  };

  const handleTestFullStrategy = async () => {
    if (steps.length === 0) {
      Alert.alert('Estratégia Vazia', 'Adicione pelo menos 1 etapa para testar no robô.');
      return;
    }

    try {
      Vibration.vibrate([0, 50, 50, 50]);
      const payload =
        `RUN_STRAT,${steps.length};` +
        steps.map((s) => `${s.motorEsq},${s.motorDir},${s.timeMs}`).join(';');
      await send(payload);
      Alert.alert('Estratégia Enviada!', 'A sequência completa foi enviada para execução no robô.');
    } catch (err: any) {
      Alert.alert('Erro ao Testar', err.message || 'Falha ao comunicar via Bluetooth.');
    }
  };

  const handleSaveFullStrategy = async () => {
    if (!title.trim()) {
      Alert.alert('Título Obrigatório', 'Informe o título da estratégia.');
      return;
    }
    if (steps.length === 0) {
      Alert.alert('Sem Etapas', 'Sua estratégia precisa ter ao menos 1 etapa.');
      return;
    }

    const strat: CustomStrategy = {
      id: strategyId || `CUST_${Date.now()}`,
      title: title.trim(),
      subtitle: subtitle.trim() || 'Customizada',
      badge: badge.trim() || 'Personalizada',
      iconName: iconName || 'flash-outline',
      description: description.trim() || 'Estratégia customizada salva pelo usuário.',
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveCustomStrategy(strat);
    Alert.alert('Sucesso!', 'Estratégia salva com sucesso.', [
      {
        text: 'OK',
        onPress: () => router.replace('/estrategias'),
      },
    ]);
  };

  const currentPreset = selectedPreset || (presets.length > 0 ? presets[0] : null);

  return (
    <View style={styles.container}>
      <Container>
        <View style={styles.innerContent}>
          {/* Header Superior com Botão de Voltar */}
          <View style={styles.topHeader}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}>
              <Ionicons name="arrow-back-outline" size={18} color="#0f172a" />
              <Text style={styles.backButtonText}>Voltar</Text>
            </TouchableOpacity>

            <Text style={styles.topHeaderTitle}>Painel de Engenharia</Text>
          </View>

          {/* BARRA DE TABS PROEMINENTE EM STYLESHEET PURO (SEM NATIVEWIND) */}
          <View style={styles.tabBarContainer}>
            <TouchableOpacity
              onPress={() => handleTabSwitch('calibracao')}
              activeOpacity={0.8}
              style={[
                styles.tabButton,
                activeTab === 'calibracao' ? styles.tabButtonCalibActive : styles.tabButtonInactive,
              ]}>
              <Ionicons
                name="options-outline"
                size={20}
                color={activeTab === 'calibracao' ? '#ffffff' : '#94a3b8'}
              />
              <View style={styles.tabTextContainer}>
                <Text
                  style={[
                    styles.tabTitle,
                    activeTab === 'calibracao' ? styles.tabTitleActive : styles.tabTitleInactive,
                  ]}>
                  1. Calibrar Movimentos
                </Text>
                <Text
                  style={[
                    styles.tabSubtitle,
                    activeTab === 'calibracao' ? styles.tabSubtitleCalibActive : styles.tabSubtitleInactive,
                  ]}>
                  Ajuste de PWM / Motores
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleTabSwitch('estrategia')}
              activeOpacity={0.8}
              style={[
                styles.tabButton,
                activeTab === 'estrategia' ? styles.tabButtonStratActive : styles.tabButtonInactive,
              ]}>
              <Ionicons
                name="git-network-outline"
                size={20}
                color={activeTab === 'estrategia' ? '#ffffff' : '#94a3b8'}
              />
              <View style={styles.tabTextContainer}>
                <Text
                  style={[
                    styles.tabTitle,
                    activeTab === 'estrategia' ? styles.tabTitleActive : styles.tabTitleInactive,
                  ]}>
                  2. Montar Estratégia
                </Text>
                <Text
                  style={[
                    styles.tabSubtitle,
                    activeTab === 'estrategia' ? styles.tabSubtitleStratActive : styles.tabSubtitleInactive,
                  ]}>
                  Linha do Tempo Tática
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* MODO 1: CALIBRAÇÃO DE MOVIMENTOS */}
            {activeTab === 'calibracao' ? (
              <View style={styles.sectionContainer}>
                {/* Banner Informativo */}
                <View style={styles.infoBannerSky}>
                  <View style={styles.infoIconSky}>
                    <Ionicons name="construct-outline" size={20} color="#ffffff" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoTitleSky}>Calibração de Movimentos Base</Text>
                    <Text style={styles.infoDescSky}>
                      Calibre a potência dos motores e a duração. Essas alterações são refletidas automaticamente em todas as estratégias que utilizarem estes movimentos.
                    </Text>
                  </View>
                </View>

                {/* Seleção de Movimento Base */}
                <View style={styles.fieldGroup}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.sectionHeaderTitle}>Escolha o Movimento para Calibrar</Text>
                    <TouchableOpacity onPress={handleResetPresets}>
                      <Text style={styles.resetText}>Restaurar Padrões</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalPresetsScroll}>
                    {presets.map((preset) => {
                      const isSelected = currentPreset?.id === preset.id;
                      return (
                        <TouchableOpacity
                          key={preset.id}
                          onPress={() => selectPresetToEdit(preset)}
                          style={[
                            styles.presetCard,
                            isSelected ? styles.presetCardSelected : styles.presetCardUnselected,
                          ]}>
                          <View
                            style={[
                              styles.presetIconBox,
                              isSelected ? styles.presetIconBoxSelected : styles.presetIconBoxUnselected,
                            ]}>
                            <Ionicons
                              name={preset.icon as any}
                              size={18}
                              color={isSelected ? '#ffffff' : '#0f172a'}
                            />
                          </View>
                          <Text
                            style={[
                              styles.presetNameText,
                              isSelected ? styles.presetNameSelected : styles.presetNameUnselected,
                            ]}
                            numberOfLines={1}>
                            {preset.name}
                          </Text>
                          <Text
                            style={[
                              styles.presetTimeText,
                              isSelected ? styles.presetTimeSelected : styles.presetTimeUnselected,
                            ]}>
                            {preset.timeMs}ms
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Painel de Form de Calibração */}
                {currentPreset ? (
                  <View style={styles.cardPanel}>
                    <View style={styles.cardPanelHeader}>
                      <View style={styles.rowCenterGap}>
                        <Ionicons name={currentPreset.icon as any} size={20} color="#0284c7" />
                        <Text style={styles.cardPanelTitle}>{currentPreset.name}</Text>
                      </View>
                      <View style={styles.badgeBox}>
                        <Text style={styles.badgeText}>{currentPreset.id}</Text>
                      </View>
                    </View>

                    <Text style={styles.cardPanelDesc}>{currentPreset.description}</Text>

                    {/* Inputs */}
                    <View style={styles.fieldGroup}>
                      <View>
                        <Text style={styles.inputLabel}>Motor Esquerdo (PWM -1599 a +1599):</Text>
                        <TextInput
                          value={presetEsq}
                          onChangeText={setPresetEsq}
                          keyboardType="numeric"
                          style={styles.textInputMono}
                        />
                      </View>

                      <View>
                        <Text style={styles.inputLabel}>Motor Direito (PWM -1599 a +1599):</Text>
                        <TextInput
                          value={presetDir}
                          onChangeText={setPresetDir}
                          keyboardType="numeric"
                          style={styles.textInputMono}
                        />
                      </View>

                      <View>
                        <Text style={styles.inputLabel}>Duração do Movimento (milissegundos):</Text>
                        <TextInput
                          value={presetTime}
                          onChangeText={setPresetTime}
                          keyboardType="numeric"
                          style={styles.textInputMono}
                        />
                      </View>
                    </View>

                    {/* Botões de Ação */}
                    <View style={styles.rowButtons}>
                      <TouchableOpacity
                        onPress={handleTestPreset}
                        disabled={testingPreset}
                        activeOpacity={0.8}
                        style={styles.btnSky}>
                        <Ionicons name="flash-outline" size={16} color="#ffffff" />
                        <Text style={styles.btnTextWhite}>
                          {testingPreset ? 'Enviando...' : 'Testar no Robô'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleSavePreset}
                        activeOpacity={0.8}
                        style={styles.btnEmerald}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                        <Text style={styles.btnTextWhite}>Salvar Calibração</Text>
                      </TouchableOpacity>
                    </View>

                    {testFeedback ? (
                      <View style={styles.feedbackBox}>
                        <Text style={styles.feedbackText}>{testFeedback}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : (
              /* MODO 2: MONTAGEM DA ESTRATÉGIA */
              <View style={styles.sectionContainer}>
                {/* Banner Informativo */}
                <View style={styles.infoBannerEmerald}>
                  <View style={styles.infoIconEmerald}>
                    <Ionicons name="git-network-outline" size={20} color="#ffffff" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoTitleEmerald}>Montagem Tática da Estratégia</Text>
                    <Text style={styles.infoDescEmerald}>
                      Crie uma sequência passo a passo utilizando os movimentos calibrados. Teste a estratégia completa no robô antes de salvar.
                    </Text>
                  </View>
                </View>

                {/* Form de Dados da Estratégia */}
                <View style={styles.cardPanel}>
                  <Text style={styles.sectionHeaderTitle}>Identificação da Estratégia</Text>

                  <View style={styles.fieldGroup}>
                    <View>
                      <Text style={styles.inputLabel}>Título da Estratégia:</Text>
                      <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="Ex: Giro Rápido + Ataque Lateral"
                        style={styles.textInputStandard}
                      />
                    </View>

                    <View>
                      <Text style={styles.inputLabel}>Subtítulo Resumido:</Text>
                      <TextInput
                        value={subtitle}
                        onChangeText={setSubtitle}
                        placeholder="Ex: Flanqueamento acelerado"
                        style={styles.textInputStandard}
                      />
                    </View>

                    <View style={styles.rowTwoColumns}>
                      <View style={styles.flexOne}>
                        <Text style={styles.inputLabel}>Etiqueta / Badge:</Text>
                        <TextInput
                          value={badge}
                          onChangeText={setBadge}
                          placeholder="Ex: Ataque"
                          style={styles.textInputStandard}
                        />
                      </View>

                      <View style={styles.flexOne}>
                        <Text style={styles.inputLabel}>Ícone (Ionicons):</Text>
                        <TextInput
                          value={iconName}
                          onChangeText={setIconName}
                          placeholder="flash-outline"
                          style={styles.textInputStandard}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Linha do Tempo das Etapas */}
                <View style={styles.cardPanel}>
                  <View style={styles.rowBetweenBorder}>
                    <Text style={styles.sectionHeaderTitle}>
                      Passos da Estratégia ({steps.length})
                    </Text>
                    <TouchableOpacity
                      onPress={handleOpenAddStepModal}
                      activeOpacity={0.8}
                      style={styles.btnDarkAdd}>
                      <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                      <Text style={styles.btnTextWhiteBold}>Adicionar Passo</Text>
                    </TouchableOpacity>
                  </View>

                  {steps.length === 0 ? (
                    <View style={styles.emptyStateBox}>
                      <Ionicons name="footsteps-outline" size={32} color="#94a3b8" />
                      <Text style={styles.emptyStateTitle}>Nenhum passo configurado nesta estratégia.</Text>
                      <Text style={styles.emptyStateSub}>Clique no botão acima para adicionar movimentos.</Text>
                    </View>
                  ) : (
                    <View style={styles.stepsListContainer}>
                      {steps.map((st, index) => (
                        <View key={st.id || index} style={styles.stepItemRow}>
                          <View style={styles.stepItemLeft}>
                            <View style={styles.stepBadgeCircle}>
                              <Text style={styles.stepBadgeText}>{st.stepNumber || index + 1}</Text>
                            </View>
                            <View style={styles.flexOne}>
                              <Text style={styles.stepActionText}>{st.action}</Text>
                              <Text style={styles.stepDetailsText}>
                                E: {st.motorEsq} | D: {st.motorDir} | {st.timeMs}ms
                              </Text>
                            </View>
                          </View>

                          <View style={styles.stepControlsGroup}>
                            <TouchableOpacity
                              onPress={() => handleMoveStep(index, 'up')}
                              disabled={index === 0}
                              style={styles.iconPadding}>
                              <Ionicons
                                name="chevron-up-outline"
                                size={16}
                                color={index === 0 ? '#cbd5e1' : '#475569'}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleMoveStep(index, 'down')}
                              disabled={index === steps.length - 1}
                              style={styles.iconPadding}>
                              <Ionicons
                                name="chevron-down-outline"
                                size={16}
                                color={index === steps.length - 1 ? '#cbd5e1' : '#475569'}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingStepIndex(index);
                                setStepAction(st.action);
                                setStepEsq(st.motorEsq.toString());
                                setStepDir(st.motorDir.toString());
                                setStepTime(st.timeMs.toString());
                                setStepMovementId(st.movementId || '');
                                setStepModalVisible(true);
                              }}
                              style={styles.iconPadding}>
                              <Ionicons name="create-outline" size={16} color="#0284c7" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRemoveStep(index)}
                              style={styles.iconPadding}>
                              <Ionicons name="trash-outline" size={16} color="#e11d48" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Botões de Ação Finais */}
                <View style={styles.finalActionsContainer}>
                  <TouchableOpacity
                    onPress={handleTestFullStrategy}
                    activeOpacity={0.8}
                    style={styles.btnSkyFull}>
                    <Ionicons name="play-circle-outline" size={20} color="#ffffff" />
                    <Text style={styles.btnTextWhiteBold}>Testar Estratégia Completa no Robô</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveFullStrategy}
                    activeOpacity={0.8}
                    style={styles.btnDarkFull}>
                    <Ionicons name="save-outline" size={20} color="#ffffff" />
                    <Text style={styles.btnTextWhiteBold}>Salvar Estratégia</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Modal para Adicionar / Editar Etapa */}
          <Modal visible={stepModalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {editingStepIndex !== null ? `Editar Passo #${editingStepIndex + 1}` : 'Novo Passo da Estratégia'}
                  </Text>
                  <TouchableOpacity onPress={() => setStepModalVisible(false)}>
                    <Ionicons name="close-circle-outline" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View>
                  <Text style={styles.inputLabel}>Preencher com Movimento Calibrado:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetModalScroll}>
                    {presets.map((p) => {
                      const isSel = stepMovementId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => handleSelectPresetForStep(p.id)}
                          style={[
                            styles.presetPill,
                            isSel ? styles.presetPillSelected : styles.presetPillUnselected,
                          ]}>
                          <Text
                            style={[
                              styles.presetPillText,
                              isSel ? styles.presetPillTextSelected : styles.presetPillTextUnselected,
                            ]}>
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View>
                  <Text style={styles.inputLabel}>Nome / Descrição da Ação:</Text>
                  <TextInput
                    value={stepAction}
                    onChangeText={setStepAction}
                    placeholder="Ex: Giro rápido à direita"
                    style={styles.textInputStandard}
                  />
                </View>

                <View style={styles.rowTwoColumns}>
                  <View style={styles.flexOne}>
                    <Text style={styles.inputLabel}>Motor Esq PWM:</Text>
                    <TextInput
                      value={stepEsq}
                      onChangeText={setStepEsq}
                      keyboardType="numeric"
                      style={styles.textInputMono}
                    />
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={styles.inputLabel}>Motor Dir PWM:</Text>
                    <TextInput
                      value={stepDir}
                      onChangeText={setStepDir}
                      keyboardType="numeric"
                      style={styles.textInputMono}
                    />
                  </View>
                </View>

                <View>
                  <Text style={styles.inputLabel}>Duração (ms):</Text>
                  <TextInput
                    value={stepTime}
                    onChangeText={setStepTime}
                    keyboardType="numeric"
                    style={styles.textInputMono}
                  />
                </View>

                <View style={styles.rowButtons}>
                  <TouchableOpacity
                    onPress={() => setStepModalVisible(false)}
                    style={styles.btnCancel}>
                    <Text style={styles.btnCancelText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveStep}
                    style={styles.btnDarkConfirm}>
                    <Text style={styles.btnTextWhiteBold}>Confirmar Passo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  innerContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  topHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#64748b',
  },
  tabBarContainer: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    padding: 6,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tabButtonCalibActive: {
    backgroundColor: '#0284c7',
  },
  tabButtonStratActive: {
    backgroundColor: '#10b981',
  },
  tabButtonInactive: {
    backgroundColor: 'transparent',
  },
  tabTextContainer: {
    alignItems: 'flex-start',
  },
  tabTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tabTitleActive: {
    color: '#ffffff',
  },
  tabTitleInactive: {
    color: '#94a3b8',
  },
  tabSubtitle: {
    fontSize: 9,
  },
  tabSubtitleCalibActive: {
    color: '#e0f2fe',
  },
  tabSubtitleStratActive: {
    color: '#d1fae5',
  },
  tabSubtitleInactive: {
    color: '#64748b',
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 40,
  },
  sectionContainer: {
    gap: 16,
  },
  infoBannerSky: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIconSky: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#0284c7',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitleSky: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  infoDescSky: {
    fontSize: 11,
    color: '#0284c7',
    marginTop: 2,
  },
  infoBannerEmerald: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIconEmerald: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#10b981',
  },
  infoTitleEmerald: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  infoDescEmerald: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
  },
  fieldGroup: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#64748b',
  },
  resetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e11d48',
  },
  horizontalPresetsScroll: {
    paddingVertical: 4,
  },
  presetCard: {
    marginRight: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    width: 140,
  },
  presetCardSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  presetCardUnselected: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  presetIconBox: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  presetIconBoxSelected: {
    backgroundColor: '#0284c7',
  },
  presetIconBoxUnselected: {
    backgroundColor: '#f1f5f9',
  },
  presetNameText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  presetNameSelected: {
    color: '#ffffff',
  },
  presetNameUnselected: {
    color: '#0f172a',
  },
  presetTimeText: {
    marginTop: 2,
    fontSize: 10,
  },
  presetTimeSelected: {
    color: '#cbd5e1',
  },
  presetTimeUnselected: {
    color: '#64748b',
  },
  cardPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 12,
  },
  cardPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  rowCenterGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardPanelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  badgeBox: {
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgeText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  cardPanelDesc: {
    fontSize: 12,
    color: '#64748b',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  textInputMono: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#0f172a',
  },
  textInputStandard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  btnSky: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
  },
  btnEmerald: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#059669',
    paddingVertical: 12,
  },
  btnTextWhite: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  btnTextWhiteBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  feedbackBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10,
    marginTop: 4,
  },
  feedbackText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  rowTwoColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  rowBetweenBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  btnDarkAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyStateBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    backgroundColor: '#f8fafc',
  },
  emptyStateTitle: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  emptyStateSub: {
    fontSize: 10,
    color: '#94a3b8',
  },
  stepsListContainer: {
    gap: 10,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10,
  },
  stepItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  stepBadgeCircle: {
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  stepActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  stepDetailsText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  stepControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    padding: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  iconPadding: {
    padding: 4,
  },
  finalActionsContainer: {
    gap: 10,
    marginTop: 8,
  },
  btnSkyFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#0284c7',
    paddingVertical: 14,
  },
  btnDarkFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 14,
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
    fontWeight: '800',
    color: '#0f172a',
  },
  presetModalScroll: {
    paddingVertical: 4,
  },
  presetPill: {
    marginRight: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetPillSelected: {
    borderColor: '#0284c7',
    backgroundColor: '#e0f2fe',
  },
  presetPillUnselected: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  presetPillTextSelected: {
    color: '#0369a1',
  },
  presetPillTextUnselected: {
    color: '#475569',
  },
  btnCancel: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
  },
  btnCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  btnDarkConfirm: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
  },
});
