import RNBluetoothClassic from './bluetoothAdapter';

type DataListener = (line: string) => void;

type BluetoothDevice = {
  address?: string;
  name?: string;
  id?: string;
  write: (data: string) => Promise<unknown>;
  onDataReceived?: (callback: (event: { data: string }) => void) => { remove?: () => void };
  disconnect?: () => Promise<unknown>;
} & Record<string, unknown>;

let device: BluetoothDevice | null = null;
let dataSubscription: { remove?: () => void } | null = null;
const listeners = new Set<DataListener>();
const logListeners = new Set<() => void>();
let communicationLog: string[] = [];
export const getCommunicationLog = () => communicationLog;
export function onLogChange(listener: () => void) {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}
function dispatchLine(line: string) {
  communicationLog = [line, ...communicationLog].slice(0, 50);
  logListeners.forEach((listener) => listener());
  listeners.forEach((listener) => {
    try {
      listener(line);
    } catch (error) {
      console.warn('Falha ao processar resposta:', error);
    }
  });
}

let buffer = '';
export type Connection = { name: string; address: string; demo: boolean };
let connection: Connection | null = null;
const connectionListeners = new Set<() => void>();
let disconnectSubscription: { remove: () => void } | null = null;

function updateConnection(next: Connection | null) {
  connection = next;
  communicationLog = [];
  logListeners.forEach((listener) => listener());
  connectionListeners.forEach((listener) => listener());
}

export const getConnection = () => connection;
export function onConnectionChange(listener: () => void) {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

export async function startDemo() {
  await disconnect();
  device = {
    write: async (payload: string) => {
      const command = payload.trim();
      setTimeout(() => {
        if (!connection?.demo) return;
        const reply =
          command === 'SENSORES'
            ? 'SENSORES = 00100'
            : command.startsWith('VARIANCIA = ')
              ? `VARIANCIA_${command.split('=')[1].trim()}_OK`
              : command.startsWith('ESTRATEGIA_')
                ? command
                : command.includes('=')
                  ? command
                  : `${command.split(',')[0]}_OK`;
        dispatchLine(reply);
      }, 120);
    },
  };
  updateConnection({ name: 'Robô de demonstração', address: 'demo', demo: true });
}

function attachDataListener() {
  if (!device || dataSubscription) return;

  try {
    if (typeof device.onDataReceived === 'function') {
      dataSubscription = device.onDataReceived((event) => {
        try {
          const data = event?.data || '';
          if (data.includes('\n')) {
            buffer += data;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            lines.forEach((line) => {
              const trimmed = line.trim();
              if (trimmed) {
                dispatchLine(trimmed);
              }
            });
          } else {
            const trimmed = data.trim();
            if (trimmed) {
              dispatchLine(trimmed);
            }
          }
        } catch (err) {
          console.warn('Erro ao processar dados recebidos:', err);
        }
      });
    }
  } catch (err) {
    console.warn('Falha ao registrar evento onDataReceived no dispositivo:', err);
    dataSubscription = null;
  }
}

export async function connect(address: string) {
  if (!RNBluetoothClassic || typeof RNBluetoothClassic.connectToDevice !== 'function') {
    throw new Error('Bluetooth indisponível. Rode no Android com módulo nativo.');
  }

  if (device) {
    await disconnect();
  }

  try {
    const connected = (await RNBluetoothClassic.connectToDevice(
      address
    )) as unknown as BluetoothDevice;
    device = connected;
    buffer = '';
    attachDataListener();
    updateConnection({ name: connected.name || 'Robô conectado', address, demo: false });
    disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((event) => {
      if (event.device.address !== address) return;
      dataSubscription?.remove?.();
      dataSubscription = null;
      device = null;
      buffer = '';
      disconnectSubscription?.remove();
      disconnectSubscription = null;
      updateConnection(null);
    });
    return connected;
  } catch (err: any) {
    dataSubscription?.remove?.();
    dataSubscription = null;
    updateConnection(null);
    device = null;
    throw new Error(err?.message || 'Não foi possível conectar ao robô via Bluetooth.');
  }
}

export async function disconnect() {
  disconnectSubscription?.remove();
  disconnectSubscription = null;
  updateConnection(null);
  if (!device) return;

  try {
    dataSubscription?.remove?.();
  } catch (e) {
    console.warn('Erro ao remover assinatura de dados:', e);
  }
  dataSubscription = null;

  try {
    await device.disconnect?.();
  } catch (e) {
    console.warn('Erro ao desconectar dispositivo:', e);
  }

  device = null;
  buffer = '';
}

export async function send(command: string) {
  if (!device) {
    throw new Error('Robô não conectado via Bluetooth. Conecte o dispositivo na tela inicial.');
  }

  try {
    const payload = command.endsWith('\n') ? command : `${command}\n`;
    await device.write(payload);
  } catch (err: any) {
    console.error('Erro ao enviar via Bluetooth:', err);
    throw new Error(
      'Falha ao enviar comando via Bluetooth. Verifique se o robô permanece ligado e conectado.'
    );
  }
}

export function sendWithTimeout(
  command: string,
  matcher?: (line: string) => boolean,
  timeoutMs = 3000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Sem resposta do robô (Timeout de 3s). Solicitação cancelada.'));
    }, timeoutMs);

    unsubscribe = onData((line) => {
      if (!matcher || matcher(line)) {
        cleanup();
        resolve(line);
      }
    });

    send(command).catch((err) => {
      cleanup();
      reject(err);
    });
  });
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
