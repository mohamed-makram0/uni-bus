import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  runTransaction,
  DocumentData,
  QuerySnapshot,
  Query
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  University,
  Line,
  Bus,
  Driver,
  Trip,
  TripTemplate,
  User,
  Subscription,
  Incident,
  ConsolidationProposal,
  SystemSettings,
  ExceptionalBookingRequest,
  ManifestStudent,
  Company,
  AuditLog
} from '../types';
import {
  initialUniversities,
  initialLines,
  initialBuses,
  initialDrivers,
  initialTrips,
  initialTripTemplates,
  initialUsers,
  initialSubscriptions,
  initialIncidents,
  initialConsolidationProposals,
  initialSettings,
  initialExceptionalRequests
} from '../data/mockData';

export const DEFAULT_COMPANY_ID = 'comp-unibus-main';
export const SECOND_TEST_COMPANY_ID = 'comp-delta-uni';

// Collection Names
export const COLLECTIONS = {
  COMPANIES: 'companies',
  COMPANY_DIRECTORY: 'companyDirectory',
  PHONE_DIRECTORY: 'phoneDirectory',
  STAFF_INVITES: 'staffInvites',
  UNIVERSITIES: 'universities',
  BUSES: 'buses',
  ROUTES: 'routes',
  TRIPS: 'trips',
  TRIP_TEMPLATES: 'tripTemplates',
  USERS: 'users',
  DRIVERS: 'drivers',
  SUBSCRIPTIONS: 'subscriptions',
  INCIDENTS: 'incidents',
  PROPOSALS: 'proposals',
  EXCEPTIONAL_REQUESTS: 'exceptionalRequests',
  SETTINGS: 'settings',
  AUDIT_LOGS: 'auditLogs'
} as const;

export function normalizePhoneDigits(raw: string): string {
  const arabicToAscii = (raw || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  let digits = arabicToAscii.replace(/\D/g, '');
  if (digits.startsWith('0020') && digits.length >= 13) {
    digits = digits.slice(3); // keep leading 0 (e.g. 002010... -> 010...)
  } else if (digits.startsWith('20') && digits.length === 12 && digits[2] === '1') {
    digits = `0${digits.slice(2)}`; // 2010... -> 010...
  }
  return digits;
}

export function phoneToUserId(phone: string): string {
  return `phone_${normalizePhoneDigits(phone)}`;
}

export async function syncPhoneDirectoryEntry(
  user: Pick<User, 'id' | 'companyId' | 'name' | 'phone' | 'role' | 'status' | 'isGeneralSupervisor'>
): Promise<void> {
  const digits = normalizePhoneDigits(user.phone);
  if (digits.length < 8) return;
  await setDoc(
    doc(db, COLLECTIONS.PHONE_DIRECTORY, digits),
    {
      id: digits,
      userId: user.id,
      companyId: user.companyId || DEFAULT_COMPANY_ID,
      name: (user.name || '').trim(),
      phone: digits,
      role: user.role,
      status: user.status,
      isGeneralSupervisor: Boolean(user.isGeneralSupervisor),
    },
    { merge: true }
  );
}

export async function removePhoneDirectoryEntry(phone: string): Promise<void> {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return;
  try {
    await deleteDoc(doc(db, COLLECTIONS.PHONE_DIRECTORY, digits));
  } catch {
    // Ignore if already absent
  }
}

export function emailToInviteId(email: string): string {
  return email.trim().toLowerCase().replace(/\//g, '_');
}

export async function syncCompanyDirectoryEntry(
  company: Pick<Company, 'id' | 'nameAr' | 'code' | 'status'>
): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.COMPANY_DIRECTORY, company.id), {
    id: company.id,
    nameAr: company.nameAr,
    code: company.code,
    status: company.status,
  });
}

export interface SeedingResult {
  success: boolean;
  message: string;
  createdCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
}

/**
 * Safe, Admin/Super-Admin on-demand seeding for a specific company.
 * - Does NOT run automatically on startup.
 * - Checks each collection and document individually.
 * - NEVER overwrites existing documents (zero data loss).
 */
