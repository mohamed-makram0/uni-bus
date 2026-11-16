export const PRODUCTION_PROJECT_ID = 'norse-crossbar-901dl';
export const PRODUCTION_DB_ID = 'ai-studio-unibusegypt-5767c610-4c07-40f1-8a23-03b5e1ef495e';

export const TEST_PROJECT_ID = 'demo-unibus-test';
export const TEST_API_KEY = 'demo-unibus-test-api-key';
export const TEST_AUTH_DOMAIN = 'demo-unibus-test.firebaseapp.com';

export const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
export const FIRESTORE_EMULATOR_PORT = 8080;
export const AUTH_EMULATOR_HOST = '127.0.0.1';
export const AUTH_EMULATOR_PORT = 9099;
export const AUTH_EMULATOR_URL = `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`;

export const TEST_APP_HOST = '127.0.0.1';
export const TEST_APP_PORT = 3100;
export const TEST_APP_URL = `http://${TEST_APP_HOST}:${TEST_APP_PORT}`;

export const TEST_COMPANIES = {
  ALPHA: 'comp-test-alpha',
  BETA: 'comp-test-beta',
} as const;

export function assertEmulatorIsolation(projectId: string): void {
  if (!projectId || projectId === PRODUCTION_PROJECT_ID) {
    throw new Error(
      `SECURITY ABORT: Refusing to run tests against production Firebase project (${projectId}).`
    );
  }
  if (!projectId.startsWith('demo-')) {
    throw new Error(
      `SECURITY ABORT: Test projectId (${projectId}) must use an isolated 'demo-*' emulator prefix.`
    );
  }
}
