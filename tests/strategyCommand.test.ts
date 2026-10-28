import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { strategyCommand } from '../src/control/strategyCommand';

describe('custom strategy transport limits', () => {
  const step = { motorEsq: 1599, motorDir: -1599, timeMs: 250 };
  it('encodes the calibrated sequence in execution order', () => {
    assert.equal(
      strategyCommand([step, { motorEsq: 0, motorDir: 0, timeMs: 400 }]),
      'RUN_STRAT,2;1599,-1599,250;0,0,400'
    );
  });
  it('rejects empty strategies and steps beyond the firmware capacity', () => {
    assert.throws(() => strategyCommand([]), /1 a 10/);
    assert.throws(() => strategyCommand(Array(11).fill(step)), /1 a 10/);
  });
  it('rejects invalid motor values and duration instead of sending an unsafe command', () => {
    for (const invalid of [
      { ...step, motorEsq: 1600 },
      { ...step, motorDir: NaN },
      { ...step, motorDir: 1.5 },
      { ...step, timeMs: -1 },
      { ...step, timeMs: 65536 },
    ]) {
      assert.throws(() => strategyCommand([invalid]));
    }
  });
  it('prevents truncation when a sequence exceeds the serial command buffer', () => {
    assert.throws(
      () => strategyCommand(Array(10).fill({ ...step, timeMs: 65535 })),
      /longa demais/
    );
    assert.ok(
      strategyCommand(Array(10).fill({ motorEsq: 0, motorDir: 0, timeMs: 100 })).length <= 127
    );
  });
});
