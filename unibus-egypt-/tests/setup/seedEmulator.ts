import fs from 'node:fs';
import path from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import {
  AUTH_EMULATOR_URL,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  TEST_API_KEY,
  TEST_COMPANIES,
  TEST_PROJECT_ID,
  assertEmulatorIsolation,
} from './testConfig';

async function ensureEmulatorsReachable() {
  assertEmulatorIsolation(TEST_PROJECT_ID);

  const fsRes = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/`
  ).catch(() => null);
  if (!fsRes) {
    throw new Error(
      `Firestore Emulator is not reachable at http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`
    );
  }

  const authRes = await fetch(`${AUTH_EMULATOR_URL}/`).catch(() => null);
  if (!authRes) {
    throw new Error(
      `Auth Emulator is not reachable at ${AUTH_EMULATOR_URL}`
    );
  }
}

async function clearAuthEmulatorUsers() {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/emulator/v1/projects/${TEST_PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear Auth Emulator accounts: ${res.status}`);
  }
}

async function createAuthEmulatorUser(params: {
  localId: string;
  email: string;
  displayName: string;
  password?: string;
}) {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${TEST_PROJECT_ID}/accounts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner',
      },
      body: JSON.stringify({
        localId: params.localId,
        email: params.email,
        password: params.password || 'TestPass123!',
        displayName: params.displayName,
        emailVerified: true,
      }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed creating Auth Emulator user ${params.email}: ${txt}`);
  }
  return res.json();
}

export async function seedIsolatedEmulator() {
  await ensureEmulatorsReachable();
  await clearAuthEmulatorUsers();

  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      rules,
      host: FIRESTORE_EMULATOR_HOST,
      port: FIRESTORE_EMULATOR_PORT,
    },
  });

  try {
    await testEnv.clearFirestore();

    const authAccounts = [
      {
        localId: 'uid-test-super-admin',
        email: 'superadmin@unibus-test.local',
        displayName: 'مالك المنصة الاختباري',
      },
      {
        localId: 'uid-alpha-admin',
        email: 'alpha.admin@unibus-test.local',
        displayName: 'مدير شركة ألفا الاختباري',
      },
      {
        localId: 'uid-alpha-supervisor',
        email: 'alpha.supervisor@unibus-test.local',
        displayName: 'مشرف ألفا الاختباري',
      },
      {
        localId: 'uid-alpha-general',
        email: 'alpha.general@unibus-test.local',
        displayName: 'المشرف العام ألفا الاختباري',
      },
      {
        localId: 'uid-beta-admin',
        email: 'beta.admin@unibus-test.local',
        displayName: 'مدير شركة بيتا الاختباري',
      },
      {
        localId: 'uid-beta-supervisor',
        email: 'beta.supervisor@unibus-test.local',
        displayName: 'مشرف بيتا الاختباري',
      },
    ];

    for (const acc of authAccounts) {
      await createAuthEmulatorUser(acc);
    }

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const put = (col: string, id: string, data: Record<string, any>) =>
        setDoc(doc(db, col, id), data);

      // Companies & Public Directory
      await put('companies', TEST_COMPANIES.ALPHA, {
        id: TEST_COMPANIES.ALPHA,
        nameAr: 'شركة ألفا للنقل الاختباري',
        code: 'ALPHA-TEST',
        ownerAdminUserId: 'uid-alpha-admin',
        ownerAdminName: 'مدير شركة ألفا الاختباري',
        ownerAdminEmail: 'alpha.admin@unibus-test.local',
        contactPhone: '01099000101',
        planName: 'enterprise',
        monthlyPriceEgp: 5000,
        durationMonths: 12,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        paymentStatus: 'paid',
        status: 'active',
        maxBuses: 50,
        maxStudents: 2000,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      await put('companyDirectory', TEST_COMPANIES.ALPHA, {
        id: TEST_COMPANIES.ALPHA,
        nameAr: 'شركة ألفا للنقل الاختباري',
        code: 'ALPHA-TEST',
        status: 'active',
      });

      await put('companies', TEST_COMPANIES.BETA, {
        id: TEST_COMPANIES.BETA,
        nameAr: 'شركة بيتا للنقل الاختباري',
        code: 'BETA-TEST',
        ownerAdminUserId: 'uid-beta-admin',
        ownerAdminName: 'مدير شركة بيتا الاختباري',
        ownerAdminEmail: 'beta.admin@unibus-test.local',
        contactPhone: '01099000201',
        planName: 'growth',
        monthlyPriceEgp: 3000,
        durationMonths: 12,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        paymentStatus: 'paid',
        status: 'active',
        maxBuses: 25,
        maxStudents: 1000,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      await put('companyDirectory', TEST_COMPANIES.BETA, {
        id: TEST_COMPANIES.BETA,
        nameAr: 'شركة بيتا للنقل الاختباري',
        code: 'BETA-TEST',
        status: 'active',
      });

      // Settings
      await put('settings', 'system', {
        bookingCutoffHour: 22,
        cancellationCutoffMinutes: 60,
        allowStudentRegistration: true,
      });
      await put('settings', `company_${TEST_COMPANIES.ALPHA}`, {
        companyId: TEST_COMPANIES.ALPHA,
        bookingCutoffHour: 22,
        cancellationCutoffMinutes: 60,
        supportPhone: '01099000102',
      });
      await put('settings', `company_${TEST_COMPANIES.BETA}`, {
        companyId: TEST_COMPANIES.BETA,
        bookingCutoffHour: 22,
        cancellationCutoffMinutes: 60,
        supportPhone: '01099000202',
      });

      // Universities
      await put('universities', 'univ-alpha-1', {
        id: 'univ-alpha-1',
        companyId: TEST_COMPANIES.ALPHA,
        nameAr: 'جامعة الاختبار الأولى',
        city: 'القاهرة الجديدة',
        campusLocation: 'البوابة الرئيسية',
        activeStatus: true,
        totalStudents: 200,
      });
      await put('universities', 'univ-alpha-2', {
        id: 'univ-alpha-2',
        companyId: TEST_COMPANIES.ALPHA,
        nameAr: 'جامعة الاختبار الثانية',
        city: '6 أكتوبر',
        campusLocation: 'بوابة 2',
        activeStatus: true,
        totalStudents: 150,
      });
      await put('universities', 'univ-beta-1', {
        id: 'univ-beta-1',
        companyId: TEST_COMPANIES.BETA,
        nameAr: 'جامعة بيتا الاختبارية',
        city: 'الشيخ زايد',
        campusLocation: 'المدخل الشرقي',
        activeStatus: true,
        totalStudents: 120,
      });

      // Routes
      await put('routes', 'line-alpha-1', {
        id: 'line-alpha-1',
        companyId: TEST_COMPANIES.ALPHA,
        universityId: 'univ-alpha-1',
        nameAr: 'خط المعادي - الاختبار',
        code: 'L-A1',
        direction: 'both',
        activeStatus: true,
        stations: [
          {
            id: 'st-alpha-1',
            lineId: 'line-alpha-1',
            nameAr: 'ميدان الحرية (اختبار)',
            orderIndex: 0,
            scheduledMinutesFromStart: 0,
          },
          {
            id: 'st-alpha-2',
            lineId: 'line-alpha-1',
            nameAr: 'الزهراء (اختبار)',
            orderIndex: 1,
            scheduledMinutesFromStart: 15,
          },
        ],
      });
      await put('routes', 'line-beta-1', {
        id: 'line-beta-1',
        companyId: TEST_COMPANIES.BETA,
        universityId: 'univ-beta-1',
        nameAr: 'خط الدقي - بيتا',
        code: 'L-B1',
        direction: 'both',
        activeStatus: true,
        stations: [
          {
            id: 'st-beta-1',
            lineId: 'line-beta-1',
            nameAr: 'ميدان الدقي (اختبار)',
            orderIndex: 0,
            scheduledMinutesFromStart: 0,
          },
        ],
      });

      // Buses
      await put('buses', 'bus-alpha-1', {
        id: 'bus-alpha-1',
        companyId: TEST_COMPANIES.ALPHA,
        code: 'A-101',
        plateNumber: 'أ ب ج 101',
        capacity: 14,
        model: 'Toyota Hiace Test',
        status: 'available',
        activeStatus: true,
      });
      await put('buses', 'bus-alpha-2', {
        id: 'bus-alpha-2',
        companyId: TEST_COMPANIES.ALPHA,
        code: 'A-102',
        plateNumber: 'أ ب ج 102',
        capacity: 28,
        model: 'Coaster Test',
        status: 'available',
        activeStatus: true,
      });
      await put('buses', 'bus-beta-1', {
        id: 'bus-beta-1',
        companyId: TEST_COMPANIES.BETA,
        code: 'B-201',
        plateNumber: 'د هـ و 201',
        capacity: 14,
        model: 'Beta Hiace Test',
        status: 'available',
        activeStatus: true,
      });

      // Drivers Directory
      await put('drivers', 'drv-alpha-1', {
        id: 'drv-alpha-1',
        companyId: TEST_COMPANIES.ALPHA,
        userId: 'phone_01099000111',
        nameAr: 'سائق ألفا الأول (اختبار)',
        phone: '01099000111',
        licenseNumber: 'TEST-LIC-101',
        status: 'active',
        assignedBusId: 'bus-alpha-1',
      });
      await put('drivers', 'drv-alpha-2', {
        id: 'drv-alpha-2',
        companyId: TEST_COMPANIES.ALPHA,
        userId: 'phone_01099000112',
        nameAr: 'سائق ألفا الثاني (اختبار)',
        phone: '01099000112',
        licenseNumber: 'TEST-LIC-102',
        status: 'active',
        assignedBusId: 'bus-alpha-2',
      });
      await put('drivers', 'drv-beta-1', {
        id: 'drv-beta-1',
        companyId: TEST_COMPANIES.BETA,
        userId: 'phone_01099000211',
        nameAr: 'سائق بيتا (اختبار)',
        phone: '01099000211',
        licenseNumber: 'TEST-LIC-201',
        status: 'active',
        assignedBusId: 'bus-beta-1',
      });

      // Users & Phone Directory across all roles
      const usersToSeed = [
        {
          id: 'uid-test-super-admin',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'مالك المنصة الاختباري',
          phone: '01099000001',
          email: 'superadmin@unibus-test.local',
          role: 'super_admin',
          status: 'active',
        },
        {
          id: 'uid-alpha-admin',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'مدير شركة ألفا الاختباري',
          phone: '01099000101',
          email: 'alpha.admin@unibus-test.local',
          role: 'admin',
          status: 'active',
        },
        {
          id: 'uid-alpha-supervisor',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'مشرف ألفا الاختباري',
          phone: '01099000102',
          email: 'alpha.supervisor@unibus-test.local',
          role: 'supervisor',
          isGeneralSupervisor: false,
          status: 'active',
        },
        {
          id: 'uid-alpha-general',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'المشرف العام ألفا الاختباري',
          phone: '01099000103',
          email: 'alpha.general@unibus-test.local',
          role: 'supervisor',
          isGeneralSupervisor: true,
          status: 'active',
        },
        {
          id: 'phone_01099000111',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'سائق ألفا الأول (اختبار)',
          phone: '01099000111',
          email: '',
          role: 'driver',
          assignedBusId: 'bus-alpha-1',
          licenseNumber: 'TEST-LIC-101',
          status: 'active',
        },
        {
          id: 'phone_01099000112',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'سائق ألفا الثاني (اختبار)',
          phone: '01099000112',
          email: '',
          role: 'driver',
          assignedBusId: 'bus-alpha-2',
          licenseNumber: 'TEST-LIC-102',
          status: 'active',
        },
        {
          id: 'phone_01099000121',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'طالب ألفا الأول (اختبار)',
          phone: '01099000121',
          email: '',
          role: 'student',
          universityId: 'univ-alpha-1',
          lineId: 'line-alpha-1',
          stationId: 'st-alpha-1',
          status: 'active',
        },
        {
          id: 'phone_01099000122',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'طالب ألفا الثاني (اختبار)',
          phone: '01099000122',
          email: '',
          role: 'student',
          universityId: 'univ-alpha-2',
          lineId: 'line-alpha-1',
          stationId: 'st-alpha-2',
          status: 'active',
        },
        {
          id: 'phone_01099000199',
          companyId: TEST_COMPANIES.ALPHA,
          name: 'طالب معلق ألفا (اختبار)',
          phone: '01099000199',
          email: '',
          role: 'student',
          universityId: 'univ-alpha-1',
          lineId: 'line-alpha-1',
          stationId: 'st-alpha-1',
          status: 'pending_approval',
        },
        {
          id: 'uid-beta-admin',
          companyId: TEST_COMPANIES.BETA,
          name: 'مدير شركة بيتا الاختباري',
          phone: '01099000201',
          email: 'beta.admin@unibus-test.local',
          role: 'admin',
          status: 'active',
        },
        {
          id: 'uid-beta-supervisor',
          companyId: TEST_COMPANIES.BETA,
          name: 'مشرف بيتا الاختباري',
          phone: '01099000202',
          email: 'beta.supervisor@unibus-test.local',
          role: 'supervisor',
          status: 'active',
        },
        {
          id: 'phone_01099000211',
          companyId: TEST_COMPANIES.BETA,
          name: 'سائق بيتا (اختبار)',
          phone: '01099000211',
          email: '',
          role: 'driver',
          assignedBusId: 'bus-beta-1',
          status: 'active',
        },
        {
          id: 'phone_01099000221',
          companyId: TEST_COMPANIES.BETA,
          name: 'طالب بيتا (اختبار)',
          phone: '01099000221',
          email: '',
          role: 'student',
          universityId: 'univ-beta-1',
          lineId: 'line-beta-1',
          stationId: 'st-beta-1',
          status: 'active',
        },
      ];

      for (const u of usersToSeed) {
        await put('users', u.id, u);
        await put('phoneDirectory', u.phone, {
          id: u.phone,
          userId: u.id,
          companyId: u.companyId,
          name: u.name,
          phone: u.phone,
          role: u.role,
          status: u.status,
          isGeneralSupervisor: Boolean(u.isGeneralSupervisor),
        });
      }

      // Pending Staff Invite
      await put('staffInvites', 'invited.supervisor@unibus-test.local', {
        id: 'invited.supervisor@unibus-test.local',
        companyId: TEST_COMPANIES.ALPHA,
        email: 'invited.supervisor@unibus-test.local',
        name: 'مشرف مدعو (اختبار)',
        phone: '01099000109',
        role: 'supervisor',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Trip Templates
      await put('tripTemplates', 'tpl-alpha-morning', {
        id: 'tpl-alpha-morning',
        companyId: TEST_COMPANIES.ALPHA,
        time: '07:00',
        direction: 'to_university',
        type: 'morning',
        universityId: 'univ-alpha-1',
        lineId: 'line-alpha-1',
        daysOfWeek: [0, 1, 2, 3, 4],
        activeStatus: true,
        isDefault: true,
      });

      // Sample Trips (Company Alpha & Company Beta)
      await put('trips', 'trip-alpha-morning-1', {
        id: 'trip-alpha-morning-1',
        companyId: TEST_COMPANIES.ALPHA,
        code: 'TRP-A1',
        date: today,
        universityId: 'univ-alpha-1',
        universityNameAr: 'جامعة الاختبار الأولى',
        lineId: 'line-alpha-1',
        lineNameAr: 'خط المعادي - الاختبار',
        direction: 'to_university',
        scheduledTime: '07:00',
        busId: 'bus-alpha-1',
        busPlate: 'أ ب ج 101',
        capacity: 14,
        driverId: 'drv-alpha-1',
        driverNameAr: 'سائق ألفا الأول (اختبار)',
        driverPhone: '01099000111',
        status: 'scheduled',
        currentStopIndex: 0,
        delayMinutes: 0,
        stops: [
          {
            stopId: 'st-alpha-1',
            stationId: 'st-alpha-1',
            stationNameAr: 'ميدان الحرية (اختبار)',
            orderIndex: 0,
            scheduledArrivalTime: '07:00',
            status: 'pending',
          },
          {
            stopId: 'st-alpha-2',
            stationId: 'st-alpha-2',
            stationNameAr: 'الزهراء (اختبار)',
            orderIndex: 1,
            scheduledArrivalTime: '07:15',
            status: 'pending',
          },
        ],
        manifest: [
          {
            studentId: 'phone_01099000121',
            studentName: 'طالب ألفا الأول (اختبار)',
            phone: '01099000121',
            stationId: 'st-alpha-1',
            stationNameAr: 'ميدان الحرية (اختبار)',
            rsvpStatus: 'confirmed',
            boardedStatus: 'waiting',
            studentUniversityId: 'univ-alpha-1',
            studentUniversityNameAr: 'جامعة الاختبار الأولى',
          },
        ],
      });

      await put('trips', 'trip-alpha-return-waiting-1', {
        id: 'trip-alpha-return-waiting-1',
        companyId: TEST_COMPANIES.ALPHA,
        code: 'RET-A1',
        date: today,
        universityId: 'univ-alpha-1',
        universityNameAr: 'جامعة الاختبار الأولى',
        lineId: 'line-alpha-1',
        lineNameAr: 'خط المعادي - الاختبار',
        direction: 'from_university',
        scheduledTime: '15:00',
        busId: 'bus-alpha-2',
        busPlate: 'أ ب ج 102',
        capacity: 28,
        driverId: 'drv-alpha-2',
        driverNameAr: 'سائق ألفا الثاني (اختبار)',
        driverPhone: '01099000112',
        status: 'scheduled',
        currentStopIndex: 0,
        delayMinutes: 0,
        notes: 'return_waiting',
        stops: [
          {
            stopId: 'st-alpha-1',
            stationId: 'st-alpha-1',
            stationNameAr: 'ميدان الحرية (اختبار)',
            orderIndex: 0,
            scheduledArrivalTime: '15:15',
            status: 'pending',
          },
        ],
        manifest: [],
      });

      await put('trips', 'trip-beta-morning-1', {
        id: 'trip-beta-morning-1',
        companyId: TEST_COMPANIES.BETA,
        code: 'TRP-B1',
        date: today,
        universityId: 'univ-beta-1',
        universityNameAr: 'جامعة بيتا الاختبارية',
        lineId: 'line-beta-1',
        lineNameAr: 'خط الدقي - بيتا',
        direction: 'to_university',
        scheduledTime: '08:00',
        busId: 'bus-beta-1',
        busPlate: 'د هـ و 201',
        capacity: 14,
        driverId: 'drv-beta-1',
        driverNameAr: 'سائق بيتا (اختبار)',
        driverPhone: '01099000211',
        status: 'scheduled',
        currentStopIndex: 0,
        delayMinutes: 0,
        stops: [
          {
            stopId: 'st-beta-1',
            stationId: 'st-beta-1',
            stationNameAr: 'ميدان الدقي (اختبار)',
            orderIndex: 0,
            scheduledArrivalTime: '08:00',
            status: 'pending',
          },
        ],
        manifest: [
          {
            studentId: 'phone_01099000221',
            studentName: 'طالب بيتا (اختبار)',
            phone: '01099000221',
            stationId: 'st-beta-1',
            stationNameAr: 'ميدان الدقي (اختبار)',
            rsvpStatus: 'confirmed',
            boardedStatus: 'waiting',
            studentUniversityId: 'univ-beta-1',
            studentUniversityNameAr: 'جامعة بيتا الاختبارية',
          },
        ],
      });
    });

    console.log(
      `[SEED OK] Seeded 2 isolated test companies (${TEST_COMPANIES.ALPHA}, ${TEST_COMPANIES.BETA}), 6 Auth Emulator users, 13 Firestore user profiles, and synthetic trips on project "${TEST_PROJECT_ID}".`
    );
  } finally {
    await testEnv.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedIsolatedEmulator().catch((err) => {
    console.error('[SEED FAILED]', err);
    process.exit(1);
  });
}
