import { useEffect, useState } from 'react';
import { onData } from '@/src/services/bluetooth';

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

  useEffect(() => {
    const unsubscribe = onData((line) => {
      setLogs((prev) => [line, ...prev].slice(0, 50));

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
