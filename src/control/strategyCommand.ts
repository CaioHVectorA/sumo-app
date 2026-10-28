// The V2 firmware's command buffer has 128 bytes, including its string terminator.
const MAX_COMMAND_LENGTH = 127;
type Step = { motorEsq: number; motorDir: number; timeMs: number };

export function strategyCommand(steps: Step[]): string {
  if (!steps.length || steps.length > 10) throw new Error('Use de 1 a 10 etapas por estratégia.');
  steps.forEach((step, index) => {
    if (
      !Number.isInteger(step.motorEsq) ||
      !Number.isInteger(step.motorDir) ||
      Math.abs(step.motorEsq) > 1599 ||
      Math.abs(step.motorDir) > 1599
    ) {
      throw new Error(`Etapa ${index + 1}: a potência deve ficar entre −1599 e 1599.`);
    }
    if (!Number.isInteger(step.timeMs) || step.timeMs < 0 || step.timeMs > 65535) {
      throw new Error(`Etapa ${index + 1}: a duração deve ficar entre 0 e 65535 ms.`);
    }
  });
  const command = `RUN_STRAT,${steps.length};${steps.map((step) => `${step.motorEsq},${step.motorDir},${step.timeMs}`).join(';')}`;
  if (command.length > MAX_COMMAND_LENGTH)
    throw new Error(
      'Esta sequência é longa demais para enviar ao robô. Reduza a quantidade de etapas.'
    );
  return command;
}
