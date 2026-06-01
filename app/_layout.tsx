import '../global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Drawer } from 'expo-router/drawer';

export default function Layout() {
  return (
    <SafeAreaProvider>
      <Drawer screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
