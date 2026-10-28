import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import Ionicons from '@/components/Icon';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ManualController,
  joystickMotors,
  MAX_PWM,
  type ManualState,
} from '@/src/control/manualController';
import { send, sendWithTimeout } from '@/src/services/bluetooth';
import { useConnection } from '@/src/hooks/useConnection';
import { Action, Notice, PageTitle, ui, type IconName } from '@/components/ui';
import { palette as c } from '@/src/theme';

const initialState: ManualState = { enabled: false, busy: false, error: null, left: 0, right: 0 };
const directions: {
  label: string;
  icon: IconName;
  left: number;
  right: number;
  position: 'up' | 'left' | 'right' | 'down';
}[] = [
  { label: 'Avançar', icon: 'arrow-up', left: MAX_PWM, right: MAX_PWM, position: 'up' },
  {
    label: 'Girar à esquerda',
    icon: 'arrow-back',
    left: -MAX_PWM,
    right: MAX_PWM,
    position: 'left',
  },
  {
    label: 'Girar à direita',
    icon: 'arrow-forward',
    left: MAX_PWM,
    right: -MAX_PWM,
    position: 'right',
  },
  { label: 'Recuar', icon: 'arrow-down', left: -MAX_PWM, right: -MAX_PWM, position: 'down' },
];

