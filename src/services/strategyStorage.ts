import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalibratedMovement, CustomStrategy, StrategyStep } from '../types/strategy';
import { calculateCurvePWM } from '../utils/movementMath';

const CALIBRATED_MOVEMENTS_KEY = '@robo_sumo:calibrated_movements_v2';
const CUSTOM_STRATEGIES_KEY = '@robo_sumo:custom_strategies_v2';

export const DEFAULT_CALIBRATIONS: CalibratedMovement[] = [
  {
    id: 'FRENTE',
    type: 'FRENTE',
    name: 'Andar para Frente',
    description: 'Movimento reto acelerado com ambos os motores alinhados.',
    motorEsq: 1500,
    motorDir: 1500,
    timeMs: 300,
    icon: 'arrow-up-outline',
    visualType: 'forward',
  },
  {
    id: 'PARAR',
    type: 'PARAR',
    name: 'Parar / Pausa',
    description: 'Motores desativados/desacelerados durante um tempo específico.',
    motorEsq: 0,
    motorDir: 0,
    timeMs: 250,
    icon: 'hand-left-outline',
    visualType: 'stop',
  },
  {
    id: 'VIRA_DIREITA',
    type: 'VIRA_DIREITA',
    name: 'Virar para Direita',
    description: 'Giro no próprio eixo com motor esquerdo para frente e direito para trás.',
    motorEsq: 1200,
    motorDir: -1200,
    timeMs: 150,
    icon: 'arrow-redo-outline',
    visualType: 'turn_right',
  },
  {
    id: 'VIRA_ESQUERDA',
    type: 'VIRA_ESQUERDA',
    name: 'Virar para Esquerda',
    description: 'Giro no próprio eixo com motor direito para frente e esquerdo para trás.',
    motorEsq: -1200,
    motorDir: 1200,
    timeMs: 150,
    icon: 'arrow-undo-outline',
    visualType: 'turn_left',
  },
  {
    id: 'ROT_90',
    type: 'ROT_90',
    name: 'Rotacionar 90°',
    description: 'Giro rápido e preciso de 90 graus à direita.',
    motorEsq: 1400,
    motorDir: -1400,
    timeMs: 120,
    icon: 'refresh-outline',
    visualType: 'rotate_90',
  },
  {
    id: 'ROT_180',
    type: 'ROT_180',
    name: 'Rotacionar 180°',
    description: 'Meia-volta rápida de 180 graus para inverter a direção.',
    motorEsq: 1500,
    motorDir: -1500,
    timeMs: 220,
    icon: 'sync-outline',
    visualType: 'rotate_180',
  },
  {
    id: 'CURVA',
    type: 'CURVA',
    name: 'Fazer Curva (Ângulo Racional)',
    description: 'Curva intuitiva calculando a proporção de PWM dos motores pelo ângulo.',
    motorEsq: 1500,
    motorDir: 750,
    timeMs: 400,
    curveAngle: 45,
    basePwm: 1500,
    icon: 'git-commit-outline',
    visualType: 'curve_right',
  },
];

// --- MOVIMENTOS CALIBRADOS ---

export async function getCalibratedMovements(): Promise<CalibratedMovement[]> {
  try {
    const json = await AsyncStorage.getItem(CALIBRATED_MOVEMENTS_KEY);
    if (!json) return DEFAULT_CALIBRATIONS;
    const stored: CalibratedMovement[] = JSON.parse(json);

    // Merge missing defaults if any
    const existingIds = new Set(stored.map((m) => m.id));
    const missingDefaults = DEFAULT_CALIBRATIONS.filter((d) => !existingIds.has(d.id));

    return [...stored, ...missingDefaults];
  } catch (e) {
    console.error('Erro ao carregar calibrações:', e);
    return DEFAULT_CALIBRATIONS;
  }
}

export async function saveCalibratedMovement(movement: CalibratedMovement): Promise<CalibratedMovement[]> {
  try {
    const current = await getCalibratedMovements();
    const index = current.findIndex((m) => m.id === movement.id);

    let updatedList: CalibratedMovement[];
    if (index >= 0) {
      updatedList = [...current];
      updatedList[index] = movement;
    } else {
      updatedList = [...current, movement];
    }

    await AsyncStorage.setItem(CALIBRATED_MOVEMENTS_KEY, JSON.stringify(updatedList));

    // Update custom strategies referencing this calibrated movement if needed
    await syncStrategiesWithCalibrations(movement);

    return updatedList;
  } catch (e) {
    console.error('Erro ao salvar calibração de movimento:', e);
    return [];
  }
}

