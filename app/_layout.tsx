import '../global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Drawer } from 'expo-router/drawer';

export default function Layout() {
  return (
    <SafeAreaProvider>
      <Drawer
        screenOptions={{
          headerShown: true,
          headerTitleAlign: 'center',
          headerTintColor: '#0369a1',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 18,
          },
          drawerActiveTintColor: '#0369a1',
          drawerInactiveTintColor: '#64748b',
          drawerLabelStyle: {
            fontSize: 16,
            fontWeight: '500',
          },
        }}>
        <Drawer.Screen
          name="index"
          options={{
            title: 'Conectar',
            drawerLabel: 'Conectar',
          }}
        />
        <Drawer.Screen
          name="connect"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="config"
          options={{
            title: 'Configuração',
            drawerLabel: 'Configuração',
          }}
        />
        <Drawer.Screen
          name="manual"
          options={{
            title: 'Controle Manual',
            drawerLabel: 'Controle Manual',
          }}
        />
        <Drawer.Screen
          name="details"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="+not-found"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
      </Drawer>
    </SafeAreaProvider>
  );
}
