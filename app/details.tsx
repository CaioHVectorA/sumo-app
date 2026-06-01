import { View } from 'react-native';

import { Stack, useLocalSearchParams } from 'expo-router';

import { Container } from '@/components/Container';
import { ScreenContent } from '@/components/ScreenContent';

export default function Details() {
  const { name } = useLocalSearchParams();

  return (
    <View className={styles.container}>
      <Stack.Screen options={{ title: 'Detalhes' }} />
      <Container>
        <ScreenContent path="screens/details.tsx" title={`Detalhes do usuario ${name}`} />
      </Container>
    </View>
  );
}

const styles = {
  container: 'flex flex-1 bg-white',
};
