import { expect, test } from '@playwright/test';

const BLOCKED_PRODUCTION_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'norse-crossbar-901dl',
];

test('Phase 2 Readiness: App loads cleanly, connects strictly to local Emulators, and makes zero production Firebase requests', async ({
  page,
}) => {
  const blockedCloudRequests: string[] = [];
  const emulatorRequests: string[] = [];

  await page.route('**/*', (route) => {
    const url = route.request().url();

    if (BLOCKED_PRODUCTION_HOSTS.some((host) => url.includes(host))) {
      blockedCloudRequests.push(url);
      return route.abort('blockedbyclient');
    }

    if (url.includes('127.0.0.1:8080') || url.includes('127.0.0.1:9099')) {
      emulatorRequests.push(url);
    }

    return route.continue();
  });

  await page.goto('/');

  // 1. Verify runtime test env marker inside browser window
  const testEnvMarker = await page.evaluate(() => (window as any).__UNIBUS_TEST_ENV__);
  expect(testEnvMarker).toEqual({
    isEmulator: true,
    projectId: 'demo-unibus-test',
    firestoreEmulator: '127.0.0.1:8080',
    authEmulator: 'http://127.0.0.1:9099',
  });

  // 2. Verify Login Screen renders and fetches the 2 isolated test companies from Emulator
  await expect(page.getByRole('button', { name: /إنشاء حساب جديد/i })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: /إنشاء حساب جديد/i }).click();

  await expect(page.locator('option', { hasText: 'شركة ألفا للنقل الاختباري' })).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('option', { hasText: 'شركة بيتا للنقل الاختباري' })).toHaveCount(1);

  // 3. Prove ZERO cloud/production Firebase traffic & positive local emulator traffic
  expect(blockedCloudRequests).toEqual([]);
  expect(emulatorRequests.length).toBeGreaterThan(0);
});
