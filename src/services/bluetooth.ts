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

// --- Otimização Estável de Comunicação Bluetooth (60ms / ~16Hz) ---
let pendingDriveCommand: string | null = null;
let lastSentDriveCommand = '';
let isWriting = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
const MIN_SEND_INTERVAL_MS = 60; // 60ms (~16Hz): taxa ultra-estável que não satura o RFCOMM do Android

async function processWriteQueue() {
  if (!device) return;

  if (pendingDriveCommand !== null) {
    const cmd = pendingDriveCommand;
    pendingDriveCommand = null;

    // Se o comando for exatamente idêntico ao último enviado, não retransmite (exceto parada)
    if (cmd === lastSentDriveCommand && cmd !== 'M,0,0') {
      isWriting = false;
      writeTimer = null;
      return;
    }

    lastSentDriveCommand = cmd;
    isWriting = true;

    // Watchdog de segurança: destrava a fila se a chamada nativa travar
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      isWriting = false;
      writeTimer = null;
    }, 500);

    try {
      await device.write(cmd.endsWith('\n') ? cmd : `${cmd}\n`);
    } catch (e) {
      console.error('Erro no envio Bluetooth:', e);
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      isWriting = false;
      writeTimer = null;

      // Se houver novo comando pendente, agenda a próxima escrita respeitando o intervalo mínimo
      if (pendingDriveCommand !== null) {
        writeTimer = setTimeout(processWriteQueue, MIN_SEND_INTERVAL_MS);
      }
    }
  } else {
    isWriting = false;
    writeTimer = null;
  }
}

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
    throw new Error('Bluetooth indisponível. Rode no Android com o módulo nativo.');
  }
  //@ts-ignore
  const connected = (await RNBluetoothClassic.connectToDevice(address)) as BluetoothDevice;
  device = connected;
  buffer = '';
  attachDataListener();

  return connected;
}

export async function disconnect() {
  if (writeTimer) clearTimeout(writeTimer);
  if (watchdogTimer) clearTimeout(watchdogTimer);
  pendingDriveCommand = null;
  lastSentDriveCommand = '';
  isWriting = false;

  try {
    if (device) {
      await device.disconnect?.();
    }
  } catch (e) {
    console.log('Socket Bluetooth já desconectado ou encerrado:', e);
  } finally {
    device = null;
    dataSubscription?.remove?.();
    dataSubscription = null;
    buffer = '';
  }
}

export async function send(command: string, priority = false) {
  if (!device) return;

  const isDriveCmd = command.startsWith('M,');

  // Comandos de controle/parada com prioridade imediata
  if (priority || !isDriveCmd || command === 'M,0,0') {
    pendingDriveCommand = null;
    lastSentDriveCommand = command;
    try {
      await device.write(command.endsWith('\n') ? command : `${command}\n`);
    } catch (e) {
      console.error('Erro no envio prioritário Bluetooth:', e);
    }
    return;
  }

  // Atualiza com o comando mais recente e aciona a fila se ela não estiver processando
  pendingDriveCommand = command;
  if (!isWriting && !writeTimer) {
    processWriteQueue();
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

    send(command, true).catch((err) => {
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
