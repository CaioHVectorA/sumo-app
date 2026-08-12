import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Container } from '@/components/Container';
import { useRobot } from '@/src/hooks/useRobot';
import { send } from '@/src/services/bluetooth';

// Configurações físicas do Joystick Analógico
const JOYSTICK_SIZE = 180;
const KNOB_SIZE = 60;
const MAX_RADIUS = JOYSTICK_SIZE / 2;

type AccelMode = 'direct' | 'smooth' | 'progressive' | 'exponential' | 'scurve';

const SPEED_PRESETS = [
  { label: '25%', percent: 0.25 },
  { label: '50%', percent: 0.5 },
  { label: '75%', percent: 0.75 },
  { label: '100%', percent: 1.0 },
];

const ACCEL_PROFILES: { key: AccelMode; label: string; desc: string }[] = [
  { key: 'direct', label: 'Direto (0ms)', desc: 'Resposta instantânea 1:1 sem filtro' },
  { key: 'smooth', label: 'Suave (~150ms)', desc: 'Rampa rápida sem trancos nos motores' },
  {
    key: 'progressive',
    label: 'Progressivo (~300ms)',
    desc: 'Arranque gradual suave para manobras',
  },
  {
    key: 'exponential',
    label: 'Esportivo (Expo)',
    desc: 'Alta precisão no centro + potência nas bordas',
  },
  { key: 'scurve', label: 'Curva S (S-Curve)', desc: 'Transição ultra suave de partida e parada' },
];