export async function resetCalibrationsToDefault(): Promise<CalibratedMovement[]> {
  try {
    await AsyncStorage.removeItem(CALIBRATED_MOVEMENTS_KEY);
    return DEFAULT_CALIBRATIONS;
  } catch (e) {
    console.error('Erro ao resetar calibrações:', e);
    return DEFAULT_CALIBRATIONS;
  }
}

// --- ESTRATÉGIAS CUSTOMIZADAS / EDITÁVEIS ---

export async function getCustomStrategies(): Promise<CustomStrategy[]> {
  try {
    const json = await AsyncStorage.getItem(CUSTOM_STRATEGIES_KEY);
    if (!json) return [];
    return JSON.parse(json);
  } catch (e) {
    console.error('Erro ao carregar estratégias customizadas:', e);
    return [];
  }
}

export async function saveCustomStrategy(strategy: CustomStrategy): Promise<CustomStrategy[]> {
  try {
    const current = await getCustomStrategies();
    const existingIndex = current.findIndex((s) => s.id === strategy.id);

    const now = Date.now();
    const updatedStrategy: CustomStrategy = {
      ...strategy,
      updatedAt: now,
      createdAt: strategy.createdAt || now,
      isCustom: true,
    };

    let newList: CustomStrategy[];
    if (existingIndex >= 0) {
      newList = [...current];
      newList[existingIndex] = updatedStrategy;
    } else {
      newList = [updatedStrategy, ...current];
    }

    await AsyncStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(newList));
    return newList;
  } catch (e) {
    console.error('Erro ao salvar estratégia:', e);
    return [];
  }
}

export async function deleteCustomStrategy(id: string): Promise<CustomStrategy[]> {
  try {
    const current = await getCustomStrategies();
    const newList = current.filter((s) => s.id !== id);
    await AsyncStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(newList));
    return newList;
  } catch (e) {
    console.error('Erro ao deletar estratégia:', e);
    return [];
  }
}

// Sincroniza passos de estratégias com os novos parâmetros calibrados do movimento
async function syncStrategiesWithCalibrations(updatedCalib: CalibratedMovement) {
  try {
    const strategies = await getCustomStrategies();
    let hasChanges = false;

    const updatedStrats = strategies.map((strat) => {
      let stratChanged = false;
      const updatedSteps = strat.steps.map((step) => {
        if (step.movementId === updatedCalib.id) {
          stratChanged = true;
          return {
            ...step,
            motorEsq: updatedCalib.motorEsq,
            motorDir: updatedCalib.motorDir,
            curveAngle: updatedCalib.curveAngle,
            visualType: updatedCalib.visualType,
          };
        }
        return step;
      });

      if (stratChanged) {
        hasChanges = true;
        return {
          ...strat,
          steps: updatedSteps,
          updatedAt: Date.now(),
        };
      }
      return strat;
    });

    if (hasChanges) {
      await AsyncStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(updatedStrats));
    }
  } catch (e) {
    console.error('Erro ao sincronizar estratégias com calibração:', e);
  }
}

// --- IMPORTAR & EXPORTAR JSON ---

export function exportStrategyToJSON(strategy: CustomStrategy): string {
  return JSON.stringify(strategy, null, 2);
}

export function importStrategyFromJSON(jsonString: string): CustomStrategy {
  try {
    const parsed = JSON.parse(jsonString);

    if (!parsed.title || !Array.isArray(parsed.steps)) {
      throw new Error('Formato JSON inválido. Requer os campos "title" e lista de "steps".');
    }

    // Normaliza a estrutura
    const newId = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const importedStrategy: CustomStrategy = {
      id: parsed.id && parsed.id.startsWith('custom_') ? parsed.id : newId,
      title: parsed.title,
      subtitle: parsed.subtitle || 'Estratégia Importada via JSON',
      badge: parsed.badge || 'Importada',
      description: parsed.description || 'Estratégia importada com sucesso.',
      steps: parsed.steps.map((s: Partial<StrategyStep>, index: number) => ({
        id: s.id || `step_${index + 1}_${Date.now()}`,
        movementId: s.movementId || 'FRENTE',
        name: s.name || `Etapa ${index + 1}`,
        motorEsq: typeof s.motorEsq === 'number' ? s.motorEsq : 1500,
        motorDir: typeof s.motorDir === 'number' ? s.motorDir : 1500,
        timeMs: typeof s.timeMs === 'number' ? s.timeMs : 250,
        curveAngle: s.curveAngle,
        visualType: s.visualType || 'forward',
        actionDescription: s.actionDescription || s.name || `Etapa ${index + 1}`,
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true,
    };

    return importedStrategy;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao processar JSON da estratégia';
    throw new Error(msg);
  }
}
