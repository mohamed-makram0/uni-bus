import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_PROJECT_ID,
  TEST_PROJECT_ID,
  assertEmulatorIsolation,
} from '../setup/testConfig';

describe('Phase 2 Readiness — Unit Runner & Isolation Guard', () => {
  it('accepts isolated demo-* projectId', () => {
    expect(() => assertEmulatorIsolation(TEST_PROJECT_ID)).not.toThrow();
  });

  it('aborts immediately if production projectId is passed', () => {
    expect(() => assertEmulatorIsolation(PRODUCTION_PROJECT_ID)).toThrow(
      /SECURITY ABORT/
    );
  });

  it('aborts immediately on any non-demo projectId', () => {
    expect(() => assertEmulatorIsolation('custom-live-project')).toThrow(
      /SECURITY ABORT/
    );
  });
});
