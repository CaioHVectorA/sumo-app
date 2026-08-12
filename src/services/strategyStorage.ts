import AsyncStorage from '@react-native-async-storage/async-storage';

const MOVEMENT_PRESETS_KEY = '@robo_sumo:movement_presets';
const CUSTOM_STRATEGIES_KEY = '@robo_sumo:custom_strategies';

export type MovementPreset = {
  id: string;
  name: string;
  icon: string;
  motorEsq: number; // -1599 a 1599
  motorDir: number; // -1599 a 1599
  timeMs: number;
  description: string;
  isCustom?: boolean;
};

export type StrategyStep = {
  id: string;
  stepNumber: number;
  movementId?: string; // Vínculo com o preset de movimento
  action: string;
  motorEsq: number;
  motorDir: number;
  timeMs: number;
};

export type CustomStrategy = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  iconName: string;
  description: string;
  steps: StrategyStep[];
  createdAt: number;
  updatedAt: number;
};

export const DEFAULT_MOVEMENT_PRESETS: MovementPreset[] = [
  {
    id: 'girar_dir_90',
    name: 'Giro 90° Direita',
    icon: 'arrow-redo-outline',
    motorEsq: 1599,
    motorDir: -1599,
    timeMs: 120,
    description: 'Giro rápido de 90° no próprio eixo no sentido horário.',
  },
  {
    id: 'girar_esq_90',
    name: 'Giro 90° Esquerda',
    icon: 'arrow-undo-outline',
    motorEsq: -1599,
    motorDir: 1599,
    timeMs: 120,
    description: 'Giro rápido de 90° no próprio eixo no sentido anti-horário.',
  },
  {
    id: 'rot_180',
    name: 'Rotação 180°',
    icon: 'refresh-outline',
    motorEsq: 1599,
    motorDir: -1599,
    timeMs: 240,
    description: 'Meia-volta completa rápida no próprio eixo.',
  },
  {
    id: 'curva_aberta_esq',
    name: 'Curva Aberta Esquerda',
    icon: 'trending-up-outline',
    motorEsq: 600,
    motorDir: 1599,
    timeMs: 500,
    description: 'Curva suave em arco para flanquear pela esquerda.',
  },
  {
    id: 'curva_aberta_dir',
    name: 'Curva Aberta Direita',
    icon: 'trending-down-outline',
    motorEsq: 1599,
    motorDir: 600,
    timeMs: 500,
    description: 'Curva suave em arco para flanquear pela direita.',
  },
  {
    id: 'avanco_reto',
    name: 'Avanço Reto',
    icon: 'arrow-up-outline',
    motorEsq: 1599,
    motorDir: 1599,
    timeMs: 300,
    description: 'Arrancada em linha reta com potência total.',
  },
  {
    id: 'parar_pausa',
    name: 'Parada / Finta',
    icon: 'pause-circle-outline',
    motorEsq: 0,
    motorDir: 0,
    timeMs: 400,
    description: 'Robô permanece imóvel aguardando o oponente.',
  },
];

// --- FALLBACK EM MEMÓRIA PARA ASYNCSTORAGE ---
const memoryStorage: Record<string, string> = {};

