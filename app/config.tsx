import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  const [sensors, setSensors] = useState(0);

  const { status } = useRobot();

  useEffect(() => {
    const unsubscribe = onData((line) => {
      if (line.startsWith('TEL;')) {
        const value = Number(line.split(';')[1]);
        setSensors(Number.isNaN(value) ? 0 : value);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

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
    <View className="flex-1 bg-white">
      <Container>
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 0 }}>
          <View className="items-center justify-center p-4 bg-sky-50 rounded-lg border border-sky-100 mb-2">
            <View className="flex-row flex-wrap justify-center gap-3">
              <TouchableOpacity 
                onPress={() => send('STATUS')}
                className="bg-slate-900 px-6 py-3 rounded-md shadow-sm active:opacity-70">
                <Text className="text-white font-bold text-center">Enviar STATUS</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={sendAll}
                className="bg-slate-900 px-6 py-3 rounded-md shadow-sm active:opacity-70">
                <Text className="text-white font-bold text-center">Enviar tudo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => send('ESTRATEGIA_A')}
                className="bg-slate-900 px-6 py-3 rounded-md shadow-sm active:opacity-70">
                <Text className="text-white font-bold text-center">Estratégia A</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
            <Text className="text-sm font-semibold text-gray-700">Sensores em tempo real</Text>
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
          </View>

          <View className="gap-3">
            {fields.map((field) => (
              <View key={field.key} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{field.label}</Text>
                <View className="mt-3 flex-row items-center gap-3">
                  <TextInput
                    value={field.value}
                    onChangeText={field.setValue}
                    keyboardType="numeric"
                    className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-base bg-slate-50"
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
                  <View key={key} className="flex-row items-center justify-between py-1 border-b border-slate-50">
                    <Text className="text-xs text-gray-400 font-medium uppercase">{key}</Text>
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
