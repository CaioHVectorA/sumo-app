import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Container } from '@/components/Container';
import { useRobot } from '@/src/hooks/useRobot';
import { useState } from 'react';

export default function ConsoleScreen() {
  const { logs } = useRobot();
  const [filter, setFilter] = useState<'all' | 'telemetry' | 'other'>('all');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'telemetry') return log.startsWith('TEL;');
    if (filter === 'other') return !log.startsWith('TEL;');
    return true;
  });

  return (
    <View className="flex-1 bg-slate-950">
      <Container>
        <View className="flex-1 px-4 py-3">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-white">Log de Comunicação</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setFilter('all')}
                className={`rounded px-3 py-1 ${filter === 'all' ? 'bg-sky-500' : 'bg-slate-800'}`}>
                <Text className="text-xs font-semibold text-white">Tudo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilter('telemetry')}
                className={`rounded px-3 py-1 ${filter === 'telemetry' ? 'bg-sky-500' : 'bg-slate-800'}`}>
                <Text className="text-xs font-semibold text-white">TEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilter('other')}
                className={`rounded px-3 py-1 ${filter === 'other' ? 'bg-sky-500' : 'bg-slate-800'}`}>
                <Text className="text-xs font-semibold text-white">Outros</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={filteredLogs}
            keyExtractor={(item, index) => `${index}-${item}`}
            renderItem={({ item }) => (
              <View className="border-b border-slate-900 py-1.5">
                <Text className="select-all font-mono text-sm text-sky-400">{item}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-10">
                <Text className="font-mono text-sm text-slate-500">
                  Nenhum dado recebido ainda...
                </Text>
              </View>
            }
          />
        </View>
      </Container>
    </View>
  );
}
