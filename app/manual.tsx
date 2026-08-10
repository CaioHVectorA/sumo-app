import React, { useRef, useState } from 'react';
import { PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Container } from '@/components/Container';
import { useRobot } from '@/src/hooks/useRobot';
import { send } from '@/src/services/bluetooth';

// Configurações físicas do Joystick Analógico
const JOYSTICK_SIZE = 180;
const KNOB_SIZE = 64;
const MAX_RADIUS = JOYSTICK_SIZE / 2;

const SPEED_PRESETS = [
  { label: '25%', percent: 0.25 },
  { label: '50%', percent: 0.5 },
  { label: '75%', percent: 0.75 },
  { label: '100%', percent: 1.0 },
];

export default function ManualScreen() {
  const [manualEnabled, setManualEnabled] = useState(false);
  const [controlMode, setControlMode] = useState<'buttons' | 'joystick'>('buttons');
  const [speedPercent, setSpeedPercent] = useState<number>(0.6); // Padrão 60%
  const [activeDirection, setActiveDirection] = useState<string>('PARADO');
  const { telemetry } = useRobot();

  // Armazena a velocidade enviada aos motores para evitar redundâncias
  const currentSpeed = useRef({ left: 0, right: 0 });

  const maxAllowedPWM = Math.round(1599 * speedPercent);

  const enableManual = async () => {
    await send('MANUAL_ON');
    setManualEnabled(true);
  };

  const disableManual = async () => {
    await send('MANUAL_OFF');
    setManualEnabled(false);
  };

  const toggleManual = () => {
    if (manualEnabled) {
      disableManual();
    } else {
      enableManual();
    }
  };

  // Ajuste personalizado de velocidade
  const changeSpeedBy = (delta: number) => {
    setSpeedPercent((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.max(0.1, Math.min(1.0, next));
    });
  };

  const drive = async (rawLeft: number, rawRight: number, directionLabel?: string) => {
    if (!manualEnabled) return;

    // Aplica o limite percentual de velocidade ajustado
    const left = Math.round(rawLeft * speedPercent);
    const right = Math.round(rawRight * speedPercent);

    if (currentSpeed.current.left === left && currentSpeed.current.right === right) return;
    currentSpeed.current = { left, right };

    if (directionLabel) {
      setActiveDirection(directionLabel);
    } else if (left === 0 && right === 0) {
      setActiveDirection('PARADO');
    }

    await send(`M,${left},${right}`);
  };

  const stop = () => drive(0, 0, 'PARADO');

  // --- Lógica do Joystick Analógico ---
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const handleJoystickMove = (x: number, y: number) => {
    const distance = Math.sqrt(x * x + y * y);
    let targetX = x;
    let targetY = y;

    if (distance > MAX_RADIUS) {
      targetX = (x / distance) * MAX_RADIUS;
      targetY = (y / distance) * MAX_RADIUS;
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
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        handleJoystickMove(gestureState.dx, gestureState.dy);
      },
      onPanResponderRelease: () => {
        setKnobPos({ x: 0, y: 0 });
        stop();
      },
      onPanResponderTerminate: () => {
        setKnobPos({ x: 0, y: 0 });
        stop();
      },
    })
  ).current;

  return (
    <View className="flex-1 bg-slate-50">
      <Container>
        <ScrollView className="flex-1 px-4 pb-6 pt-1" contentContainerStyle={{ gap: 16 }}>
          {/* Top Bar: Manual Mode Toggle */}
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
                  {manualEnabled ? 'Motores liberados' : 'Ative para controlar'}
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

          {/* Ajuste Personalizado de Velocidade (PWM) */}
          <View className="gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ajuste de Velocidade
              </Text>
              <Text className="font-mono text-xs font-semibold text-slate-700">
                PWM: {maxAllowedPWM} ({Math.round(speedPercent * 100)}%)
              </Text>
            </View>

            {/* Controle Personalizado (+ / - e Percentuais) */}
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

          {/* Telemetria de Motores & Direção Atual */}
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
          <View className="min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-white py-4 shadow-sm">
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
                    borderColor: '#334155',
                    position: 'absolute',
                    transform: [{ translateX: knobPos.x }, { translateY: knobPos.y }],
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 3,
                    elevation: 4,
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
