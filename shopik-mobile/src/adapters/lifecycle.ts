import { App } from '@capacitor/app';
import type { LifecycleAdapter, LifecycleEvent, Unsubscribe } from '../../../shopik-app/lib/domain/platform.ts';

// Subscribe before reading cold-start URLs so an already-running callback is not lost.
export function createAndroidLifecycle(source: Pick<typeof App, 'addListener' | 'getLaunchUrl'> = App): LifecycleAdapter {
  return {
    async subscribe(listener) {
      const cleanup: Unsubscribe[] = [];
      let active = true;
      const startupUrls = new Set<string>();
      let startup = true;
      // Suppress duplicate warm/cold delivery during startup without retaining secrets afterward.
      const publish = (event: LifecycleEvent) => {
        if (!active) return;
        if (startup && event.kind === 'open-url') {
          if (startupUrls.has(event.url)) return;
          startupUrls.add(event.url);
        }
        listener(event);
      };
      // Every acquired handle is removed if a later native registration fails.
      const remove = () => {
        if (!active) return;
        active = false;
        for (const stop of cleanup) stop();
        startupUrls.clear();
      };
      try {
        const urls = await source.addListener('appUrlOpen', ({ url }) => publish({ kind: 'open-url', url }));
        cleanup.push(() => { void urls.remove().catch(() => undefined); });
        const states = await source.addListener('appStateChange', ({ isActive }) => publish({ kind: isActive ? 'resume' : 'pause' }));
        cleanup.push(() => { void states.remove().catch(() => undefined); });
        const launch = await source.getLaunchUrl();
        if (launch) publish({ kind: 'open-url', url: launch.url });
        startup = false;
        startupUrls.clear();
        return remove;
      } catch (error) { remove(); throw error; }
    },
  };
}
