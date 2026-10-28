import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import Ionicons from '@/components/Icon';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { strategyCommand } from '@/src/control/strategyCommand';
import { useConnection } from '@/src/hooks/useConnection';
import { send, sendWithTimeout } from '@/src/services/bluetooth';
import {
  CustomStrategy,
  deleteCustomStrategy,
  exportStrategyToJSON,
  getCustomStrategies,
  importStrategyFromJSON,
  StrategyStep,
} from '@/src/services/strategyStorage';
import { Action, Card, Notice, PageTitle, ui } from '@/components/ui';
import { palette as c } from '@/src/theme';

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
    0: [
      {
        id: '0_1',
        stepNumber: 1,
        motorEsq: 0,
        motorDir: 0,
        timeMs: 0,
        action: 'Busca direta por sensores',
      },
    ],
  },
  A: {
    0: [
      {
        id: 'A0_1',
        stepNumber: 1,
        motorEsq: 1599,
        motorDir: -1599,
        timeMs: 100,
        action: 'Giro no eixo à DIREITA',
      },
      {
        id: 'A0_2',
        stepNumber: 2,
        motorEsq: 300,
        motorDir: 1599,
        timeMs: 550,
        action: 'Curva aberta à esquerda',
      },
    ],
    1: [
      {
        id: 'A1_1',
        stepNumber: 1,
        motorEsq: 1599,
        motorDir: -1599,
        timeMs: 70,
        action: 'Giro no eixo à DIREITA',
      },
      {
        id: 'A1_2',
        stepNumber: 2,
        motorEsq: 700,
        motorDir: 1599,
        timeMs: 400,
        action: 'Curva média à esquerda',
      },
    ],
    2: [
      {
        id: 'A2_1',
        stepNumber: 1,
        motorEsq: 1599,
        motorDir: -1599,
        timeMs: 70,
        action: 'Giro no eixo à DIREITA',
      },
      {
        id: 'A2_2',
        stepNumber: 2,
        motorEsq: 850,
        motorDir: 1599,
        timeMs: 580,
        action: 'Avanço longo (fundo da arena)',
      },
    ],
  },
  B: {
    0: [
      {
        id: 'B_1',
        stepNumber: 1,
        motorEsq: 1100,
        motorDir: -1100,
        timeMs: 48,
        action: 'Giro curto à DIREITA',
      },
      {
        id: 'B_2',
        stepNumber: 2,
        motorEsq: 1500,
        motorDir: 1500,
        timeMs: 120,
        action: 'Avanço reto rápido',
      },
      {
        id: 'B_3',
        stepNumber: 3,
        motorEsq: 200,
        motorDir: 1400,
        timeMs: 182,
        action: 'Curva diagonal fechada',
      },
      {
        id: 'B_4',
        stepNumber: 4,
        motorEsq: 1500,
        motorDir: 1500,
        timeMs: 500,
        action: 'Sprint final',
      },
    ],
  },
  C: {
    0: [
      {
        id: 'C_1',
        stepNumber: 1,
        motorEsq: 0,
        motorDir: 0,
        timeMs: 400,
        action: 'Imóvel (aguarda oponente)',
      },
      {
        id: 'C_2',
        stepNumber: 2,
        motorEsq: 1599,
        motorDir: 1599,
        timeMs: 160,
        action: 'Contra-ataque 100%',
      },
    ],
  },
  D: {
    0: [
      {
        id: 'D_1',
        stepNumber: 1,
        motorEsq: 1599,
        motorDir: 1599,
        timeMs: 180,
        action: 'Impulso inicial',
      },
      { id: 'D_2', stepNumber: 2, motorEsq: 0, motorDir: 0, timeMs: 400, action: 'Pausa completa' },
      {
        id: 'D_3',
        stepNumber: 3,
        motorEsq: 1599,
        motorDir: 1599,
        timeMs: 160,
        action: 'Segundo avanço 100%',
      },
      {
        id: 'D_4',
        stepNumber: 4,
        motorEsq: 0,
        motorDir: 0,
        timeMs: 0,
        action: 'Início do loop PID',
      },
    ],
  },
  E: {
    0: [
      {
        id: 'E_1',
        stepNumber: 1,
        motorEsq: 0,
        motorDir: 0,
        timeMs: 0,
        action: 'Reservado no firmware',
      },
    ],
  },
};

