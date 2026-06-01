import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { connect } from '@/src/services/bluetooth';

type BondedDevice = {
  name?: string;
  address?: string;
  id?: string;
};

type DeviceItem = {
  name: string;
  address: string;
};

export default function ConnectScreen() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!RNBluetoothClassic || typeof RNBluetoothClassic.getBondedDevices !== 'function') {
        setDevices([]);
        setError('Bluetooth indisponivel. Rode no Android com o modulo nativo.');
        return;
      }

      const bonded = (await RNBluetoothClassic.getBondedDevices()) as BondedDevice[];
      const normalized = bonded
        .map((device) => ({
          name: device.name ?? device.id ?? 'Desconhecido',
          address: device.address ?? device.id ?? '',
        }))
        .filter((device) => device.address.length > 0);

      setDevices(normalized);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load devices.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleConnect = async (device: DeviceItem) => {
    setConnecting(device.address);
    setError(null);

    try {
      await connect(device.address);
      setConnectedName(device.name);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect.';
      setError(message);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen options={{ title: 'Conexao Bluetooth' }} />
      <Container>
        <View className="flex-1 gap-5 px-4 pb-6 pt-4">
          <View className="gap-1">
            <Text className="text-2xl font-bold">Dispositivos emparelhados</Text>
            <Text className="text-sm text-gray-600">
              Selecione um dispositivo (HC-05, SUMO, ROBO_01).
            </Text>
          </View>

          <View className="flex-row items-center justify-between">
            <Button title="Atualizar lista" onPress={loadDevices} />
            {loading ? <ActivityIndicator /> : null}
          </View>

          {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
          {connectedName ? (
            <Text className="text-sm text-emerald-600">Conectado em {connectedName}</Text>
          ) : null}

          <FlatList
            data={devices}
            keyExtractor={(item) => item.address}
            contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                onPress={() => handleConnect(item)}
                disabled={connecting === item.address}>
                <Text className="text-lg font-semibold">{item.name}</Text>
                <Text className="text-xs text-gray-500">{item.address}</Text>
                {connecting === item.address ? (
                  <Text className="mt-2 text-xs text-gray-500">Conectando...</Text>
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              loading ? null : (
                <View className="rounded-2xl border border-dashed border-gray-300 bg-white p-6">
                  <Text className="text-center text-sm text-gray-500">
                    Nenhum dispositivo emparelhado encontrado.
                  </Text>
                </View>
              )
            }
          />
        </View>
      </Container>
    </View>
  );
}
