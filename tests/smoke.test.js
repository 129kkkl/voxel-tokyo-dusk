import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hash2 } from '../src/rng.js';

test('rng 确定性：同种子同序列', () => {
  const a = makeRng(20260919), b = makeRng(20260919);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('rng 辅助方法与 hash2 值域', () => {
  const r = makeRng(7);
  assert.equal(r.int(3, 3), 3);
  const x = r.range(1, 2);
  assert.ok(x >= 1 && x < 2);
  for (let i = -5; i < 5; i++) {
    const h = hash2(i, i * 3);
    assert.ok(h >= 0 && h < 1, `hash2 越界: ${h}`);
  }
  assert.equal(hash2(1, 2), hash2(1, 2));
});
