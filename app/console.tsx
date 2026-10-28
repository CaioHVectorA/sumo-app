import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@/components/Icon';
import { useRouter } from 'expo-router';
import { useRobot } from '@/src/hooks/useRobot';
import { useConnection } from '@/src/hooks/useConnection';
import { PageTitle, ui } from '@/components/ui';
import { palette as c } from '@/src/theme';

export default function ConsoleScreen() {
  const { logs } = useRobot();
  const connection = useConnection();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'telemetry' | 'other'>('all');
  const filtered = logs.filter((log) =>
    filter === 'telemetry'
      ? log.startsWith('TEL;')
      : filter === 'other'
        ? !log.startsWith('TEL;')
        : true
  );
  return (
    <View style={ui.page}>
      <View style={[ui.content, { flex: 1 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar aos ajustes"
          onPress={() => router.navigate('/config')}
          style={[ui.row, { minHeight: 44 }]}>
          <Ionicons name="arrow-back" size={20} color={c.primary} />
          <Text style={{ color: c.primary, fontWeight: '700' }}>Voltar aos ajustes</Text>
        </Pressable>
        <PageTitle
          eyebrow="Diagnóstico"
          title="Console."
          description={
            connection?.demo
              ? 'Mensagens simuladas da demonstração.'
              : 'Acompanhe as últimas 50 mensagens recebidas.'
          }
        />
        <View style={s.filters}>
          {(
            [
              { id: 'all', title: 'Tudo' },
              { id: 'telemetry', title: 'Telemetria' },
              { id: 'other', title: 'Respostas' },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              aria-selected={filter === item.id}
              accessibilityState={{ selected: filter === item.id }}
              onPress={() => setFilter(item.id)}
              style={[s.filter, filter === item.id && { backgroundColor: c.primary }]}>
              <Text
                style={{
                  color: filter === item.id ? '#FFFFFF' : c.muted,
                  fontWeight: '700',
                  fontSize: 13,
                }}>
                {item.title}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.terminal}>
          <View style={[ui.row, { padding: 16, borderBottomWidth: 1, borderColor: '#31504A' }]}>
            <View style={s.dot} />
            <Text style={{ fontSize: 11, color: '#C1D6CE', letterSpacing: 1, flex: 1 }}>
              BLUETOOTH / RX
            </Text>
            <Text style={{ color: '#C1D6CE', fontSize: 11 }}>{filtered.length} mensagens</Text>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={{ padding: 16, gap: 14 }}
            renderItem={({ item, index }) => (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Text style={{ fontFamily: 'monospace', color: '#688A7D', fontSize: 12 }}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text
                  selectable
                  style={{
                    flex: 1,
                    fontFamily: 'monospace',
                    color: c.lime,
                    fontSize: 13,
                    lineHeight: 21,
                  }}>
                  {item}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 48 }}>
                <Ionicons name="terminal-outline" size={36} color="#688A7D" />
                <Text style={{ color: '#C1D6CE', textAlign: 'center', lineHeight: 22 }}>
                  Aguardando mensagens.{'\n'}Envie um comando ou consulte os sensores.
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 16,
    backgroundColor: c.surface,
  },
  filter: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminal: {
    flex: 1,
    minHeight: 260,
    borderRadius: 22,
    backgroundColor: c.night,
    overflow: 'hidden',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.lime },
});
