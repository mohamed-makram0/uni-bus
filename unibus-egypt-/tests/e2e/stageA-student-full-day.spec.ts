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

test.describe('Stage A — يوم كامل كطالب (Full Day as a Student)', () => {
  test.beforeEach(async () => {
    await seedIsolatedEmulator();
  });

  test('S1: تسجيل طالب جديد بالهاتف والاسم + شاشة انتظار الموافقة + تحديث الحالة + تسجيل خروج', async ({ page }) => {
    const blocked = await attachProductionNetworkGuard(page);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/');

    // 1. Switch to register tab
    await page.getByRole('button', { name: /إنشاء حساب جديد/i }).click();

    // Verify both synthetic companies loaded from emulator
    const companySelect = page.locator('select').first();
    await expect(companySelect.locator('option', { hasText: 'شركة ألفا للنقل الاختباري' })).toHaveCount(1, { timeout: 10000 });
    await companySelect.selectOption('comp-test-alpha');

    // Fill student info
    await page.getByPlaceholder('الاسم الثلاثي').fill('يوسف طالب اختبار');
    await page.getByPlaceholder('01012345678').fill('01099000555');
    await page.getByRole('button', { name: /إرسال طلب الحساب للاعتماد/i }).click();

    // 2. Pending approval gate must appear
    await expect(page.getByText(/حسابك قيد المراجعة|في انتظار موافقة المشرف/i).first()).toBeVisible({ timeout: 10000 });

    // Click refresh button while still pending
    await page.getByRole('button', { name: /تحديث حالة الحساب/i }).click();
    await expect(page.getByText(/حسابك قيد المراجعة|في انتظار موافقة المشرف/i).first()).toBeVisible();

    // 3. Verify persistence in Firestore Emulator (users/phone_01099000555 + phoneDirectory/01099000555)
    const userDoc = await readEmulatorDoc('users', 'phone_01099000555');
    expect(userDoc).not.toBeNull();
    expect(userDoc.fields.status.stringValue).toBe('pending_approval');
    expect(userDoc.fields.role.stringValue).toBe('student');
    expect(userDoc.fields.companyId.stringValue).toBe('comp-test-alpha');

    // Logout cleanly
    await page.getByRole('main').getByRole('button', { name: /تسجيل الخروج/i }).click();
    await expect(page.getByRole('button', { name: /دخول وحفظ الجلسة/i })).toBeVisible();

    expect(blocked).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors, `Console errors observed: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('S2–S6: رحلة اليوم الكامل لطالب نشط (دخول لمرة واحدة، التتبع المباشر، الحجز، خلصت الجامعة، الإلغاء، الحجز بعد العاشرة)', async ({ page }) => {
    const blocked = await attachProductionNetworkGuard(page);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // Set fixed Cairo daytime before 22:00 (11:30 AM Cairo = 09:30 UTC) initially
    const todayCairo = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await page.clock.install({ time: new Date(`${todayCairo}T09:30:00.000Z`) });

    await page.goto('/');

    // 1. Login once with Phone + Name
    await page.getByPlaceholder('01012345678').fill('01099000121');
    await page.getByPlaceholder('اكتب اسمك كما سجلته').fill('طالب ألفا الأول');
    await page.getByRole('button', { name: /دخول وحفظ الجلسة/i }).click();

    await expect(page.getByText(/أهلاً بك، طالب ألفا الأول/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('جامعة الاختبار الأولى').first()).toBeVisible();
    await expect(page.getByText('خط المعادي - الاختبار').first()).toBeVisible();
    await expect(page.getByText('07:00 (مؤكد)')).toBeVisible();

    // 2. Reload page -> must restore saved 1-time session automatically
    await page.reload();
    await expect(page.getByText(/أهلاً بك، طالب ألفا الأول/)).toBeVisible({ timeout: 10000 });

    // 3. Morning tracking tab verification + Real-time stop progression update
    await expect(page.getByText('TRP-A1')).toBeVisible();
    await expect(page.getByText('سائق ألفا الأول (اختبار)').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /اتصال بالسائق \(01099000111\)/ })).toBeVisible();
    await expect(page.getByText('ميدان الحرية (اختبار)').first()).toBeVisible();

    // Simulate real-time driver progression arriving at student's station (index 0: ميدان الحرية) directly in Emulator
    const tripBefore = await readEmulatorDoc('trips', 'trip-alpha-morning-1');
    expect(tripBefore).not.toBeNull();
    const stopsValues = tripBefore.fields.stops.arrayValue.values;
    stopsValues[0].mapValue.fields.status = { stringValue: 'arrived' };
    stopsValues[0].mapValue.fields.actualArrivalTime = { stringValue: '07:05' };
    await fetch(
      `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/trips/trip-alpha-morning-1?updateMask.fieldPaths=status&updateMask.fieldPaths=currentStopIndex&updateMask.fieldPaths=stops&updateMask.fieldPaths=lastConfirmedStopName&updateMask.fieldPaths=lastConfirmedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'in_progress' },
            currentStopIndex: { integerValue: '0' },
            lastConfirmedStopName: { stringValue: 'ميدان الحرية (اختبار)' },
            lastConfirmedTime: { stringValue: '07:05' },
            stops: { arrayValue: { values: stopsValues } },
          },
        }),
      }
    );
    await expect(page.getByText('الحافلة في محطتك الآن!')).toBeVisible({ timeout: 10000 });

    // 4. Switch to Booking tab -> Same-day morning must be blocked
    await page.getByRole('button', { name: /تسجيل موعد الذهاب والعودة/ }).first().click();
    await expect(page.getByText(/لا يمكن تسجيل موعد الذهاب في نفس اليوم/)).toBeVisible();

    // Verify morning 07:00 card is currently booked; cancel it directly from Tab 2 and verify unbooked today-morning card becomes disabled
    await page.getByRole('button', { name: 'إلغاء تسجيل الموعد' }).click();
    await expect(page.getByRole('button', { name: 'غير متاح التسجيل للذهاب اليوم' })).toBeDisabled({ timeout: 10000 });

    // 5. Switch to Return direction on Today & book 15:00 return waiting trip (RET-A1)
    await page.getByRole('button', { name: /رحلات العودة \(ظهراً ومساءً من الجامعة\)/ }).click();
    await expect(page.getByText('15:00')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'تأكيد تسجيل الموعد' }).first().click();

    await expect(page.getByText('15:00 (مؤكد)')).toBeVisible({ timeout: 10000 });

    // Reload to verify return RSVP ACTUALLY persisted in Firestore Emulator!
    await page.reload();
    await expect(page.getByText('15:00 (مؤكد)')).toBeVisible({ timeout: 10000 });

    // 6. Click "1. خلصت الجامعة الآن" -> verify UI + Firestore persistence across reload!
    await page.getByRole('button', { name: /خلصت الجامعة الآن/ }).click();
    await expect(page.getByRole('button', { name: /خلصت الجامعة \(إلغاء؟\)/ })).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByRole('button', { name: /خلصت الجامعة \(إلغاء؟\)/ })).toBeVisible({ timeout: 10000 });

    // 7. Track return trip & cancel return booking -> verify cancellation persists across reload!
    await expect(page.getByText('RET-A1')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /إلغاء الحجز \/ الاعتذار عن هذه الرحلة/ }).click();
    await expect(page.getByText('رحلة العودة:').locator('..').getByText('لم تحدد بعد')).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText('رحلة العودة:').locator('..').getByText('لم تحدد بعد')).toBeVisible({ timeout: 10000 });

    // 8. Tomorrow booking BEFORE 10 PM cutoff (using template 07:00)
    await page.getByRole('button', { name: /3\. حجز الغد \/ العودة/ }).click();
    await expect(page.getByText(/التسجيل لرحلات الغد مفتوح حتى الساعة 10:00 مساءً/)).toBeVisible();
    await page.getByRole('button', { name: 'تأكيد تسجيل الموعد' }).first().click();

    await expect(page.getByText(/مسجل ومعلق لمراجعة واعتماد المشرف/).first()).toBeVisible({ timeout: 10000 });

    // 9. Advance Cairo clock to 22:30 (After 10 PM Cutoff!) & submit Exceptional Request
    await page.clock.setFixedTime(new Date(`${todayCairo}T20:30:00.000Z`)); // 22:30 Africa/Cairo
    await page.reload();
    await page.getByRole('button', { name: /3\. حجز الغد \/ العودة/ }).click();
    await expect(page.getByText(/تم إغلاق التسجيل المباشر لرحلات الغد بعد الساعة 10:00 مساءً/)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /طلب تسجيل استثنائي \(بعد 10 م\)/ }).first().click();
    await expect(page.getByText('طلب تسجيل استثنائي بعد 10:00 م')).toBeVisible();
    await page.getByPlaceholder('مثال: تغيير موعد المحاضرة أو ظرف طارئ...').fill('تغيير موعد السكشن صباحاً');
    await page.getByRole('button', { name: 'إرسال الطلب للمشرف' }).click();
    await expect(page.getByText('طلب تسجيل استثنائي بعد 10:00 م')).toBeHidden({ timeout: 10000 });
    await expect(page.getByText(/تم إرسال طلبك الاستثنائي للمشرف بنجاح/).first()).toBeVisible({ timeout: 10000 });

    // Verify exceptionalRequests persisted in Firestore Emulator
    const reqListRes = await fetch(
      `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/exceptionalRequests`,
      { headers: { Authorization: 'Bearer owner' } }
    );
    const reqListData = await reqListRes.json();
    const savedDocs = (reqListData.documents || []).filter(
      (d: any) => d.fields?.studentId?.stringValue === 'phone_01099000121'
    );
    expect(savedDocs.length).toBeGreaterThanOrEqual(2);
    expect(
      savedDocs.some((d: any) => d.fields?.reason?.stringValue === 'تغيير موعد السكشن صباحاً')
    ).toBe(true);

    // Assert zero prod traffic, zero page errors, zero console errors
    expect(blocked).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors, `Console errors observed: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