export async function safeAdminSeedFirestore(
  currentUser: User,
  companyId: string = DEFAULT_COMPANY_ID
): Promise<SeedingResult> {
  if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
    return {
      success: false,
      message: 'غير مصرح: عملية التهيئة الأولية مقتصرة حصرياً على مدير الشركة أو مالك المنصة.',
      createdCounts: {},
      skippedCounts: {}
    };
  }

  const createdCounts: Record<string, number> = {};
  const skippedCounts: Record<string, number> = {};

  const collectionsToSeed = [
    { name: COLLECTIONS.UNIVERSITIES, items: initialUniversities },
    { name: COLLECTIONS.BUSES, items: initialBuses },
    { name: COLLECTIONS.ROUTES, items: initialLines },
    { name: COLLECTIONS.TRIP_TEMPLATES, items: initialTripTemplates },
    { name: COLLECTIONS.USERS, items: initialUsers },
    { name: COLLECTIONS.DRIVERS, items: initialDrivers },
    { name: COLLECTIONS.SUBSCRIPTIONS, items: initialSubscriptions },
    { name: COLLECTIONS.TRIPS, items: initialTrips },
    { name: COLLECTIONS.INCIDENTS, items: initialIncidents },
    { name: COLLECTIONS.PROPOSALS, items: initialConsolidationProposals },
    { name: COLLECTIONS.EXCEPTIONAL_REQUESTS, items: initialExceptionalRequests },
  ];

  try {
    // Ensure main company doc exists
    const compRef = doc(db, COLLECTIONS.COMPANIES, companyId);
    const compSnap = await getDoc(compRef);
    createdCounts[COLLECTIONS.COMPANIES] = 0;
    skippedCounts[COLLECTIONS.COMPANIES] = 0;
    if (!compSnap.exists()) {
      const today = new Date().toISOString().slice(0, 10);
      const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
      const mainCompany: Company = {
        id: companyId,
        nameAr: companyId === DEFAULT_COMPANY_ID ? 'شركة UniBus مصر الرئيسية' : `شركة ${companyId}`,
        code: companyId === DEFAULT_COMPANY_ID ? 'UNIBUS-EG' : companyId.toUpperCase(),
        ownerAdminName: 'خالد عبد الرحمن',
        ownerAdminEmail: 'admin@unibusegypt.com',
        contactPhone: '01000000001',
        planName: 'enterprise',
        monthlyPriceEgp: 4500,
        durationMonths: 12,
        startDate: today,
        endDate: nextYear,
        paymentStatus: 'paid',
        status: 'active',
        maxBuses: 50,
        maxStudents: 1500,
        createdAt: today,
      };
      await setDoc(compRef, mainCompany);
      await syncCompanyDirectoryEntry(mainCompany);
      createdCounts[COLLECTIONS.COMPANIES]++;
    } else {
      const existingComp = compSnap.data() as Company;
      await syncCompanyDirectoryEntry({ ...existingComp, id: companyId });
      skippedCounts[COLLECTIONS.COMPANIES]++;
    }

    for (const group of collectionsToSeed) {
      createdCounts[group.name] = 0;
      skippedCounts[group.name] = 0;

      for (const item of group.items) {
        const docRef = doc(db, group.name, item.id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          skippedCounts[group.name]++;
        } else {
          await setDoc(docRef, { ...item, companyId });
          createdCounts[group.name]++;
        }
      }
    }

    // Seed Settings only if missing
    const settingsDocId = companyId === DEFAULT_COMPANY_ID ? 'system' : `company_${companyId}`;
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, settingsDocId);
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, { ...initialSettings, companyId });
      createdCounts[COLLECTIONS.SETTINGS] = 1;
    } else {
      skippedCounts[COLLECTIONS.SETTINGS] = 1;
    }

    const totalCreated = Object.values(createdCounts).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(skippedCounts).reduce((a, b) => a + b, 0);

    return {
      success: true,
      message: `اكتملت التهيئة الآمنة بنجاح: تم إنشاء ${totalCreated} سجلاً جديداً، وتخطي ${totalSkipped} سجلاً موجوداً مسبقاً دون مساس.`,
      createdCounts,
      skippedCounts
    };
  } catch (error: any) {
    console.error('Error during safeAdminSeedFirestore:', error);
    return {
      success: false,
      message: `فشلت عملية التهيئة: ${error?.message || 'خطأ في الاتصال بقاعدة البيانات أو رفض الصلاحيات.'}`,
      createdCounts,
      skippedCounts
    };
  }
}

