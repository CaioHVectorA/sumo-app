import '../global.css';
import Ionicons from '@/components/Icon';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useConnection } from '@/src/hooks/useConnection';
import { palette as c } from '@/src/theme';

function ConnectionBadge() {
  const connection = useConnection();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir conexão com o robô"
      onPress={() => router.navigate('/')}
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        flexDirection: 'row',
        gap: 7,
        alignItems: 'center',
      }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: connection ? c.primary : c.muted,
        }}
      />
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>
        {connection?.demo ? 'DEMO' : connection ? 'Conectado' : 'Sem conexão'}
      </Text>
    </Pressable>
  );
}

function Navigation() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerTitle: () => (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View
              style={{
                backgroundColor: c.night,
                width: 28,
                height: 28,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="hardware-chip" size={17} color={c.lime} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', letterSpacing: 2, color: c.ink }}>
              SUMÔ<Text style={{ color: c.primary }}>.</Text>
            </Text>
          </View>
        ),
        headerTitleAlign: 'left',
        headerRight: () => <ConnectionBadge />,
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          height: 68 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        sceneStyle: { backgroundColor: c.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarAccessibilityLabel: 'Início',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="manual"
        options={{
          title: 'Controle',
          tabBarAccessibilityLabel: 'Controle',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="game-controller-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="estrategias"
        options={{
          title: 'Estratégias',
          tabBarAccessibilityLabel: 'Estratégias',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="git-branch-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: 'Ajustes',
          tabBarAccessibilityLabel: 'Ajustes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="options-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="console" options={{ href: null }} />
      <Tabs.Screen name="editar-estrategia" options={{ href: null }} />
      <Tabs.Screen name="connect" options={{ href: null }} />
      <Tabs.Screen name="details" options={{ href: null }} />
      <Tabs.Screen name="+not-found" options={{ href: null }} />
    </Tabs>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Navigation />
    </SafeAreaProvider>
  );
}
