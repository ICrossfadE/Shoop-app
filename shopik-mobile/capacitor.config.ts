import type { CapacitorConfig } from '@capacitor/cli';

// A separate prototype ID protects the future production app and its private data.
const config: CapacitorConfig = {
  appId: 'ua.shopik.prototype',
  appName: 'Shopik Prototype',
  webDir: 'dist',
  server: { hostname: 'localhost', androidScheme: 'https', cleartext: false },
  // Native dialog/popover and strict IndexedDB durability require a modern WebView.
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false, minWebViewVersion: 114 },
};

export default config;
