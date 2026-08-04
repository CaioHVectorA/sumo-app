import React, { useState, useRef } from 'react';
import { Text, TouchableOpacity, View, PanResponder } from 'react-native';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { send } from '@/src/services/bluetooth';
import { useRobot } from '@/src/hooks/useRobot';

// Configurações e limites físicos do Joystick
const JOYSTICK_SIZE = 160;
const KNOB_SIZE = 60;
const CENTER = JOYSTICK_SIZE / 2;
const MAX_RADIUS = JOYSTICK_SIZE / 2;

export default function ManualScreen() {
  const [manualEnabled, setManualEnabled] = useState(false);
  const [controlMode, setControlMode] = useState<'buttons' | 'joystick'>('buttons');
  const { telemetry } = useRobot();

  // Guarda os motores que estão rodando para não floodar comandos repetidos idênticos
  const currentSpeed = useRef({ left: 0, right: 0 });

  const enableManual = async () => {
    await send('MANUAL_ON');
    setManualEnabled(true);
  };

  const disableManual = async () => {
    await send('MANUAL_OFF');
    setManualEnabled(false);
  };

  const drive = async (left: number, right: number) => {
    if (!manualEnabled) return;
    // Evita envio se os valores forem iguais aos últimos enviados
    if (currentSpeed.current.left === left && currentSpeed.current.right === right) return;
    currentSpeed.current = { left, right };
    await send(`M,${left},${right}`);
  };

  const stop = () => drive(0, 0);

  // --- Lógica do Joystick ---
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const handleJoystickMove = (x: number, y: number) => {
    // Distância do centro
    const distance = Math.sqrt(x * x + y * y);
    let targetX = x;
    let targetY = y;

    // Limita ao raio máximo
    if (distance > MAX_RADIUS) {
      targetX = (x / distance) * MAX_RADIUS;
      targetY = (y / distance) * MAX_RADIUS;
    }

    setKnobPos({ x: targetX, y: targetY });

    // Normaliza os valores entre -1 e 1
    const nx = targetX / MAX_RADIUS;
    const ny = -targetY / MAX_RADIUS; // Inverte eixo Y do toque para plano cartesiano tradicional

    // Mapeamento Joystick -> Velocidade de Motores Diferencial
    // Velocidade vai de -1599 a 1599
    const speedScale = 1599;
    const V = ny * speedScale; // Frente/Trás base
    const W = nx * speedScale; // Rotação base

    let left = Math.round(V + W);
    let right = Math.round(V - W);

    // Garante que não ultrapasse o limite de PWM
    left = Math.max(-1599, Math.min(1599, left));
    right = Math.max(-1599, Math.min(1599, right));

    // Se estiver muito próximo do centro, para
    if (Math.abs(left) < 150 && Math.abs(right) < 150) {
      drive(0, 0);
    } else {
      drive(left, right);
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
    <View className="flex-1 bg-white">
      <Container>
        <View className="flex-1 gap-6 px-4 pb-8 pt-0 justify-between">
          <View className="gap-4">
            {/* Status e Controles Manuais Gerais */}
            <View className="flex-row flex-wrap gap-2 justify-center">
              <Button
                title={manualEnabled ? 'Manual ativo' : 'Ativar manual'}
                onPress={enableManual}
              />
              <Button title="Desativar manual" onPress={disableManual} />
              <Button title="Parar" onPress={stop} />
            </View>

            {/* Alternador de Modo de Controle */}
            <View className="flex-row justify-center gap-4 bg-slate-100 p-1.5 rounded-lg">
              <TouchableOpacity
                onPress={() => { stop(); setControlMode('buttons'); }}
                className={`flex-1 py-2 rounded-md ${controlMode === 'buttons' ? 'bg-sky-500 shadow-sm' : 'bg-transparent'}`}
              >
                <Text className={`text-center font-bold text-sm ${controlMode === 'buttons' ? 'text-white' : 'text-slate-600'}`}>
                  Direcionais
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { stop(); setControlMode('joystick'); }}
                className={`flex-1 py-2 rounded-md ${controlMode === 'joystick' ? 'bg-sky-500 shadow-sm' : 'bg-transparent'}`}
              >
                <Text className={`text-center font-bold text-sm ${controlMode === 'joystick' ? 'text-white' : 'text-slate-600'}`}>
                  Joystick
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Área de Controle Ativo */}
          <View className="flex-1 justify-center items-center py-6">
            {controlMode === 'buttons' ? (
              /* Direcionais Normais (Só andam enquanto pressionados) */
              <View className="items-center w-64 aspect-square justify-center relative">
                {/* Frente */}
                <TouchableOpacity
                  onPressIn={() => drive(1599, 1599)}
                  onPressOut={stop}
                  className="absolute top-0 h-16 w-20 items-center justify-center rounded-lg bg-sky-500 shadow active:bg-sky-600"
                >
                  <Text className="text-white font-bold">▲</Text>
                </TouchableOpacity>

                {/* Esquerda */}
                <TouchableOpacity
                  onPressIn={() => drive(-1200, 1200)}
                  onPressOut={stop}
                  className="absolute left-0 h-16 w-20 items-center justify-center rounded-lg bg-sky-500 shadow active:bg-sky-600"
                >
                  <Text className="text-white font-bold">◀</Text>
                </TouchableOpacity>

                {/* Direita */}
                <TouchableOpacity
                  onPressIn={() => drive(1200, -1200)}
                  onPressOut={stop}
                  className="absolute right-0 h-16 w-20 items-center justify-center rounded-lg bg-sky-500 shadow active:bg-sky-600"
                >
                  <Text className="text-white font-bold">▶</Text>
                </TouchableOpacity>

                {/* Ré */}
                <TouchableOpacity
                  onPressIn={() => drive(-1000, -1000)}
                  onPressOut={stop}
                  className="absolute bottom-0 h-16 w-20 items-center justify-center rounded-lg bg-sky-500 shadow active:bg-sky-600"
                >
                  <Text className="text-white font-bold">▼</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Joystick Analógico */
              <View 
                {...panResponder.panHandlers}
                style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }}
                className="bg-slate-200 border-2 border-slate-300 rounded-full items-center justify-center relative shadow-inner"
              >
                {/* Knob */}
                <View
                  style={{
                    width: KNOB_SIZE,
                    height: KNOB_SIZE,
                    transform: [
                      { translateX: knobPos.x },
                      { translateY: knobPos.y }
                    ]
                  }}
                  className="bg-sky-500 border-2 border-sky-600 rounded-full shadow-md absolute"
                />
              </View>
            )}
          </View>

          {/* Telemetria */}
          {telemetry ? (
            <View className="rounded-lg border border-sky-300 bg-sky-100 p-4">
              <Text className="text-sm font-semibold text-gray-700">Telemetria atual</Text>
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-xs text-gray-500">Sensores</Text>
                <Text className="text-xs font-semibold text-gray-800">{telemetry.sensores}</Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-gray-500">PWM</Text>
                <Text className="text-xs font-semibold text-gray-800">{telemetry.pwm}</Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-gray-500">Delta</Text>
                <Text className="text-xs font-semibold text-gray-800">{telemetry.delta}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Container>
    </View>
  );
}
