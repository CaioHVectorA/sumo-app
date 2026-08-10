import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_DEVICES_KEY = '@robo_sumo:saved_devices';

export type SavedDevice = {
  name: string;
  address: string;
  lastConnectedAt?: number;
};

export async function getSavedDevices(): Promise<SavedDevice[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(SAVED_DEVICES_KEY);
    return jsonValue != null ? (JSON.parse(jsonValue) as SavedDevice[]) : [];
  } catch (e) {
    console.error('Erro ao ler conexoes memorizadas:', e);
    return [];
  }
}

export async function saveDevice(device: {
  name: string;
  address: string;
}): Promise<SavedDevice[]> {
  try {
    const current = await getSavedDevices();
    const filtered = current.filter((d) => d.address !== device.address);
    const updated: SavedDevice = {
      name: device.name,
      address: device.address,
      lastConnectedAt: Date.now(),
    };
    const newList = [updated, ...filtered];
    await AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(newList));
    return newList;
  } catch (e) {
    console.error('Erro ao memorizar dispositivo:', e);
    return [];
  }
}

export async function removeSavedDevice(address: string): Promise<SavedDevice[]> {
  try {
    const current = await getSavedDevices();
    const newList = current.filter((d) => d.address !== address);
    await AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(newList));
    return newList;
  } catch (e) {
    console.error('Erro ao remover dispositivo memorizado:', e);
    return [];
  }
}
