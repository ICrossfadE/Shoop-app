import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { CredentialStorage } from '../../../shopik-app/lib/domain/platform.ts';

// Refuse the plugin's unencrypted web fallback, including browser previews.
export function createCredentialStorage(
  platform: () => string = () => Capacitor.getPlatform(),
  native: CredentialStorage = SecureStorage,
): CredentialStorage {
  function guard() { if (platform() !== 'android') throw new Error('Android secure storage required'); }
  return {
    async getItem(key) { guard(); return native.getItem('shopik-auth-v1:' + key); },
    async setItem(key, value) { guard(); await native.setItem('shopik-auth-v1:' + key, value); },
    async removeItem(key) { guard(); await native.removeItem('shopik-auth-v1:' + key); },
  };
}
