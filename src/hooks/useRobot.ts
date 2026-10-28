import { getCommunicationLog, onData, onLogChange, send } from '@/src/services/bluetooth';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useConnection } from './useConnection';

type RobotStatus = Record<string, string>;
type Telemetry = { sensores: number; pwm: number; delta: number };

export function useRobot() {
  const connection = useConnection();
  const focused = useIsFocused();
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [isRealTime, setIsRealTime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logs = useSyncExternalStore(onLogChange, getCommunicationLog, getCommunicationLog);
  const getSensors = useCallback(() => {
    setError(null);
    void send('SENSORES').catch((err: unknown) => {
      setIsRealTime(false);
      setError(err instanceof Error ? err.message : 'Não foi possível ler os sensores.');
    });
  }, []);

  useEffect(() => {
    setTelemetry(null);
    setStatus(null);
    setError(null);
    setIsRealTime(false);
  }, [connection]);

  useEffect(() => {
    if (!isRealTime || !connection || !focused) return;
    getSensors();
    const interval = setInterval(getSensors, 1000);
    return () => clearInterval(interval);
  }, [isRealTime, connection, focused, getSensors]);

  useEffect(
    () =>
      onData((line) => {
        if (line.startsWith('SENSORES = ')) {
          const value = parseInt(line.substring(11).trim(), 2);
          setTelemetry({ sensores: Number.isNaN(value) ? 0 : value, pwm: 0, delta: 0 });
        } else if (line.startsWith('ESTRATEGIA_')) {
          setStatus((previous) => ({ ...previous, ESTRATEGIA: line.replace('ESTRATEGIA_', '') }));
        } else if (line.startsWith('VARIANCIA_') && line.endsWith('_OK')) {
          setStatus((previous) => ({
            ...previous,
            VARIANCIA: line.replace('VARIANCIA_', '').replace('_OK', ''),
          }));
        } else if (line.startsWith('STATUS')) {
          setStatus(
            Object.fromEntries(
              line
                .split(';')
                .slice(1)
                .filter((part) => part.includes('='))
                .map((part) => part.split('=').map((value) => value.trim()))
            )
          );
        } else if (line.includes('=')) {
          const [key, value] = line.split('=').map((part) => part.trim());
          if (key && value !== undefined) setStatus((previous) => ({ ...previous, [key]: value }));
        } else if (line.startsWith('TEL;')) {
          const parts = line.split(';');
          setTelemetry({
            sensores: Number(parts[1] ?? 0),
            pwm: Number(parts[2] ?? 0),
            delta: Number(parts[3] ?? 0),
          });
        }
      }),
    []
  );

  return { status, telemetry, logs, isRealTime, setIsRealTime, getSensors, error };
}