/**
 * Super-Admin-only seeding of 2 distinct test companies for multi-tenant isolation & audit testing.
 * Never overwrites existing documents.
 */
export async function seedTwoTestCompanies(currentUser: User): Promise<SeedingResult> {
  if (currentUser.role !== 'super_admin') {
    return {
      success: false,
      message: 'غير مصرح: إنشاء الشركات التجريبية مقتصر على مالك المنصة (Super Admin).',
      createdCounts: {},
      skippedCounts: {}
    };
  }

  // First ensure Company 1 exists cleanly
  const firstRes = await safeAdminSeedFirestore(currentUser, DEFAULT_COMPANY_ID);
  if (!firstRes.success) return firstRes;

  const createdCounts = { ...firstRes.createdCounts };
  const skippedCounts = { ...firstRes.skippedCounts };

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const nextHalfYear = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

  const deltaCompany: Company = {
    id: SECOND_TEST_COMPANY_ID,
    nameAr: 'شركة دلتا للنقل الجامعي',
    code: 'DELTA-TRANS',
    ownerAdminUserId: 'delta-admin-1',
    ownerAdminName: 'أحمد سامي النجار',
    ownerAdminEmail: 'admin@deltatrans.eg',
    contactPhone: '01223344556',
    planName: 'growth',
    monthlyPriceEgp: 2800,
    durationMonths: 6,
    startDate: today,
    endDate: nextHalfYear,
    paymentStatus: 'paid',
    status: 'active',
    maxBuses: 25,
    maxStudents: 600,
    createdAt: today,
  };

  const deltaUnis: University[] = [
    {
      id: 'uni-delta-nmu',
      companyId: SECOND_TEST_COMPANY_ID,
      nameAr: 'جامعة المنصورة الجديدة',
      city: 'دمياط / الدقهلية',
      campusLocation: 'البوابة الرئيسية - الطريق الساحلي الدولي',
      activeStatus: true,
      totalStudents: 185,
    },
    {
      id: 'uni-delta-dust',
      companyId: SECOND_TEST_COMPANY_ID,
      nameAr: 'جامعة الدلتا للعلوم والتكنولوجيا',
      city: 'جمصة - الدقهلية',
      campusLocation: 'بوابة كليات الهندسة والطب',
      activeStatus: true,
      totalStudents: 140,
    }
  ];

  const deltaLines: Line[] = [
    {
      id: 'line-delta-mansoura',
      companyId: SECOND_TEST_COMPANY_ID,
      universityId: 'uni-delta-nmu',
      nameAr: 'المنصورة (حي الجامعة) ⟵ المنصورة الجديدة',
      code: 'DLT-MN01',
      direction: 'both',
      activeStatus: true,
      stations: [
        { id: 'st-dlt-1', lineId: 'line-delta-mansoura', nameAr: 'حي الجامعة - بوابة توشكى', orderIndex: 1, scheduledMinutesFromStart: 0 },
        { id: 'st-dlt-2', lineId: 'line-delta-mansoura', nameAr: 'طلخا - الموقف الجديد', orderIndex: 2, scheduledMinutesFromStart: 15 },
        { id: 'st-dlt-3', lineId: 'line-delta-mansoura', nameAr: 'حرم جامعة المنصورة الجديدة', orderIndex: 3, scheduledMinutesFromStart: 45 },
      ]
    },
    {
      id: 'line-delta-damietta',
      companyId: SECOND_TEST_COMPANY_ID,
      universityId: 'uni-delta-dust',
      nameAr: 'دمياط الجديدة ⟵ جامعة الدلتا',
      code: 'DLT-DM02',
      direction: 'both',
      activeStatus: true,
      stations: [
        { id: 'st-dlt-4', lineId: 'line-delta-damietta', nameAr: 'ميدان الحرية - دمياط الجديدة', orderIndex: 1, scheduledMinutesFromStart: 0 },
        { id: 'st-dlt-5', lineId: 'line-delta-damietta', nameAr: 'كفر سعد', orderIndex: 2, scheduledMinutesFromStart: 20 },
        { id: 'st-dlt-6', lineId: 'line-delta-damietta', nameAr: 'حرم جامعة الدلتا بجمصة', orderIndex: 3, scheduledMinutesFromStart: 35 },
      ]
    }
  ];

  const deltaBuses: Bus[] = [
    {
      id: 'bus-delta-1',
      companyId: SECOND_TEST_COMPANY_ID,
      code: 'DELTA-201',
      plateNumber: 'د هـ ط 7142',
      capacity: 28,
      model: 'ميني باص مرسيدس MCV 2024',
      status: 'available',
      activeStatus: true,
      currentAssignedPassengers: 2,
    },
    {
      id: 'bus-delta-2',
      companyId: SECOND_TEST_COMPANY_ID,
      code: 'DELTA-202',
      plateNumber: 'د س ر 3309',
      capacity: 14,
      model: 'ميكروباص تويوتا هاي أس 2024',
      status: 'available',
      activeStatus: true,
      currentAssignedPassengers: 1,
    }
  ];

  const deltaDrivers: Driver[] = [
    {
      id: 'drv-delta-1',
      companyId: SECOND_TEST_COMPANY_ID,
      userId: 'delta-driver-1',
      nameAr: 'كابتن محمود الشربيني',
      phone: '01200998877',
      licenseNumber: 'DL-DK-5521',
      status: 'active',
      assignedBusId: 'bus-delta-1'
    }
  ];

  const deltaUsers: User[] = [
    {
      id: 'delta-admin-1',
      companyId: SECOND_TEST_COMPANY_ID,
      name: 'أحمد سامي النجار',
      phone: '01223344556',
      email: 'admin@deltatrans.eg',
      role: 'admin',
      status: 'active',
    },
    {
      id: 'delta-sup-1',
      companyId: SECOND_TEST_COMPANY_ID,
      name: 'ياسمين فؤاد (مشرف الدلتا)',
      phone: '01211223344',
      email: 'sup@deltatrans.eg',
      role: 'supervisor',
      status: 'active',
    },
    {
      id: 'delta-driver-1',
      companyId: SECOND_TEST_COMPANY_ID,
      name: 'كابتن محمود الشربيني',
      phone: '01200998877',
      email: 'driver@deltatrans.eg',
      role: 'driver',
      assignedBusId: 'bus-delta-1',
      status: 'active',
    },
    {
      id: 'delta-stu-1',
      companyId: SECOND_TEST_COMPANY_ID,
      name: 'نورهان علاء المنصوري',
      phone: '01099881122',
      email: 'nora.delta@student.eg',
      role: 'student',
      universityId: 'uni-delta-nmu',
      lineId: 'line-delta-mansoura',
      stationId: 'st-dlt-1',
      status: 'active',
    },
    {
      id: 'delta-stu-2',
      companyId: SECOND_TEST_COMPANY_ID,
      name: 'عمر خالد الدسوقي',
      phone: '01144556677',
      email: 'omar.delta@student.eg',
      role: 'student',
      universityId: 'uni-delta-nmu',
      lineId: 'line-delta-mansoura',
      stationId: 'st-dlt-2',
      status: 'active',
    }
  ];

  const deltaTemplates: TripTemplate[] = [
    {
      id: 'tmpl-delta-m730',
      companyId: SECOND_TEST_COMPANY_ID,
      time: '07:30 ص',
      direction: 'to_university',
      type: 'morning',
      daysOfWeek: [0, 1, 2, 3, 4],
      activeStatus: true,
      isDefault: true,
    },
    {
      id: 'tmpl-delta-r1430',
      companyId: SECOND_TEST_COMPANY_ID,
      time: '02:30 م',
      direction: 'from_university',
      type: 'return',
      daysOfWeek: [0, 1, 2, 3, 4],
      activeStatus: true,
      isDefault: true,
    }
  ];

  const deltaTrips: Trip[] = [
    {
      id: `trip-delta-ret-${today}`,
      companyId: SECOND_TEST_COMPANY_ID,
      code: 'DLT-901',
      date: today,
      universityId: 'uni-delta-nmu',
      universityNameAr: 'جامعة المنصورة الجديدة',
      lineId: 'line-delta-mansoura',
      lineNameAr: 'المنصورة (حي الجامعة) ⟵ المنصورة الجديدة',
      direction: 'from_university',
      scheduledTime: '02:30 م',
      busId: 'bus-delta-1',
      busPlate: 'د هـ ط 7142',
      capacity: 28,
      driverId: 'drv-delta-1',
      driverNameAr: 'كابتن محمود الشربيني',
      driverPhone: '01200998877',
      status: 'scheduled',
      currentStopIndex: 0,
      delayMinutes: 0,
      stops: [
        { stopId: 'stop-dlt-r1', stationId: 'st-dlt-3', stationNameAr: 'حرم جامعة المنصورة الجديدة', orderIndex: 1, scheduledArrivalTime: '02:30 م', status: 'pending' },
        { stopId: 'stop-dlt-r2', stationId: 'st-dlt-2', stationNameAr: 'طلخا - الموقف الجديد', orderIndex: 2, scheduledArrivalTime: '03:00 م', status: 'pending' },
        { stopId: 'stop-dlt-r3', stationId: 'st-dlt-1', stationNameAr: 'حي الجامعة - بوابة توشكى', orderIndex: 3, scheduledArrivalTime: '03:15 م', status: 'pending' },
      ],
      manifest: [
        {
          studentId: 'delta-stu-1',
          studentName: 'نورهان علاء المنصوري',
          phone: '01099881122',
          stationId: 'st-dlt-1',
          stationNameAr: 'حي الجامعة - بوابة توشكى',
          rsvpStatus: 'confirmed',
          boardedStatus: 'waiting',
          readyForReturn: true,
          readyForReturnAt: '02:05 م'
        },
        {
          studentId: 'delta-stu-2',
          studentName: 'عمر خالد الدسوقي',
          phone: '01144556677',
          stationId: 'st-dlt-2',
          stationNameAr: 'طلخا - الموقف الجديد',
          rsvpStatus: 'confirmed',
          boardedStatus: 'waiting',
        }
      ]
    },
    {
      id: `trip-delta-morn-${tomorrow}`,
      companyId: SECOND_TEST_COMPANY_ID,
      code: 'DLT-902',
      date: tomorrow,
      universityId: 'uni-delta-nmu',
      universityNameAr: 'جامعة المنصورة الجديدة',
      lineId: 'line-delta-mansoura',
      lineNameAr: 'المنصورة (حي الجامعة) ⟵ المنصورة الجديدة',
      direction: 'to_university',
      scheduledTime: '07:30 ص',
      busId: 'bus-delta-2',
      busPlate: 'د س ر 3309',
      capacity: 14,
      driverId: 'drv-delta-1',
      driverNameAr: 'كابتن محمود الشربيني',
      driverPhone: '01200998877',
      status: 'scheduled',
      currentStopIndex: 0,
      delayMinutes: 0,
      stops: [
        { stopId: 'stop-dlt-m1', stationId: 'st-dlt-1', stationNameAr: 'حي الجامعة - بوابة توشكى', orderIndex: 1, scheduledArrivalTime: '07:30 ص', status: 'pending' },
        { stopId: 'stop-dlt-m2', stationId: 'st-dlt-2', stationNameAr: 'طلخا - الموقف الجديد', orderIndex: 2, scheduledArrivalTime: '07:45 ص', status: 'pending' },
        { stopId: 'stop-dlt-m3', stationId: 'st-dlt-3', stationNameAr: 'حرم جامعة المنصورة الجديدة', orderIndex: 3, scheduledArrivalTime: '08:15 ص', status: 'pending' },
      ],
      manifest: [
        {
          studentId: 'delta-stu-1',
          studentName: 'نورهان علاء المنصوري',
          phone: '01099881122',
          stationId: 'st-dlt-1',
          stationNameAr: 'حي الجامعة - بوابة توشكى',
          rsvpStatus: 'confirmed',
          boardedStatus: 'waiting',
        }
      ]
    }
  ];

  const groups: Array<{ name: string; items: Array<{ id: string } & Record<string, any>> }> = [
    { name: COLLECTIONS.COMPANIES, items: [deltaCompany] },
    { name: COLLECTIONS.UNIVERSITIES, items: deltaUnis },
    { name: COLLECTIONS.ROUTES, items: deltaLines },
    { name: COLLECTIONS.BUSES, items: deltaBuses },
    { name: COLLECTIONS.DRIVERS, items: deltaDrivers },
    { name: COLLECTIONS.USERS, items: deltaUsers },
    { name: COLLECTIONS.TRIP_TEMPLATES, items: deltaTemplates },
    { name: COLLECTIONS.TRIPS, items: deltaTrips },
  ];

  try {
    for (const g of groups) {
      createdCounts[g.name] = createdCounts[g.name] || 0;
      skippedCounts[g.name] = skippedCounts[g.name] || 0;
      for (const item of g.items) {
        const ref = doc(db, g.name, item.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          skippedCounts[g.name]++;
        } else {
          await setDoc(ref, item);
          createdCounts[g.name]++;
        }
      }
    }

    await syncCompanyDirectoryEntry(deltaCompany);

    const deltaSettingsRef = doc(db, COLLECTIONS.SETTINGS, `company_${SECOND_TEST_COMPANY_ID}`);
    const deltaSettingsSnap = await getDoc(deltaSettingsRef);
    if (!deltaSettingsSnap.exists()) {
      await setDoc(deltaSettingsRef, { ...initialSettings, companyId: SECOND_TEST_COMPANY_ID });
      createdCounts[COLLECTIONS.SETTINGS] = (createdCounts[COLLECTIONS.SETTINGS] || 0) + 1;
    } else {
      skippedCounts[COLLECTIONS.SETTINGS] = (skippedCounts[COLLECTIONS.SETTINGS] || 0) + 1;
    }

    return {
      success: true,
      message: 'تمت تهيئة الشركتين التجريبيتين (UniBus مصر الرئيسية + شركة دلتا للنقل الجامعي) بعزل كامل في قاعدة البيانات!',
      createdCounts,
      skippedCounts
    };
  } catch (error: any) {
    console.error('seedTwoTestCompanies error:', error);
    return {
      success: false,
      message: `فشلت تهيئة الشركتين: ${error?.message || 'خطأ في الصلاحيات أو الاتصال.'}`,
      createdCounts,
      skippedCounts
    };
  }
}

