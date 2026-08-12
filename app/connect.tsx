import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { Ionicons } from '@expo/vector-icons';

import { Container } from '@/components/Container';
import { connect, disconnect } from '@/src/services/bluetooth';
import { getSavedDevices, removeSavedDevice, saveDevice } from '@/src/services/storage';

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
  const [memorizedDevices, setMemorizedDevices] = useState<DeviceItem[]>([]);
  const [otherDevices, setOtherDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const saved = await getSavedDevices();

      if (!RNBluetoothClassic || typeof RNBluetoothClassic.getBondedDevices !== 'function') {
        const savedList: DeviceItem[] = saved.map((s) => ({ name: s.name, address: s.address }));
        setMemorizedDevices(savedList);
        setOtherDevices([]);
        setError('Bluetooth indisponível. Rode no Android com módulo nativo.');
        return;
      }

      const bonded = (await RNBluetoothClassic.getBondedDevices()) as BondedDevice[];
      const normalized: DeviceItem[] = bonded
        .map((device) => ({
          name: device.name ?? device.id ?? 'Desconhecido',
          address: device.address ?? device.id ?? '',
        }))
        .filter((device) => device.address.length > 0);

      const memorizedList: DeviceItem[] = [];
      const addedAddresses = new Set<string>();

      saved.forEach((s) => {
        const bondedMatch = normalized.find((b) => b.address === s.address);
        memorizedList.push({
          name: bondedMatch ? bondedMatch.name : s.name,
          address: s.address,
        });
        addedAddresses.add(s.address);
      });

      const otherList = normalized.filter((d) => !addedAddresses.has(d.address));

      setMemorizedDevices(memorizedList);
      setOtherDevices(otherList);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar dispositivos.';
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
      await saveDevice(device);
      await loadDevices();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao conectar.';
      setError(message);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err: unknown) {
      console.log('Desconexão silenciosa:', err);
    } finally {
      setConnectedName(null);
      setError(null);
    }
  };

  const handleRemoveSaved = async (address: string) => {
    try {
      await removeSavedDevice(address);
      await loadDevices();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao remover dispositivo.';
      setError(message);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <Container>
        <View className="flex-1 gap-4 px-4 pb-4 pt-1">
          {/* Header Minimalista */}
          <View className="flex-row items-center justify-between border-b border-slate-200 pb-3">
            <View className="flex-row items-center gap-2">
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: connectedName ? '#10b981' : '#94a3b8',
                }}
              />
              <Text className="text-xs font-medium text-slate-600">
                {connectedName ? `Conectado: ${connectedName}` : 'Desconectado'}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              {connectedName ? (
                <TouchableOpacity
                  onPress={handleDisconnect}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5">
                  <Text className="text-xs font-medium text-rose-600">Desconectar</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={loadDevices}
                disabled={loading}
                className="flex-row items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                {loading ? (
                  <ActivityIndicator size="small" color="#64748b" />
                ) : (
                  <Ionicons name="refresh-outline" size={14} color="#64748b" />
                )}
                <Text className="text-xs font-medium text-slate-700">Atualizar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {error ? (
            <View className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <Text className="text-xs text-rose-600">{error}</Text>
            </View>
          ) : null}

          <ScrollView className="flex-1" contentContainerStyle={{ gap: 20, paddingBottom: 16 }}>
            {/* Seção 1: Memorizados */}
            <View className="gap-2">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Memorizados ({memorizedDevices.length})
              </Text>

              {memorizedDevices.length === 0 ? (
                <View className="rounded-xl border border-slate-200/80 bg-white p-4">
                  <Text className="text-center text-xs text-slate-400">
                    Nenhum dispositivo memorizado.
                  </Text>
                </View>
              ) : (
                memorizedDevices.map((item) => {
                  const isConnected = connectedName === item.name;
                  const isConnecting = connecting === item.address;

                  return (
                    <View
                      key={item.address}
                      className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <TouchableOpacity
                        className="flex-1 pr-2"
                        onPress={() => handleConnect(item)}
                        disabled={isConnecting}>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-semibold text-slate-800">{item.name}</Text>
                          {isConnected ? (
                            <View className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">
                              <Text className="text-[10px] font-semibold text-emerald-600">
                                Ativo
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="mt-0.5 text-xs text-slate-400">{item.address}</Text>
                        {isConnecting ? (
                          <Text className="mt-1 text-xs text-sky-600">Conectando...</Text>
                        ) : null}
                      </TouchableOpacity>

                      <View className="flex-row items-center gap-2">
                        {!isConnected && (
                          <TouchableOpacity
                            onPress={() => handleConnect(item)}
                            disabled={isConnecting}
                            className="rounded-lg bg-slate-900 px-3 py-1.5">
                            <Text className="text-xs font-medium text-white">Conectar</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          onPress={() => handleRemoveSaved(item.address)}
                          className="p-1.5"
                          accessibilityLabel="Esquecer conexão">
                          <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Seção 2: Outros Emparelhados */}
            <View className="gap-2">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Outros Emparelhados ({otherDevices.length})
              </Text>

              {otherDevices.length === 0 ? (
                <View className="rounded-xl border border-slate-200/80 bg-white p-4">
                  <Text className="text-center text-xs text-slate-400">
                    Nenhum outro dispositivo emparelhado.
                  </Text>
                </View>
              ) : (
                otherDevices.map((item) => {
                  const isConnecting = connecting === item.address;

                  return (
                    <View
                      key={item.address}
                      className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <TouchableOpacity
                        className="flex-1 pr-2"
                        onPress={() => handleConnect(item)}
                        disabled={isConnecting}>
                        <Text className="text-sm font-semibold text-slate-800">{item.name}</Text>
                        <Text className="mt-0.5 text-xs text-slate-400">{item.address}</Text>
                        {isConnecting ? (
                          <Text className="mt-1 text-xs text-sky-600">Conectando...</Text>
                        ) : null}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleConnect(item)}
                        disabled={isConnecting}
                        className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5">
                        <Text className="text-xs font-medium text-slate-700">Conectar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </Container>
    </View>
  );
}
