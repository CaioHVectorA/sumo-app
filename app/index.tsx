import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View, PermissionsAndroid, Platform, ScrollView, Alert } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { connect, disconnect, getConnectedDevice } from '@/src/services/bluetooth';
import { useRobot } from '@/src/hooks/useRobot';

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
  const { logs } = useRobot();

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }
    return true;
  };

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (Platform.OS === 'android') {
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          setError('Permissão de Bluetooth/Localização negada.');
          setLoading(false);
          return;
        }
      }

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

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setConnectedName(null);
      Alert.alert('Desconectado', 'Conexão Bluetooth encerrada.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect.';
      setError(message);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <Container>
        <View className="flex-1 gap-5 px-4 pb-6 pt-0">
          <View className="flex-row items-center justify-between">
            <Button title="Atualizar lista" onPress={loadDevices} />
            {loading ? <ActivityIndicator /> : null}
            {connectedName && (
              <TouchableOpacity
                onPress={handleDisconnect}
                className="rounded-md bg-red-100 px-4 py-2 border border-red-200">
                <Text className="text-sm font-semibold text-red-600">Desconectar</Text>
              </TouchableOpacity>
            )}
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
                className="rounded-lg border border-sky-300 bg-sky-100 p-4"
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
                <View className="rounded-lg border border-dashed border-sky-300 bg-sky-50 p-6">
                  <Text className="text-center text-sm text-gray-500">
                    Nenhum dispositivo emparelhado encontrado.
                  </Text>
                </View>
              )
            }
          />

          <View className="mt-2 flex-1 rounded-lg border border-slate-300 bg-slate-900 p-2">
            <Text className="mb-1 text-xs font-bold text-slate-400">CONSOLE LOGS (BLUETOOTH)</Text>
            <ScrollView className="flex-1">
              {logs.length === 0 ? (
                <Text className="text-xs italic text-slate-600">Aguardando dados...</Text>
              ) : (
                logs.map((log, index) => (
                  <Text key={index} className="font-mono text-[10px] text-emerald-400">
                    {`> ${log}`}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Container>
    </View>
  );
}
