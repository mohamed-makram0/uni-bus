import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import {
  AUTH_EMULATOR_URL,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  TEST_API_KEY,
  TEST_AUTH_DOMAIN,
  TEST_PROJECT_ID,
  assertEmulatorIsolation,
} from './testConfig';

// Strict pre-init guard: abort immediately if projectId ever resembles production
assertEmulatorIsolation(TEST_PROJECT_ID);

const emulatorConfig = {
  apiKey: TEST_API_KEY,
  authDomain: TEST_AUTH_DOMAIN,
  projectId: TEST_PROJECT_ID,
  appId: '1:000000000000:web:emulator-test',
};

const app = initializeApp(emulatorConfig, 'unibus-emulator-app');

// Connect strictly to local Firestore Emulator (default database on demo-unibus-test)
export const db = getFirestore(app);
connectFirestoreEmulator(db, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);

// Connect strictly to local Auth Emulator
export const auth = getAuth(app);
connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });

if (typeof window !== 'undefined') {
  (window as any).__UNIBUS_TEST_ENV__ = {
    isEmulator: true,
    projectId: TEST_PROJECT_ID,
    firestoreEmulator: `${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`,
    authEmulator: AUTH_EMULATOR_URL,
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error (Emulator): ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'universities', '_ping'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    return true;
  }
}

export default app;
