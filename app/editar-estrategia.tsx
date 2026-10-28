import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import Ionicons from '@/components/Icon';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { strategyCommand } from '@/src/control/strategyCommand';
import { useConnection } from '@/src/hooks/useConnection';
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
import { NumberControl } from '@/components/NumberControl';
import { Action, Card, Notice, PageTitle, ui, type IconName } from '@/components/ui';
import { palette as c } from '@/src/theme';

type Draft = { name: string; left: string; right: string; time: string; movementId?: string };
const fromPreset = (preset: MovementPreset): Draft => ({
  name: preset.name,
  left: String(preset.motorEsq),
  right: String(preset.motorDir),
  time: String(preset.timeMs),
  movementId: preset.id,
});
function readDraft(draft: Draft) {
  const left = Number(draft.left),
    right = Number(draft.right),
    time = Number(draft.time);
  if (!draft.name.trim()) throw new Error('Dê um nome ao movimento.');
  if (
    ![draft.left, draft.right, draft.time].every((value) => value.trim()) ||
    ![left, right, time].every(Number.isInteger)
  )
    throw new Error('Use números inteiros nos motores e na duração.');
  if (Math.abs(left) > 1599 || Math.abs(right) > 1599)
    throw new Error('A potência deve ficar entre −1599 e 1599.');
  if (time < 0 || time > 65535) throw new Error('A duração deve ficar entre 0 e 65535 ms.');
  return { motorEsq: left, motorDir: right, timeMs: time };
}

