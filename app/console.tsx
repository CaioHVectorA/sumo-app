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
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-white text-lg font-bold">Log de Comunicação</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setFilter('all')}
                className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-sky-500' : 'bg-slate-800'}`}
              >
                <Text className="text-white text-xs font-semibold">Tudo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilter('telemetry')}
                className={`px-3 py-1 rounded ${filter === 'telemetry' ? 'bg-sky-500' : 'bg-slate-800'}`}
              >
                <Text className="text-white text-xs font-semibold">TEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilter('other')}
                className={`px-3 py-1 rounded ${filter === 'other' ? 'bg-sky-500' : 'bg-slate-800'}`}
              >
                <Text className="text-white text-xs font-semibold">Outros</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={filteredLogs}
            keyExtractor={(item, index) => `${index}-${item}`}
            renderItem={({ item }) => (
              <View className="py-1.5 border-b border-slate-900">
                <Text className="font-mono text-sm text-sky-400 select-all">{item}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-10">
                <Text className="text-slate-500 font-mono text-sm">Nenhum dado recebido ainda...</Text>
              </View>
            }
          />
        </View>
      </Container>
    </View>
  );
}
