import { expect, test } from '@playwright/test';
import { seedIsolatedEmulator } from '../setup/seedEmulator';
import {
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  TEST_PROJECT_ID,
} from '../setup/testConfig';

const BLOCKED_PRODUCTION_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'norse-crossbar-901dl',
];

async function attachProductionNetworkGuard(page: import('@playwright/test').Page) {
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (BLOCKED_PRODUCTION_HOSTS.some((h) => url.includes(h))) {
      blocked.push(url);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  return blocked;
}

async function readEmulatorDoc(collection: string, docId: string): Promise<any | null> {
  const url = `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed reading emulator doc ${collection}/${docId}: ${res.status}`);
  return res.json();
}

test.describe('Stage B — يوم كامل كسائق (Full Day as a Driver)', () => {
  test.beforeEach(async () => {
    await seedIsolatedEmulator();
  });

  test('D1: سائق الصباح (دخول بالهاتف، استعادة الجلسة، أوفلاين ريلود، شطب ركاب، تشيك محطات، مزامنة أوفلاين، بلاغ تأخير)', async ({ page }) => {
    const blocked = await attachProductionNetworkGuard(page);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let simulateFirestoreDown = false;
    page.on('console', (m) => {
      if (m.type() === 'error') {
        const txt = m.text();
        if (
          simulateFirestoreDown &&
          (txt.includes('net::ERR_FAILED') ||
            txt.includes('Could not reach Cloud Firestore backend') ||
            txt.includes('offline mode'))
        ) {
          return;
        }
        consoleErrors.push(txt);
      }
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/');

    // 1. Login once as Driver 1 (Phone + Name)
    await page.getByPlaceholder('01012345678').fill('01099000111');
    await page.getByPlaceholder('اكتب اسمك كما سجلته').fill('سائق ألفا الأول');
    await page.getByRole('button', { name: /دخول وحفظ الجلسة/i }).click();

    await expect(page.getByText('سائق ألفا الأول (اختبار)', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/أ ب ج 101 · خط المعادي - الاختبار \(07:00\)/)).toBeVisible();
    await expect(page.getByText('المحطة الحالية: 1 من 2')).toBeVisible();

    // 2. Normal reload -> Driver session must restore
    await page.reload();
    await expect(page.getByText('سائق ألفا الأول (اختبار)', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('المحطة الحالية: 1 من 2')).toBeVisible();

    // 2b. Simulated Firestore network outage on reload -> must preserve Driver role (not downgrade to pending student!)
    simulateFirestoreDown = true;
    await page.route(`http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/**`, (route) => {
      if (simulateFirestoreDown) return route.abort('failed');
      return route.continue();
    });
    await page.reload();
    await expect(page.getByText('سائق ألفا الأول (اختبار)', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/حسابك قيد المراجعة/)).toHaveCount(0);
    await page.unroute(`http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/**`);
    simulateFirestoreDown = false;
    await page.reload();
    await expect(page.getByText('سائق ألفا الأول (اختبار)', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // 3. Cross-station search check-in for student
    await page
      .getByPlaceholder('اكتب اسم الطالب أو هاتفه للتحضير الفوري من أي محطة...')
      .fill('طالب ألفا الأول');
    await page.getByRole('button', { name: /صعد هنا الآن/ }).click();

    await expect(page.getByText('مشطوب (صعد)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/تم تأكيد صعود الطالب/)).toBeVisible({ timeout: 10000 });
    const tripAfterBoard = await readEmulatorDoc('trips', 'trip-alpha-morning-1');
    expect(tripAfterBoard.fields.manifest.arrayValue.values[0].mapValue.fields.boardedStatus.stringValue).toBe('boarded');

    // 4. 1-click stop check-in for Stop 1 -> must persist in Firestore across reload!
    await page.getByRole('button', { name: /تشيك بنقرة واحدة \(تأكيد المرور بالمحطة\)/ }).click();
    await expect(page.getByText(/✓ تم تشيك وتأكيد المرور بمحطة/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('✓ تم إنجاز وتشيك المحطة بنجاح').first()).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText('✓ تم إنجاز وتشيك المحطة بنجاح').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('المحطة الحالية: 2 من 2')).toBeVisible();

    // 5. Offline queue test: switch to Offline, check Stop 2, then come back Online -> verify sync + Firestore!
    await page.getByRole('button', { name: /متصل ومحدث/ }).click();
    await expect(page.getByRole('button', { name: /^أوفلاين$/ })).toBeVisible();

    await page.getByRole('button', { name: /تشيك بنقرة واحدة \(تأكيد المرور بالمحطة\)/ }).click();
    await expect(page.getByText(/أوفلاين · طابور الانتظار: 1/)).toBeVisible({ timeout: 10000 });

    // Come back online -> queue flushes automatically
    await page.getByRole('button', { name: /^أوفلاين$/ }).click();
    await expect(page.getByText(/تمت مزامنة 1 إجراء أوفلاين بنجاح/)).toBeVisible({ timeout: 10000 });

    await page.reload();
    const tripAfterStop2 = await readEmulatorDoc('trips', 'trip-alpha-morning-1');
    expect(tripAfterStop2.fields.status.stringValue).toBe('completed');

    // 6. Report emergency delay incident -> must persist in incidents AND trips in Firestore!
    await page.getByRole('button', { name: /الإبلاغ عن طارئ \/ عطل فني \/ زحام مروري للغرفة/ }).click();
    await page.getByPlaceholder('مثال: حادث مروري أو ثقب بالإطار...').fill('ازدحام مروري شديد على الكوبري');
    await page.getByRole('button', { name: 'إرسال البلاغ فوراً' }).click();
    await expect(page.getByText('تم إرسال البلاغ التشغيلي وحفظه في السحابة بنجاح.')).toBeVisible({ timeout: 10000 });

    const tripAfterIncident = await readEmulatorDoc('trips', 'trip-alpha-morning-1');
    expect(tripAfterIncident.fields.status.stringValue).toBe('delayed');
    expect(tripAfterIncident.fields.delayReason.stringValue).toBe('ازدحام مروري شديد على الكوبري');

    expect(blocked).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors, `Console errors observed: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('D2: سائق العودة بالجامعة (شاشة انتظار العودة، صعود ركاب، علامة اختلاف الجامعة الحمراء والتسليم لمكتب آخر، تأكيد الانطلاق روّحت)', async ({ page }) => {
    const blocked = await attachProductionNetworkGuard(page);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // Pre-add a cross-university student (univ-alpha-2) to RET-A1 (which belongs to univ-alpha-1) to test the Red Alert banner
    await fetch(
      `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/trips/trip-alpha-return-waiting-1?updateMask.fieldPaths=manifest`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            manifest: {
              arrayValue: {
                values: [
                  {
                    mapValue: {
                      fields: {
                        studentId: { stringValue: 'phone_01099000122' },
                        studentName: { stringValue: 'طالب ألفا الثاني (اختبار)' },
                        phone: { stringValue: '01099000122' },
                        stationId: { stringValue: 'st-alpha-2' },
                        stationNameAr: { stringValue: 'الزهراء (اختبار)' },
                        rsvpStatus: { stringValue: 'confirmed' },
                        boardedStatus: { stringValue: 'waiting' },
                        studentUniversityId: { stringValue: 'univ-alpha-2' },
                        studentUniversityNameAr: { stringValue: 'جامعة الاختبار الثانية' },
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      }
    );

    await page.goto('/');

    // 1. Login as Driver 2 (Return waiting bus RET-A1)
    await page.getByPlaceholder('01012345678').fill('01099000112');
    await page.getByPlaceholder('اكتب اسمك كما سجلته').fill('سائق ألفا الثاني');
    await page.getByRole('button', { name: /دخول وحفظ الجلسة/i }).click();

    await expect(page.getByText('سائق ألفا الثاني (اختبار)', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('تحضير ركاب سيارة الانتظار (أثناء العودة)')).toBeVisible();

    // 2. Red Alert banner must appear for univ-alpha-2 student; click handoff to external office
    await expect(
      page.getByText(/علامة حمراء: يوجد 1 طالب في هذه الحافلة لا يتبعون نفس الجامعة/)
    ).toBeVisible();
    await page.getByRole('button', { name: /تم التسليم لمكتب\/سيارة أخرى/ }).click();
    await expect(page.getByText(/علامة حمراء:/)).toHaveCount(0, { timeout: 10000 });

    // 3. Board waiting student (طالب ألفا الأول) in 1 tap
    const studentCardBtn = page
      .locator('div', { hasText: 'طالب ألفا الأول (اختبار)' })
      .getByRole('button', { name: /ركب الانتظار \+/ })
      .first();
    await studentCardBtn.click();
    await expect(page.getByRole('button', { name: /راكب معك \(إلغاء\)/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('1 / 28')).toBeVisible();

    // Reload to ensure both handoff and waiting boarding persisted cleanly
    await page.reload();
    await expect(page.getByText('1 / 28')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/علامة حمراء:/)).toHaveCount(0);

    // 4. Confirm return bus departure ("انطلقت الحافلة من الجامعة الآن (روّحت)")
    await page.getByRole('button', { name: 'انطلقت الحافلة من الجامعة الآن (روّحت)' }).click();
    await expect(page.getByText('انطلقت الحافلة من الجامعة (روّحت)')).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText('انطلقت الحافلة من الجامعة (روّحت)')).toBeVisible({ timeout: 10000 });
    const retAfter = await readEmulatorDoc('trips', 'trip-alpha-return-waiting-1');
    expect(retAfter.fields.status.stringValue).toBe('completed');

    expect(blocked).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors, `Console errors observed: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
