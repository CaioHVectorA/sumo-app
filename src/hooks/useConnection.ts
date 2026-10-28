import { useSyncExternalStore } from 'react';
import { getConnection, onConnectionChange } from '@/src/services/bluetooth';

export function useConnection() {
  return useSyncExternalStore(onConnectionChange, getConnection, getConnection);
}