export default function ManualScreen() {
  const [manualEnabled, setManualEnabled] = useState(true);
  const [controlMode, setControlMode] = useState<'buttons' | 'joystick'>('buttons');
  const [speedPercent, setSpeedPercent] = useState<number>(0.6);
  const [accelMode, setAccelMode] = useState<AccelMode>('smooth');
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [activeDirection, setActiveDirection] = useState<string>('PARADO');
  const { telemetry } = useRobot();

  const targetSpeed = useRef({ left: 0, right: 0 });
  const currentSpeed = useRef({ left: 0, right: 0 });
  const rampTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxAllowedPWM = Math.round(1599 * speedPercent);

  // Envia MANUAL_ON ao abrir a tela para liberar comandos no firmware do Arduino
  useEffect(() => {
    send('MANUAL_ON', true);
    setManualEnabled(true);

    return () => {
      send('M,0,0', true);
    };
  }, []);

  // --- Motor de Rampa e Aceleração Inteligente (Dispara apenas se a velocidade mudar) ---
  useEffect(() => {
    rampTimer.current = setInterval(() => {
      if (!manualEnabled) return;

      let curL = currentSpeed.current.left;
      let curR = currentSpeed.current.right;
      const tgtL = targetSpeed.current.left;
      const tgtR = targetSpeed.current.right;

      // Se a velocidade atual já é igual à velocidade desejada, NÃO envia dados repetidos para não saturar a UART
      if (curL === tgtL && curR === tgtR) return;

      if (accelMode === 'direct') {
        curL = tgtL;
        curR = tgtR;
      } else {
        let step = 350;

        if (accelMode === 'progressive') {
          step = 180;
        } else if (accelMode === 'exponential') {
          const diffL = Math.abs(tgtL - curL);
          const diffR = Math.abs(tgtR - curR);
          step = Math.max(120, Math.round(Math.max(diffL, diffR) * 0.45));
        } else if (accelMode === 'scurve') {
          const diffL = Math.abs(tgtL - curL);
          const diffR = Math.abs(tgtR - curR);
          const maxDiff = Math.max(diffL, diffR);
          const ratio = maxDiff / 1599;
          const factor = 0.5 * (1 - Math.cos(Math.PI * ratio));
          step = Math.max(90, Math.round(160 + factor * 400));
        }

        if (curL < tgtL) curL = Math.min(tgtL, curL + step);
        else if (curL > tgtL) curL = Math.max(tgtL, curL - step);

        if (curR < tgtR) curR = Math.min(tgtR, curR + step);
        else if (curR > tgtR) curR = Math.max(tgtR, curR - step);
      }

      currentSpeed.current = { left: curL, right: curR };
      send(`M,${curL},${curR}`);
    }, 35); // Loop a ~28Hz

    return () => {
      if (rampTimer.current) clearInterval(rampTimer.current);
    };
  }, [manualEnabled, accelMode]);

  const enableManual = async () => {
    await send('MANUAL_ON', true);
    setManualEnabled(true);
  };

  const disableManual = async () => {
    targetSpeed.current = { left: 0, right: 0 };
    currentSpeed.current = { left: 0, right: 0 };
    await send('MANUAL_OFF', true);
    setManualEnabled(false);
  };

  const toggleManual = () => {
    if (manualEnabled) {
      disableManual();
    } else {
      enableManual();
    }
  };

  const changeSpeedBy = (delta: number) => {
    setSpeedPercent((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.max(0.1, Math.min(1.0, next));
    });
  };

  const drive = (rawLeft: number, rawRight: number, directionLabel?: string) => {
    if (!manualEnabled) return;

    let left = Math.round(rawLeft * speedPercent);
    let right = Math.round(rawRight * speedPercent);

    if (accelMode === 'exponential') {
      const normL = left / 1599;
      const normR = right / 1599;
      left = Math.round(Math.sign(normL) * normL * normL * 1599);
      right = Math.round(Math.sign(normR) * normR * normR * 1599);
    }

    // Filtro de banda morta (deadband): se a alteração for insignificante (< 35 PWM), ignora ruído
    const diffL = Math.abs(left - targetSpeed.current.left);
    const diffR = Math.abs(right - targetSpeed.current.right);
    if (left !== 0 && right !== 0 && diffL < 35 && diffR < 35) return;

    targetSpeed.current = { left, right };

    if (directionLabel) {
      setActiveDirection(directionLabel);
    } else if (left === 0 && right === 0) {
      setActiveDirection('PARADO');
    }

    if (accelMode === 'direct') {
      currentSpeed.current = { left, right };
      send(`M,${left},${right}`);
    }
  };

  const stop = () => {
    targetSpeed.current = { left: 0, right: 0 };
    currentSpeed.current = { left: 0, right: 0 };
    setActiveDirection('PARADO');
    send('M,0,0', true);
  };

  // --- Lógica do Joystick Analógico 360° com Bloqueio do Scroll ---
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const handleJoystickMove = (dx: number, dy: number) => {
    const distance = Math.sqrt(dx * dx + dy * dy);
    let targetX = dx;
    let targetY = dy;

    if (distance > MAX_RADIUS) {
      targetX = (dx / distance) * MAX_RADIUS;
      targetY = (dy / distance) * MAX_RADIUS;
    }

    setKnobPos({ x: targetX, y: targetY });

    const nx = targetX / MAX_RADIUS;
    const ny = -targetY / MAX_RADIUS;

    const baseScale = 1599;
    const V = ny * baseScale;
    const W = nx * baseScale;

    let left = Math.round(V + W);
    let right = Math.round(V - W);

    left = Math.max(-1599, Math.min(1599, left));
    right = Math.max(-1599, Math.min(1599, right));

    let label = 'DIRECIONAL';
    if (ny > 0.3) label = 'FRENTE';
    else if (ny < -0.3) label = 'RÉ';
    else if (nx > 0.3) label = 'GIRO DIREITA';
    else if (nx < -0.3) label = 'GIRO ESQUERDA';

    if (Math.abs(left) < 150 && Math.abs(right) < 150) {
      drive(0, 0, 'PARADO');
    } else {
      drive(left, right, label);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        setScrollEnabled(false);
      },
      onPanResponderMove: (evt, gestureState) => {
        handleJoystickMove(gestureState.dx, gestureState.dy);
      },
      onPanResponderRelease: () => {
        setKnobPos({ x: 0, y: 0 });
        stop();
        setScrollEnabled(true);
      },
      onPanResponderTerminate: () => {
        setKnobPos({ x: 0, y: 0 });
        stop();
        setScrollEnabled(true);
      },
    })
  ).current;

  return (
    <View className="flex-1 bg-slate-50">
      <Container>
        <ScrollView
          scrollEnabled={scrollEnabled}
          className="flex-1 px-4 pb-6 pt-1"
          contentContainerStyle={{ gap: 16 }}>
          {/* Bar de Controle Manual */}
          <View className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <View className="flex-row items-center gap-2.5">
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: manualEnabled ? '#10b981' : '#94a3b8',
                }}
              />
              <View>
                <Text className="text-xs font-semibold text-slate-800">
                  {manualEnabled ? 'Controle Manual Ativo' : 'Manual Desativado'}
                </Text>
                <Text className="text-[10px] text-slate-400">
                  {manualEnabled ? 'Comandos liberados no Arduino' : 'Ative para controlar'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={toggleManual}
              className="rounded-lg px-3 py-1.5"
              style={{
                backgroundColor: manualEnabled ? '#fff1f2' : '#f0fdf4',
                borderWidth: 1,
                borderColor: manualEnabled ? '#fecdd3' : '#bbf7d0',
              }}>
              <Text
                className="text-xs font-semibold"
                style={{ color: manualEnabled ? '#e11d48' : '#16a34a' }}>
                {manualEnabled ? 'Desativar' : 'Ativar'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Ajuste de Velocidade (PWM) */}
          <View className="gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ajuste de Velocidade
              </Text>
              <Text className="font-mono text-xs font-semibold text-slate-700">
                PWM Máx: {maxAllowedPWM} ({Math.round(speedPercent * 100)}%)
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => changeSpeedBy(-0.05)}
                className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2">
                <Text className="text-xs font-bold text-slate-700">- 5%</Text>
              </TouchableOpacity>

              <View className="flex-1 flex-row justify-center gap-1.5">
                {SPEED_PRESETS.map((preset) => {
                  const isSelected = Math.abs(speedPercent - preset.percent) < 0.01;
                  return (
                    <TouchableOpacity
                      key={preset.percent}
                      onPress={() => setSpeedPercent(preset.percent)}
                      className="flex-1 items-center justify-center rounded-lg border py-2"
                      style={{
                        backgroundColor: isSelected ? '#0f172a' : '#f8fafc',
                        borderColor: isSelected ? '#0f172a' : '#e2e8f0',
                      }}>
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: isSelected ? '#ffffff' : '#475569' }}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => changeSpeedBy(0.05)}
                className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2">
                <Text className="text-xs font-bold text-slate-700">+ 5%</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Perfis de Aceleração dos Motores */}
          <View className="gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="options-outline" size={16} color="#475569" />
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Perfil de Aceleração
                </Text>
              </View>
              <Text className="text-[10px] font-medium text-slate-500">
                {ACCEL_PROFILES.find((m) => m.key === accelMode)?.desc}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {ACCEL_PROFILES.map((profile) => {
                const isSelected = accelMode === profile.key;
                return (
                  <TouchableOpacity
                    key={profile.key}
                    onPress={() => setAccelMode(profile.key)}
                    className="min-w-[30%] flex-1 items-center rounded-lg border px-1 py-2"
                    style={{
                      backgroundColor: isSelected ? '#0f172a' : '#f8fafc',
                      borderColor: isSelected ? '#0f172a' : '#e2e8f0',
                    }}>
                    <Text
                      className="text-center text-[11px] font-bold"
                      style={{ color: isSelected ? '#ffffff' : '#475569' }}>
                      {profile.label.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Telemetria dos Motores em Tempo Real */}
          <View className="gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="speedometer-outline" size={16} color="#64748b" />
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Vetor dos Motores
                </Text>
              </View>
              <View className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
                <Text className="text-[10px] font-bold text-slate-700">{activeDirection}</Text>
              </View>
            </View>

            <View className="flex-row items-center justify-around">
              <View className="items-center">
                <Text className="text-[10px] font-medium text-slate-400">Motor Esquerdo (L)</Text>
                <Text className="font-mono text-sm font-bold text-slate-800">
                  {currentSpeed.current.left > 0
                    ? `+${currentSpeed.current.left}`
                    : currentSpeed.current.left}
                </Text>
              </View>

              <View className="h-6 w-px bg-slate-200" />

              <View className="items-center">
                <Text className="text-[10px] font-medium text-slate-400">Motor Direito (R)</Text>
                <Text className="font-mono text-sm font-bold text-slate-800">
                  {currentSpeed.current.right > 0
                    ? `+${currentSpeed.current.right}`
                    : currentSpeed.current.right}
                </Text>
              </View>
            </View>
          </View>

          {/* Alternador de Modo de Controle */}
          <View className="flex-row rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <TouchableOpacity
              onPress={() => {
                stop();
                setControlMode('buttons');
              }}
              className="flex-1 items-center justify-center rounded-lg py-2"
              style={{
                backgroundColor: controlMode === 'buttons' ? '#0f172a' : 'transparent',
              }}>
              <Text
                className="text-xs font-semibold"
                style={{ color: controlMode === 'buttons' ? '#ffffff' : '#64748b' }}>
                Direcionais
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                stop();
                setControlMode('joystick');
              }}
              className="flex-1 items-center justify-center rounded-lg py-2"
              style={{
                backgroundColor: controlMode === 'joystick' ? '#0f172a' : 'transparent',
              }}>
              <Text
                className="text-xs font-semibold"
                style={{ color: controlMode === 'joystick' ? '#ffffff' : '#64748b' }}>
                Joystick Analógico
              </Text>
            </TouchableOpacity>
          </View>

          {/* Área de Controle (Direcionais ou Joystick Analógico) */}
          <View className="min-h-[230px] items-center justify-center rounded-xl border border-slate-200 bg-white py-4 shadow-sm">
            {controlMode === 'buttons' ? (
              <View className="relative h-48 w-48 items-center justify-center">
                {/* Frente */}
                <TouchableOpacity
                  onPressIn={() => drive(1599, 1599, 'FRENTE')}
                  onPressOut={stop}
                  className="absolute top-0 h-14 w-16 items-center justify-center rounded-xl bg-slate-900 shadow active:bg-slate-800">
                  <Ionicons name="chevron-up" size={24} color="#ffffff" />
                </TouchableOpacity>

                {/* Esquerda */}
                <TouchableOpacity
                  onPressIn={() => drive(-1200, 1200, 'GIRO ESQUERDA')}
                  onPressOut={stop}
                  className="absolute left-0 h-14 w-16 items-center justify-center rounded-xl bg-slate-900 shadow active:bg-slate-800">
                  <Ionicons name="chevron-back" size={24} color="#ffffff" />
                </TouchableOpacity>

                {/* Direita */}
                <TouchableOpacity
                  onPressIn={() => drive(1200, -1200, 'GIRO DIREITA')}
                  onPressOut={stop}
                  className="absolute right-0 h-14 w-16 items-center justify-center rounded-xl bg-slate-900 shadow active:bg-slate-800">
                  <Ionicons name="chevron-forward" size={24} color="#ffffff" />
                </TouchableOpacity>

                {/* Ré */}
                <TouchableOpacity
                  onPressIn={() => drive(-1000, -1000, 'RÉ')}
                  onPressOut={stop}
                  className="absolute bottom-0 h-14 w-16 items-center justify-center rounded-xl bg-slate-900 shadow active:bg-slate-800">
                  <Ionicons name="chevron-down" size={24} color="#ffffff" />
                </TouchableOpacity>

                {/* Botão Central de Parada */}
                <TouchableOpacity
                  onPress={stop}
                  className="h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-slate-100">
                  <View className="h-3.5 w-3.5 rounded-sm bg-slate-600" />
                </TouchableOpacity>
              </View>
            ) : (
              <View
                {...panResponder.panHandlers}
                style={{
                  width: JOYSTICK_SIZE,
                  height: JOYSTICK_SIZE,
                  borderRadius: JOYSTICK_SIZE / 2,
                  backgroundColor: '#f8fafc',
                  borderWidth: 2,
                  borderColor: '#cbd5e1',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}>
                <View
                  style={{
                    position: 'absolute',
                    width: JOYSTICK_SIZE - 20,
                    height: 1,
                    backgroundColor: '#e2e8f0',
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: JOYSTICK_SIZE - 20,
                    backgroundColor: '#e2e8f0',
                  }}
                />

                <View
                  style={{
                    width: KNOB_SIZE,
                    height: KNOB_SIZE,
                    borderRadius: KNOB_SIZE / 2,
                    backgroundColor: '#0f172a',
                    borderWidth: 2,
                    borderColor: '#38bdf8',
                    position: 'absolute',
                    transform: [{ translateX: knobPos.x }, { translateY: knobPos.y }],
                    shadowColor: '#38bdf8',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 5,
                  }}
                />
              </View>
            )}
          </View>

          {/* Botão de Parada de Emergência Prominente */}
          <TouchableOpacity
            onPress={stop}
            className="items-center justify-center rounded-xl bg-rose-600 py-3.5 shadow-sm active:bg-rose-700">
            <View className="flex-row items-center gap-2">
              <Ionicons name="stop-circle-outline" size={20} color="#ffffff" />
              <Text className="text-sm font-bold uppercase tracking-wider text-white">
                PARADA DE EMERGÊNCIA (STOP)
              </Text>
            </View>
          </TouchableOpacity>

          {/* Telemetria do Robô */}
          {telemetry ? (
            <View className="gap-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Leitura de Telemetria
              </Text>

              <View className="flex-row items-center justify-between border-b border-slate-100 py-1">
                <Text className="text-xs text-slate-500">Sensores de Linha / Obstáculo</Text>
                <Text className="font-mono text-xs font-semibold text-slate-800">
                  {telemetry.sensores}
                </Text>
              </View>

              <View className="flex-row items-center justify-between border-b border-slate-100 py-1">
                <Text className="text-xs text-slate-500">Sinal PWM Atual</Text>
                <Text className="font-mono text-xs font-semibold text-slate-800">
                  {telemetry.pwm}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-1">
                <Text className="text-xs text-slate-500">Variação Delta</Text>
                <Text className="font-mono text-xs font-semibold text-slate-800">
                  {telemetry.delta}
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Container>
    </View>
  );
}
