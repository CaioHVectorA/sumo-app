import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { send } from '@/src/services/bluetooth';
import { useRobot } from '@/src/hooks/useRobot';

type ControlButtonProps = {
  label: string;
  onPress: () => void;
};

function ControlButton({ label, onPress }: ControlButtonProps) {
  return (
    <TouchableOpacity className="h-16 w-28 items-center justify-center rounded-2xl bg-slate-800" onPress={onPress}>
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </TouchableOpacity>
  );
}

export default function ManualScreen() {
  const [manualEnabled, setManualEnabled] = useState(false);
  const { telemetry } = useRobot();

  const enableManual = async () => {
    await send('MANUAL_ON');
    setManualEnabled(true);
  };

  const disableManual = async () => {
    await send('MANUAL_OFF');
    setManualEnabled(false);
  };

  const drive = async (left: number, right: number) => {
    await send(`M,${left},${right}`);
  };

  return (
    <View className="flex-1 bg-sky-50">
      <Stack.Screen options={{ headerShown: false }} />
      <Container>
        <View className="flex-1 gap-6 px-4 pb-8 pt-2">
          <View className="gap-2">
            <Text className="text-2xl font-bold">Controle manual</Text>
            <Text className="text-sm text-gray-600">
              Ative o modo manual e controle os motores.
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-3">
            <Button
              title={manualEnabled ? 'Manual ativo' : 'Ativar manual'}
              onPress={enableManual}
            />
            <Button title="Desativar manual" onPress={disableManual} />
            <Button title="Parar" onPress={() => drive(0, 0)} />
          </View>

          <View className="items-center gap-3">
            <ControlButton label="Frente" onPress={() => drive(1599, 1599)} />
            <View className="flex-row items-center gap-3">
              <ControlButton label="Esquerda" onPress={() => drive(-1200, 1200)} />
              <ControlButton label="Direita" onPress={() => drive(1200, -1200)} />
            </View>
            <ControlButton label="Re" onPress={() => drive(-1000, -1000)} />
          </View>

          {telemetry ? (
            <View className="rounded-2xl border border-slate-200 bg-white p-4">
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
