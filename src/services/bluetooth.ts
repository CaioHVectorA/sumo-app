import RNBluetoothClassic from 'react-native-bluetooth-classic';

type DataListener = (line: string) => void;

type BluetoothDevice = {
  address?: string;
  name?: string;
  id?: string;
  write: (data: string) => Promise<void>;
  onDataReceived: (callback: (event: { data: string }) => void) => { remove?: () => void };
  disconnect?: () => Promise<void>;
} & Record<string, unknown>;

let device: BluetoothDevice | null = null;
let dataSubscription: { remove?: () => void } | null = null;
const listeners = new Set<DataListener>();
let buffer = '';

function attachDataListener() {
  if (!device || dataSubscription) return;

  dataSubscription = device.onDataReceived((event) => {
    const data = event.data;

    if (data.includes('\n')) {
      buffer += data;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          listeners.forEach((callback) => callback(trimmed));
        }
      });
    } else {
      const trimmed = data.trim();
      if (trimmed) {
        listeners.forEach((callback) => callback(trimmed));
      }
    }
  });
}

export async function connect(address: string) {
  if (!RNBluetoothClassic || typeof RNBluetoothClassic.connectToDevice !== 'function') {
    throw new Error('Bluetooth indisponivel. Rode no Android com o modulo nativo.');
  }
  //@ts-ignore
  const connected = (await RNBluetoothClassic.connectToDevice(address)) as BluetoothDevice;
  device = connected;
  buffer = '';
  attachDataListener();

  return connected;
}

export async function disconnect() {
  if (!device) return;

  await device.disconnect?.();
  device = null;
  dataSubscription?.remove?.();
  dataSubscription = null;
  buffer = '';
}

export async function send(command: string) {
  if (!device) return;
  console.log('Enviando comando:', command);
  await device.write(command.endsWith('\n') ? command : `${command}\n`);
}

export function onData(callback: DataListener) {
  listeners.add(callback);
  attachDataListener();

  return () => {
    listeners.delete(callback);
  };
}

export function getConnectedDevice() {
  return device;
}
