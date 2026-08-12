export type VisualType = 'forward' | 'stop' | 'turn_right' | 'turn_left' | 'rotate_90' | 'rotate_180' | 'curve_right' | 'curve_left' | 'custom';

export type MovementType = 
  | 'FRENTE'
  | 'PARAR'
  | 'VIRA_DIREITA'
  | 'VIRA_ESQUERDA'
  | 'ROT_90'
  | 'ROT_180'
  | 'CURVA'
  | 'CUSTOM';

export type CalibratedMovement = {
  id: string; // e.g. 'FRENTE', 'PARAR', 'VIRA_DIREITA', 'VIRA_ESQUERDA', 'ROT_90', 'ROT_180', 'CURVA', or custom step ID
  type: MovementType;
  name: string;
  description: string;
  motorEsq: number; // -1599 to 1599
  motorDir: number; // -1599 to 1599
  timeMs: number;
  accelStep?: number; // 0 = instantâneo, >0 = incremento de rampa PWM (ex: 50, 100)
  curveAngle?: number; // -90 to +90 degrees (for curves)
  basePwm?: number; // base PWM for curve calculations
  icon: string;
  visualType: VisualType;
  isCustom?: boolean;
};

export type StrategyStep = {
  id: string; // unique ID for step in strategy instance
  movementId: string;
  name: string;
  motorEsq: number;
  motorDir: number;
  timeMs: number;
  accelStep?: number; // 0 = instantâneo, >0 = incremento de rampa PWM (ex: 50, 100)
  curveAngle?: number;
  visualType: VisualType;
  actionDescription?: string;
};

export type CustomStrategy = {
  id: string;
  numId?: number;
  title: string;
  subtitle: string;
  badge: string;
  description: string;
  steps: StrategyStep[];
  createdAt: number;
  updatedAt: number;
  isCustom: boolean;
};
