const MAX_PWM = 1599;
const MIN_PWM = -1599;

/**
 * Calculates motor PWM values based on a base PWM and a intuitive curve angle (-90 to +90 degrees).
 * - Angle 0°: Straight forward (motorEsq = basePwm, motorDir = basePwm)
 * - Positive angle (> 0°): Turn Right (motorEsq remains basePwm, motorDir decreases proportionally)
 * - Negative angle (< 0°): Turn Left (motorDir remains basePwm, motorEsq decreases proportionally)
 * - Angle = 90°: Inner motor stops (0)
 * - Angle > 90° or sharp ratio: Inner motor reverses direction for tight pivot curve
 */
export function calculateCurvePWM(basePwm: number, curveAngle: number): { motorEsq: number; motorDir: number } {
  const clampedBase = Math.max(MIN_PWM, Math.min(MAX_PWM, basePwm));
  const clampedAngle = Math.max(-90, Math.min(90, curveAngle));

  if (clampedAngle === 0) {
    return { motorEsq: clampedBase, motorDir: clampedBase };
  }

  // Ratio from 1.0 (straight) down to 0.0 (90 deg) or -0.5 (very sharp)
  // angle / 90 maps 0..90 to 0..1
  const reductionFactor = 1 - (Math.abs(clampedAngle) / 90);
  const innerMotorPwm = Math.round(clampedBase * reductionFactor);

  if (clampedAngle > 0) {
    // Right curve: Left motor is outer (full speed), Right motor is inner (reduced speed)
    return {
      motorEsq: clampedBase,
      motorDir: innerMotorPwm,
    };
  } else {
    // Left curve: Right motor is outer (full speed), Left motor is inner (reduced speed)
    return {
      motorEsq: innerMotorPwm,
      motorDir: clampedBase,
    };
  }
}

export function clampPWM(pwm: number): number {
  return Math.max(MIN_PWM, Math.min(MAX_PWM, Math.round(pwm)));
}
