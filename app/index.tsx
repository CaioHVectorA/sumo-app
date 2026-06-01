import { Link, Stack } from 'expo-router';

import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';

export default function Home() {
  return (
    <View className="flex flex-1 bg-sky-50">
      <Stack.Screen options={{ headerShown: false }} />
      <Container>
        <View className="flex-1 gap-6 px-4 pb-8 pt-3">
          <View className="gap-2">
            <Text className="text-3xl font-bold">Robo Sumo</Text>
            <Text className="text-base text-gray-600">
              Controle Bluetooth, configuracao e telemetria do robo.
            </Text>
          </View>

          <View className="gap-3">
            <Link href="/connect" asChild>
              <Button title="Conectar" />
            </Link>
            <Link href="/config" asChild>
              <Button title="Configuracao" />
            </Link>
            <Link href="/manual" asChild>
              <Button title="Controle manual" />
            </Link>
          </View>

          <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Text className="text-sm font-semibold text-gray-700">Dica rapida</Text>
            <Text className="mt-2 text-sm text-gray-600">
              Emparelhe o HC-05 no Android e depois toque em Conectar.
            </Text>
          </View>
        </View>
      </Container>
    </View>
  );
}
