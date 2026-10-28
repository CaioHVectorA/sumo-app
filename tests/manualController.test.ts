import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  joystickMotors,
  ManualController,
  MAX_PWM,
  SEND_INTERVAL_MS,
  type ManualState,
} from '../src/control/manualController';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function setup(write?: (command: string) => Promise<unknown>) {
  const commands: string[] = [];
  let state: ManualState = { enabled: false, busy: false, left: 0, right: 0, error: null };
  const driver = new ManualController(
    async (command) => {
      commands.push(command);
      return write?.(command);
    },
    (next) => {
      state = next;
    }
  );
  return { driver, commands, state: () => state };
}

describe('joystick', () => {
  it('maps forward, reverse and turns consistently', () => {
    assert.deepEqual(joystickMotors(0, -100, 100), { left: MAX_PWM, right: MAX_PWM });
    assert.deepEqual(joystickMotors(0, 100, 100), { left: -MAX_PWM, right: -MAX_PWM });
    assert.deepEqual(joystickMotors(100, 0, 100), { left: MAX_PWM, right: -MAX_PWM });
    assert.deepEqual(joystickMotors(-100, 0, 100), { left: -MAX_PWM, right: MAX_PWM });
  });
  it('has a dead zone and bounds diagonals even outside the circle', () => {
    assert.deepEqual(joystickMotors(4, 5, 100), { left: 0, right: 0 });
    for (let x = -300; x <= 300; x += 20)
      for (let y = -300; y <= 300; y += 20) {
        const motors = joystickMotors(x, y, 100);
        assert.ok(Math.abs(motors.left) <= MAX_PWM);
        assert.ok(Math.abs(motors.right) <= MAX_PWM);
      }
  });
});

describe('manual command lifecycle', () => {
  it('blocks movement until activation has completed', async () => {
    let confirm!: () => void;
    const pending = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    const { driver, commands, state } = setup((command) =>
      command === 'MANUAL_ON' ? pending : Promise.resolve()
    );
    driver.move({ left: 1000, right: 1000 });
    const activating = driver.enable();
    await wait(0);
    driver.move({ left: 1000, right: 1000 });
    assert.deepEqual(commands, ['MANUAL_ON']);
    assert.equal(state().enabled, false);
    confirm();
    await activating;
    assert.equal(state().enabled, true);
    await driver.disable();
  });
  it('uses the latest speed after activation and clears pending motion on release', async () => {
    const { driver, commands } = setup();
    await driver.enable();
    driver.setSpeed(0.25);
    await driver.settled();
    driver.move({ left: MAX_PWM, right: MAX_PWM });
    await driver.settled();
    assert.equal(commands.at(-1), 'M,400,400');
    driver.move({ left: -MAX_PWM, right: -MAX_PWM });
    await driver.stop();
    await wait(SEND_INTERVAL_MS + 15);
    assert.equal(commands.at(-1), 'M,0,0');
    assert.ok(!commands.includes('M,-400,-400'));
    driver.setSpeed(0.75);
    await driver.settled();
    await wait(SEND_INTERVAL_MS);
    driver.move({ left: MAX_PWM, right: -MAX_PWM });
    await driver.settled();
    assert.equal(commands.at(-1), 'M,1199,-1199');
    await driver.disable();
  });
  it('discards queued movement when emergency stop is pressed', async () => {
    let release!: () => void;
    let block = false;
    const { driver, commands, state } = setup(async (command) => {
      if (command === 'M,500,500' && !block) {
        block = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });
    await driver.enable();
    driver.move({ left: 1000, right: 1000 });
    await wait(0);
    driver.move({ left: 1300, right: -1300 });
    await wait(SEND_INTERVAL_MS + 5);
    const stopping = driver.disable();
    driver.move({ left: MAX_PWM, right: MAX_PWM });
    release();
    await stopping;
    await wait(SEND_INTERVAL_MS + 10);
    assert.deepEqual(commands, ['MANUAL_ON', 'M,500,500', 'M,0,0', 'MANUAL_OFF']);
    assert.equal(state().enabled, false);
  });
  it('cancels an activation in flight without enabling again', async () => {
    let confirm!: () => void;
    const { driver, commands, state } = setup(async (command) => {
      if (command === 'MANUAL_ON')
        await new Promise<void>((resolve) => {
          confirm = resolve;
        });
    });
    void driver.enable();
    await wait(0);
    const stopping = driver.disable();
    confirm();
    await stopping;
    assert.equal(state().enabled, false);
    assert.equal(state().busy, false);
    assert.deepEqual(commands, ['MANUAL_ON', 'M,0,0', 'MANUAL_OFF']);
  });
  it('does not get stuck activating if a release happens while enabling', async () => {
    const { driver, state } = setup();
    void driver.enable();
    await driver.stop();
    assert.equal(state().busy, false);
    assert.equal(state().enabled, false);
  });
  it('deactivates, reports failures and attempts to stop after a write error', async () => {
    const { driver, commands, state } = setup(async (command) => {
      if (command.startsWith('M,500')) throw new Error('Link perdido');
    });
    await driver.enable();
    driver.move({ left: 1000, right: 1000 });
    await driver.settled();
    assert.equal(state().error, 'Link perdido');
    assert.equal(state().enabled, false);
    assert.deepEqual(commands.slice(-2), ['M,0,0', 'MANUAL_OFF']);
  });
});