/**
 * Generic Real-Time Collection Listener reflecting live Firestore state.
 * Empty Firestore collections emit [] rather than silently injecting mock data.
 */
export function subscribeToCollection<T extends { id: string }>(
  collectionName: string,
  onData: (data: T[]) => void,
  _fallbackData: T[] = [],
  onError?: (err: Error) => void
): () => void {
  try {
    const colRef = collection(db, collectionName);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as T[];
        onData(items);
      },
      (error) => {
        console.warn(`Firestore listener [${collectionName}] notice: ${error.message}.`);
        if (onError) onError(error);
      }
    );
    return unsubscribe;
  } catch (error: any) {
    console.warn(`Could not attach listener to ${collectionName}:`, error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Real-Time Scoped Query Listener (for role/owner-restricted queries such as student subscriptions).
 */
export function subscribeToQuery<T extends { id: string }>(
  firestoreQuery: Query<DocumentData>,
  label: string,
  onData: (data: T[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    return onSnapshot(
      firestoreQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as T[];
        onData(items);
      },
      (error) => {
        console.warn(`Firestore query [${label}] notice: ${error.message}.`);
        if (onError) onError(error);
      }
    );
  } catch (error: any) {
    console.warn(`Could not attach query listener [${label}]:`, error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Recursively strips `undefined` values from objects/arrays because Firestore
 * rejects documents containing explicit `undefined` field values.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefinedDeep(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Generic document setter with verified persistence.
 * Throws on failure to allow caller to handle rollback and alert user.
 */
export async function persistDocument<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  const path = `${collectionName}/${docId}`;
  try {
    const sanitized = stripUndefinedDeep(data);
    await setDoc(doc(db, collectionName, docId), sanitized, { merge: true });
  } catch (error: any) {
    console.error(`Failed to persist document to ${path}:`, error);
    throw new Error(error?.message || `فشل حفظ البيانات في المسار ${path}`);
  }
}

/**
 * Generic document deleter with verified persistence.
 * Throws on failure to allow caller to handle rollback.
 */
export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  const path = `${collectionName}/${docId}`;
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (error: any) {
    console.error(`Failed to delete document from ${path}:`, error);
    throw new Error(error?.message || `فشل حذف السجل من المسار ${path}`);
  }
}

/**
 * Atomic seat booking using Firestore Transactions to guarantee that concurrent
 * student bookings cannot exceed the bus physical capacity under any circumstances.
 */
export async function atomicConfirmStudentRsvp(
  tripId: string,
  studentId: string,
  status: 'confirmed' | 'excused',
  studentUser: User,
  studentStationName: string,
  studentStationId: string
): Promise<{ success: boolean; trip: Trip }> {
  const tripRef = doc(db, COLLECTIONS.TRIPS, tripId);
  const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());

  return await runTransaction(db, async (transaction) => {
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) {
      throw new Error('الرحلة المطلوبة غير موجودة في قاعدة البيانات.');
    }

    const tripData = tripSnap.data() as Trip;
    const currentManifest = tripData.manifest || [];
    const capacity = tripData.capacity || 14;

    if (status === 'confirmed') {
      const alreadyConfirmed = currentManifest.some(
        m => m.studentId === studentId && m.rsvpStatus === 'confirmed'
      );

      if (!alreadyConfirmed) {
        const confirmedCount = currentManifest.filter(
          m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported'
        ).length;

        if (confirmedCount >= capacity) {
          throw new Error(`عذراً، اكتملت سعة الحافلة بالكامل (${capacity}/${capacity} مقعد). لا يمكن حجز مقعد إضافي.`);
        }
      }
    }

    // Update manifest
    const existingIndex = currentManifest.findIndex(m => m.studentId === studentId);
    let updatedManifest: ManifestStudent[] = [...currentManifest];

    if (existingIndex >= 0) {
      updatedManifest[existingIndex] = {
        ...updatedManifest[existingIndex],
        rsvpStatus: status,
        rsvpConfirmedAt: nowTime,
        studentUniversityId: updatedManifest[existingIndex].studentUniversityId || studentUser.universityId
      };
    } else if (status === 'confirmed') {
      updatedManifest.push({
        studentId,
        studentName: studentUser.name,
        phone: studentUser.phone,
        stationId: studentStationId || 'st-default',
        stationNameAr: studentStationName || 'المحطة المعتمدة',
        rsvpStatus: 'confirmed',
        rsvpConfirmedAt: nowTime,
        boardedStatus: 'waiting',
        studentUniversityId: studentUser.universityId
      });
    }

    const updatedTrip: Trip = {
      ...tripData,
      manifest: updatedManifest
    };

    transaction.update(tripRef, { manifest: updatedManifest });
    return { success: true, trip: updatedTrip };
  });
}

/**
 * Persists an immutable AuditLog entry to Firestore /auditLogs/{id}.
 */
export async function persistAuditLog(log: AuditLog): Promise<void> {
  const sanitized = stripUndefinedDeep(log);
  await setDoc(doc(db, COLLECTIONS.AUDIT_LOGS, log.id), sanitized);
}

/**
 * Executes a verified, transactional Rollback of a reversible AuditLog entry.
 * Restores the target document's beforeState (or deletes it if beforeState === null)
 * and stamps rolledBackAt / rolledBackBy on the audit log entry.
 */
export async function runAuditRollbackTransaction(
  log: AuditLog,
  actor: User
): Promise<{ success: boolean; restoredData: Record<string, any> | null; rolledBackAt: string }> {
  if (!log.reversible || log.rolledBackAt || !log.targetCollection || !log.targetDocId) {
    throw new Error('هذا الإجراء غير قابل للتراجع أو تم التراجع عنه مسبقاً.');
  }

  const targetRef = doc(db, log.targetCollection, log.targetDocId);
  const logRef = doc(db, COLLECTIONS.AUDIT_LOGS, log.id);
  const rolledBackAt = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  await runTransaction(db, async (transaction) => {
    const logSnap = await transaction.get(logRef);
    if (logSnap.exists() && logSnap.data()?.rolledBackAt) {
      throw new Error('تم تنفيذ التراجع على هذا السجل مسبقاً.');
    }

    if (log.beforeState === null || log.beforeState === undefined) {
      transaction.delete(targetRef);
    } else {
      const sanitizedBefore = stripUndefinedDeep(log.beforeState);
      transaction.set(targetRef, sanitizedBefore);
    }

    if (logSnap.exists()) {
      transaction.update(logRef, {
        rolledBackAt,
        rolledBackBy: actor.name,
      });
    } else {
      transaction.set(
        logRef,
        stripUndefinedDeep({
          ...log,
          rolledBackAt,
          rolledBackBy: actor.name,
        })
      );
    }
  });

  return {
    success: true,
    restoredData: log.beforeState ?? null,
    rolledBackAt,
  };
}

/**
 * Transfers a user cleanly to another company inside a Firestore Transaction,
 * clearing old company-specific bindings (universityId, lineId, stationId, assignedBusId)
 * and removing them from non-completed trips in the previous company so records never mix.
 */
export async function transferUserCompanyTransaction(
  user: User,
  targetCompanyId: string,
  affectedTripIds: string[],
  driverRecordId?: string
): Promise<User> {
  const userRef = doc(db, COLLECTIONS.USERS, user.id);

  const transferredUser: User = {
    ...user,
    companyId: targetCompanyId,
    universityId: undefined,
    lineId: undefined,
    stationId: undefined,
    assignedBusId: undefined,
  };

  await runTransaction(db, async (transaction) => {
    const tripSnaps = await Promise.all(
      affectedTripIds.map(tid => transaction.get(doc(db, COLLECTIONS.TRIPS, tid)))
    );

    const driverSnap = driverRecordId
      ? await transaction.get(doc(db, COLLECTIONS.DRIVERS, driverRecordId))
      : null;

    // Update user doc (explicitly overwrite cleared fields as null/deleted via set without merge)
    transaction.set(userRef, stripUndefinedDeep(transferredUser));

    // Clean student from open/upcoming trips of previous company
    tripSnaps.forEach((snap, idx) => {
      if (!snap.exists()) return;
      const tData = snap.data() as Trip;
      const filteredManifest = (tData.manifest || []).filter(m => m.studentId !== user.id);
      transaction.update(doc(db, COLLECTIONS.TRIPS, affectedTripIds[idx]), {
        manifest: filteredManifest,
      });
    });

    // If user is a driver, move driver directory record to target company and detach bus
    if (driverRecordId && driverSnap && driverSnap.exists()) {
      const drvData = driverSnap.data() as Driver;
      transaction.set(
        doc(db, COLLECTIONS.DRIVERS, driverRecordId),
        stripUndefinedDeep({
          ...drvData,
          companyId: targetCompanyId,
          assignedBusId: undefined,
        })
      );
    }
  });

  return transferredUser;
}

