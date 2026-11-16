import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertSucceeds,
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  TEST_COMPANIES,
  TEST_PROJECT_ID,
  assertEmulatorIsolation,
} from '../setup/testConfig';

describe('Phase 2 Readiness — Firestore Emulator & Rules Isolation', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    assertEmulatorIsolation(TEST_PROJECT_ID);
    const rules = fs.readFileSync(
      path.resolve(process.cwd(), 'firestore.rules'),
      'utf8'
    );
    testEnv = await initializeTestEnvironment({
      projectId: TEST_PROJECT_ID,
      firestore: {
        rules,
        host: FIRESTORE_EMULATOR_HOST,
        port: FIRESTORE_EMULATOR_PORT,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('reads seeded synthetic company data from local Firestore Emulator (not production)', async () => {
    const adminDb = testEnv
      .authenticatedContext('uid-alpha-admin', {
        email: 'alpha.admin@unibus-test.local',
        email_verified: true,
      })
      .firestore();

    const alphaSnap = await assertSucceeds(
      getDoc(doc(adminDb, 'companies', TEST_COMPANIES.ALPHA))
    );
    expect(alphaSnap.exists()).toBe(true);
    expect(alphaSnap.data()?.code).toBe('ALPHA-TEST');

    // Non-destructive cross-company read denial check
    await assertFails(getDoc(doc(adminDb, 'companies', TEST_COMPANIES.BETA)));
  });

  it('can create and verify a disposable synthetic readiness doc inside Emulator only', async () => {
    const superDb = testEnv
      .authenticatedContext('uid-test-super-admin', {
        email: 'superadmin@unibus-test.local',
        email_verified: true,
      })
      .firestore();

    await assertSucceeds(
      setDoc(doc(superDb, 'companyDirectory', 'comp-readiness-probe'), {
        id: 'comp-readiness-probe',
        nameAr: 'شركة فحص جاهزية المحاكي',
        code: 'PROBE',
        status: 'active',
      })
    );

    const probe = await getDoc(
      doc(superDb, 'companyDirectory', 'comp-readiness-probe')
    );
    expect(probe.exists()).toBe(true);
  });
});
