export const MAX_PWM = 1599;
export const SEND_INTERVAL_MS = 60;
export type Motors = { left: number; right: number };
export type ManualState = Motors & { enabled: boolean; busy: boolean; error: string | null };

export function joystickMotors(x: number, y: number, radius: number): Motors {
  const distance = Math.hypot(x, y);
  if (distance < radius * 0.12) return { left: 0, right: 0 };
  const scale = Math.max(radius, distance);
  const forward = -y / scale;
  const turn = x / scale;
  const peak = Math.max(1, Math.abs(forward + turn), Math.abs(forward - turn));
  return {
    left: Math.round(((forward + turn) / peak) * MAX_PWM),
    right: Math.round(((forward - turn) / peak) * MAX_PWM),
  };
}

// Serialize writes, discard obsolete movements, and give releases/stops priority
// over movement samples that have not reached the Bluetooth transport yet.
export class ManualController {
  private state: ManualState = { left: 0, right: 0, enabled: false, busy: false, error: null };
  private tail: Promise<void> = Promise.resolve();
  private epoch = 0;
  private speed = 0.5;
  private pending: Motors | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSample = 0;
  private sampleRevision = 0;

  constructor(
    private write: (command: string) => Promise<unknown>,
    private changed: (state: ManualState) => void
  ) {}

  private update(patch: Partial<ManualState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }

  private clearPending() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  private queue(task: () => Promise<unknown>) {
    this.tail = this.tail
      .then(task)
      .then(() => {})
      .catch(async (error: unknown) => {
        this.epoch++;
        this.clearPending();
        this.update({
          enabled: false,
          busy: false,
          left: 0,
          right: 0,
          error: error instanceof Error ? error.message : 'Falha na comunicação. Reconecte o robô.',
        });
        // A transport error can happen after the robot received a previous movement.
        // Attempt a stop, but do not claim the hardware stopped if the link is gone.
        try {
          await this.write('M,0,0');
          await this.write('MANUAL_OFF');
        } catch {
          /* Link unavailable. */
        }
      });
    return this.tail;
  }

  enable() {
    if (this.state.enabled || this.state.busy) return this.tail;
    const epoch = ++this.epoch;
    this.update({ busy: true, error: null });
    return this.queue(async () => {
      if (epoch !== this.epoch) return;
      await this.write('MANUAL_ON');
      if (epoch === this.epoch) this.update({ enabled: true, busy: false });
    });
  }

  move(motors: Motors) {
    if (!this.state.enabled) return;
    const left = Math.round(Math.max(-MAX_PWM, Math.min(MAX_PWM, motors.left)) * this.speed);
    const right = Math.round(Math.max(-MAX_PWM, Math.min(MAX_PWM, motors.right)) * this.speed);
    if (!left && !right) {
      this.stop();
      return;
    }
    if (left === this.state.left && right === this.state.right) return;
    this.sampleRevision++;
    this.update({ left, right });
    this.pending = { left, right };
    if (this.timer) return;
    const flush = () => {
      this.timer = null;
      const pending = this.pending;
      this.pending = null;
      if (!pending) return;
      const epoch = this.epoch;
      const revision = this.sampleRevision;
      this.lastSample = Date.now();
      void this.queue(async () => {
        if (epoch === this.epoch && revision === this.sampleRevision && this.state.enabled)
          await this.write(`M,${pending.left},${pending.right}`);
      });
    };
    const delay = Math.max(0, SEND_INTERVAL_MS - (Date.now() - this.lastSample));
    if (delay) this.timer = setTimeout(flush, delay);
    else flush();
  }

  stop(): Promise<void> {
    if (this.state.busy) return this.disable();
    this.epoch++;
    this.clearPending();
    const wasMoving = Boolean(this.state.left || this.state.right);
    this.update({ left: 0, right: 0 });
    if (!this.state.enabled && !wasMoving) return this.tail;
    return this.queue(() => this.write('M,0,0'));
  }

  setSpeed(speed: number) {
    this.stop();
    this.speed = Math.max(0.1, Math.min(1, speed));
  }

  disable() {
    const wasActive = this.state.enabled || this.state.busy;
    this.epoch++;
    this.clearPending();
    this.update({ enabled: false, busy: false, left: 0, right: 0 });
    if (!wasActive) return this.tail;
    return this.queue(async () => {
      await this.write('M,0,0');
      await this.write('MANUAL_OFF');
    });
  }

  settled() {
    return this.tail;
  }
}
