import { send, onData, getConnectedDevice } from './bluetooth';
import { StrategyStep, CustomStrategy } from '../types/strategy';

/**
 * Robust Handshake Communication Helpers for Testing Movements & Strategies on Arduino
 */

const HANDSHAKE_TIMEOUT_MS = 2500;

export async function testMovementOnRobot(
  motorEsq: number,
  motorDir: number,
  timeMs: number,
  accelStep = 0
): Promise<void> {
  const device = getConnectedDevice();
  if (!device) {
    throw new Error('Robô não conectado via Bluetooth. Conecte antes de testar.');
  }

  const command = `TEST_STEP,${Math.round(motorEsq)},${Math.round(motorDir)},${Math.round(timeMs)},${Math.round(accelStep || 0)}`;

  return new Promise<void>((resolve, reject) => {
    let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    let handshakeReceived = false;

    const cleanup = () => {
      if (handshakeTimer) clearTimeout(handshakeTimer);
      if (finishTimer) clearTimeout(finishTimer);
      unsubscribe?.();
    };

    // 1. Timeout de resposta Handshake inicial
    handshakeTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Sem resposta do Arduino. O robô não confirmou o comando.'));
    }, HANDSHAKE_TIMEOUT_MS);

    // 2. Escuta respostas do Arduino
    unsubscribe = onData((line) => {
      const trimmed = line.trim();

      if (!handshakeReceived && (trimmed === 'STEP_OK' || trimmed.startsWith('STEP_OK'))) {
        handshakeReceived = true;
        if (handshakeTimer) clearTimeout(handshakeTimer);

        const expectedDuration = Math.max(timeMs, 100) + 1500;
        finishTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, expectedDuration);
      }

      if (handshakeReceived && (trimmed === 'TEST_FINISHED' || trimmed.startsWith('TEST_FINISHED'))) {
        cleanup();
        resolve();
      }
    });

    send(command, true).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export async function testStrategyOnRobot(steps: StrategyStep[]): Promise<void> {
  const device = getConnectedDevice();
  if (!device) {
    throw new Error('Robô não conectado via Bluetooth. Conecte antes de testar.');
  }

  if (!steps || steps.length === 0) {
    throw new Error('Nenhuma etapa definida para testar na estratégia.');
  }

  const serializedSteps = steps
    .map((s) => `${Math.round(s.motorEsq)},${Math.round(s.motorDir)},${Math.round(s.timeMs)},${Math.round(s.accelStep || 0)}`)
    .join(';');

  const command = `TEST_STRAT,${steps.length};${serializedSteps}`;
  const totalTimeMs = steps.reduce((acc, curr) => acc + (curr.timeMs || 0), 0);

  return new Promise<void>((resolve, reject) => {
    let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    let handshakeReceived = false;

    const cleanup = () => {
      if (handshakeTimer) clearTimeout(handshakeTimer);
      if (finishTimer) clearTimeout(finishTimer);
      unsubscribe?.();
    };

    handshakeTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Sem resposta do Arduino (Erro Handshake). Teste de estratégia cancelado.'));
    }, HANDSHAKE_TIMEOUT_MS);

    unsubscribe = onData((line) => {
      const trimmed = line.trim();

      if (!handshakeReceived && (trimmed === 'STRAT_OK' || trimmed.startsWith('STRAT_OK'))) {
        handshakeReceived = true;
        if (handshakeTimer) clearTimeout(handshakeTimer);

        const expectedDuration = Math.max(totalTimeMs, 200) + 2000;
        finishTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, expectedDuration);
      }

      if (handshakeReceived && (trimmed === 'TEST_FINISHED' || trimmed.startsWith('TEST_FINISHED'))) {
        cleanup();
        resolve();
      }
    });

    send(command, true).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export async function applyPresetStrategyOnRobot(strategyId: string, variancia?: number): Promise<void> {
  const device = getConnectedDevice();
  if (!device) {
    throw new Error('Robô não conectado via Bluetooth. Conecte antes de aplicar.');
  }

  const command = `ESTRATEGIA_${strategyId}`;
  const expectedStratConfirm = `ESTRATEGIA_${strategyId}`;
  const expectVariancia = strategyId === 'A' && typeof variancia === 'number';

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    let stratConfirmed = false;
    let varConfirmed = !expectVariancia;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Sem resposta do robô (Timeout). O Arduino não confirmou a estratégia.'));
    }, HANDSHAKE_TIMEOUT_MS);

    unsubscribe = onData((line) => {
      const trimmed = line.trim();

      if (!stratConfirmed && (trimmed === expectedStratConfirm || trimmed.startsWith(expectedStratConfirm))) {
        stratConfirmed = true;
        if (expectVariancia) {
          send(`VARIANCIA = ${variancia}`).catch(() => {});
        }
      }

      if (!varConfirmed && trimmed.startsWith('VARIANCIA_') && trimmed.endsWith('_OK')) {
        varConfirmed = true;
      }

      if (stratConfirmed && varConfirmed) {
        cleanup();
        resolve();
      }
    });

    send(command, true).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export async function stopRobot(): Promise<void> {
  await send('M,0,0', true);
}

export function formatStrategyToArduinoCode(strategy: CustomStrategy): string {
  let code = `// --- CÓDIGO AUTOMÁTICO GERADO PELO APP PARA O ARDUINO ---\n`;
  code += `// Estratégia: ${strategy.title}\n`;
  code += `// Etapas: ${strategy.steps.length}\n\n`;
  code += `void executarEstrategiaCustomizada() {\n`;

  strategy.steps.forEach((step, idx) => {
    code += `  // Etapa ${idx + 1}: ${step.name}\n`;
    code += `  setMotors(${step.motorEsq}, ${step.motorDir});\n`;
    if (step.timeMs > 0) {
      code += `  delay(${step.timeMs});\n`;
    } else {
      code += `  // Continuous PID loop mode\n`;
    }
  });

  code += `  setMotors(0, 0);\n`;
  code += `}\n`;
  return code;
}
