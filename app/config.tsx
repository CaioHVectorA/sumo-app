import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { send } from '@/src/services/bluetooth';
import { useRobot } from '@/src/hooks/useRobot';

type FieldConfig = {
  key: string;
  label: string;
  value: string;
  setValue: (value: string) => void;
};

export default function ConfigScreen() {
  const [pwmBase, setPwmBase] = useState('1300');
  const [pwmMaxDelta, setPwmMaxDelta] = useState('8');
  const [breakTime1, setBreakTime1] = useState('250');
  const [breakTime3, setBreakTime3] = useState('250');
  const [timeBeforeMoving, setTimeBeforeMoving] = useState('1500');
  const [variancia, setVariancia] = useState('2');

  const { status, telemetry } = useRobot();

  const fields = useMemo<FieldConfig[]>(
    () => [
      { key: 'PWM_BASE', label: 'PWM base', value: pwmBase, setValue: setPwmBase },
      { key: 'PWM_MAX_DELTA', label: 'PWM delta max', value: pwmMaxDelta, setValue: setPwmMaxDelta },
      { key: 'BREAK_TIME_1', label: 'Tempo de freio 1', value: breakTime1, setValue: setBreakTime1 },
      { key: 'BREAK_TIME_3', label: 'Tempo de freio 3', value: breakTime3, setValue: setBreakTime3 },
      { key: 'TIME_BEFORE_MOVING', label: 'Tempo antes de mover', value: timeBeforeMoving, setValue: setTimeBeforeMoving },
      { key: 'VARIANCIA', label: 'Variancia', value: variancia, setValue: setVariancia },
    ],
    [pwmBase, pwmMaxDelta, breakTime1, breakTime3, timeBeforeMoving, variancia]
  );

  const sendParam = async (key: string, value: string) => {
    await send(`${key} = ${value}`);
  };

  const sendAll = async () => {
    for (const field of fields) {
      await sendParam(field.key, field.value);
    }
  };

  return (
    <View className="flex-1 bg-sky-50">
      <Stack.Screen options={{ headerShown: false }} />
      <Container>
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24, paddingHorizontal: 16 }}>
          <View className="gap-2 pt-2">
            <Text className="text-2xl font-bold">Configuracao do robo</Text>
            <Text className="text-sm text-gray-600">
              Envie parametros para o firmware AVR e solicite STATUS.
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-3">
            <Button title="Enviar STATUS" onPress={() => send('STATUS')} />
            <Button title="Enviar tudo" onPress={sendAll} />
            <Button title="Estrategia A" onPress={() => send('ESTRATEGIA_A')} />
          </View>

          <View className="gap-3">
            {fields.map((field) => (
              <View key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Text className="text-sm font-semibold text-gray-700">{field.label}</Text>
                <View className="mt-3 flex-row items-center gap-3">
                  <TextInput
                    value={field.value}
                    onChangeText={field.setValue}
                    keyboardType="numeric"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-base"
                  />
                  <TouchableOpacity
                    className="rounded-full bg-slate-800 px-4 py-2"
                    onPress={() => sendParam(field.key, field.value)}>
                    <Text className="text-sm font-semibold text-white">Enviar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {status ? (
            <View className="rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="text-sm font-semibold text-gray-700">Status atual</Text>
              <View className="mt-3 gap-2">
                {Object.entries(status).map(([key, value]) => (
                  <View key={key} className="flex-row items-center justify-between">
                    <Text className="text-xs text-gray-500">{key}</Text>
                    <Text className="text-xs font-semibold text-gray-800">{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {telemetry ? (
            <View className="rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="text-sm font-semibold text-gray-700">Telemetria atual</Text>
              <View className="mt-3 gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-gray-500">Sensores</Text>
                  <Text className="text-xs font-semibold text-gray-800">{telemetry.sensores}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-gray-500">PWM</Text>
                  <Text className="text-xs font-semibold text-gray-800">{telemetry.pwm}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-gray-500">Delta</Text>
                  <Text className="text-xs font-semibold text-gray-800">{telemetry.delta}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Container>
    </View>
  );
}
