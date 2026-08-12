import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_DEVICES_KEY = '@robo_sumo:saved_devices';

export type SavedDevice = {
  name: string;
  address: string;
  lastConnectedAt?: number;
};

const memoryStorage: Record<string, string> = {};

async function safeGetItem(key: string): Promise<string | null> {
  try {
    if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch (e) {
    console.warn(`[Storage Safe Fallback] Erro ao ler ${key}:`, e);
  }
  return memoryStorage[key] ?? null;
}

async function safeSetItem(key: string, value: string): Promise<void> {
  memoryStorage[key] = value;
  try {
    if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
      await AsyncStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn(`[Storage Safe Fallback] Erro ao salvar ${key}:`, e);
  }
}

export async function getSavedDevices(): Promise<SavedDevice[]> {
  try {
    const jsonValue = await safeGetItem(SAVED_DEVICES_KEY);
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
    await safeSetItem(SAVED_DEVICES_KEY, JSON.stringify(newList));
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
    await safeSetItem(SAVED_DEVICES_KEY, JSON.stringify(newList));
    return newList;
  } catch (e) {
    console.error('Erro ao remover dispositivo memorizado:', e);
    return [];
  }
}