export default function EditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const connection = useConnection();
  const [tab, setTab] = useState<'calibration' | 'strategy'>(
    params.id || params.tab === 'estrategia' ? 'strategy' : 'calibration'
  );
  const [presets, setPresets] = useState(DEFAULT_MOVEMENT_PRESETS);
  const [presetId, setPresetId] = useState(DEFAULT_MOVEMENT_PRESETS[0].id);
  const [draft, setDraft] = useState(fromPreset(DEFAULT_MOVEMENT_PRESETS[0]));
  const [existing, setExisting] = useState<CustomStrategy | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<StrategyStep[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [badge, setBadge] = useState('Personalizada');
  const [icon, setIcon] = useState('flash-outline');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [stepDraft, setStepDraft] = useState(fromPreset(DEFAULT_MOVEMENT_PRESETS[0]));
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await getMovementPresets();
      const strategy = params.id
        ? (await getCustomStrategies()).find((item) => item.id === params.id)
        : null;
      if (!active) return;
      setPresets(saved);
      setPresetId(saved[0].id);
      setDraft(fromPreset(saved[0]));
      setExisting(strategy || null);
      setTitle(strategy?.title || '');
      setDescription(strategy?.description || '');
      setSteps(strategy?.steps || []);
      setSubtitle(strategy?.subtitle || '');
      setBadge(strategy?.badge || 'Personalizada');
      setIcon(strategy?.iconName || 'flash-outline');
      setTab(params.id || params.tab === 'estrategia' ? 'strategy' : 'calibration');
      setFeedback(null);
    })();
    return () => {
      active = false;
    };
  }, [params.id, params.tab]);

  const report = (error: unknown) =>
    setFeedback({
      message: error instanceof Error ? error.message : 'Não foi possível concluir.',
      error: true,
    });
  const choosePreset = (preset: MovementPreset) => {
    setPresetId(preset.id);
    setDraft(fromPreset(preset));
    setFeedback(null);
    Vibration.vibrate(10);
  };
  const syncLocal = (updated: MovementPreset[]) =>
    setSteps((current) =>
      current.map((step) => {
        const preset = updated.find((item) => item.id === step.movementId);
        return preset
          ? { ...step, motorEsq: preset.motorEsq, motorDir: preset.motorDir, timeMs: preset.timeMs }
          : step;
      })
    );
  const saveCalibration = async () => {
    try {
      const values = readDraft(draft);
      const preset = presets.find((item) => item.id === presetId);
      if (!preset) return;
      setBusy(true);
      const updated = await saveMovementPreset({ ...preset, ...values });
      setPresets(updated);
      syncLocal(updated);
      Vibration.vibrate(20);
      setFeedback({
        message: 'Calibração salva. Os movimentos vinculados foram atualizados.',
        error: false,
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const testMovement = async () => {
    try {
      const values = readDraft(draft);
      setBusy(true);
      await send(`TEST_STEP,${values.motorEsq},${values.motorDir},${values.timeMs}`);
      Vibration.vibrate(20);
      setFeedback({
        message: connection?.demo
          ? 'Teste simulado na demonstração.'
          : 'Movimento enviado para execução.',
        error: false,
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const reset = () =>
    Alert.alert('Restaurar calibração?', 'Os movimentos voltarão aos valores de fábrica.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        onPress: async () => {
          const restored = await resetMovementPresets();
          setPresets(restored);
          syncLocal(restored);
          choosePreset(restored[0]);
        },
      },
    ]);
  const addPreset = (preset: MovementPreset) => {
    if (steps.length >= 10) return;
    setSteps((current) => [
      ...current,
      {
        id: `step_${Date.now()}`,
        stepNumber: current.length + 1,
        action: preset.name,
        movementId: preset.id,
        motorEsq: preset.motorEsq,
        motorDir: preset.motorDir,
        timeMs: preset.timeMs,
      },
    ]);
    setModal(null);
    setFeedback(null);
    Vibration.vibrate(12);
  };
  const editStep = (index: number) => {
    const step = steps[index];
    setEditIndex(index);
    setStepDraft({
      name: step.action,
      left: String(step.motorEsq),
      right: String(step.motorDir),
      time: String(step.timeMs),
      movementId: step.movementId,
    });
    setStepError(null);
    setModal('edit');
  };
  const saveStep = () => {
    try {
      const values = readDraft(stepDraft);
      setSteps((current) =>
        editIndex === null
          ? [
              ...current,
              {
                id: `step_${Date.now()}`,
                stepNumber: current.length + 1,
                action: stepDraft.name.trim(),
                ...values,
              },
            ]
          : current.map((step, index) =>
              index === editIndex
                ? { ...step, action: stepDraft.name.trim(), movementId: undefined, ...values }
                : step
            )
      );
      setModal(null);
      setFeedback(null);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Confira os valores.');
    }
  };
  const reorder = (index: number, delta: number) => {
    setSteps((current) => {
      const next = [...current];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next.map((step, index) => ({ ...step, stepNumber: index + 1 }));
    });
    Vibration.vibrate(10);
  };
  const saveStrategy = async () => {
    try {
      if (!title.trim()) throw new Error('Dê um nome à estratégia antes de salvar.');
      if (!steps.length || steps.length > 10) throw new Error('Adicione de 1 a 10 etapas.');
      setBusy(true);
      const id = existing?.id || `CUST_${Date.now()}`;
      await saveCustomStrategy({
        id,
        title: title.trim(),
        subtitle: subtitle.trim() || 'Sequência personalizada',
        description: description.trim() || 'Estratégia personalizada.',
        badge: badge.trim() || 'Personalizada',
        iconName: icon,
        steps,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
      Vibration.vibrate(24);
      router.navigate({ pathname: '/estrategias', params: { selected: id } });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const testStrategy = async () => {
    try {
      if (!steps.length || steps.length > 10)
        throw new Error('Adicione de 1 a 10 etapas para testar.');
      setBusy(true);
      await send(strategyCommand(steps));
      setFeedback({
        message: connection?.demo
          ? 'Sequência simulada na demonstração.'
          : 'Sequência enviada para execução no robô.',
        error: false,
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const updateDraft = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <KeyboardAvoidingView style={ui.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/estrategias')}
          style={[ui.row, { minHeight: 44 }]}>
          <Ionicons name="arrow-back" size={20} color={c.primary} />
          <Text style={{ fontWeight: '700', color: c.primary }}>Estratégias</Text>
        </Pressable>
        <PageTitle
          eyebrow="Do ajuste à jogada"
          title={existing ? 'Refine sua estratégia.' : 'Monte sua próxima jogada.'}
        />
        <View style={s.tabs}>
          {(['calibration', 'strategy'] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              aria-selected={tab === item}
              accessibilityState={{ selected: tab === item }}
              onPress={() => {
                setTab(item);
                setFeedback(null);
              }}
              style={[s.tab, tab === item && { backgroundColor: c.night }]}>
              <Ionicons
                name={item === 'calibration' ? 'options-outline' : 'git-branch-outline'}
                size={20}
                color={tab === item ? c.lime : c.muted}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: tab === item ? '#FFFFFF' : c.muted,
                }}>
                {item === 'calibration' ? 'Calibrar' : 'Montar sequência'}
              </Text>
            </Pressable>
          ))}
        </View>
        {connection?.demo && <Notice>Demonstração: os testes de movimento são simulados.</Notice>}
        {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
        {tab === 'calibration' ? (
          <>
            <Text style={ui.body}>
              Escolha um movimento, ajuste os motores e teste no robô. A calibração é usada pelas
              estratégias vinculadas.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}>
              {presets.map((preset) => (
                <Pressable
                  key={preset.id}
                  accessibilityRole="button"
                  aria-selected={presetId === preset.id}
                  accessibilityState={{ selected: presetId === preset.id }}
                  onPress={() => choosePreset(preset)}
                  style={[
                    s.preset,
                    presetId === preset.id && {
                      backgroundColor: c.primaryLight,
                      borderColor: c.primary,
                    },
                  ]}>
                  <Ionicons name={preset.icon as IconName} size={24} color={c.primary} />
                  <Text style={s.label}>{preset.name}</Text>
                  <Text style={ui.body}>{preset.timeMs} ms</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Card>
              <Text style={ui.section}>{draft.name}</Text>
              <NumberControl
                label="Motor esquerdo"
                value={draft.left}
                onChange={(value) => updateDraft('left', value)}
              />
              <NumberControl
                label="Motor direito"
                value={draft.right}
                onChange={(value) => updateDraft('right', value)}
              />
              <NumberControl
                label="Duração"
                value={draft.time}
                onChange={(value) => updateDraft('time', value)}
                min={0}
                max={65535}
                step={10}
                unit="ms"
              />
              <Text style={ui.body}>Valor positivo: frente. Negativo: ré. Zero: motor parado.</Text>
              <Action
                title="Testar este movimento"
                icon="play-outline"
                tone="secondary"
                onPress={() => void testMovement()}
                disabled={!connection || busy}
              />
            </Card>
            <Pressable
              accessibilityRole="button"
              onPress={reset}
              style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: c.danger, fontWeight: '600' }}>
                Restaurar calibração de fábrica
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Card>
              <Text style={s.label}>Nome da estratégia</Text>
              <TextInput
                accessibilityLabel="Nome da estratégia"
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Ataque pela esquerda"
                placeholderTextColor={c.muted}
                style={s.input}
              />
              <Text style={s.label}>Descrição</Text>
              <TextInput
                accessibilityLabel="Descrição da estratégia"
                value={description}
                onChangeText={setDescription}
                placeholder="Qual é a ideia desta jogada?"
                placeholderTextColor={c.muted}
                multiline
                style={[s.input, { minHeight: 76, textAlignVertical: 'top' }]}
              />
              <Pressable
                accessibilityRole="button"
                aria-expanded={advanced}
                accessibilityState={{ expanded: advanced }}
                onPress={() => setAdvanced(!advanced)}
                style={[ui.row, { minHeight: 44 }]}>
                <Text style={{ color: c.primary, fontWeight: '600', flex: 1 }}>
                  Personalizar identificação
                </Text>
                <Ionicons
                  name={advanced ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={c.primary}
                />
              </Pressable>
              {advanced && (
                <>
                  <TextInput
                    accessibilityLabel="Subtítulo"
                    value={subtitle}
                    onChangeText={setSubtitle}
                    placeholder="Subtítulo"
                    placeholderTextColor={c.muted}
                    style={s.input}
                  />
                  <TextInput
                    accessibilityLabel="Etiqueta"
                    value={badge}
                    onChangeText={setBadge}
                    placeholder="Etiqueta"
                    style={s.input}
                  />
                  <View style={[ui.row, { flexWrap: 'wrap' }]}>
                    {(
                      [
                        'flash-outline',
                        'sync-outline',
                        'shield-checkmark-outline',
                        'speedometer-outline',
                        'git-branch-outline',
                      ] as const
                    ).map((name) => (
                      <Pressable
                        key={name}
                        accessibilityRole="button"
                        accessibilityLabel={`Ícone ${name}`}
                        aria-selected={icon === name}
                        accessibilityState={{ selected: icon === name }}
                        onPress={() => setIcon(name)}
                        style={[
                          ui.iconButton,
                          icon === name && {
                            backgroundColor: c.primaryLight,
                            borderColor: c.primary,
                          },
                        ]}>
                        <Ionicons name={name} size={22} color={c.primary} />
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </Card>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <Text style={ui.section}>Sequência de movimentos</Text>
              <Text style={{ color: c.primary, fontWeight: '700' }}>{steps.length}/10 etapas</Text>
            </View>
            {!steps.length && (
              <Card
                style={{
                  alignItems: 'center',
                  paddingVertical: 28,
                  borderStyle: 'dashed',
                  backgroundColor: 'transparent',
                }}>
                <Ionicons name="git-branch-outline" size={32} color={c.primary} />
                <Text style={ui.section}>Comece com um movimento.</Text>
                <Text style={[ui.body, { textAlign: 'center' }]}>
                  Adicione giros, avanços e pausas.{'\n'}Depois ajuste a ordem da sua jogada.
                </Text>
              </Card>
            )}
            {steps.map((step, index) => (
              <Card key={step.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Editar etapa ${index + 1}: ${step.action}`}
                  onPress={() => editStep(index)}
                  style={[ui.row, { minHeight: 48 }]}>
                  <View style={s.number}>
                    <Text style={{ color: c.primary, fontWeight: '800' }}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.label}>{step.action}</Text>
                    <Text style={ui.body}>
                      {step.timeMs} ms · E {step.motorEsq} / D {step.motorDir}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={20} color={c.primary} />
                </Pressable>
                <View style={[ui.row, { borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mover etapa ${index + 1} para cima`}
                    disabled={index === 0}
                    onPress={() => reorder(index, -1)}
                    style={[s.stepAction, index === 0 && { opacity: 0.3 }]}>
                    <Ionicons name="arrow-up" size={20} color={c.primary} />
                    <Text style={s.smallLabel}>Subir</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mover etapa ${index + 1} para baixo`}
                    disabled={index === steps.length - 1}
                    onPress={() => reorder(index, 1)}
                    style={[s.stepAction, index === steps.length - 1 && { opacity: 0.3 }]}>
                    <Ionicons name="arrow-down" size={20} color={c.primary} />
                    <Text style={s.smallLabel}>Descer</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir etapa ${index + 1}`}
                    onPress={() =>
                      setSteps((current) =>
                        current
                          .filter((_, position) => index !== position)
                          .map((step, index) => ({ ...step, stepNumber: index + 1 }))
                      )
                    }
                    style={[s.stepAction, { marginLeft: 'auto' }]}>
                    <Ionicons name="trash-outline" size={20} color={c.danger} />
                  </Pressable>
                </View>
              </Card>
            ))}
            <Action
              title={steps.length >= 10 ? 'Limite de 10 etapas atingido' : 'Adicionar movimento'}
              icon="add"
              tone="secondary"
              disabled={steps.length >= 10}
              onPress={() => {
                setStepError(null);
                setModal('add');
              }}
            />
            {steps.length > 0 && (
              <>
                <Text style={ui.body}>
                  Duração total:{' '}
                  {(steps.reduce((sum, step) => sum + step.timeMs, 0) / 1000).toFixed(2)} s
                </Text>
                <Action
                  title="Executar teste da sequência"
                  icon="play-outline"
                  tone="secondary"
                  disabled={!connection || busy}
                  onPress={() => void testStrategy()}
                />
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  O teste executa os movimentos assim que o robô receber.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
      <View style={s.dock}>
        <Action
          title={tab === 'calibration' ? 'Salvar calibração' : 'Salvar estratégia'}
          icon="checkmark"
          busy={busy}
          onPress={() => void (tab === 'calibration' ? saveCalibration() : saveStrategy())}
        />
        <Text style={s.caption}>
          {tab === 'calibration'
            ? 'Salva os ajustes de movimento neste dispositivo.'
            : 'Salva no celular. Você escolhe quando executar no robô.'}
        </Text>
      </View>
      <Modal
        visible={modal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView
          style={s.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.sheet, { paddingBottom: 22 + insets.bottom }]}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <Text style={ui.section}>
                {modal === 'add'
                  ? 'Adicionar movimento'
                  : editIndex === null
                    ? 'Movimento personalizado'
                    : `Editar etapa ${editIndex + 1}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar editor de movimento"
                onPress={() => setModal(null)}
                style={ui.iconButton}>
                <Ionicons name="close" size={22} color={c.ink} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 16, paddingBottom: 10 }}>
              {modal === 'add' ? (
                <>
                  <Text style={ui.body}>Um toque adiciona o movimento com a calibração salva.</Text>
                  {presets.map((preset) => (
                    <Pressable
                      key={preset.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar ${preset.name}`}
                      onPress={() => addPreset(preset)}
                      style={s.presetRow}>
                      <Ionicons name={preset.icon as IconName} size={24} color={c.primary} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={s.label}>{preset.name}</Text>
                        <Text style={ui.body}>{preset.timeMs} ms</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={24} color={c.primary} />
                    </Pressable>
                  ))}
                  <Action
                    title="Criar movimento personalizado"
                    icon="construct-outline"
                    tone="secondary"
                    onPress={() => {
                      setEditIndex(null);
                      setStepDraft({ name: '', left: '0', right: '0', time: '300' });
                      setModal('edit');
                    }}
                  />
                </>
              ) : (
                <>
                  <Text style={s.label}>Nome do movimento</Text>
                  <TextInput
                    accessibilityLabel="Nome do movimento"
                    value={stepDraft.name}
                    onChangeText={(name) => setStepDraft((current) => ({ ...current, name }))}
                    style={s.input}
                  />
                  <NumberControl
                    label="Motor esquerdo da etapa"
                    value={stepDraft.left}
                    onChange={(left) => setStepDraft((current) => ({ ...current, left }))}
                  />
                  <NumberControl
                    label="Motor direito da etapa"
                    value={stepDraft.right}
                    onChange={(right) => setStepDraft((current) => ({ ...current, right }))}
                  />
                  <NumberControl
                    label="Duração da etapa"
                    value={stepDraft.time}
                    onChange={(time) => setStepDraft((current) => ({ ...current, time }))}
                    min={0}
                    max={65535}
                    step={10}
                    unit="ms"
                  />
                  <Text style={ui.body}>
                    Os ajustes desta etapa ficam independentes da calibração do preset.
                  </Text>
                  {stepError && <Notice error>{stepError}</Notice>}
                  <Action title="Concluir movimento" icon="checkmark" onPress={saveStep} />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c.surface, borderRadius: 16 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  preset: {
    width: 156,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    padding: 16,
    gap: 10,
  },
  label: { color: c.ink, fontSize: 15, fontWeight: '700' },
  input: {
    minHeight: 52,
    backgroundColor: c.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    color: c.ink,
    fontSize: 16,
    padding: 14,
  },
  number: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: c.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepAction: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallLabel: { fontSize: 12, fontWeight: '600', color: c.primary },
  dock: {
    borderTopWidth: 1,
    borderColor: c.line,
    padding: 16,
    backgroundColor: c.surface,
    gap: 8,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  caption: { color: c.muted, fontSize: 11, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: '#102E2C99', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    backgroundColor: c.surface,
    maxHeight: '90%',
    gap: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    padding: 12,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
  },
});
