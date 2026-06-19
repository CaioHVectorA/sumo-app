import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { onData, send } from '@/src/services/bluetooth';
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
  const { status, telemetry, isRealTime, setIsRealTime, getSensors } = useRobot();

  const sensors = telemetry?.sensores ?? 0;

  const sensorBits = [
    Boolean(sensors & (1 << 4)),
    Boolean(sensors & (1 << 3)),
    Boolean(sensors & (1 << 2)),
    Boolean(sensors & (1 << 1)),
    Boolean(sensors & (1 << 0)),
  ];

  const fields = useMemo<FieldConfig[]>(
    () => [
      { key: 'PWM_BASE', label: 'PWM base', value: pwmBase, setValue: setPwmBase },
      {
        key: 'PWM_MAX_DELTA',
        label: 'PWM delta max',
        value: pwmMaxDelta,
        setValue: setPwmMaxDelta,
      },
      {
        key: 'BREAK_TIME_1',
        label: 'Tempo de freio 1',
        value: breakTime1,
        setValue: setBreakTime1,
      },
      {
        key: 'BREAK_TIME_3',
        label: 'Tempo de freio 3',
        value: breakTime3,
        setValue: setBreakTime3,
      },
      {
        key: 'TIME_BEFORE_MOVING',
        label: 'Tempo antes de mover',
        value: timeBeforeMoving,
        setValue: setTimeBeforeMoving,
      },
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
    <View className="flex-1 bg-white">
      <Container>
        <ScrollView
          contentContainerStyle={{
            gap: 16,
            paddingBottom: 24,
            paddingHorizontal: 16,
            paddingTop: 0,
          }}>
          <View className="mb-2 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 p-4">
            <View className="flex-row flex-wrap justify-center gap-3">
              <TouchableOpacity
                onPress={sendAll}
                className="rounded-md bg-slate-900 px-6 py-3 shadow-sm active:opacity-70">
                <Text className="text-center font-bold text-white">Enviar tudo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => send('ESTRATEGIA_A')}
                className="rounded-md bg-slate-900 px-6 py-3 shadow-sm active:opacity-70">
                <Text className="text-center font-bold text-white">Estratégia A</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-gray-700">Sensores</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-gray-500">Tempo Real</Text>
                <Switch
                  value={isRealTime}
                  onValueChange={setIsRealTime}
                  trackColor={{ false: '#767577', true: '#10b981' }}
                  thumbColor={isRealTime ? '#f4f3f4' : '#f4f3f4'}
                />
              </View>
            </View>

            <View className="mt-4 flex-row justify-center gap-2">
              {sensorBits.map((active, index) => (
                <View
                  key={index}
                  className={`h-12 w-12 rounded-md border ${
                    active ? 'border-green-600 bg-green-500' : 'border-zinc-700 bg-zinc-800'
                  }`}
                />
              ))}
            </View>

            {!isRealTime && (
              <TouchableOpacity
                onPress={getSensors}
                className="mt-4 rounded-md bg-slate-900 py-2.5 active:opacity-70">
                <Text className="text-center text-sm font-semibold text-white">
                  Ler Sensores Agora
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="gap-3">
            {fields.map((field) => (
              <View
                key={field.key}
                className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <Text className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                  {field.label}
                </Text>
                <View className="mt-3 flex-row items-center gap-3">
                  <TextInput
                    value={field.value}
                    onChangeText={field.setValue}
                    keyboardType="numeric"
                    className="flex-1 rounded-md border border-gray-200 bg-slate-50 px-3 py-2 text-base"
                  />
                  <TouchableOpacity
                    className="rounded-md bg-slate-900 px-4 py-2"
                    onPress={() => sendParam(field.key, field.value)}>
                    <Text className="text-sm font-semibold text-white">Enviar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {status ? (
            <View className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
              <Text className="text-sm font-semibold text-gray-700">Status atual</Text>
              <View className="mt-3 gap-2">
                {Object.entries(status).map(([key, value]) => (
                  <View
                    key={key}
                    className="flex-row items-center justify-between border-b border-slate-50 py-1">
                    <Text className="text-xs font-medium uppercase text-gray-400">{key}</Text>
                    <Text className="text-xs font-bold text-slate-800">{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Container>
    </View>
  );
}