export default function ManualScreen() {
  const connection = useConnection();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 700;
  const compact = wide && height < 600;
  const dense = height < 720;
  const [state, setState] = useState(initialState);
  const [mode, setMode] = useState<'buttons' | 'joystick'>('joystick');
  const [speed, setSpeed] = useState(0.5);
  const [haptics, setHaptics] = useState(true);
  const [presentation, setPresentation] = useState(false);
  const [details, setDetails] = useState(false);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: !presentation,
      tabBarStyle: presentation
        ? { display: 'none' }
        : {
            backgroundColor: c.surface,
            borderTopColor: c.line,
            height: 68 + insets.bottom,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
          },
    });
  }, [presentation, navigation, insets.bottom]);
  const [touching, setTouching] = useState(false);
  const [direction, setDirection] = useState('Pronto para pilotar');
  const mounted = useRef(true);
  const controller = useRef<ManualController | null>(null);
  if (!controller.current)
    controller.current = new ManualController(
      (command) =>
        command === 'MANUAL_ON'
          ? sendWithTimeout(command, (line) => line === 'MANUAL_ON_OK')
          : send(command),
      (next) => {
        if (mounted.current) setState(next);
      }
    );
  const driver = controller.current;
  const knob = useRef(new Animated.ValueXY()).current;
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;
  const pulse = useCallback((duration = 12) => {
    if (hapticsRef.current) Vibration.vibrate(duration);
  }, []);
  const controlSize =
    dense && !presentation
      ? 180
      : presentation && compact
        ? Math.max(140, Math.min(220, height - 190 - insets.top - insets.bottom))
        : Math.min(wide ? 310 : width - 72, Math.max(200, height - (presentation ? 500 : 620)));

  const radius = (controlSize - 76) / 2;
  const liveGesture = useRef({ enabled: state.enabled, radius, direction });
  liveGesture.current = { enabled: state.enabled, radius, direction };

  const release = useCallback(() => {
    void driver.stop();
    setTouching(false);
    setDirection('Parado');
    Animated.spring(knob, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      speed: 28,
      bounciness: 4,
    }).start();
  }, [driver, knob]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => liveGesture.current.enabled,
      onMoveShouldSetPanResponder: () => liveGesture.current.enabled,
      onPanResponderGrant: () => {
        setTouching(true);
        pulse();
      },
      onPanResponderMove: (_, gesture) => {
        if (!liveGesture.current.enabled) return;
        const r = liveGesture.current.radius;
        const distance = Math.hypot(gesture.dx, gesture.dy);
        const scale = Math.min(1, r / (distance || 1));
        knob.setValue({ x: gesture.dx * scale, y: gesture.dy * scale });
        const motors = joystickMotors(gesture.dx, gesture.dy, r);
        driver.move(motors);
        const label =
          !motors.left && !motors.right
            ? 'Parado'
            : Math.abs(gesture.dy) >= Math.abs(gesture.dx)
              ? gesture.dy < 0
                ? 'Avançando'
                : 'Recuando'
              : gesture.dx > 0
                ? 'Virando à direita'
                : 'Virando à esquerda';
        if (label !== liveGesture.current.direction) {
          liveGesture.current.direction = label;
          setDirection(label);
          pulse(8);
        }
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  useFocusEffect(
    useCallback(() => {
      return () => {
        void driver.disable();
        release();
      };
    }, [driver, release])
  );

  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        void driver.disable();
        release();
      }
    });
    return () => {
      mounted.current = false;
      sub.remove();
      void driver.disable();
    };
  }, [driver, release]);

  useEffect(() => {
    void driver.disable();
    release();
  }, [connection, driver, release]);

  const emergencyStop = () => {
    void driver.disable();
    release();
    pulse(40);
  };
  const changeSpeed = (value: number) => {
    release();
    driver.setSpeed(value);
    setSpeed(value);
    pulse();
  };
  const moving = state.enabled && Boolean(state.left || state.right);

  return (
    <View style={ui.page}>
      <ScrollView
        scrollEnabled={!touching}
        contentContainerStyle={[
          ui.content,
          { gap: 14, paddingTop: presentation ? Math.max(insets.top, 12) : 12, paddingBottom: 16 },
        ]}>
        {!dense && (
          <PageTitle
            title={presentation ? 'Apresentação' : 'Controle manual'}
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={presentation ? 'Sair da apresentação' : 'Modo apresentação'}
                aria-selected={presentation}
                accessibilityState={{ selected: presentation }}
                onPress={() => {
                  release();
                  setPresentation(!presentation);
                }}
                style={ui.iconButton}>
                <Ionicons
                  name={presentation ? 'contract-outline' : 'expand-outline'}
                  size={22}
                  color={c.ink}
                />
              </Pressable>
            }
          />
        )}
        {!connection && (
          <Notice>
            Conecte seu robô na aba Início ou abra a demonstração para experimentar os controles.
          </Notice>
        )}
        {state.error && (
          <Notice error>
            {state.error} O controle foi desativado. Confira o robô antes de reativar.
          </Notice>
        )}
        <View style={[s.workspace, wide && { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={[s.settings, wide && { width: 280 }]}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <Text style={ui.section}>Potência</Text>
              {dense && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={presentation ? 'Sair da apresentação' : 'Modo apresentação'}
                  onPress={() => {
                    release();
                    setPresentation(!presentation);
                  }}
                  style={ui.iconButton}>
                  <Ionicons
                    name={presentation ? 'contract-outline' : 'expand-outline'}
                    size={22}
                    color={c.ink}
                  />
                </Pressable>
              )}
              <View style={ui.row}>
                <Text style={s.speedValue}>
                  {Math.round(speed * 100)}
                  <Text style={{ fontSize: 16 }}>%</Text>
                </Text>
                {!presentation && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Opções de potência e resposta tátil"
                    aria-expanded={details}
                    accessibilityState={{ expanded: details }}
                    onPress={() => setDetails(!details)}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Ionicons name="options-outline" size={22} color={c.primary} />
                  </Pressable>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0.25, 0.5, 0.75, 1].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`Potência ${value * 100} por cento`}
                  aria-selected={speed === value}
                  accessibilityState={{ selected: speed === value }}
                  onPress={() => changeSpeed(value)}
                  style={[
                    s.speedPreset,
                    speed === value && { backgroundColor: c.primary, borderColor: c.primary },
                  ]}>
                  <Text
                    style={{
                      color: speed === value ? '#FFFFFF' : c.ink,
                      fontWeight: '700',
                      fontSize: 14,
                    }}>
                    {value * 100}%
                  </Text>
                </Pressable>
              ))}
            </View>
            {!presentation && details && (
              <>
                <View style={ui.row}>
                  <Action
                    title="− 5%"
                    tone="secondary"
                    disabled={speed <= 0.1}
                    onPress={() =>
                      changeSpeed(Math.max(0.1, Math.round((speed - 0.05) * 100) / 100))
                    }
                    style={{ flex: 1, minHeight: 44 }}
                  />
                  <Action
                    title="+ 5%"
                    tone="secondary"
                    disabled={speed >= 1}
                    onPress={() => changeSpeed(Math.min(1, Math.round((speed + 0.05) * 100) / 100))}
                    style={{ flex: 1, minHeight: 44 }}
                  />
                </View>
                <View style={s.motorReadout}>
                  {(['left', 'right'] as const).map((side) => (
                    <View key={side} style={{ flex: 1, gap: 8 }}>
                      <Text style={s.motorLabel}>{side === 'left' ? 'ESQUERDO' : 'DIREITO'}</Text>
                      <Text style={s.motorValue}>
                        {state[side] > 0 ? '+' : ''}
                        {state[side]}
                      </Text>
                      <View style={s.motorTrack}>
                        <View
                          style={{
                            width: `${(Math.abs(state[side]) / MAX_PWM) * 100}%`,
                            height: 4,
                            backgroundColor: c.primary,
                            borderRadius: 2,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={{ color: c.muted, fontSize: 11 }}>
                  Potência solicitada aos motores.
                </Text>
                <Pressable
                  accessibilityRole="switch"
                  aria-checked={haptics}
                  accessibilityState={{ checked: haptics }}
                  onPress={() => {
                    setHaptics(!haptics);
                    if (!haptics) Vibration.vibrate(12);
                  }}
                  style={[ui.row, { minHeight: 44, justifyContent: 'space-between' }]}>
                  <View style={ui.row}>
                    <Ionicons name="finger-print-outline" size={20} color={c.primary} />
                    <Text style={ui.body}>Resposta tátil</Text>
                  </View>
                  <Text style={{ color: c.primary, fontWeight: '700' }}>
                    {haptics ? 'Ativada' : 'Desativada'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
          <View style={[s.controlPanel, wide && { flex: 1 }, dense && { padding: 12, gap: 10 }]}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <View style={ui.row}>
                <View style={[s.dot, { backgroundColor: state.enabled ? c.lime : '#77918B' }]} />
                <Text style={s.controlStatus}>
                  {connection?.demo ? 'DEMO · ' : ''}
                  {state.busy
                    ? 'Ativando…'
                    : state.enabled
                      ? 'Controle ativo'
                      : 'Controle desativado'}
                </Text>
              </View>
              <View style={s.modeSwitch}>
                {(['joystick', 'buttons'] as const).map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={
                      item === 'joystick' ? 'Usar joystick' : 'Usar botões direcionais'
                    }
                    aria-selected={mode === item}
                    accessibilityState={{ selected: mode === item }}
                    onPress={() => {
                      release();
                      setMode(item);
                      pulse();
                    }}
                    style={[s.modeButton, mode === item && { backgroundColor: c.lime }]}>
                    <Ionicons
                      name={item === 'joystick' ? 'radio-button-on-outline' : 'keypad-outline'}
                      size={21}
                      color={mode === item ? c.night : '#C5D9D2'}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ alignItems: 'center', opacity: state.enabled ? 1 : 0.4 }}>
              {mode === 'joystick' ? (
                <View
                  {...responder.panHandlers}
                  accessibilityLabel="Joystick. Arraste para mover; solte para parar. Use os direcionais para controle por botões."
                  style={[
                    s.joystick,
                    { width: controlSize, height: controlSize, borderRadius: controlSize / 2 },
                  ]}>
                  <View
                    pointerEvents="none"
                    style={[
                      s.ring,
                      {
                        width: controlSize * 0.7,
                        height: controlSize * 0.7,
                        borderRadius: controlSize,
                      },
                    ]}
                  />
                  <View
                    pointerEvents="none"
                    style={[s.crosshair, { width: controlSize - 32, height: 1 }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[s.crosshair, { width: 1, height: controlSize - 32 }]}
                  />
                  <Ionicons
                    name="chevron-up"
                    size={20}
                    color="#77918B"
                    style={{ position: 'absolute', top: 12 }}
                  />
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color="#77918B"
                    style={{ position: 'absolute', bottom: 12 }}
                  />
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color="#77918B"
                    style={{ position: 'absolute', left: 12 }}
                  />
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#77918B"
                    style={{ position: 'absolute', right: 12 }}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      s.knob,
                      {
                        backgroundColor: touching ? '#E3FF9E' : c.lime,
                        transform: knob.getTranslateTransform(),
                      },
                    ]}>
                    <View style={s.knobGrip} />
                    <View style={s.knobGrip} />
                    <View style={s.knobGrip} />
                  </Animated.View>
                </View>
              ) : (
                <View style={{ width: controlSize, height: controlSize }}>
                  {directions.map((item) => (
                    <Pressable
                      key={item.position}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label}. Segure para mover e solte para parar.`}
                      disabled={!state.enabled}
                      onPressIn={() => {
                        setTouching(true);
                        setDirection(item.label);
                        pulse();
                        driver.move(item);
                      }}
                      onPressOut={release}
                      style={({ pressed }) => [
                        s.directionButton,
                        { width: controlSize * 0.31, height: controlSize * 0.31 },
                        s[item.position],
                        {
                          backgroundColor: pressed ? c.lime : '#2B4E47',
                          transform: [{ scale: pressed ? 0.94 : 1 }],
                        },
                      ]}>
                      {({ pressed }) => (
                        <Ionicons
                          name={item.icon}
                          size={32}
                          color={pressed ? c.night : '#FFFFFF'}
                        />
                      )}
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Parar motores"
                    onPressIn={() => {
                      release();
                      pulse(24);
                    }}
                    style={[
                      s.centerStop,
                      { width: controlSize * 0.25, height: controlSize * 0.25 },
                    ]}>
                    <Ionicons name="stop" size={24} color={c.lime} />
                  </Pressable>
                </View>
              )}
            </View>
            {!dense && (
              <View style={{ alignItems: 'center', gap: 5 }}>
                <Text accessibilityLiveRegion="polite" style={s.direction}>
                  {state.enabled ? (moving ? direction : 'Parado') : 'Ative para começar'}
                </Text>
                <Text style={s.instruction}>Segure para mover · Solte para parar</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <View style={[s.dock, presentation && { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {state.enabled || state.busy ? (
          <Action
            title="PARAR E DESATIVAR"
            icon="stop-circle"
            tone="danger"
            onPress={emergencyStop}
            style={{ minHeight: presentation && compact ? 48 : 62 }}
          />
        ) : (
          <Action
            title={connection ? 'Ativar controle manual' : 'Conectar um robô'}
            icon={connection ? 'power' : 'bluetooth'}
            busy={state.busy}
            onPress={() => {
              pulse(20);
              if (connection) void driver.enable();
              else router.navigate('/');
            }}
            style={{ minHeight: presentation && compact ? 48 : 60 }}
          />
        )}
        {!(presentation && compact) && (
          <Text style={s.dockCaption}>
            {state.enabled
              ? 'A parada desativa o controle. Reative para voltar a mover.'
              : 'Os motores só respondem com o controle ativado.'}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  workspace: { gap: 14 },
  controlPanel: { backgroundColor: c.night, borderRadius: 28, padding: 16, gap: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  controlStatus: { fontSize: 12, fontWeight: '700', color: '#DCE9E2' },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#21453E', padding: 3, borderRadius: 14 },
  modeButton: {
    width: 44,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystick: {
    backgroundColor: '#173B34',
    borderColor: '#3F6055',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', borderColor: '#35564A', borderWidth: 1 },
  crosshair: { position: 'absolute', backgroundColor: '#35564A' },
  knob: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: '#ACC666',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  knobGrip: { width: 22, height: 2, backgroundColor: '#829945', borderRadius: 1 },
  direction: { fontSize: 19, fontWeight: '700', color: '#FFFFFF' },
  instruction: { fontSize: 12, color: '#B1C9BB' },
  directionButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderBottomWidth: 5,
    borderColor: '#416555',
  },
  up: { top: 0, left: '34.5%' },
  left: { left: 0, top: '34.5%' },
  right: { right: 0, top: '34.5%' },
  down: { bottom: 0, left: '34.5%' },
  centerStop: {
    position: 'absolute',
    left: '37.5%',
    top: '37.5%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#23473B',
  },
  settings: { gap: 12 },
  speedValue: { fontSize: 28, fontWeight: '800', color: c.primary, letterSpacing: -1 },
  speedPreset: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  motorReadout: {
    flexDirection: 'row',
    gap: 24,
    backgroundColor: c.surface,
    borderRadius: 18,
    padding: 16,
    marginTop: 4,
  },
  motorLabel: { fontSize: 10, letterSpacing: 1.5, color: c.muted, fontWeight: '700' },
  motorValue: { fontSize: 24, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  motorTrack: { height: 4, borderRadius: 2, backgroundColor: c.line },
  dock: {
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  dockCaption: { fontSize: 11, color: c.muted, textAlign: 'center' },
  demoLabel: { color: c.primary, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
});
