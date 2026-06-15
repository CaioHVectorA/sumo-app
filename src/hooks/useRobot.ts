import { onData, send } from '@/src/services/bluetooth';
import { useEffect, useState } from 'react';

type RobotStatus = Record<string, string>;

type Telemetry = {
  sensores: number;
  pwm: number;
  delta: number;
};
export function useRobot() {
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRealTime, setIsRealTime] = useState(false);

  useEffect(() => {
    if (!isRealTime) return;

    const interval = setInterval(() => {
      send('SENSORES');
    }, 1000);

    return () => clearInterval(interval);
  }, [isRealTime]);

  const getSensors = () => {
    send('SENSORES');
  };
  useEffect(() => {
    const unsubscribe = onData((line) => {
      console.log('Received line:', line);
      setLogs((prev) => [line, ...prev].slice(0, 50));

      if (line.startsWith('SENSORES = ')) {
        const binStr = line.substring(11).trim();
        const value = parseInt(binStr, 2);
        setTelemetry({
          sensores: Number.isNaN(value) ? 0 : value,
          pwm: 0,
          delta: 0,
        });
        return;
      }

      if (line.startsWith('ESTRATEGIA_')) {
        const value = line.replace('ESTRATEGIA_', '');
        setStatus((prev) => ({
          ...(prev ?? {}),
          ESTRATEGIA: value,
        }));
        return;
      }

      if (line.startsWith('VARIANCIA_') && line.endsWith('_OK')) {
        const value = line.replace('VARIANCIA_', '').replace('_OK', '');
        setStatus((prev) => ({
          ...(prev ?? {}),
          VARIANCIA: value,
        }));
        return;
      }

      if (line.includes('=')) {
        const [key, val] = line.split('=').map((s) => s.trim());
        if (key && val !== undefined) {
          setStatus((prev) => ({
            ...(prev ?? {}),
            [key]: val,
          }));
        }
        return;
      }

      if (line.startsWith('STATUS')) {
        const textoTraduzidoDoBluetooth = parseStatus(line);
        setStatus(textoTraduzidoDoBluetooth);
        return;
      }

      if (line.startsWith('TEL')) {
        setTelemetry(parseTelemetry(line));
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return {
    status,
    telemetry,
    logs,
    isRealTime,
    setIsRealTime,
    getSensors,
  };
}

function parseStatus(line: string) {
  const data: RobotStatus = {};
  const parts = line.split(';');
  parts.forEach((part) => {
    if (!part || part === 'STATUS') return;

    const [key, value] = part.split('=');

    if (value !== undefined && key) {
      data[key] = value;
    }
  });

  return data;
}

function parseTelemetry(line: string): Telemetry {
  const parts = line.split(';');

  return {
    sensores: Number(parts[1] ?? 0),
    pwm: Number(parts[2] ?? 0),
    delta: Number(parts[3] ?? 0),
  };
}
