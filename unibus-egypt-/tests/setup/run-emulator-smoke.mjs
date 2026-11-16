import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function runAndStream(cmd, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

async function waitForHttp(url, label, timeoutMs = 45000, childProc = null) {
  let exitError = null;
  if (childProc) {
    childProc.once('exit', (code, signal) => {
      exitError = new Error(`${label} exited prematurely (code=${code}, signal=${signal})`);
    });
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (exitError) throw exitError;
    try {
      const res = await fetch(url);
      if (res) return;
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function main() {
  console.log('=== [Phase 2] Starting Firebase Emulators (Auth:9099, Firestore:8080) ===');
  const emu = spawn(
    'firebase',
    [
      'emulators:start',
      '--config',
      'firebase.test.json',
      '--project',
      'demo-unibus-test',
      '--only',
      'auth,firestore',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }
  );

  emu.stdout.on('data', (chunk) => process.stdout.write(`[EMU] ${chunk}`));
  emu.stderr.on('data', (chunk) => process.stderr.write(`[EMU-ERR] ${chunk}`));

  let viteProc = null;

  const cleanup = () => {
    if (viteProc && viteProc.pid) {
      try {
        process.kill(-viteProc.pid, 'SIGTERM');
      } catch {
        // ignore
      }
    }
    if (emu && emu.pid) {
      try {
        process.kill(-emu.pid, 'SIGTERM');
      } catch {
        // ignore
      }
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(1);
  });

  try {
    await waitForHttp('http://127.0.0.1:8080/', 'Firestore Emulator', 60000, emu);
    await waitForHttp('http://127.0.0.1:9099/', 'Auth Emulator', 60000, emu);
    console.log('=== [Phase 2] Emulators Ready! Seeding synthetic multi-tenant data... ===');

    await runAndStream('npx', ['tsx', 'tests/setup/seedEmulator.ts'], 'seedEmulator');

    console.log('=== [Phase 2] Running Vitest Unit + Firestore Rules Readiness Tests... ===');
    await runAndStream(
      'npx',
      ['vitest', 'run', 'tests/unit/readiness.smoke.test.ts', 'tests/rules/emulator.readiness.test.ts'],
      'vitest readiness'
    );

    console.log('=== [Phase 2] Starting Isolated Vite Test Server (http://127.0.0.1:3100)... ===');
    viteProc = spawn(
      'npx',
      ['vite', '--config', 'vite.test.config.ts', '--port', '3100', '--host', '127.0.0.1'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      }
    );
    viteProc.stdout.on('data', (chunk) => process.stdout.write(`[VITE-TEST] ${chunk}`));
    viteProc.stderr.on('data', (chunk) => process.stderr.write(`[VITE-TEST-ERR] ${chunk}`));

    await waitForHttp('http://127.0.0.1:3100/', 'Vite Test Server', 45000, viteProc);

    console.log('=== [Phase 2] Running Playwright Chromium Readiness Test... ===');
    await runAndStream(
      'npx',
      ['playwright', 'test', 'tests/e2e/readiness.spec.ts'],
      'playwright readiness'
    );

    console.log('=== [Phase 2] ALL READINESS & ISOLATION CHECKS PASSED ===');
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('[Phase 2 Verification Failed]', err);
  process.exit(1);
});
