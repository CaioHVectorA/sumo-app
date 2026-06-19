import { useEffect, useState, useRef, useCallback } from 'react';
import { Text, TouchableOpacity, View, PanResponder, Animated, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { send } from '@/src/services/bluetooth';
import { useRobot } from '@/src/hooks/useRobot';

type PresetButtonProps = {
  label: string;
  value: number;
  currentValue: number;
  onPress: (val: number) => void;
  disabled?: boolean;
};

function PresetButton({ label, value, currentValue, onPress, disabled }: PresetButtonProps) {
  const active = currentValue === value;
  return (
    <TouchableOpacity
      className="items-center justify-center rounded-md border px-3 py-1.5 text-center"
      style={{
        backgroundColor: active ? '#0ea5e9' : '#f8fafc',
        borderColor: active ? '#0284c7' : '#e2e8f0',
        opacity: disabled ? 0.5 : 1,
      }}
      onPress={() => onPress(value)}
      disabled={disabled}>
      <Text
        style={{
          color: active ? '#ffffff' : '#334155',
          fontWeight: active ? 'bold' : 'normal',
          fontSize: 12,
        }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ManualScreen() {
  const [manualEnabled, setManualEnabled] = useState(false);
  const [maxPwm, setMaxPwm] = useState(1200); // Speed limit (default 1200, max 1599)
  const [controlMode, setControlMode] = useState<'joystick' | 'buttons'>('joystick');
  const { telemetry, setIsRealTime } = useRobot();
  const navigation = useNavigation();

  // Refs to synchronize state values with the PanResponder closure
  const manualEnabledRef = useRef(manualEnabled);
  const maxPwmRef = useRef(maxPwm);

  useEffect(() => {
    manualEnabledRef.current = manualEnabled;
  }, [manualEnabled]);

  useEffect(() => {
    maxPwmRef.current = maxPwm;
  }, [maxPwm]);

  // Refs for bluetooth command throttling
  const lastSentTime = useRef(0);
  const lastSentValues = useRef({ left: 0, right: 0 });
  const pendingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Joystick visual position
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // Logical position (-1 to 1) for calculations
  const joystickPos = useRef({ x: 0, y: 0 });

  const [livePwm, setLivePwm] = useState({ left: 0, right: 0 });

  const drive = useCallback(async (left: number, right: number) => {
    await send(`M,${left},${right}`);
  }, []);

  const stopRobot = useCallback(() => {
    if (pendingTimeout.current) {
      clearTimeout(pendingTimeout.current);
      pendingTimeout.current = null;
    }
    // Reset local state
    pan.setValue({ x: 0, y: 0 });
    joystickPos.current = { x: 0, y: 0 };
    setLivePwm({ left: 0, right: 0 });
    // Send immediate stop command
    drive(0, 0);
    lastSentValues.current = { left: 0, right: 0 };
  }, [drive, pan]);

  // Disable manual control and stop robot on blur/unmount for safety
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      stopRobot();
      send('MANUAL_OFF');
      setManualEnabled(false);
      setIsRealTime(false);
    });

    return () => {
      unsubscribe();
      stopRobot();
      send('MANUAL_OFF');
      setManualEnabled(false);
      setIsRealTime(false);
    };
  }, [navigation, setIsRealTime, stopRobot]);

  const enableManual = async () => {
    await send('MANUAL_ON');
    setManualEnabled(true);
    setIsRealTime(true);
  };

  const disableManual = async () => {
    stopRobot();
    await send('MANUAL_OFF');
    setManualEnabled(false);
    setIsRealTime(false);
  };

  // Controlled BLE message sending to prevent input queue lag
  const sendDriveCommand = async (left: number, right: number, force = false) => {
    if (!force && left === lastSentValues.current.left && right === lastSentValues.current.right) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSentTime.current;
    const throttleInterval = 50; // Max 20 commands per second (50ms)

    if (pendingTimeout.current) {
      clearTimeout(pendingTimeout.current);
      pendingTimeout.current = null;
    }

    if (force || elapsed >= throttleInterval) {
      lastSentTime.current = now;
      lastSentValues.current = { left, right };
      setLivePwm({ left, right });
      await drive(left, right);
    } else {
      const delay = throttleInterval - elapsed;
      pendingTimeout.current = setTimeout(() => {
        sendDriveCommand(left, right);
      }, delay);
    }
  };

  const JOYSTICK_RADIUS = 75; // Max drag range

  // Configure PanResponder for capturing joystick gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (pendingTimeout.current) {
          clearTimeout(pendingTimeout.current);
          pendingTimeout.current = null;
        }
      },
      onPanResponderMove: (e, gestureState) => {
        if (!manualEnabledRef.current) return;

        const { dx, dy } = gestureState;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let targetX = dx;
        let targetY = dy;

        // Limit movement to joystick bounds
        if (distance > JOYSTICK_RADIUS) {
          targetX = (dx / distance) * JOYSTICK_RADIUS;
          targetY = (dy / distance) * JOYSTICK_RADIUS;
        }

        pan.setValue({ x: targetX, y: targetY });

        // Normalize to -1 to 1 (inverting Y so up is positive)
        let nx = targetX / JOYSTICK_RADIUS;
        let ny = -targetY / JOYSTICK_RADIUS;

        // Apply deadzone and snap thresholds for easier straight driving and pivot turns
        const DEADZONE = 0.12; // Ignore very small movements around center
        const SNAP_THRESHOLD = 0.25; // Lock to axis if within 25% of it

        const currentDist = Math.sqrt(nx * nx + ny * ny);

        if (currentDist < DEADZONE) {
          nx = 0;
          ny = 0;
        } else {
          // Snap to axes: if close to y-axis (nx is small), go straight forward/backward
          if (Math.abs(nx) < SNAP_THRESHOLD) {
            nx = 0;
          }
          // Snap to axes: if close to x-axis (ny is small), spin in place left/right
          else if (Math.abs(ny) < SNAP_THRESHOLD) {
            ny = 0;
          }

          // Apply sensitivity curve (quadratic curve) for smoother control at low ranges
          const applyCurve = (val: number) => {
            const sign = val < 0 ? -1 : 1;
            const absVal = Math.abs(val);
            return sign * (absVal * absVal);
          };

          nx = applyCurve(nx);
          ny = applyCurve(ny);
        }

        joystickPos.current = { x: nx, y: ny };

        // Differential steering calculation (Arcade Drive model)
        // y: forward/backward, x: left/right spin
        let leftSpeed = ny * maxPwmRef.current + nx * maxPwmRef.current;
        let rightSpeed = ny * maxPwmRef.current - nx * maxPwmRef.current;

        // Clip to maximum allowed limits
        leftSpeed = Math.max(-maxPwmRef.current, Math.min(maxPwmRef.current, leftSpeed));
        rightSpeed = Math.max(-maxPwmRef.current, Math.min(maxPwmRef.current, rightSpeed));

        sendDriveCommand(Math.round(leftSpeed), Math.round(rightSpeed));
      },
      onPanResponderRelease: () => {
        if (!manualEnabledRef.current) return;
        // Spring animation to return back to center smoothly
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          tension: 40,
          friction: 5,
        }).start();

        // Stop robot immediately
        sendDriveCommand(0, 0, true);
      },
      onPanResponderTerminate: () => {
        if (!manualEnabledRef.current) return;
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          tension: 40,
          friction: 5,
        }).start();
        sendDriveCommand(0, 0, true);
      },
    })
  ).current;

  const adjustMaxPwm = (amount: number) => {
    setMaxPwm((prev) => Math.max(500, Math.min(1599, prev + amount)));
  };

  const sensors = telemetry?.sensores ?? 0;
  const sensorBits = [
    Boolean(sensors & (1 << 4)),
    Boolean(sensors & (1 << 3)),
    Boolean(sensors & (1 << 2)),
    Boolean(sensors & (1 << 1)),
    Boolean(sensors & (1 << 0)),
  ];

  return (
    <View className="flex-1 bg-white">
      <Container>
        <View className="flex-1 gap-4 px-4 pb-6 pt-0">
          {/* Activation Controls */}
          <View className="flex-row flex-wrap gap-2.5">
            <Button
              title={manualEnabled ? 'Manual Ativo' : 'Ativar Manual'}
              onPress={enableManual}
              disabled={manualEnabled}
            />
            <Button title="Desativar Manual" onPress={disableManual} disabled={!manualEnabled} />
            <Button title="Parar" onPress={stopRobot} disabled={!manualEnabled} />
          </View>

          {/* Speed Limit Configuration (PWM) */}
          <View className="gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ajuste de Velocidade Máxima
              </Text>
              <Text className="text-sm font-bold text-sky-600">{maxPwm} PWM</Text>
            </View>

            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => adjustMaxPwm(-100)}
                disabled={!manualEnabled || maxPwm <= 500}
                className="h-9 items-center justify-center rounded-lg bg-slate-200 px-3 active:bg-slate-300"
                style={{ opacity: !manualEnabled || maxPwm <= 500 ? 0.5 : 1 }}>
                <Text className="text-sm font-bold text-slate-700">-100</Text>
              </TouchableOpacity>

              <View className="flex-1 flex-row justify-around gap-1">
                <PresetButton
                  label="Lento"
                  value={800}
                  currentValue={maxPwm}
                  onPress={setMaxPwm}
                  disabled={!manualEnabled}
                />
                <PresetButton
                  label="Médio"
                  value={1200}
                  currentValue={maxPwm}
                  onPress={setMaxPwm}
                  disabled={!manualEnabled}
                />
                <PresetButton
                  label="Máximo"
                  value={1599}
                  currentValue={maxPwm}
                  onPress={setMaxPwm}
                  disabled={!manualEnabled}
                />
              </View>

              <TouchableOpacity
                onPress={() => adjustMaxPwm(100)}
                disabled={!manualEnabled || maxPwm >= 1599}
                className="h-9 items-center justify-center rounded-lg bg-slate-200 px-3 active:bg-slate-300"
                style={{ opacity: !manualEnabled || maxPwm >= 1599 ? 0.5 : 1 }}>
                <Text className="text-sm font-bold text-slate-700">+100</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Selector de Modo de Controle (Joystick ou Botões) */}
          <View className="flex-row justify-center rounded-xl border border-slate-200 bg-slate-100 p-1.5">
            <TouchableOpacity
              onPress={() => {
                stopRobot();
                setControlMode('joystick');
              }}
              className="flex-1 items-center justify-center rounded-lg py-2"
              style={{
                backgroundColor: controlMode === 'joystick' ? '#ffffff' : 'transparent',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: controlMode === 'joystick' ? 0.08 : 0,
                shadowRadius: 2,
                elevation: controlMode === 'joystick' ? 2 : 0,
              }}>
              <Text
                className={`text-xs font-bold ${
                  controlMode === 'joystick' ? 'text-sky-600' : 'text-slate-500'
                }`}>
                Joystick
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                stopRobot();
                setControlMode('buttons');
              }}
              className="flex-1 items-center justify-center rounded-lg py-2"
              style={{
                backgroundColor: controlMode === 'buttons' ? '#ffffff' : 'transparent',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: controlMode === 'buttons' ? 0.08 : 0,
                shadowRadius: 2,
                elevation: controlMode === 'buttons' ? 2 : 0,
              }}>
              <Text
                className={`text-xs font-bold ${
                  controlMode === 'buttons' ? 'text-sky-600' : 'text-slate-500'
                }`}>
                Teclado Direcional
              </Text>
            </TouchableOpacity>
          </View>

          {/* Area de Controle Ativa */}
          {controlMode === 'joystick' ? (
            <View className="relative min-h-[220px] flex-1 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 py-6 shadow-sm">
              <Text className="absolute top-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Joystick Virtual
              </Text>

              <View
                style={[styles.joystickContainer, { opacity: manualEnabled ? 1 : 0.4 }]}
                {...(manualEnabled ? panResponder.panHandlers : {})}>
                {/* Target / Reference center marker */}
                <View style={styles.joystickGuide} />

                {/* Draggable Knob */}
                <Animated.View
                  style={[
                    styles.joystickKnob,
                    {
                      transform: [{ translateX: pan.x }, { translateY: pan.y }],
                    },
                  ]}>
                  <View style={styles.joystickKnobInner} />
                </Animated.View>
              </View>

              {!manualEnabled && (
                <View className="absolute inset-0 items-center justify-center rounded-xl bg-white/70">
                  <Text className="text-sm font-semibold text-slate-500">
                    Ative o controle manual para usar o joystick
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View className="relative min-h-[220px] flex-1 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 py-4 shadow-sm">
              <Text className="absolute top-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Teclado Direcional (Pressione e Segure)
              </Text>

              <View className="items-center gap-3 pt-6">
                {/* Up Button */}
                <TouchableOpacity
                  onPressIn={() => sendDriveCommand(maxPwm, maxPwm, true)}
                  onPressOut={stopRobot}
                  disabled={!manualEnabled}
                  className="h-14 w-24 items-center justify-center rounded-xl bg-sky-500 shadow-sm active:bg-sky-600"
                  style={{ opacity: manualEnabled ? 1 : 0.4 }}>
                  <Text className="text-xl font-bold text-white">▲</Text>
                  <Text className="mt-0.5 text-[10px] font-bold uppercase text-white">Frente</Text>
                </TouchableOpacity>

                {/* Middle Row */}
                <View className="flex-row items-center gap-4">
                  {/* Left Button */}
                  <TouchableOpacity
                    onPressIn={() =>
                      sendDriveCommand(-Math.round(maxPwm * 0.85), Math.round(maxPwm * 0.85), true)
                    }
                    onPressOut={stopRobot}
                    disabled={!manualEnabled}
                    className="h-14 w-24 items-center justify-center rounded-xl bg-sky-500 shadow-sm active:bg-sky-600"
                    style={{ opacity: manualEnabled ? 1 : 0.4 }}>
                    <Text className="text-xl font-bold text-white">◀</Text>
                    <Text className="mt-0.5 text-[10px] font-bold uppercase text-white">Esq</Text>
                  </TouchableOpacity>

                  {/* Center Stop Button */}
                  <TouchableOpacity
                    onPress={stopRobot}
                    disabled={!manualEnabled}
                    className="h-11 w-11 items-center justify-center rounded-full bg-red-500 shadow-sm active:bg-red-600"
                    style={{ opacity: manualEnabled ? 1 : 0.4 }}>
                    <Text className="text-center text-[9px] font-bold uppercase text-white">
                      Para
                    </Text>
                  </TouchableOpacity>

                  {/* Right Button */}
                  <TouchableOpacity
                    onPressIn={() =>
                      sendDriveCommand(Math.round(maxPwm * 0.85), -Math.round(maxPwm * 0.85), true)
                    }
                    onPressOut={stopRobot}
                    disabled={!manualEnabled}
                    className="h-14 w-24 items-center justify-center rounded-xl bg-sky-500 shadow-sm active:bg-sky-600"
                    style={{ opacity: manualEnabled ? 1 : 0.4 }}>
                    <Text className="text-xl font-bold text-white">▶</Text>
                    <Text className="mt-0.5 text-[10px] font-bold uppercase text-white">Dir</Text>
                  </TouchableOpacity>
                </View>

                {/* Down Button */}
                <TouchableOpacity
                  onPressIn={() => sendDriveCommand(-maxPwm, -maxPwm, true)}
                  onPressOut={stopRobot}
                  disabled={!manualEnabled}
                  className="h-14 w-24 items-center justify-center rounded-xl bg-sky-500 shadow-sm active:bg-sky-600"
                  style={{ opacity: manualEnabled ? 1 : 0.4 }}>
                  <Text className="text-xl font-bold text-white">▼</Text>
                  <Text className="mt-0.5 text-[10px] font-bold uppercase text-white">Ré</Text>
                </TouchableOpacity>
              </View>

              {!manualEnabled && (
                <View className="absolute inset-0 items-center justify-center rounded-xl bg-white/70">
                  <Text className="text-sm font-semibold text-slate-500">
                    Ative o controle manual para usar os botões
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* System Telemetry & Motor Monitor */}
          <View className="gap-2.5 rounded-xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
            <View className="flex-row items-center justify-between border-b border-sky-100 pb-2">
              <Text className="text-sm font-bold text-sky-900">Monitor do Sistema</Text>
              {manualEnabled && (
                <View className="flex-row items-center gap-1.5">
                  <View className="h-2 w-2 rounded-full bg-emerald-500" />
                  <Text className="text-xs font-semibold uppercase text-emerald-600">
                    Em tempo real
                  </Text>
                </View>
              )}
            </View>

            {/* Sensors visualization */}
            <View className="items-center py-1">
              <View className="flex-row justify-center gap-2">
                {sensorBits.map((active, index) => (
                  <View
                    key={index}
                    className="h-8 w-8 items-center justify-center rounded-md border"
                    style={{
                      borderColor: active ? '#059669' : '#cbd5e1',
                      backgroundColor: active ? '#10b981' : '#e2e8f0',
                    }}>
                    <Text
                      style={{
                        color: active ? '#ffffff' : '#64748b',
                        fontSize: 9,
                        fontWeight: 'bold',
                      }}>
                      S{index + 1}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Numeric Feedback */}
            <View className="mt-1 gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-sky-700">
                  Comando Motor Esquerdo (Enviado / Retornado)
                </Text>
                <Text className="text-xs font-bold text-sky-950">
                  {livePwm.left} / {telemetry?.pwm ?? 0}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-sky-700">
                  Comando Motor Direito (Enviado / Retornado)
                </Text>
                <Text className="text-xs font-bold text-sky-950">
                  {livePwm.right} / {telemetry?.delta ?? 0}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-sky-700">
                  Leitura Bruta dos Sensores (Código de Erro)
                </Text>
                <Text className="text-xs font-bold text-sky-950">{sensors}</Text>
              </View>
            </View>
          </View>
        </View>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  joystickContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(224, 242, 254, 0.5)',
    borderWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  joystickGuide: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#93c5fd',
    opacity: 0.7,
  },
  joystickKnob: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 5,
  },
  joystickKnobInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});
