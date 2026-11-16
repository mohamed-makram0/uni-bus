import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const firebaseEmulatorTarget = path.resolve(import.meta.dirname, 'tests/setup/firebase.emulator.ts');
const originalFirebaseSource = path.resolve(import.meta.dirname, 'src/services/firebase.ts');

function redirectFirebaseToEmulatorPlugin(): Plugin {
  return {
    name: 'unibus-redirect-firebase-to-emulator',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source === 'virtual:pwa-register') {
        return '\0virtual:pwa-register-test-stub';
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved && path.resolve(resolved.id) === originalFirebaseSource) {
        return firebaseEmulatorTarget;
      }
      if (
        source.endsWith('/services/firebase') ||
        source.endsWith('/services/firebase.ts') ||
        (importer &&
          importer.includes(`${path.sep}src${path.sep}`) &&
          (source === './firebase' || source === '../services/firebase'))
      ) {
        return firebaseEmulatorTarget;
      }
      return null;
    },
    load(id) {
      if (id === '\0virtual:pwa-register-test-stub') {
        return 'export function registerSW() { return async () => {}; }';
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [redirectFirebaseToEmulatorPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3100,
    strictPort: true,
    hmr: false,
  },
});