const VARIANCIA_LABELS = [
  { value: 0, label: 'Curto', desc: 'Giro 100ms + Curva Rápida' },
  { value: 1, label: 'Médio', desc: 'Giro 70ms + Curva Média' },
  { value: 2, label: 'Fundo', desc: 'Giro 70ms + Avanço Longo' },
];

const FRIENDLY_NAMES: Record<string, string> = {
  '0': 'Busca direta',
  A: 'Giro e fuga',
  B: 'Flanqueamento',
  C: 'Contra-ataque',
  D: 'Finta',
};

export default function EstrategiasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ selected?: string }>();
  const connection = useConnection();
  const [custom, setCustom] = useState<CustomStrategy[]>([]);
  const [selected, setSelected] = useState('A');
  const [variation, setVariation] = useState(1);
  const [category, setCategory] = useState<'builtin' | 'custom'>('builtin');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [modal, setModal] = useState<'import' | 'export' | null>(null);
  const [json, setJson] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    setCustom(await getCustomStrategies());
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );
  useEffect(() => {
    if (params.selected) {
      setSelected(params.selected);
      setCategory('custom');
      setExpanded(false);
    }
  }, [params.selected]);
  const all: StrategyOption[] = [
    ...BUILTIN_STRATEGIES.filter((item) => item.id !== 'E'),
    ...custom.map((item) => ({
      ...item,
      isCustom: true,
      iconName: item.iconName as StrategyOption['iconName'],
    })),
  ];
  const active = all.find((item) => item.id === selected) || all[1];
  const steps = active.isCustom
    ? active.steps || []
    : BUILTIN_MOVEMENT_DETAILS[active.id]?.[active.id === 'A' ? variation : 0] || [];
  const duration = steps.reduce((sum, step) => sum + step.timeMs, 0);
  const label = FRIENDLY_NAMES[active.id] || active.title;

  const choose = (id: string) => {
    setSelected(id);
    setExpanded(false);
    setFeedback(null);
    Vibration.vibrate(10);
  };
  const apply = async () => {
    if (busy) return;
    if (active.isCustom && (!steps.length || steps.length > 10)) {
      setFeedback({ message: 'Use de 1 a 10 etapas por estratégia.', error: true });
      return;
    }
    setBusy(true);
    setFeedback(null);
    Vibration.vibrate(16);
    try {
      if (active.isCustom) {
        await send(strategyCommand(steps));
      } else {
        await sendWithTimeout(
          `ESTRATEGIA_${active.id}`,
          (line) => line === `ESTRATEGIA_${active.id}`
        );
        if (active.id === 'A')
          await sendWithTimeout(
            `VARIANCIA = ${variation}`,
            (line) => line === `VARIANCIA_${variation}_OK`
          );
      }
      if (mounted.current)
        setFeedback({
          message: connection?.demo
            ? `${label}: comando simulado.`
            : active.isCustom
              ? `${label}: sequência enviada para execução.`
              : `${label}: seleção confirmada pelo robô.`,
          error: false,
        });
    } catch (error) {
      if (mounted.current)
        setFeedback({
          message: error instanceof Error ? error.message : 'Falha ao enviar.',
          error: true,
        });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const exportActive = () => {
    const item = custom.find((item) => item.id === active.id);
    setJson(
      item
        ? exportStrategyToJSON(item)
        : JSON.stringify(
            {
              version: '1.0',
              type: 'sumo_strategy',
              strategy: {
                title: active.title,
                subtitle: active.subtitle,
                badge: active.badge,
                iconName: active.iconName,
                description: active.description,
                steps: steps.map((step) => ({
                  step: step.stepNumber,
                  action: step.action,
                  motorEsq: step.motorEsq,
                  motorDir: step.motorDir,
                  timeMs: step.timeMs,
                })),
              },
            },
            null,
            2
          )
    );
    setModal('export');
  };
  const importJson = async () => {
    try {
      const item = await importStrategyFromJSON(json);
      await reload();
      setSelected(item.id);
      setCategory('custom');
      setModal(null);
      setJson('');
      setFeedback({ message: `${item.title}: estratégia importada.`, error: false });
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'JSON inválido.',
        error: true,
      });
    }
  };
  const remove = () =>
    Alert.alert('Excluir estratégia?', `“${active.title}” será removida do celular.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomStrategy(active.id);
          await reload();
          choose('A');
          setCategory('builtin');
        },
      },
    ]);

  return (
    <View style={ui.page}>
      <ScrollView contentContainerStyle={ui.content}>
        <PageTitle
          eyebrow="Uma jogada à frente"
          title="Prepare sua estratégia."
          description="Escolha a abertura e confira a sequência antes de enviar."
        />
        {connection?.demo && (
          <Notice>Demonstração: nenhum movimento será executado em um robô.</Notice>
        )}
        {!connection && (
          <Notice>
            Conecte o robô para aplicar uma estratégia. Você pode montar sua sequência agora.
          </Notice>
        )}
        <View style={s.tabs}>
          {(['builtin', 'custom'] as const).map((item) => (
            <Pressable
              accessibilityRole="button"
              aria-selected={category === item}
              accessibilityState={{ selected: category === item }}
              key={item}
              onPress={() => setCategory(item)}
              style={[s.tab, category === item && { backgroundColor: c.night }]}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: category === item ? '#FFFFFF' : c.muted,
                }}>
                {item === 'builtin' ? 'Prontas para usar' : `Minhas estratégias · ${custom.length}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.grid}>
          {all
            .filter((item) => (category === 'custom' ? item.isCustom : !item.isCustom))
            .map((item) => {
              const checked = active.id === item.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  aria-selected={checked}
                  accessibilityState={{ selected: checked, disabled: busy }}
                  key={item.id}
                  disabled={busy}
                  onPress={() => choose(item.id)}
                  style={({ pressed }) => [
                    s.strategy,
                    checked && { borderColor: c.primary, backgroundColor: c.primaryLight },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={[ui.row, { justifyContent: 'space-between' }]}>
                    <View style={[s.icon, checked && { backgroundColor: c.primary }]}>
                      <Ionicons
                        name={item.iconName}
                        size={23}
                        color={checked ? '#FFFFFF' : c.primary}
                      />
                    </View>
                    <Ionicons
                      name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={21}
                      color={checked ? c.primary : c.line}
                    />
                  </View>
                  <Text style={s.strategyTitle}>{FRIENDLY_NAMES[item.id] || item.title}</Text>
                  <Text style={s.strategyMeta}>
                    {item.isCustom
                      ? `${item.steps?.length || 0} etapas`
                      : `Estratégia ${item.id} · ${item.badge}`}
                  </Text>
                </Pressable>
              );
            })}
        </View>
        {category === 'custom' && !custom.length && (
          <Card>
            <Ionicons name="git-branch-outline" size={32} color={c.primary} />
            <Text style={ui.section}>Sua próxima jogada começa aqui.</Text>
            <Text style={ui.body}>
              Combine movimentos, calibre os tempos e salve sua primeira estratégia.
            </Text>
          </Card>
        )}
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          <Action
            title="Criar estratégia"
            icon="add"
            tone="secondary"
            onPress={() =>
              router.navigate({
                pathname: '/editar-estrategia',
                params: { id: '', tab: 'estrategia' },
              })
            }
            style={{ flexGrow: 1 }}
          />
          <Action
            title="Importar"
            icon="download-outline"
            tone="secondary"
            onPress={() => {
              setJson('');
              setModal('import');
              setFeedback(null);
            }}
            style={{ flexGrow: 1 }}
          />
        </View>
        <Card>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.eyebrow}>Selecionada</Text>
              <Text style={ui.section}>{label}</Text>
            </View>
            <View style={s.duration}>
              <Text style={{ color: c.primary, fontWeight: '700' }}>
                {duration > 0 ? `${(duration / 1000).toFixed(2)} s` : 'Busca direta'}
              </Text>
            </View>
          </View>
          <Text style={ui.body}>{active.description}</Text>
          {active.hasVariancia && (
            <View style={{ gap: 10 }}>
              <Text style={s.strategyTitle}>Distância da abertura</Text>
              <View style={ui.row}>
                {VARIANCIA_LABELS.map((item) => (
                  <Pressable
                    key={item.value}
                    accessibilityRole="button"
                    aria-selected={variation === item.value}
                    accessibilityState={{ selected: variation === item.value }}
                    disabled={busy}
                    onPress={() => {
                      setVariation(item.value);
                      setFeedback(null);
                      Vibration.vibrate(10);
                    }}
                    style={[
                      s.variant,
                      variation === item.value && {
                        backgroundColor: c.primary,
                        borderColor: c.primary,
                      },
                    ]}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: variation === item.value ? '#FFFFFF' : c.ink,
                      }}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={[ui.row, { minHeight: 48, justifyContent: 'space-between' }]}>
            <Text style={s.strategyTitle}>
              {expanded ? 'Ocultar' : 'Ver'} sequência · {steps.length} etapas
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={c.primary} size={20} />
          </Pressable>
          {expanded &&
            steps.map((step, index) => (
              <View key={step.id || index} style={s.step}>
                <View style={s.stepNumber}>
                  <Text style={{ color: c.primary, fontWeight: '700' }}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.strategyTitle}>{step.action}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    E {step.motorEsq} · D {step.motorDir}
                  </Text>
                </View>
                <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>
                  {step.timeMs ? `${step.timeMs} ms` : 'Busca'}
                </Text>
              </View>
            ))}
          <View style={[ui.row, { flexWrap: 'wrap' }]}>
            {active.isCustom && (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.navigate({ pathname: '/editar-estrategia', params: { id: active.id } })
                }
                style={s.textAction}>
                <Ionicons name="create-outline" size={19} color={c.primary} />
                <Text style={s.textActionLabel}>Editar</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exportar"
              onPress={exportActive}
              style={s.textAction}>
              <Ionicons name="share-outline" size={19} color={c.primary} />
              <Text style={s.textActionLabel}>Exportar</Text>
            </Pressable>
            {active.isCustom && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Excluir ${active.title}`}
                onPress={remove}
                style={s.textAction}>
                <Ionicons name="trash-outline" size={19} color={c.danger} />
                <Text style={{ color: c.danger, fontWeight: '700' }}>Excluir</Text>
              </Pressable>
            )}
          </View>
        </Card>
        {feedback && !modal && <Notice error={feedback.error}>{feedback.message}</Notice>}
      </ScrollView>
      <View style={s.dock}>
        <Action
          title={active.isCustom ? `Executar ${label}` : `Aplicar ${label}`}
          icon={active.isCustom ? 'play' : 'checkmark'}
          busy={busy}
          disabled={!connection}
          onPress={() => void apply()}
        />
        <Text style={s.caption}>
          {active.isCustom
            ? 'A sequência começa assim que o robô receber o comando.'
            : 'Define a abertura usada no próximo início de combate.'}
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
                {modal === 'import' ? 'Importar estratégia' : 'Exportar estratégia'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                onPress={() => setModal(null)}
                style={ui.iconButton}>
                <Ionicons name="close" size={22} color={c.ink} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
              <Text style={ui.body}>
                {modal === 'import'
                  ? 'Cole o JSON de uma estratégia com até 10 etapas.'
                  : 'Selecione o texto para copiar ou compartilhe a estratégia.'}
              </Text>
              <TextInput
                accessibilityLabel="JSON da estratégia"
                value={json}
                onChangeText={setJson}
                editable={modal === 'import'}
                multiline
                textAlignVertical="top"
                style={s.json}
                placeholder="Cole o JSON aqui…"
                placeholderTextColor={c.muted}
              />
              {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
              {modal === 'import' ? (
                <Action
                  title="Importar e salvar"
                  icon="download-outline"
                  onPress={() => void importJson()}
                  disabled={!json.trim()}
                />
              ) : (
                Platform.OS !== 'web' && (
                  <Action
                    title="Compartilhar JSON"
                    icon="share-outline"
                    onPress={async () => {
                      try {
                        await Share.share({ message: json, title: active.title });
                      } catch (error) {
                        setFeedback({
                          message:
                            error instanceof Error
                              ? error.message
                              : 'Não foi possível compartilhar.',
                          error: true,
                        });
                      }
                    }}
                  />
                )
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: c.surface, gap: 4 },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  strategy: {
    width: '48%',
    flexGrow: 1,
    minWidth: 130,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    backgroundColor: c.surface,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: c.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strategyTitle: { fontSize: 15, fontWeight: '700', color: c.ink },
  strategyMeta: { color: c.muted, fontSize: 12, lineHeight: 18 },
  duration: { backgroundColor: c.primaryLight, padding: 10, borderRadius: 12 },
  variant: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: c.line,
  },
  stepNumber: {
    width: 32,
    height: 32,
    backgroundColor: c.primaryLight,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  textActionLabel: { color: c.primary, fontWeight: '700' },
  dock: {
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderColor: c.line,
    padding: 16,
    gap: 8,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  caption: { fontSize: 11, textAlign: 'center', color: c.muted },
  overlay: { flex: 1, backgroundColor: '#102E2C99', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.surface,
    padding: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    gap: 14,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  json: {
    minHeight: 220,
    maxHeight: 340,
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.background,
    color: c.ink,
    fontFamily: 'monospace',
    fontSize: 13,
    borderWidth: 1,
    borderColor: c.line,
  },
});
