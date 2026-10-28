// Bluetooth Classic requires the native Android app. The browser offers an explicit UI demo.
const unavailable = async (): Promise<never> => {
  throw new Error(
    'Para conectar ao robô, use o app Android. No navegador, experimente a demonstração.'
  );
};

export default {
  getBondedDevices: unavailable,
  connectToDevice: unavailable,
  onDeviceDisconnected: () => ({ remove() {} }),
};
