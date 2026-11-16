import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidLifecycle } from '../src/adapters/lifecycle.ts';
import type { LifecycleEvent } from '../../shopik-app/lib/domain/platform.ts';

type NativeSource = Parameters<typeof createAndroidLifecycle>[0];

// Native callbacks are captured explicitly; tests never claim to run an Android device.
test('cold and warm startup URL delivery is deduplicated, resumes propagate and cleanup stops delivery', async () => {
  let onUrl: ((event: { url: string }) => void) | undefined;
  let onState: ((event: { isActive: boolean }) => void) | undefined;
  let removed = 0;
  const source = {
    async addListener(name: string, callback: never) {
      if (name === 'appUrlOpen') onUrl = callback;
      else onState = callback;
      return { remove: async () => { removed++; } };
    },
    async getLaunchUrl() {
      onUrl?.({ url: 'https://localhost/settings' });
      return { url: 'https://localhost/settings' };
    },
  } as unknown as NativeSource;
  const events: LifecycleEvent[] = [];
  const stop = await createAndroidLifecycle(source).subscribe(event => events.push(event));
  assert.deepEqual(events, [{ kind: 'open-url', url: 'https://localhost/settings' }]);
  onState?.({ isActive: true }); onState?.({ isActive: false });
  assert.deepEqual(events.slice(1), [{ kind: 'resume' }, { kind: 'pause' }]);
  stop(); stop();
  assert.equal(removed, 2);
  onUrl?.({ url: 'https://localhost/expenses' }); onState?.({ isActive: true });
  assert.equal(events.length, 3);
});

// A later native registration failure must release handles acquired earlier.
test('failed native startup releases existing listeners and propagates the error', async () => {
  let removed = 0;
  let calls = 0;
  const source = {
    async addListener() {
      if (++calls === 2) throw new Error('Native registration failed');
      return { remove: async () => { removed++; } };
    },
    async getLaunchUrl() { return undefined; },
  } as unknown as NativeSource;
  await assert.rejects(createAndroidLifecycle(source).subscribe(() => {}), /Native registration failed/);
  assert.equal(removed, 1);
});