async function safeGetItem(key: string): Promise<string | null> {
  try {
    if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch (e) {
    console.warn(`[Storage Safe Fallback] Erro ao ler ${key}:`, e);
  }
  return memoryStorage[key] ?? null;
}

async function safeSetItem(key: string, value: string): Promise<void> {
  memoryStorage[key] = value;
  try {
    if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
      await AsyncStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn(`[Storage Safe Fallback] Erro ao salvar ${key}:`, e);
  }
}

// --- GESTÃO DE PRESETS DE MOVIMENTO ---

export async function getMovementPresets(): Promise<MovementPreset[]> {
  try {
    const jsonValue = await safeGetItem(MOVEMENT_PRESETS_KEY);
    if (!jsonValue) {
      await safeSetItem(MOVEMENT_PRESETS_KEY, JSON.stringify(DEFAULT_MOVEMENT_PRESETS));
      return DEFAULT_MOVEMENT_PRESETS;
    }
    const parsed = JSON.parse(jsonValue) as MovementPreset[];
    return parsed && parsed.length > 0 ? parsed : DEFAULT_MOVEMENT_PRESETS;
  } catch (e) {
    console.error('Erro ao ler presets de movimento:', e);
    return DEFAULT_MOVEMENT_PRESETS;
  }
}

export async function saveMovementPreset(preset: MovementPreset): Promise<MovementPreset[]> {
  try {
    const current = await getMovementPresets();
    const index = current.findIndex((p) => p.id === preset.id);

    let updatedList: MovementPreset[];
    if (index >= 0) {
      updatedList = [...current];
      updatedList[index] = preset;
    } else {
      updatedList = [...current, preset];
    }

    await safeSetItem(MOVEMENT_PRESETS_KEY, JSON.stringify(updatedList));

    // Atualiza etapas de estratégias que utilizam este preset recalibrado
    await syncStrategiesWithPreset(preset);

    return updatedList;
  } catch (e) {
    console.error('Erro ao salvar preset de movimento:', e);
    return DEFAULT_MOVEMENT_PRESETS;
  }
}

export async function resetMovementPresets(): Promise<MovementPreset[]> {
  try {
    await safeSetItem(MOVEMENT_PRESETS_KEY, JSON.stringify(DEFAULT_MOVEMENT_PRESETS));
    return DEFAULT_MOVEMENT_PRESETS;
  } catch (e) {
    console.error('Erro ao resetar presets:', e);
    return DEFAULT_MOVEMENT_PRESETS;
  }
}

// Sincroniza passos de estratégias customizadas quando um preset é recalibrado
async function syncStrategiesWithPreset(updatedPreset: MovementPreset) {
  try {
    const strats = await getCustomStrategies();
    let hasChanges = false;

    const updatedStrats = strats.map((strat) => {
      let stratChanged = false;
      const updatedSteps = (strat.steps || []).map((step) => {
        if (step.movementId === updatedPreset.id) {
          stratChanged = true;
          return {
            ...step,
            motorEsq: updatedPreset.motorEsq,
            motorDir: updatedPreset.motorDir,
            timeMs: updatedPreset.timeMs,
            action: step.action || updatedPreset.name,
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
      await safeSetItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(updatedStrats));
    }
  } catch (e) {
    console.error('Erro ao sincronizar estratégias com preset atualizado:', e);
  }
}

// --- GESTÃO DE ESTRATÉGIAS CUSTOMIZADAS ---

export async function getCustomStrategies(): Promise<CustomStrategy[]> {
  try {
    const jsonValue = await safeGetItem(CUSTOM_STRATEGIES_KEY);
    return jsonValue ? (JSON.parse(jsonValue) as CustomStrategy[]) : [];
  } catch (e) {
    console.error('Erro ao ler estratégias customizadas:', e);
    return [];
  }
}

export async function saveCustomStrategy(strat: CustomStrategy): Promise<CustomStrategy[]> {
  try {
    const current = await getCustomStrategies();
    const index = current.findIndex((s) => s.id === strat.id);

    let updatedList: CustomStrategy[];
    const toSave: CustomStrategy = {
      ...strat,
      updatedAt: Date.now(),
    };

    if (index >= 0) {
      updatedList = [...current];
      updatedList[index] = toSave;
    } else {
      updatedList = [toSave, ...current];
    }

    await safeSetItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(updatedList));
    return updatedList;
  } catch (e) {
    console.error('Erro ao salvar estratégia customizada:', e);
    return [];
  }
}

export async function deleteCustomStrategy(id: string): Promise<CustomStrategy[]> {
  try {
    const current = await getCustomStrategies();
    const newList = current.filter((s) => s.id !== id);
    await safeSetItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(newList));
    return newList;
  } catch (e) {
    console.error('Erro ao remover estratégia customizada:', e);
    return [];
  }
}

// --- IMPORTAÇÃO E EXPORTAÇÃO JSON ---

export function exportStrategyToJSON(strat: CustomStrategy): string {
  const exportPayload = {
    version: '1.0',
    type: 'sumo_strategy',
    strategy: {
      title: strat.title,
      subtitle: strat.subtitle,
      badge: strat.badge || 'Customizada',
      iconName: strat.iconName || 'construct-outline',
      description: strat.description,
      steps: (strat.steps || []).map((st, index) => ({
        step: index + 1,
        action: st.action,
        motorEsq: st.motorEsq,
        motorDir: st.motorDir,
        timeMs: st.timeMs,
      })),
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}

export async function importStrategyFromJSON(jsonString: string): Promise<CustomStrategy> {
  try {
    const parsed = JSON.parse(jsonString);
    const target = parsed.strategy || parsed;

    if (!target || typeof target !== 'object') {
      throw new Error('Formato JSON inválido. Estrutura não reconhecida.');
    }

    if (!target.title || typeof target.title !== 'string') {
      throw new Error('Estratégia inválida: o campo "title" é obrigatório.');
    }

    if (!Array.isArray(target.steps) || target.steps.length === 0) {
      throw new Error('Estratégia inválida: deve conter pelo menos 1 etapa ("steps").');
    }

    const steps: StrategyStep[] = target.steps.map((st: any, idx: number) => {
      if (typeof st.motorEsq !== 'number' || typeof st.motorDir !== 'number') {
        throw new Error(`Etapa ${idx + 1} com motores inválidos.`);
      }
      return {
        id: `imported_step_${Date.now()}_${idx}`,
        stepNumber: idx + 1,
        action: st.action || `Etapa ${idx + 1}`,
        motorEsq: Math.max(-1599, Math.min(1599, Math.round(st.motorEsq))),
        motorDir: Math.max(-1599, Math.min(1599, Math.round(st.motorDir))),
        timeMs: Math.max(0, Math.round(st.timeMs || 0)),
      };
    });

    const newId = `CUST_${Date.now()}`;
    const importedStrat: CustomStrategy = {
      id: newId,
      title: target.title,
      subtitle: target.subtitle || 'Estratégia Importada',
      badge: target.badge || 'Importada',
      iconName: target.iconName || 'download-outline',
      description: target.description || 'Estratégia importada via arquivo/JSON.',
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveCustomStrategy(importedStrat);
    return importedStrat;
  } catch (err: any) {
    throw new Error(err.message || 'Falha ao importar JSON de estratégia.');
  }
}
