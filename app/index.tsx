import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@/components/Icon';
import { useRouter } from 'expo-router';
import Bluetooth from '@/src/services/bluetoothAdapter';
import { useConnection } from '@/src/hooks/useConnection';
import { connect, disconnect, startDemo } from '@/src/services/bluetooth';
import { getSavedDevices, removeSavedDevice, saveDevice } from '@/src/services/storage';
import { Action, Card, Notice, PageTitle, ui, type IconName } from '@/components/ui';
import { palette as c } from '@/src/theme';

type DeviceItem = { name: string; address: string };

async function requestPermissions() {
  if (Platform.OS !== 'android') return;
  const permissions =
    Number(Platform.Version) >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  if (permissions.some((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error('Permita o acesso ao Bluetooth nas configurações do celular para conectar.');
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const connection = useConnection();
  const [saved, setSaved] = useState<DeviceItem[]>([]);
  const [paired, setPaired] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setSaved(await getSavedDevices());
      if (Platform.OS === 'web' || !refresh) return;
      await requestPermissions();
      const devices = await Bluetooth.getBondedDevices();
      setPaired(
        devices.map((device) => ({ name: device.name || 'Robô', address: device.address }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível buscar os dispositivos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = async (item: DeviceItem) => {
    setConnecting(item.address);
    setError(null);
    try {
      await requestPermissions();
      await connect(item.address);
      setSaved(await saveDevice(item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conectar.');
    } finally {
      setConnecting(null);
    }
  };

  const shortcuts: {
    title: string;
    detail: string;
    icon: IconName;
    path: '/manual' | '/estrategias' | '/config';
  }[] = [
    {
      title: 'Pilotar o robô',
      detail: 'Joystick e direcionais',
      icon: 'game-controller-outline',
      path: '/manual',
    },
    {
      title: 'Preparar estratégia',
      detail: 'Escolha a próxima jogada',
      icon: 'git-branch-outline',
      path: '/estrategias',
    },
    {
      title: 'Ajustar e calibrar',
      detail: 'Motores e sensores',
      icon: 'options-outline',
      path: '/config',
    },
  ];
  const other = paired.filter((device) => !saved.some((item) => item.address === device.address));

  return (
    <View style={ui.page}>
      <ScrollView contentContainerStyle={ui.content}>
        <PageTitle
          eyebrow="Seu centro de comando"
          title="Tudo pronto para a arena."
          description="Conecte, ajuste e coloque o robô em movimento."
        />
        <View style={s.hero}>
          <View style={ui.row}>
            <View style={s.heroIcon}>
              <Ionicons
                name={connection ? 'bluetooth' : 'radio-outline'}
                size={28}
                color={c.lime}
              />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={s.heroLabel}>
                {connection?.demo
                  ? 'DEMONSTRAÇÃO · SEM HARDWARE'
                  : connection
                    ? 'CONEXÃO ATIVA'
                    : 'COMECE POR AQUI'}
              </Text>
              <Text style={s.heroTitle}>{connection?.name || 'Encontre seu robô'}</Text>
            </View>
          </View>
          <Text style={s.heroBody}>
            {connection
              ? connection.demo
                ? 'Explore os controles com uma simulação. Nenhum comando é enviado a um robô.'
                : 'Seu robô está conectado. Acesse o controle ou prepare uma estratégia.'
              : 'Ligue o robô e pareie o Bluetooth nas configurações do celular. Depois, busque abaixo.'}
          </Text>
          {connection ? (
            <View style={[ui.row, { flexWrap: 'wrap' }]}>
              <Action
                title="Abrir controle"
                icon="arrow-forward"
                onPress={() => router.navigate('/manual')}
                style={{ flexGrow: 1, backgroundColor: c.lime }}
                tone="secondary"
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => void disconnect()}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: '#CBDEDA', fontWeight: '600' }}>Desconectar</Text>
              </Pressable>
            </View>
          ) : (
            <Action
              title="Buscar dispositivos"
              icon="bluetooth"
              busy={loading}
              onPress={() => void load(true)}
              style={{ backgroundColor: c.lime }}
              tone="secondary"
            />
          )}
        </View>
        {error && <Notice error>{error}</Notice>}
        <View style={{ gap: 10 }}>
          <Text style={ui.section}>A um toque de distância</Text>
          {shortcuts.map((item, index) => (
            <Pressable
              key={item.path}
              accessibilityRole="button"
              onPress={() => router.navigate(item.path)}
              style={({ pressed }) => [s.shortcut, { opacity: pressed ? 0.7 : 1 }]}>
              <View style={[s.shortcutIcon, index === 0 && { backgroundColor: c.primaryLight }]}>
                <Ionicons name={item.icon} size={24} color={index === 0 ? c.primary : c.ink} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.shortcutTitle}>{item.title}</Text>
                <Text style={ui.body}>{item.detail}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={c.muted} />
            </Pressable>
          ))}
        </View>
        <View style={{ gap: 12 }}>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <Text style={ui.section}>Seus dispositivos</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Atualizar dispositivos"
              disabled={loading}
              onPress={() => void load(true)}
              style={ui.iconButton}>
              {loading ? (
                <ActivityIndicator color={c.primary} />
              ) : (
                <Ionicons name="refresh-outline" color={c.primary} size={20} />
              )}
            </Pressable>
          </View>
          {[...saved, ...other].length === 0 ? (
            <Card>
              <Text style={ui.body}>
                Nenhum dispositivo por aqui ainda. Os robôs conectados ficam salvos para a próxima
                vez.
              </Text>
            </Card>
          ) : (
            [...saved, ...other].map((item) => {
              const active = connection?.address === item.address;
              return (
                <Card key={item.address}>
                  <View style={ui.row}>
                    <Ionicons name="hardware-chip-outline" size={24} color={c.primary} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={ui.section}>{item.name}</Text>
                      <Text style={ui.body}>{active ? 'Conectado agora' : item.address}</Text>
                    </View>
                    {saved.some((device) => device.address === item.address) && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Esquecer ${item.name}`}
                        style={ui.iconButton}
                        disabled={Boolean(connecting)}
                        onPress={async () => {
                          setSaved(await removeSavedDevice(item.address));
                        }}>
                        <Ionicons name="trash-outline" color={c.muted} size={20} />
                      </Pressable>
                    )}
                  </View>
                  {!active && (
                    <Action
                      title="Conectar"
                      icon="bluetooth"
                      busy={connecting === item.address}
                      disabled={Boolean(connecting)}
                      onPress={() => void handleConnect(item)}
                      tone="secondary"
                    />
                  )}
                </Card>
              );
            })
          )}
        </View>
        {!connection && (
          <Card style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }}>
            <Text style={ui.section}>Quer conhecer os controles?</Text>
            <Text style={ui.body}>
              Abra uma demonstração da interface, mesmo sem o robô por perto.
            </Text>
            <Action
              title="Experimentar demonstração"
              icon="play-circle-outline"
              tone="secondary"
              onPress={async () => {
                await startDemo();
                router.navigate('/manual');
              }}
            />
          </Card>
        )}
        <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center', letterSpacing: 2 }}>
          SUMÔ CONTROL / FEITO PARA A ARENA
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: c.night, borderRadius: 26, padding: 22, gap: 20 },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#214540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { fontSize: 10, fontWeight: '800', color: c.lime, letterSpacing: 1.5 },
  heroTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5 },
  heroBody: { fontSize: 14, lineHeight: 22, color: '#BBD1CC' },
  shortcut: {
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: { color: c.ink, fontSize: 16, fontWeight: '700' },
});
