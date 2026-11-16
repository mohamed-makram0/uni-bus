import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  User,
  UserRole,
  University,
  Line,
  Station,
  Bus,
  Driver,
  Trip,
  TripTemplate,
  Subscription,
  Incident,
  ConsolidationProposal,
  AuditLog,
  SystemSettings,
  ExceptionalBookingRequest,
  DailySlotDemand,
  ManifestStudent,
  TripStopStatus,
  Company,
  SaveDiagnosticError,
  StaffInvite,
  PublicCompanyDirectoryEntry
} from '../types';
import {
  initialSettings
} from '../data/mockData';
import { dataService, DataValidationError } from '../services/dataService';
import {
  safeAdminSeedFirestore,
  seedTwoTestCompanies,
  subscribeToCollection,
  subscribeToQuery,
  persistDocument,
  deleteDocument,
  atomicConfirmStudentRsvp,
  persistAuditLog,
  runAuditRollbackTransaction,
  transferUserCompanyTransaction,
  syncCompanyDirectoryEntry,
  syncPhoneDirectoryEntry,
  removePhoneDirectoryEntry,
  emailToInviteId,
  COLLECTIONS,
  DEFAULT_COMPANY_ID,
  SeedingResult
} from '../services/firestoreDb';
import {
  logoutUser,
  claimPendingStaffInviteIfAny,
  restoreSavedPhoneUser,
  savePhoneSessionLocally
} from '../services/authService';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, testFirestoreConnection } from '../services/firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';

export function getCairoTodayDateString(offsetDays = 0): string {
  try {
    const base = new Date(Date.now() + offsetDays * 86400000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(base);
  } catch {
    const base = new Date(Date.now() + offsetDays * 86400000);
    return base.toISOString().slice(0, 10);
  }
}

const belongsToCompany = (item: { companyId?: string } | undefined | null, companyId: string) => {
  if (!item) return false;
  return (item.companyId || DEFAULT_COMPANY_ID) === companyId;
};

const GUEST_USER: User = {
  id: 'guest',
  companyId: DEFAULT_COMPANY_ID,
  name: 'زائر غير مسجل',
  phone: '',
  email: '',
  role: 'student',
  status: 'pending_approval',
};

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextType {
  currentUser: User;
  authenticatedUser: User | null;
  isAuthReady: boolean;
  isAuthenticated: boolean;
  refreshCurrentUserProfile: () => Promise<void>;
  setCurrentUser: (user: User) => void;
  switchRole: (role: UserRole) => void;
  logout: () => Promise<void>;
  triggerAdminSeed: () => Promise<SeedingResult>;
  users: User[];
  universities: University[];
  lines: Line[];
  buses: Bus[];
  drivers: Driver[];
  trips: Trip[];
  tripTemplates: TripTemplate[];
  subscriptions: Subscription[];
  incidents: Incident[];
  proposals: ConsolidationProposal[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
  toasts: ToastMessage[];
  addToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // Operational Date & Archiving
  activeOperatingDate: string;
  setActiveOperatingDate: (date: string) => void;
  availableOperatingDates: string[];
  startNewOperatingDay: (newDate: string) => void;

  // Cutoff & Next-day registration
  isCutoffPassedForTomorrow: boolean;
  toggleSimulateCutoff: () => void;
  exceptionalRequests: ExceptionalBookingRequest[];
  submitExceptionalBooking: (request: Omit<ExceptionalBookingRequest, 'id' | 'requestedAt' | 'status'>) => Promise<void>;
  approveExceptionalBooking: (requestId: string, targetTripId?: string) => void;
  rejectExceptionalBooking: (requestId: string) => void;

  // Demand Planning & Vehicle auto-assignment
  autoAssignBusesForPlan: (planDate: string) => void;
  approveDailyPlan: (planDate: string) => void;
  toggleStudentAssignmentMode: () => void;
  autoAllocateStudentsToSlotBuses: (slotFilter?: { date: string; lineId?: string; scheduledTime?: string }) => void;

  // Batch actions
  batchUpdateStudentBoarding: (tripId: string, studentIds: string[], status: 'boarded' | 'waiting' | 'no_show') => void;
  reassignStudentToTrip: (currentTripId: string, targetTripId: string, studentId: string) => Promise<boolean>;

  // Universities CRUD
  createUniversity: (data: Omit<University, 'id' | 'totalStudents'>) => void;
  updateUniversity: (id: string, data: Partial<University>) => void;
  toggleUniversityStatus: (id: string) => void;
  deleteUniversity: (id: string) => void;

  // Buses CRUD
  createBus: (data: Omit<Bus, 'id'>) => void;
  updateBus: (id: string, data: Partial<Bus>) => void;
  toggleBusStatus: (id: string) => void;
  deleteBus: (id: string) => void;

  // Lines & Stations CRUD
  createLine: (data: Omit<Line, 'id' | 'stations'>) => void;
  updateLine: (id: string, data: Partial<Line>) => void;
  toggleLineStatus: (id: string) => void;
  deleteLine: (id: string) => void;
  addStationToLine: (lineId: string, stationData: { nameAr: string; scheduledMinutesFromStart: number }) => void;
  reorderStation: (lineId: string, stationId: string, direction: 'up' | 'down') => void;
  deleteStationFromLine: (lineId: string, stationId: string) => void;

  // Trip Templates (Schedule Management)
  createTripTemplate: (data: Omit<TripTemplate, 'id' | 'isDefault'>) => void;
  updateTripTemplate: (id: string, data: Partial<TripTemplate>) => void;
  toggleTripTemplateStatus: (id: string) => void;
  deleteTripTemplate: (id: string) => void;

  // Users & Roles
  updateUserRole: (targetUserId: string, newRole: UserRole) => void;
  toggleUserStatus: (targetUserId: string) => void;

  // Operations
  confirmStudentRsvp: (tripId: string, studentId: string, status: 'confirmed' | 'excused') => void;
  setStudentReturnReady: (date: string, studentId: string, ready: boolean) => Promise<void>;
  driverUpdateStop: (tripId: string, stopId: string, action: 'arrive' | 'depart') => void;
  driverToggleStopCheck: (tripId: string, stopId: string) => void;
  driverConfirmReturnDeparture: (tripId: string) => Promise<void>;
  driverCheckInStudent: (tripId: string, studentId: string, actualStation?: { id: string; nameAr: string }) => void;
  driverBoardWaitingStudent: (
    tripId: string,
    student: {
      studentId: string;
      studentName: string;
      phone: string;
      stationId?: string;
      stationNameAr?: string;
      studentUniversityId?: string;
      studentUniversityNameAr?: string;
    }
  ) => Promise<void>;
  dispatchWaitingReturnBus: (tripId: string, consolidateFromTripIds?: string[]) => Promise<void>;
  consolidateWaitingBusesOnly: (targetTripId: string, donorTripIds: string[]) => Promise<void>;
  markCrossUniversityHandoff: (tripId: string, studentIds: string[], note?: string) => Promise<void>;
  allocateWaitingReturnBus: (payload: {
    universityId: string;
    lineId?: string;
    busId?: string;
    driverId?: string;
    scheduledTime?: string;
    adHocDriverName?: string;
    adHocDriverPhone?: string;
    adHocBusPlate?: string;
    adHocCapacity?: number;
  }) => Promise<Trip | undefined>;
  supervisorQuickSwapOrEmergency: (
    tripId: string,
    payload: {
      mode: 'existing' | 'unregistered' | 'new_driver';
      newBusId?: string;
      newDriverId?: string;
      adHocDriverName?: string;
      adHocDriverPhone?: string;
      adHocBusPlate?: string;
      adHocCapacity?: number;
      newDriverEmail?: string;
      reason: string;
    }
  ) => Promise<void>;
  reportIncident: (incident: Omit<Incident, 'id' | 'createdAt' | 'status'>) => void;
  swapBusOrDriver: (tripId: string, newBusId: string, newDriverId: string, reason: string) => void;
  approveConsolidation: (proposalId: string) => void;
  rejectConsolidation: (proposalId: string) => void;
  importWhatsappAttendance: (rawText: string, tripId: string) => Promise<{ matched: number; unassigned: number }>;
  approveStudentRegistration: (userId: string) => void;
  rejectPendingRegistration: (userId: string) => Promise<void>;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  createTrip: (newTrip: Partial<Trip>) => void;

  // Platform Super Admin & Multi-Tenant Management
  companies: Company[];
  publicCompanyDirectory: PublicCompanyDirectoryEntry[];
  staffInvites: StaffInvite[];
  cancelStaffInvite: (inviteId: string) => Promise<void>;
  activeCompanyId: string;
  activeCompany: Company | null;
  setActiveCompanyId: (companyId: string) => void;
  isCompanySuspended: boolean;
  previewRole: UserRole | null;
  setPreviewRole: (role: UserRole | null) => void;
  isPreviewMode: boolean;
  impersonatedUser: User | null;
  enterUserAccount: (userId: string) => void;
  exitUserAccount: () => void;
  canSwitchRoles: boolean;
  allUsers: User[];
  allTrips: Trip[];
  platformAuditLogs: AuditLog[];
  saveDiagnostics: SaveDiagnosticError[];
  clearSaveDiagnostics: () => void;
  createCompany: (data: Omit<Company, 'id' | 'createdAt'>) => Promise<Company>;
  updateCompany: (companyId: string, data: Partial<Company>, reason?: string) => Promise<void>;
  toggleCompanyStatus: (companyId: string, reason?: string) => Promise<void>;
  seedTwoTestCompaniesAction: () => Promise<SeedingResult>;
  backfillLegacyCompanyAction: () => Promise<number>;
  createCompanyUser: (data: Omit<User, 'id' | 'companyId'> & { companyId?: string; licenseNumber?: string }, reason?: string) => Promise<User>;
  updateUserDetails: (userId: string, data: Partial<User>, reason?: string) => Promise<void>;
  transferUserToCompany: (userId: string, targetCompanyId: string, reason: string) => Promise<void>;
  deleteUserSafe: (userId: string, reason: string) => Promise<void>;
  updateTripDetails: (tripId: string, data: Partial<Trip>, reason?: string) => Promise<void>;
  addStudentToTrip: (tripId: string, student: User, reason?: string) => Promise<void>;
  removeStudentFromTrip: (tripId: string, studentId: string, reason?: string) => Promise<void>;
  splitMergedTrip: (mergedTripId: string, reason?: string) => Promise<void>;
  deleteTripSafe: (tripId: string, reason: string) => Promise<void>;
  rollbackAuditLog: (logId: string, reason: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [publicCompanyDirectory, setPublicCompanyDirectory] = useState<PublicCompanyDirectoryEntry[]>([]);
  const [allStaffInvites, setAllStaffInvites] = useState<StaffInvite[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string>(DEFAULT_COMPANY_ID);
  const [previewRole, setPreviewRoleState] = useState<UserRole | null>(null);
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null);
  const [saveDiagnostics, setSaveDiagnostics] = useState<SaveDiagnosticError[]>([]);
  const attachAuthListenersRef = React.useRef<((profile: User) => void) | null>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [allUniversities, setAllUniversities] = useState<University[]>([]);
  const [allLines, setAllLines] = useState<Line[]>([]);
  const [allBuses, setAllBuses] = useState<Bus[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [allTripTemplates, setAllTripTemplates] = useState<TripTemplate[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [allProposals, setAllProposals] = useState<ConsolidationProposal[]>([]);
  const [allAuditLogs, setAllAuditLogs] = useState<AuditLog[]>([]);
  const [settingsById, setSettingsById] = useState<Record<string, SystemSettings>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Operational Date Management anchored dynamically to Cairo today
  const [activeOperatingDate, setActiveOperatingDate] = useState<string>(() => getCairoTodayDateString(0));
  const [allExceptionalRequests, setAllExceptionalRequests] = useState<ExceptionalBookingRequest[]>([]);

  const isAuthenticated = Boolean(authenticatedUser);

  const setActiveCompanyId = (companyId: string) => {
    setActiveCompanyIdState(companyId);
    setPreviewRoleState(null);
  };

  const companies = useMemo(() => {
    const hasLegacy =
      allUsers.some(u => belongsToCompany(u, DEFAULT_COMPANY_ID)) ||
      allUniversities.some(u => belongsToCompany(u, DEFAULT_COMPANY_ID)) ||
      allTrips.some(t => belongsToCompany(t, DEFAULT_COMPANY_ID));
    if (!allCompanies.some(c => c.id === DEFAULT_COMPANY_ID) && hasLegacy) {
      const today = getCairoTodayDateString(0);
      const legacyCompany: Company = {
        id: DEFAULT_COMPANY_ID,
        nameAr: 'شركة UniBus مصر الرئيسية',
        code: 'UNIBUS-EG',
        ownerAdminName: 'خالد عبد الرحمن',
        ownerAdminEmail: 'admin@unibusegypt.com',
        contactPhone: '01000000001',
        planName: 'enterprise',
        monthlyPriceEgp: 4500,
        durationMonths: 12,
        startDate: today,
        endDate: getCairoTodayDateString(365),
        paymentStatus: 'paid',
        status: 'active',
        createdAt: today,
      };
      return [legacyCompany, ...allCompanies];
    }
    return [...allCompanies].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  }, [allCompanies, allUsers, allUniversities, allTrips]);

  const activeCompany = useMemo(
    () => companies.find(c => c.id === activeCompanyId) || companies[0] || null,
    [companies, activeCompanyId]
  );

  const isCompanySuspended = Boolean(
    authenticatedUser &&
      authenticatedUser.role !== 'super_admin' &&
      (activeCompany?.status === 'suspended' ||
        publicCompanyDirectory.find(c => c.id === activeCompanyId)?.status === 'suspended')
  );

  // Scoped tenant collections for the active company
  const users = useMemo(() => allUsers.filter(u => belongsToCompany(u, activeCompanyId)), [allUsers, activeCompanyId]);
  const universities = useMemo(() => allUniversities.filter(u => belongsToCompany(u, activeCompanyId)), [allUniversities, activeCompanyId]);
  const lines = useMemo(() => allLines.filter(l => belongsToCompany(l, activeCompanyId)), [allLines, activeCompanyId]);
  const buses = useMemo(() => allBuses.filter(b => belongsToCompany(b, activeCompanyId)), [allBuses, activeCompanyId]);
  const drivers = useMemo(() => allDrivers.filter(d => belongsToCompany(d, activeCompanyId)), [allDrivers, activeCompanyId]);
  const trips = useMemo(() => allTrips.filter(t => belongsToCompany(t, activeCompanyId)), [allTrips, activeCompanyId]);
  const tripTemplates = useMemo(() => allTripTemplates.filter(t => belongsToCompany(t, activeCompanyId)), [allTripTemplates, activeCompanyId]);
  const subscriptions = useMemo(() => allSubscriptions.filter(s => belongsToCompany(s, activeCompanyId)), [allSubscriptions, activeCompanyId]);
  const incidents = useMemo(() => allIncidents.filter(i => belongsToCompany(i, activeCompanyId)), [allIncidents, activeCompanyId]);
  const proposals = useMemo(() => allProposals.filter(p => belongsToCompany(p, activeCompanyId)), [allProposals, activeCompanyId]);
  const exceptionalRequests = useMemo(
    () => allExceptionalRequests.filter(r => belongsToCompany(r, activeCompanyId)),
    [allExceptionalRequests, activeCompanyId]
  );

  const platformAuditLogs = useMemo(
    () => [...allAuditLogs].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)),
    [allAuditLogs]
  );

  const auditLogs = useMemo(
    () => platformAuditLogs.filter(l => belongsToCompany(l, activeCompanyId)),
    [platformAuditLogs, activeCompanyId]
  );

  const activeSettingsDocId = activeCompanyId === DEFAULT_COMPANY_ID ? 'system' : `company_${activeCompanyId}`;
  const settings = useMemo<SystemSettings>(() => {
    const companySpecific = settingsById[`company_${activeCompanyId}`];
    const systemFallback = activeCompanyId === DEFAULT_COMPANY_ID ? settingsById['system'] : undefined;
    return companySpecific || systemFallback || { ...initialSettings, companyId: activeCompanyId };
  }, [settingsById, activeCompanyId]);

  const impersonatedUser = useMemo<User | null>(() => {
    if (authenticatedUser?.role !== 'super_admin' || !impersonatedUserId) return null;
    return allUsers.find(u => u.id === impersonatedUserId) || null;
  }, [authenticatedUser, impersonatedUserId, allUsers]);

  const canSwitchRoles = Boolean(
    authenticatedUser &&
      (authenticatedUser.role === 'admin' ||
        authenticatedUser.role === 'super_admin' ||
        (authenticatedUser.role === 'supervisor' && authenticatedUser.isGeneralSupervisor))
  );

  const currentUser = useMemo<User>(() => {
    if (!authenticatedUser) return GUEST_USER;
    if (impersonatedUser && authenticatedUser.role === 'super_admin') {
      return { ...impersonatedUser, companyId: impersonatedUser.companyId || activeCompanyId };
    }
    if (previewRole && canSwitchRoles) {
      if (previewRole === authenticatedUser.role) {
        return { ...authenticatedUser, companyId: activeCompanyId };
      }
      const match = users.find(u => u.role === previewRole);
      if (match) return { ...match, companyId: activeCompanyId };
      return {
        ...authenticatedUser,
        companyId: activeCompanyId,
        role: previewRole,
        universityId: universities[0]?.id,
        lineId: lines[0]?.id,
        stationId: lines[0]?.stations[0]?.id,
        assignedBusId: buses[0]?.id,
      };
    }
    if (authenticatedUser.role === 'super_admin') {
      return { ...authenticatedUser, companyId: activeCompanyId };
    }
    return authenticatedUser;
  }, [authenticatedUser, impersonatedUser, previewRole, canSwitchRoles, users, universities, lines, buses, activeCompanyId]);

  const isPreviewMode = Boolean(previewRole);

  const phoneUserListenerRef = React.useRef<(() => void) | null>(null);

  const attachPhoneUserSelfListener = (userId: string) => {
    if (phoneUserListenerRef.current) {
      phoneUserListenerRef.current();
      phoneUserListenerRef.current = null;
    }
    phoneUserListenerRef.current = onSnapshot(
      doc(db, COLLECTIONS.USERS, userId),
      (snap) => {
        if (!snap.exists()) return;
        const fresh = { ...snap.data(), id: snap.id } as User;
        savePhoneSessionLocally(fresh);
        setAuthenticatedUser(prev => {
          const prevStatus = prev?.status;
          const prevRole = prev?.role;
          if (prevStatus !== fresh.status || prevRole !== fresh.role || prev?.companyId !== fresh.companyId) {
            attachAuthListenersRef.current?.(fresh);
          }
          return fresh;
        });
      },
      (err) => console.warn('Phone user status listener notice:', err.message)
    );
  };

  const setCurrentUser = (user: User) => {
    setAuthenticatedUser(user);
    setActiveCompanyIdState(user.companyId || DEFAULT_COMPANY_ID);
    setPreviewRoleState(null);
    setImpersonatedUserId(null);
    if (!auth.currentUser) {
      savePhoneSessionLocally(user);
      attachPhoneUserSelfListener(user.id);
    }
    attachAuthListenersRef.current?.(user);
  };

  const refreshCurrentUserProfile = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      const phoneFresh = await restoreSavedPhoneUser();
      if (phoneFresh) {
        setAuthenticatedUser(phoneFresh);
        setActiveCompanyIdState(phoneFresh.companyId || DEFAULT_COMPANY_ID);
        attachPhoneUserSelfListener(phoneFresh.id);
        attachAuthListenersRef.current?.(phoneFresh);
      }
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, fbUser.uid));
      const existing = userDoc.exists() ? ({ ...userDoc.data(), id: fbUser.uid } as User) : null;
      const claimed = await claimPendingStaffInviteIfAny(fbUser, existing);
      const finalProfile = claimed || existing;
      if (finalProfile) {
        setAuthenticatedUser(finalProfile);
        if (finalProfile.role !== 'super_admin') {
          setActiveCompanyIdState(finalProfile.companyId || DEFAULT_COMPANY_ID);
        }
        attachAuthListenersRef.current?.(finalProfile);
      }
    } catch (e) {
      console.warn('Could not refresh user profile:', e);
    }
  };

  // Authentication session restoration & Role-scoped Real-time Firestore synchronization
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    // Validate connection to Firestore server on boot
    void testFirestoreConnection();

    const clearLiveState = () => {
      setAllCompanies([]);
      setAllStaffInvites([]);
      setAllUsers([]);
      setAllBuses([]);
      setAllDrivers([]);
      setAllTrips([]);
      setAllTripTemplates([]);
      setAllSubscriptions([]);
      setAllIncidents([]);
      setAllProposals([]);
      setAllExceptionalRequests([]);
      setAllAuditLogs([]);
      setSettingsById({});
      setPreviewRoleState(null);
    };

    const attachPublicCatalogListeners = () => {
      unsubs.forEach(u => u());
      unsubs = [
        subscribeToCollection<PublicCompanyDirectoryEntry>(COLLECTIONS.COMPANY_DIRECTORY, setPublicCompanyDirectory),
        subscribeToCollection<University>(COLLECTIONS.UNIVERSITIES, setAllUniversities),
        subscribeToCollection<Line>(COLLECTIONS.ROUTES, setAllLines),
      ];
    };

    const attachAuthenticatedListeners = (profile: User) => {
      unsubs.forEach(u => u());
      const userCompanyId = profile.companyId || DEFAULT_COMPANY_ID;
      const isSuperAdminUser = profile.role === 'super_admin';
      const isOpsStaff = isSuperAdminUser || profile.role === 'admin' || profile.role === 'supervisor';

      if (isSuperAdminUser) {
        unsubs = [
          subscribeToCollection<PublicCompanyDirectoryEntry>(COLLECTIONS.COMPANY_DIRECTORY, setPublicCompanyDirectory),
          subscribeToCollection<StaffInvite>(COLLECTIONS.STAFF_INVITES, setAllStaffInvites),
          subscribeToCollection<Company>(COLLECTIONS.COMPANIES, setAllCompanies),
          subscribeToCollection<University>(COLLECTIONS.UNIVERSITIES, setAllUniversities),
          subscribeToCollection<Bus>(COLLECTIONS.BUSES, setAllBuses),
          subscribeToCollection<Line>(COLLECTIONS.ROUTES, setAllLines),
          subscribeToCollection<TripTemplate>(COLLECTIONS.TRIP_TEMPLATES, setAllTripTemplates),
          subscribeToCollection<Driver>(COLLECTIONS.DRIVERS, setAllDrivers),
          subscribeToCollection<Trip>(COLLECTIONS.TRIPS, setAllTrips),
          subscribeToCollection<Incident>(COLLECTIONS.INCIDENTS, setAllIncidents),
          subscribeToCollection<User>(COLLECTIONS.USERS, setAllUsers),
          subscribeToCollection<Subscription>(COLLECTIONS.SUBSCRIPTIONS, setAllSubscriptions),
          subscribeToCollection<ConsolidationProposal>(COLLECTIONS.PROPOSALS, setAllProposals),
          subscribeToCollection<ExceptionalBookingRequest>(COLLECTIONS.EXCEPTIONAL_REQUESTS, setAllExceptionalRequests),
          subscribeToCollection<AuditLog>(COLLECTIONS.AUDIT_LOGS, setAllAuditLogs),
          onSnapshot(
            collection(db, COLLECTIONS.SETTINGS),
            (snap) => {
              const map: Record<string, SystemSettings> = {};
              snap.docs.forEach(d => {
                map[d.id] = { ...initialSettings, ...d.data() } as SystemSettings;
              });
              setSettingsById(map);
            },
            (err) => console.warn('Settings collection listener notice:', err.message)
          )
        ];
        return;
      }

      if (profile.status === 'pending_approval' && !isSuperAdminUser) {
        attachPublicCatalogListeners();
        return;
      }

      // Company-scoped listeners matching firestore.rules belongsToUserCompany static validation
      const companyQuery = (colName: string) =>
        query(collection(db, colName), where('companyId', '==', userCompanyId));

      const settingsDocId = userCompanyId === DEFAULT_COMPANY_ID ? 'system' : `company_${userCompanyId}`;

      const baseUnsubs: (() => void)[] = [];
      if (auth.currentUser) {
        baseUnsubs.push(
          onSnapshot(
            doc(db, COLLECTIONS.COMPANIES, userCompanyId),
            (snap) => {
              if (snap.exists()) {
                setAllCompanies([{ ...snap.data(), id: snap.id } as Company]);
              } else {
                setAllCompanies([]);
              }
            },
            (err) => console.warn('Company doc listener notice:', err.message)
          )
        );
      }

      baseUnsubs.push(
        subscribeToQuery<University>(companyQuery(COLLECTIONS.UNIVERSITIES), 'universities:company', setAllUniversities),
        subscribeToQuery<Line>(companyQuery(COLLECTIONS.ROUTES), 'routes:company', setAllLines),
        subscribeToQuery<Bus>(companyQuery(COLLECTIONS.BUSES), 'buses:company', setAllBuses),
        subscribeToQuery<TripTemplate>(companyQuery(COLLECTIONS.TRIP_TEMPLATES), 'tripTemplates:company', setAllTripTemplates),
        subscribeToQuery<Driver>(companyQuery(COLLECTIONS.DRIVERS), 'drivers:company', setAllDrivers),
        subscribeToQuery<Trip>(companyQuery(COLLECTIONS.TRIPS), 'trips:company', setAllTrips),
        subscribeToQuery<Incident>(companyQuery(COLLECTIONS.INCIDENTS), 'incidents:company', setAllIncidents),
        onSnapshot(
          doc(db, COLLECTIONS.SETTINGS, settingsDocId),
          (snap) => {
            if (snap.exists()) {
              setSettingsById(prev => ({
                ...prev,
                [settingsDocId]: { ...initialSettings, ...snap.data() } as SystemSettings
              }));
            }
          },
          (err) => console.warn('Settings listener notice:', err.message)
        )
      );

      if (isOpsStaff && auth.currentUser) {
        baseUnsubs.push(
          subscribeToQuery<User>(companyQuery(COLLECTIONS.USERS), 'users:company', setAllUsers),
          subscribeToQuery<Subscription>(companyQuery(COLLECTIONS.SUBSCRIPTIONS), 'subscriptions:company', setAllSubscriptions),
          subscribeToQuery<ConsolidationProposal>(companyQuery(COLLECTIONS.PROPOSALS), 'proposals:company', setAllProposals),
          subscribeToQuery<ExceptionalBookingRequest>(companyQuery(COLLECTIONS.EXCEPTIONAL_REQUESTS), 'exceptionalRequests:company', setAllExceptionalRequests),
          subscribeToQuery<AuditLog>(companyQuery(COLLECTIONS.AUDIT_LOGS), 'auditLogs:company', setAllAuditLogs)
        );
        if (profile.role === 'admin') {
          baseUnsubs.push(
            subscribeToQuery<StaffInvite>(companyQuery(COLLECTIONS.STAFF_INVITES), 'staffInvites:company', setAllStaffInvites)
          );
        }
      } else {
        setAllUsers([profile]);
        setAllProposals([]);
        setAllAuditLogs([]);
        setAllStaffInvites([]);
        baseUnsubs.push(
          subscribeToQuery<Subscription>(
            query(collection(db, COLLECTIONS.SUBSCRIPTIONS), where('studentId', '==', profile.id)),
            'subscriptions:own',
            setAllSubscriptions
          ),
          subscribeToQuery<ExceptionalBookingRequest>(
            query(collection(db, COLLECTIONS.EXCEPTIONAL_REQUESTS), where('studentId', '==', profile.id)),
            'exceptionalRequests:own',
            setAllExceptionalRequests
          )
        );
      }

      baseUnsubs.push(
        subscribeToCollection<PublicCompanyDirectoryEntry>(COLLECTIONS.COMPANY_DIRECTORY, setPublicCompanyDirectory)
      );

      unsubs = baseUnsubs;
    };

    attachAuthListenersRef.current = attachAuthenticatedListeners;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        const savedPhoneUser = await restoreSavedPhoneUser();
        if (savedPhoneUser) {
          setAuthenticatedUser(savedPhoneUser);
          setActiveCompanyIdState(savedPhoneUser.companyId || DEFAULT_COMPANY_ID);
          attachPhoneUserSelfListener(savedPhoneUser.id);
          attachAuthenticatedListeners(savedPhoneUser);
          setIsAuthReady(true);
          return;
        }

        if (phoneUserListenerRef.current) {
          phoneUserListenerRef.current();
          phoneUserListenerRef.current = null;
        }
        setAuthenticatedUser(null);
        setActiveCompanyIdState(DEFAULT_COMPANY_ID);
        clearLiveState();
        attachPublicCatalogListeners();
        setIsAuthReady(true);
        return;
      }

      if (phoneUserListenerRef.current) {
        phoneUserListenerRef.current();
        phoneUserListenerRef.current = null;
      }

      try {
        const userRef = doc(db, COLLECTIONS.USERS, fbUser.uid);
        const userDoc = await getDoc(userRef);
        const isBootstrapOwner = (fbUser.email || '').toLowerCase() === 'khaled5ber5@gmail.com';
        const existing = userDoc.exists() ? ({ ...userDoc.data(), id: fbUser.uid } as User) : null;
        let profile: User;

        if (isBootstrapOwner) {
          if (existing && existing.role === 'super_admin' && existing.status === 'active') {
            profile = existing;
          } else {
            profile = {
              id: fbUser.uid,
              companyId: existing?.companyId || DEFAULT_COMPANY_ID,
              name: existing?.name || fbUser.displayName || 'مالك المنصة',
              phone: existing?.phone || fbUser.phoneNumber || '01000000000',
              email: fbUser.email || '',
              role: 'super_admin',
              status: 'active',
            };
            await setDoc(userRef, profile, { merge: true });
          }
        } else {
          const claimed = await claimPendingStaffInviteIfAny(fbUser, existing);
          if (claimed) {
            profile = claimed;
          } else if (existing) {
            profile = existing;
          } else {
            profile = {
              id: fbUser.uid,
              companyId: DEFAULT_COMPANY_ID,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'مستخدم مسجل',
              phone: fbUser.phoneNumber || '01000000000',
              email: fbUser.email || '',
              role: 'student',
              status: 'pending_approval',
            };
            await setDoc(userRef, profile, { merge: true });
          }
        }

        setAuthenticatedUser(profile);
        setActiveCompanyIdState(profile.companyId || DEFAULT_COMPANY_ID);
        attachAuthenticatedListeners(profile);
      } catch (e) {
        console.warn('Could not fetch user profile from Firestore:', e);
        setAuthenticatedUser(null);
        clearLiveState();
        attachPublicCatalogListeners();
      } finally {
        setIsAuthReady(true);
      }
    });

    return () => {
      attachAuthListenersRef.current = null;
      if (phoneUserListenerRef.current) {
        phoneUserListenerRef.current();
        phoneUserListenerRef.current = null;
      }
      unsubAuth();
      unsubs.forEach(u => u());
    };
  }, []);

  // Helper wrappers updating raw collections while preserving optimistic UI
  const setUniversities = (updater: React.SetStateAction<University[]>) => {
    setAllUniversities(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setLines = (updater: React.SetStateAction<Line[]>) => {
    setAllLines(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setBuses = (updater: React.SetStateAction<Bus[]>) => {
    setAllBuses(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setDrivers = (updater: React.SetStateAction<Driver[]>) => {
    setAllDrivers(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setTrips = (updater: React.SetStateAction<Trip[]>) => {
    setAllTrips(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setTripTemplates = (updater: React.SetStateAction<TripTemplate[]>) => {
    setAllTripTemplates(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setIncidents = (updater: React.SetStateAction<Incident[]>) => {
    setAllIncidents(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setProposals = (updater: React.SetStateAction<ConsolidationProposal[]>) => {
    setAllProposals(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setExceptionalRequests = (updater: React.SetStateAction<ExceptionalBookingRequest[]>) => {
    setAllExceptionalRequests(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setUsers = (updater: React.SetStateAction<User[]>) => {
    setAllUsers(prev => {
      const scoped = prev.filter(x => belongsToCompany(x, activeCompanyId));
      const others = prev.filter(x => !belongsToCompany(x, activeCompanyId));
      const nextScoped = typeof updater === 'function' ? updater(scoped) : updater;
      return [...nextScoped, ...others];
    });
  };
  const setSettings = (updater: React.SetStateAction<SystemSettings>) => {
    setSettingsById(prev => {
      const current = prev[activeSettingsDocId] || { ...initialSettings, companyId: activeCompanyId };
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeSettingsDocId]: { ...next, companyId: activeCompanyId } };
    });
  };

  // Available operating dates (dynamic Cairo yesterday/today/tomorrow + trip dates)
  const availableOperatingDates = useMemo(() => {
    const dates = new Set<string>([
      getCairoTodayDateString(-1),
      getCairoTodayDateString(0),
      getCairoTodayDateString(1),
    ]);
    trips.forEach(t => { if (t.date) dates.add(t.date); });
    return Array.from(dates).sort().reverse();
  }, [trips]);

  // 10:00 PM Cutoff check: simulated or actual Cairo time >= 22:00
  const isCutoffPassedForTomorrow = useMemo(() => {
    if (settings.simulateCutoffPassed) return true;
    try {
      const cairoHour = parseInt(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Cairo',
          hour: 'numeric',
          hour12: false
        }).format(new Date()),
        10
      );
      return cairoHour >= 22;
    } catch {
      return false;
    }
  }, [settings.simulateCutoffPassed]);

  const toggleSimulateCutoff = () => {
    const nextVal = !settings.simulateCutoffPassed;
    setSettings(prev => ({
      ...prev,
      simulateCutoffPassed: nextVal
    }));
    addToast(
      nextVal
        ? 'تمت محاكاة تجاوز موعد 10:00 م (التسجيل العادي للغد مغلق الآن، ويتطلب طلباً استثنائياً).'
        : 'تمت محاكاة ما قبل 10:00 م (التسجيل العادي للغد مفتوح الآن).',
      'info'
    );
  };

  const addToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const recordDiagnosticError = (operation: string, target: string, err: any) => {
    const item: SaveDiagnosticError = {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
      companyId: activeCompanyId,
      operation,
      target,
      message: err?.message || 'خطأ غير متوقع في الحفظ السحابي',
    };
    setSaveDiagnostics(prev => [item, ...prev].slice(0, 50));
  };

  const clearSaveDiagnostics = () => setSaveDiagnostics([]);

  const addAuditLog = (
    action: string,
    details: string,
    targetEntity: string,
    meta?: {
      targetCollection?: string;
      targetDocId?: string;
      beforeState?: Record<string, any> | null;
      afterState?: Record<string, any> | null;
      reversible?: boolean;
      interventionReason?: string;
      companyIdOverride?: string;
    }
  ) => {
    const targetCompId = meta?.companyIdOverride || activeCompanyId;
    const compObj = companies.find(c => c.id === targetCompId);
    const actor = authenticatedUser || currentUser;
    const impersonationSuffix = impersonatedUser
      ? ` [نيابةً عن حساب: ${impersonatedUser.name} (${impersonatedUser.role})]`
      : '';
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date()),
      createdAtMs: Date.now(),
      companyId: targetCompId,
      companyNameAr: compObj?.nameAr || targetCompId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      details: `${details}${impersonationSuffix}`,
      targetEntity,
      targetCollection: meta?.targetCollection,
      targetDocId: meta?.targetDocId,
      beforeState: meta?.beforeState,
      afterState: meta?.afterState,
      reversible: meta?.reversible ?? false,
      interventionReason: meta?.interventionReason || (impersonatedUser ? `تنفيذ من داخل حساب ${impersonatedUser.name} لحل مشكلة` : undefined),
    };
    setAllAuditLogs(prev => [newLog, ...prev]);
    if (authenticatedUser) {
      persistAuditLog(newLog).catch((err) => {
        console.warn('Could not persist AuditLog:', err);
      });
    }
  };

  const enterUserAccount = (userId: string) => {
    if (!authenticatedUser || authenticatedUser.role !== 'super_admin') {
      addToast('الدخول إلى حسابات المستخدمين حصري لمالك المنصة فقط.', 'error');
      return;
    }
    const target = allUsers.find(u => u.id === userId);
    if (!target) {
      addToast('تعذر العثور على حساب المستخدم المطلوب.', 'error');
      return;
    }
    if (target.companyId) {
      setActiveCompanyIdState(target.companyId);
    }
    setPreviewRoleState(null);
    setImpersonatedUserId(target.id);
    addAuditLog(
      'الدخول لحساب مستخدم (مالك المنصة)',
      `دخل مالك المنصة إلى حساب: ${target.name} (${target.role}) لإجراء تعديلات أو معالجة مشكلة`,
      `User: ${target.id}`,
      { companyIdOverride: target.companyId || activeCompanyId }
    );
    addToast(`أنت الآن داخل حساب (${target.name}) — جميع تعديلاتك تُنفذ فوراً بالنيابة عنه.`, 'info');
  };

  const exitUserAccount = () => {
    if (!impersonatedUserId) return;
    setImpersonatedUserId(null);
    addToast('تم الخروج من حساب المستخدم والعودة إلى صلاحية مالك المنصة.', 'info');
  };

  const setPreviewRole = (role: UserRole | null) => {
    if (!canSwitchRoles || !authenticatedUser) {
      addToast('معاينة الواجهات متاحة لمدير الشركة أو المشرف العام أو مالك المنصة فقط.', 'error');
      return;
    }
    if (role === null || role === authenticatedUser.role) {
      setPreviewRoleState(null);
      return;
    }
    setPreviewRoleState(role);
  };

  const switchRole = (role: UserRole) => {
    if (!canSwitchRoles || !authenticatedUser) {
      addToast('تبديل الواجهات متاح لمدير النظام أو المشرف العام فقط.', 'error');
      return;
    }
    if (role === authenticatedUser.role) {
      setPreviewRoleState(null);
      addToast(
        `تمت العودة إلى واجهتك الأساسية: ${
          role === 'super_admin' ? 'مالك المنصة' : role === 'supervisor' ? 'المشرف العام' : 'مدير الشركة'
        }`,
        'info'
      );
      return;
    }
    setPreviewRoleState(role);
    const roleLabel =
      role === 'admin'
        ? 'مدير الشركة'
        : role === 'supervisor'
        ? 'المشرف التشغيلي'
        : role === 'driver'
        ? 'السائق'
        : 'الطالب';
    addToast(`تم التبديل إلى واجهة: ${roleLabel} (مع الاحتفاظ بصلاحياتك الحقيقية)`, 'info');
  };

  const logout = async () => {
    await logoutUser();
    setAuthenticatedUser(null);
    setPreviewRoleState(null);
    setImpersonatedUserId(null);
    setActiveCompanyIdState(DEFAULT_COMPANY_ID);
  };

  const triggerAdminSeed = async (): Promise<SeedingResult> => {
    return await safeAdminSeedFirestore(authenticatedUser || currentUser, activeCompanyId);
  };

  // ==========================================
  // UNIVERSITIES CRUD
  // ==========================================
  const createUniversity = async (data: Omit<University, 'id' | 'totalStudents'>) => {
    try {
      dataService.validateUniversity(data, universities);
      const newUni: University = {
        ...data,
        companyId: activeCompanyId,
        id: `uni-${Date.now()}`,
        totalStudents: 0,
      };
      await persistDocument(COLLECTIONS.UNIVERSITIES, newUni.id, newUni);
      setUniversities(prev => [...prev, newUni]);
      addAuditLog('إضافة جامعة جديدة', `تمت إضافة جامعة: ${newUni.nameAr}`, `University: ${newUni.id}`, {
        targetCollection: COLLECTIONS.UNIVERSITIES,
        targetDocId: newUni.id,
        beforeState: null,
        afterState: newUni,
        reversible: true,
      });
      addToast(`تمت إضافة جامعة "${newUni.nameAr}" وحفظها بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('إضافة جامعة', COLLECTIONS.UNIVERSITIES, err);
      addToast(`فشل حفظ الجامعة في قاعدة البيانات: ${err.message || 'خطأ في الصلاحيات أو الاتصال'}`, 'error');
      throw err;
    }
  };

  const updateUniversity = async (id: string, data: Partial<University>) => {
    const before = universities.find(u => u.id === id);
    try {
      dataService.validateUniversity(data, universities, id);
      const payload = { ...data, companyId: before?.companyId || activeCompanyId };
      await persistDocument(COLLECTIONS.UNIVERSITIES, id, payload);
      const after = before ? { ...before, ...payload } : payload;
      setUniversities(prev => prev.map(u => u.id === id ? { ...u, ...payload } : u));
      addAuditLog('تعديل بيانات جامعة', `تم تعديل بيانات الجامعة: ${before?.nameAr || id}`, `University: ${id}`, {
        targetCollection: COLLECTIONS.UNIVERSITIES,
        targetDocId: id,
        beforeState: before || null,
        afterState: after,
        reversible: Boolean(before),
      });
      addToast('تم حفظ تعديلات الجامعة بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('تعديل جامعة', `${COLLECTIONS.UNIVERSITIES}/${id}`, err);
      addToast(`فشل تعديل الجامعة: ${err.message || 'خطأ في الحفظ'}`, 'error');
      throw err;
    }
  };

  const toggleUniversityStatus = async (id: string) => {
    const target = universities.find(u => u.id === id);
    if (!target) return;
    const nextStatus = !target.activeStatus;
    try {
      await persistDocument(COLLECTIONS.UNIVERSITIES, id, { activeStatus: nextStatus, companyId: target.companyId || activeCompanyId });
      const after = { ...target, activeStatus: nextStatus };
      setUniversities(prev => prev.map(u => u.id === id ? after : u));
      addAuditLog(
        nextStatus ? 'تفعيل جامعة' : 'إيقاف جامعة',
        `تم تغيير حالة الجامعة ${target.nameAr} إلى ${nextStatus ? 'نشطة' : 'متوقفة'}`,
        `University: ${id}`,
        {
          targetCollection: COLLECTIONS.UNIVERSITIES,
          targetDocId: id,
          beforeState: target,
          afterState: after,
          reversible: true,
        }
      );
      addToast(`تم ${nextStatus ? 'تفعيل' : 'إيقاف'} الجامعة بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تبديل حالة جامعة', `${COLLECTIONS.UNIVERSITIES}/${id}`, err);
      addToast(`فشل تحديث حالة الجامعة: ${err.message}`, 'error');
    }
  };

  const deleteUniversity = async (id: string) => {
    const check = dataService.canDeleteUniversity(id, lines, trips, users);
    if (!check.canDelete) {
      addToast(check.reason || 'لا يمكن حذف هذه الجامعة.', 'error');
      return;
    }
    const targetUni = universities.find(u => u.id === id);
    try {
      await deleteDocument(COLLECTIONS.UNIVERSITIES, id);
      setUniversities(prev => prev.filter(u => u.id !== id));
      addAuditLog('حذف جامعة', `تم حذف الجامعة: ${targetUni?.nameAr || id}`, `University: ${id}`, {
        targetCollection: COLLECTIONS.UNIVERSITIES,
        targetDocId: id,
        beforeState: targetUni || null,
        afterState: null,
        reversible: Boolean(targetUni),
      });
      addToast('تم حذف الجامعة بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('حذف جامعة', `${COLLECTIONS.UNIVERSITIES}/${id}`, err);
      addToast(`فشل حذف الجامعة: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // BUSES CRUD
  // ==========================================
  const createBus = async (data: Omit<Bus, 'id'>) => {
    try {
      dataService.validateBus(data, buses);
      const newBus: Bus = {
        ...data,
        companyId: activeCompanyId,
        id: `bus-${Date.now()}`,
        currentAssignedPassengers: 0,
      };
      await persistDocument(COLLECTIONS.BUSES, newBus.id, newBus);
      setBuses(prev => [...prev, newBus]);
      addAuditLog('إضافة باص جديد', `تمت إضافة باص: ${newBus.code} - لوحة: ${newBus.plateNumber} (سعة ${newBus.capacity})`, `Bus: ${newBus.id}`, {
        targetCollection: COLLECTIONS.BUSES,
        targetDocId: newBus.id,
        beforeState: null,
        afterState: newBus,
        reversible: true,
      });
      addToast(`تمت إضافة الباص (${newBus.code}) وحفظه بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('إضافة باص', COLLECTIONS.BUSES, err);
      addToast(`فشل حفظ الباص في السحابة: ${err.message || 'خطأ في الاتصال بقاعدة البيانات'}`, 'error');
      throw err;
    }
  };

  const updateBus = async (id: string, data: Partial<Bus>) => {
    const existingBus = buses.find(b => b.id === id);
    if (!existingBus) return;

    try {
      dataService.validateBus(data, buses, id);

      if (data.capacity && data.capacity < existingBus.capacity) {
        dataService.validateCapacityReduction(existingBus, data.capacity, trips);
      }

      const payload = { ...data, companyId: existingBus.companyId || activeCompanyId };
      await persistDocument(COLLECTIONS.BUSES, id, payload);
      const after = { ...existingBus, ...payload };
      setBuses(prev => prev.map(b => b.id === id ? after : b));
      addAuditLog('تعديل بيانات باص', `تم تعديل بيانات الباص ${existingBus.code}`, `Bus: ${id}`, {
        targetCollection: COLLECTIONS.BUSES,
        targetDocId: id,
        beforeState: existingBus,
        afterState: after,
        reversible: true,
      });
      addToast('تم تحديث بيانات الباص بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('تعديل باص', `${COLLECTIONS.BUSES}/${id}`, err);
      addToast(`فشل تعديل بيانات الباص: ${err.message}`, 'error');
      throw err;
    }
  };

  const toggleBusStatus = async (id: string) => {
    const b = buses.find(bus => bus.id === id);
    if (!b) return;
    const nextStatus = !b.activeStatus;
    const newStatusField = nextStatus ? 'available' : 'maintenance';

    try {
      await persistDocument(COLLECTIONS.BUSES, id, {
        activeStatus: nextStatus,
        status: newStatusField,
        companyId: b.companyId || activeCompanyId
      });
      const after: Bus = { ...b, activeStatus: nextStatus, status: newStatusField };
      setBuses(prev => prev.map(bus => bus.id === id ? after : bus));
      addAuditLog(
        nextStatus ? 'تفعيل باص' : 'إيقاف باص',
        `تم تغيير حالة الباص ${b.plateNumber} إلى ${nextStatus ? 'جاهز للعمل' : 'معطل/متوقف'}`,
        `Bus: ${id}`,
        {
          targetCollection: COLLECTIONS.BUSES,
          targetDocId: id,
          beforeState: b,
          afterState: after,
          reversible: true,
        }
      );
      addToast(`تم ${nextStatus ? 'تفعيل' : 'إيقاف'} الباص بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تبديل حالة باص', `${COLLECTIONS.BUSES}/${id}`, err);
      addToast(`فشل تحديث حالة الباص: ${err.message}`, 'error');
    }
  };

  const deleteBus = async (id: string) => {
    const check = dataService.canDeleteBus(id, trips);
    if (!check.canDelete) {
      addToast(check.reason || 'لا يمكن حذف الباص.', 'error');
      return;
    }
    const targetBus = buses.find(b => b.id === id);
    try {
      await deleteDocument(COLLECTIONS.BUSES, id);
      setBuses(prev => prev.filter(b => b.id !== id));
      addAuditLog('حذف باص', `تم حذف الباص ${targetBus?.code}`, `Bus: ${id}`, {
        targetCollection: COLLECTIONS.BUSES,
        targetDocId: id,
        beforeState: targetBus || null,
        afterState: null,
        reversible: Boolean(targetBus),
      });
      addToast('تم حذف الباص بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('حذف باص', `${COLLECTIONS.BUSES}/${id}`, err);
      addToast(`فشل حذف الباص من السحابة: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // LINES & STATIONS CRUD
  // ==========================================
  const createLine = async (data: Omit<Line, 'id' | 'stations'>) => {
    try {
      dataService.validateRoute(data, lines);
      const newLine: Line = {
        ...data,
        companyId: activeCompanyId,
        id: `line-${Date.now()}`,
        stations: [],
      };
      await persistDocument(COLLECTIONS.ROUTES, newLine.id, newLine);
      setLines(prev => [...prev, newLine]);
      addAuditLog('إنشاء خط سير', `تمت إضافة خط سير: ${newLine.nameAr} (${newLine.code})`, `Line: ${newLine.id}`, {
        targetCollection: COLLECTIONS.ROUTES,
        targetDocId: newLine.id,
        beforeState: null,
        afterState: newLine,
        reversible: true,
      });
      addToast(`تم إنشاء خط السير "${newLine.nameAr}" وحفظه بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('إنشاء خط سير', COLLECTIONS.ROUTES, err);
      addToast(`فشل حفظ خط السير: ${err.message}`, 'error');
      throw err;
    }
  };

  const updateLine = async (id: string, data: Partial<Line>) => {
    const before = lines.find(l => l.id === id);
    try {
      dataService.validateRoute(data, lines, id);
      const payload = { ...data, companyId: before?.companyId || activeCompanyId };
      await persistDocument(COLLECTIONS.ROUTES, id, payload);
      const after = before ? { ...before, ...payload } : payload;
      setLines(prev => prev.map(l => l.id === id ? { ...l, ...payload } : l));
      addAuditLog('تعديل خط سير', `تم تحديث خط السير: ${before?.nameAr || id}`, `Line: ${id}`, {
        targetCollection: COLLECTIONS.ROUTES,
        targetDocId: id,
        beforeState: before || null,
        afterState: after,
        reversible: Boolean(before),
      });
      addToast('تم حفظ تعديل خط السير بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('تعديل خط سير', `${COLLECTIONS.ROUTES}/${id}`, err);
      addToast(`فشل تعديل خط السير: ${err.message}`, 'error');
      throw err;
    }
  };

  const toggleLineStatus = async (id: string) => {
    const l = lines.find(line => line.id === id);
    if (!l) return;
    const nextStatus = !l.activeStatus;
    try {
      await persistDocument(COLLECTIONS.ROUTES, id, { activeStatus: nextStatus, companyId: l.companyId || activeCompanyId });
      const after = { ...l, activeStatus: nextStatus };
      setLines(prev => prev.map(line => line.id === id ? after : line));
      addAuditLog(
        nextStatus ? 'تفعيل خط سير' : 'إيقاف خط سير',
        `تم تغيير حالة الخط ${l.nameAr} إلى ${nextStatus ? 'نشط' : 'متوقف'}`,
        `Line: ${id}`,
        {
          targetCollection: COLLECTIONS.ROUTES,
          targetDocId: id,
          beforeState: l,
          afterState: after,
          reversible: true,
        }
      );
      addToast(`تم ${nextStatus ? 'تفعيل' : 'إيقاف'} خط السير.`);
    } catch (err: any) {
      recordDiagnosticError('تبديل حالة خط', `${COLLECTIONS.ROUTES}/${id}`, err);
      addToast(`فشل تحديث حالة خط السير: ${err.message}`, 'error');
    }
  };

  const deleteLine = async (id: string) => {
    const check = dataService.canDeleteRoute(id, trips, users);
    if (!check.canDelete) {
      addToast(check.reason || 'لا يمكن حذف خط السير.', 'error');
      return;
    }
    const targetLine = lines.find(l => l.id === id);
    try {
      await deleteDocument(COLLECTIONS.ROUTES, id);
      setLines(prev => prev.filter(l => l.id !== id));
      addAuditLog('حذف خط سير', `تم حذف خط السير ${targetLine?.nameAr}`, `Line: ${id}`, {
        targetCollection: COLLECTIONS.ROUTES,
        targetDocId: id,
        beforeState: targetLine || null,
        afterState: null,
        reversible: Boolean(targetLine),
      });
      addToast('تم حذف خط السير بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('حذف خط سير', `${COLLECTIONS.ROUTES}/${id}`, err);
      addToast(`فشل حذف خط السير: ${err.message}`, 'error');
    }
  };

  const addStationToLine = async (lineId: string, stationData: { nameAr: string; scheduledMinutesFromStart: number }) => {
    if (!stationData.nameAr.trim()) {
      addToast('اسم المحطة مطلوب.', 'error');
      return;
    }

    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    const newOrder = line.stations.length + 1;
    const newStation: Station = {
      id: `st-${Date.now()}`,
      lineId,
      nameAr: stationData.nameAr.trim(),
      orderIndex: newOrder,
      scheduledMinutesFromStart: stationData.scheduledMinutesFromStart || 0,
    };

    const updatedStations = [...line.stations, newStation];
    try {
      await persistDocument(COLLECTIONS.ROUTES, lineId, { stations: updatedStations });
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, stations: updatedStations } : l));
      addAuditLog('إضافة محطة لخط سير', `تمت إضافة محطة: ${stationData.nameAr} إلى الخط ${lineId}`, `Line: ${lineId}`);
      addToast(`تمت إضافة محطة "${stationData.nameAr}" بنجاح.`);
    } catch (err: any) {
      addToast(`فشل حفظ المحطة الجديدة: ${err.message}`, 'error');
    }
  };

  const reorderStation = async (lineId: string, stationId: string, direction: 'up' | 'down') => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    const index = line.stations.findIndex(s => s.id === stationId);
    if (index < 0) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === line.stations.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newStations = [...line.stations];
    const temp = newStations[index];
    newStations[index] = newStations[targetIndex];
    newStations[targetIndex] = temp;

    const updated = newStations.map((st, i) => ({ ...st, orderIndex: i + 1 }));
    try {
      await persistDocument(COLLECTIONS.ROUTES, lineId, { stations: updated });
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, stations: updated } : l));
      addToast('تم تحديث ترتيب المحطات بنجاح.');
    } catch (err: any) {
      addToast(`فشل حفظ ترتيب المحطات: ${err.message}`, 'error');
    }
  };

  const deleteStationFromLine = async (lineId: string, stationId: string) => {
    const check = dataService.canDeleteStation(stationId, trips, users);
    if (!check.canDelete) {
      addToast(check.reason || 'لا يمكن حذف المحطة.', 'error');
      return;
    }

    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    const filtered = line.stations.filter(s => s.id !== stationId);
    const reordered = filtered.map((s, i) => ({ ...s, orderIndex: i + 1 }));

    try {
      await persistDocument(COLLECTIONS.ROUTES, lineId, { stations: reordered });
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, stations: reordered } : l));
      addAuditLog('حذف محطة من خط', `تم حذف محطة ${stationId} من الخط ${lineId}`, `Line: ${lineId}`);
      addToast('تم حذف المحطة بنجاح.');
    } catch (err: any) {
      addToast(`فشل حذف المحطة: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // TRIP TEMPLATES (SCHEDULES) CRUD
  // ==========================================
  const createTripTemplate = async (data: Omit<TripTemplate, 'id' | 'isDefault'>) => {
    try {
      dataService.validateTripTemplate(data, tripTemplates);
      const newTmpl: TripTemplate = {
        ...data,
        companyId: activeCompanyId,
        id: `tmpl-${Date.now()}`,
        isDefault: false,
      };
      await persistDocument(COLLECTIONS.TRIP_TEMPLATES, newTmpl.id, newTmpl);
      setTripTemplates(prev => [...prev, newTmpl]);
      addAuditLog('إضافة موعد رحلة', `تمت إضافة موعد رحلة: ${newTmpl.time} (${newTmpl.direction === 'to_university' ? 'ذهاب' : 'عودة'})`, `Schedule: ${newTmpl.id}`, {
        targetCollection: COLLECTIONS.TRIP_TEMPLATES,
        targetDocId: newTmpl.id,
        beforeState: null,
        afterState: newTmpl,
        reversible: true,
      });
      addToast(`تمت إضافة موعد الرحلة (${newTmpl.time}) وحفظه بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('إضافة موعد رحلة', COLLECTIONS.TRIP_TEMPLATES, err);
      addToast(`فشل حفظ موعد الرحلة: ${err.message}`, 'error');
      throw err;
    }
  };

  const updateTripTemplate = async (id: string, data: Partial<TripTemplate>) => {
    const before = tripTemplates.find(t => t.id === id);
    try {
      dataService.validateTripTemplate(data, tripTemplates, id);
      const payload = { ...data, companyId: before?.companyId || activeCompanyId };
      await persistDocument(COLLECTIONS.TRIP_TEMPLATES, id, payload);
      const after = before ? { ...before, ...payload } : payload;
      setTripTemplates(prev => prev.map(t => t.id === id ? { ...t, ...payload } : t));
      addAuditLog('تعديل موعد رحلة', `تم تعديل موعد الرحلة: ${before?.time || id}`, `Schedule: ${id}`, {
        targetCollection: COLLECTIONS.TRIP_TEMPLATES,
        targetDocId: id,
        beforeState: before || null,
        afterState: after,
        reversible: Boolean(before),
      });
      addToast('تم تحديث موعد الرحلة بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('تعديل موعد رحلة', `${COLLECTIONS.TRIP_TEMPLATES}/${id}`, err);
      addToast(`فشل تعديل موعد الرحلة: ${err.message}`, 'error');
      throw err;
    }
  };

  const toggleTripTemplateStatus = async (id: string) => {
    const t = tripTemplates.find(tmpl => tmpl.id === id);
    if (!t) return;
    const nextStatus = !t.activeStatus;
    try {
      await persistDocument(COLLECTIONS.TRIP_TEMPLATES, id, { activeStatus: nextStatus, companyId: t.companyId || activeCompanyId });
      const after = { ...t, activeStatus: nextStatus };
      setTripTemplates(prev => prev.map(tmpl => tmpl.id === id ? after : tmpl));
      addAuditLog(
        nextStatus ? 'تفعيل موعد رحلة' : 'إيقاف موعد رحلة',
        `تم تغيير حالة الموعد ${t.time} إلى ${nextStatus ? 'نشط' : 'متوقف'}`,
        `Schedule: ${id}`,
        {
          targetCollection: COLLECTIONS.TRIP_TEMPLATES,
          targetDocId: id,
          beforeState: t,
          afterState: after,
          reversible: true,
        }
      );
      addToast(`تم ${nextStatus ? 'تفعيل' : 'إيقاف'} موعد الرحلة بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تبديل حالة موعد', `${COLLECTIONS.TRIP_TEMPLATES}/${id}`, err);
      addToast(`فشل تغيير حالة الموعد: ${err.message}`, 'error');
    }
  };

  const deleteTripTemplate = async (id: string) => {
    const before = tripTemplates.find(t => t.id === id);
    try {
      await deleteDocument(COLLECTIONS.TRIP_TEMPLATES, id);
      setTripTemplates(prev => prev.filter(t => t.id !== id));
      addAuditLog('حذف موعد رحلة', `تم حذف موعد الرحلة ${before?.time || id}`, `Schedule: ${id}`, {
        targetCollection: COLLECTIONS.TRIP_TEMPLATES,
        targetDocId: id,
        beforeState: before || null,
        afterState: null,
        reversible: Boolean(before),
      });
      addToast('تم حذف موعد الرحلة بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('حذف موعد رحلة', `${COLLECTIONS.TRIP_TEMPLATES}/${id}`, err);
      addToast(`فشل حذف موعد الرحلة: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // USERS & ROLES
  // ==========================================
  const updateUserRole = async (targetUserId: string, newRole: UserRole) => {
    const actor = authenticatedUser || currentUser;
    const targetUser = allUsers.find(u => u.id === targetUserId) || users.find(u => u.id === targetUserId);
    try {
      dataService.validateRoleChange(actor, targetUserId, newRole, targetUser?.role);
      await persistDocument(COLLECTIONS.USERS, targetUserId, { role: newRole });
      const after = targetUser ? { ...targetUser, role: newRole } : { id: targetUserId, role: newRole };
      if (targetUser) {
        await syncPhoneDirectoryEntry({ ...targetUser, role: newRole }).catch(() => {});
      }
      setAllUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));

      // Auto-register Driver directory entry when promoting a user to driver so trips link cleanly
      if (newRole === 'driver') {
        const existingDriver = drivers.find(d => d.userId === targetUserId || d.id === `drv-${targetUserId}`);
        if (!existingDriver && targetUser) {
          const newDriver: Driver = {
            id: `drv-${targetUserId}`,
            companyId: targetUser.companyId || activeCompanyId,
            userId: targetUserId,
            nameAr: targetUser.name,
            phone: targetUser.phone || '01000000000',
            licenseNumber: 'DL-REG',
            status: 'active',
          };
          await persistDocument(COLLECTIONS.DRIVERS, newDriver.id, newDriver);
          setAllDrivers(prev => [...prev, newDriver]);
        }
      }

      addAuditLog('تغيير دور مستخدم', `تم تغيير دور المستخدم ${targetUser?.name || targetUserId} إلى ${newRole}`, `User: ${targetUserId}`, {
        targetCollection: COLLECTIONS.USERS,
        targetDocId: targetUserId,
        beforeState: targetUser || null,
        afterState: after,
        reversible: Boolean(targetUser),
        companyIdOverride: targetUser?.companyId || activeCompanyId,
      });
      addToast('تم تحديث دور وصلاحيات المستخدم بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('تغيير دور مستخدم', `${COLLECTIONS.USERS}/${targetUserId}`, err);
      addToast(`فشل تحديث دور المستخدم: ${err.message}`, 'error');
      throw err;
    }
  };

  const toggleUserStatus = async (targetUserId: string) => {
    const actor = authenticatedUser || currentUser;
    if (actor.role !== 'admin' && actor.role !== 'super_admin') {
      addToast('صلاحية تعديل حالة الحسابات لمدير الشركة أو مالك المنصة فقط.', 'error');
      return;
    }
    if (actor.id === targetUserId) {
      addToast('لا يمكن إيقاف حسابك الإداري الخاص.', 'error');
      return;
    }

    const u = allUsers.find(usr => usr.id === targetUserId) || users.find(usr => usr.id === targetUserId);
    if (!u) return;
    if (u.role === 'super_admin' && actor.role !== 'super_admin') {
      addToast('غير مصرح بتعديل حساب مالك المنصة.', 'error');
      return;
    }
    const nextStatus: User['status'] = u.status === 'active' ? 'suspended' : 'active';

    try {
      await persistDocument(COLLECTIONS.USERS, targetUserId, { status: nextStatus });
      const after: User = { ...u, status: nextStatus };
      await syncPhoneDirectoryEntry(after).catch(() => {});
      setAllUsers(prev => prev.map(usr => usr.id === targetUserId ? after : usr));
      addAuditLog(
        nextStatus === 'active' ? 'تفعيل حساب مستخدم' : 'تعطيل حساب مستخدم',
        `تم تغيير حالة حساب ${u.name} إلى ${nextStatus}`,
        `User: ${targetUserId}`,
        {
          targetCollection: COLLECTIONS.USERS,
          targetDocId: targetUserId,
          beforeState: u,
          afterState: after,
          reversible: true,
          companyIdOverride: u.companyId || activeCompanyId,
        }
      );
      addToast(`تم ${nextStatus === 'active' ? 'تفعيل' : 'تعطيل'} حساب المستخدم.`);
    } catch (err: any) {
      recordDiagnosticError('تغيير حالة مستخدم', `${COLLECTIONS.USERS}/${targetUserId}`, err);
      addToast(`فشل تحديث حالة المستخدم: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // OPERATIONS - ASYNC & VERIFIED PERSISTENCE
  // ==========================================
  const confirmStudentRsvp = async (tripId: string, studentId: string, status: 'confirmed' | 'excused') => {
    const targetTrip = trips.find(t => t.id === tripId);
    if (!targetTrip) return;

    const studentUser = users.find(u => u.id === studentId) || currentUser;
    const studentLine = lines.find(l => l.id === targetTrip.lineId);
    const studentStation = studentLine?.stations.find(s => s.id === studentUser.stationId) || studentLine?.stations[0];

    try {
      // Phase 5: Atomic Firestore transaction to prevent overbooking
      const { trip: updatedTrip } = await atomicConfirmStudentRsvp(
        tripId,
        studentId,
        status,
        studentUser,
        studentStation?.nameAr || 'المحطة المعتمدة',
        studentStation?.id || 'st-default'
      );

      // If confirming, excuse conflicting booking in another bus on the same date/direction
      if (status === 'confirmed') {
        const conflicting = trips.find(
          t => t.id !== tripId && t.direction === targetTrip.direction && t.date === targetTrip.date &&
          t.manifest.some(m => m.studentId === studentId && m.rsvpStatus === 'confirmed')
        );
        if (conflicting) {
          const excusedConflicting = {
            ...conflicting,
            manifest: conflicting.manifest.map(m => m.studentId === studentId ? { ...m, rsvpStatus: 'excused' as const } : m)
          };
          try {
            await persistDocument(COLLECTIONS.TRIPS, conflicting.id, excusedConflicting);
            setTrips(prev => prev.map(t => t.id === conflicting.id ? excusedConflicting : t));
          } catch (e) {
            console.warn('Could not auto-excuse conflicting trip:', e);
          }
        }
      }

      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));

      addAuditLog(
        status === 'confirmed' ? 'تأكيد حجز مقعد' : 'اعتذار عن حضور الرحلة',
        `الطالب: ${studentUser.name} في رحلة ${targetTrip.scheduledTime} (${targetTrip.code})`,
        `Trip: ${tripId}`
      );
      addToast(status === 'confirmed' ? `تم تأكيد حجزك في رحلة الساعة (${targetTrip.scheduledTime}) بنجاح!` : 'تم تسجيل اعتذارك عن رحلة اليوم.');
    } catch (err: any) {
      console.error('RSVP atomic transaction failed:', err);
      addToast(err?.message || 'فشل تأكيد الحجز في قاعدة البيانات، يرجى المحاولة ثانية.', 'error');
    }
  };

  const getEffectiveTripStops = (trip: Trip): TripStopStatus[] => {
    if (trip.stops && trip.stops.length > 0) return trip.stops;
    const lineObj = lines.find(l => l.id === trip.lineId);
    if (!lineObj || !lineObj.stations || lineObj.stations.length === 0) return [];
    const ordered = trip.direction === 'from_university'
      ? [...lineObj.stations].reverse()
      : lineObj.stations;
    return ordered.map((s, idx) => ({
      stopId: `stop-${trip.id}-${s.id}`,
      stationId: s.id,
      stationNameAr: s.nameAr,
      orderIndex: idx + 1,
      scheduledArrivalTime: trip.scheduledTime,
      status: 'pending' as const,
    }));
  };

  const setStudentReturnReady = async (date: string, studentId: string, ready: boolean) => {
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    const studentUser = users.find(u => u.id === studentId) || currentUser;
    const studentLine = lines.find(l => l.id === studentUser.lineId);
    const studentStation = studentLine?.stations.find(s => s.id === studentUser.stationId) || studentLine?.stations[0];

    const dateTrips = trips.filter(t => t.date === date && t.status !== 'cancelled' && t.status !== 'merged');
    const existingMemberTrips = dateTrips.filter(t => (t.manifest || []).some(m => m.studentId === studentId));
    const targetTripsMap = new Map<string, Trip>();
    existingMemberTrips.forEach(t => targetTripsMap.set(t.id, t));

    // Also attach readiness to an active return trip on the student's line/university if not already in one
    const hasReturnTripAlready = existingMemberTrips.some(t => t.direction === 'from_university');
    if (!hasReturnTripAlready) {
      const matchingReturnTrip =
        dateTrips.find(t => t.lineId === studentUser.lineId && t.direction === 'from_university' && t.status !== 'completed') ||
        dateTrips.find(t => t.universityId === studentUser.universityId && t.direction === 'from_university' && t.status !== 'completed') ||
        dateTrips.find(t => t.lineId === studentUser.lineId) ||
        dateTrips[0];
      if (matchingReturnTrip) {
        targetTripsMap.set(matchingReturnTrip.id, matchingReturnTrip);
      }
    }

    const targetTrips = Array.from(targetTripsMap.values());

    if (targetTrips.length === 0) {
      addToast('لا توجد رحلات مجدولة لهذا اليوم لتسجيل الجاهزية.', 'error');
      return;
    }

    const studentUni = universities.find(u => u.id === studentUser.universityId);
    const updatedTripMap = new Map<string, Trip>();
    targetTrips.forEach(trip => {
      const currentManifest = trip.manifest || [];
      const exists = currentManifest.some(m => m.studentId === studentId);
      const updatedManifest: ManifestStudent[] = exists
        ? currentManifest.map(m =>
            m.studentId === studentId
              ? {
                  ...m,
                  readyForReturn: ready,
                  readyForReturnAt: ready ? nowTime : undefined,
                  studentUniversityId: m.studentUniversityId || studentUser.universityId,
                  studentUniversityNameAr: m.studentUniversityNameAr || studentUni?.nameAr,
                }
              : m
          )
        : [
            ...currentManifest,
            {
              studentId,
              studentName: studentUser.name,
              phone: studentUser.phone,
              stationId: studentStation?.id || 'st-default',
              stationNameAr: studentStation?.nameAr || 'المحطة المعتمدة',
              rsvpStatus: 'unconfirmed',
              boardedStatus: 'waiting',
              readyForReturn: ready,
              readyForReturnAt: ready ? nowTime : undefined,
              studentUniversityId: studentUser.universityId,
              studentUniversityNameAr: studentUni?.nameAr,
            },
          ];

      updatedTripMap.set(trip.id, { ...trip, manifest: updatedManifest });
    });

    try {
      await Promise.all(
        Array.from(updatedTripMap.values()).map(updatedTrip =>
          persistDocument(COLLECTIONS.TRIPS, updatedTrip.id, { manifest: updatedTrip.manifest })
        )
      );
      setTrips(prev => prev.map(t => updatedTripMap.get(t.id) || t));
      addAuditLog(
        ready ? 'تأكيد جاهزية العودة' : 'إلغاء جاهزية العودة',
        `الطالب ${studentUser.name}: ${ready ? 'خلص الجامعة وجاهز وينتظر رحلة العودة' : 'تم إلغاء حالة الجاهزية'}`,
        `Student: ${studentId}`
      );
      addToast(
        ready
          ? 'تم تسجيل أنك خلصت الجامعة وجاهز وبانتظار رحلة العودة بنجاح!'
          : 'تم إلغاء حالة الجاهزية للعودة.',
        ready ? 'success' : 'info'
      );
    } catch (err: any) {
      addToast(`فشل حفظ حالة الجاهزية للعودة: ${err.message}`, 'error');
    }
  };

  const driverUpdateStop = async (tripId: string, stopId: string, action: 'arrive' | 'depart') => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const effectiveStops = getEffectiveTripStops(trip);
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    let nextIndex = trip.currentStopIndex;
    let confirmedStopName = trip.lastConfirmedStopName;

    const updatedStops = effectiveStops.map((stop, idx) => {
      if (stop.stopId === stopId) {
        confirmedStopName = stop.stationNameAr;
        if (action === 'arrive') {
          return {
            ...stop,
            status: 'arrived' as const,
            actualArrivalTime: nowTime
          };
        } else {
          nextIndex = Math.min(idx + 1, effectiveStops.length - 1);
          return {
            ...stop,
            status: 'departed' as const,
            actualDepartureTime: nowTime
          };
        }
      }
      return stop;
    });

    const allDeparted = updatedStops.length > 0 && updatedStops.every(s => s.status === 'departed');
    const updatedTrip: Trip = {
      ...trip,
      stops: updatedStops,
      currentStopIndex: nextIndex,
      lastConfirmedStopName: confirmedStopName,
      lastConfirmedTime: nowTime,
      status: (allDeparted ? 'completed' : 'in_progress') as Trip['status'],
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, updatedTrip);
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addAuditLog(
        action === 'arrive' ? 'تسجيل وصول المحطة' : 'تسجيل مغادرة المحطة',
        `السائق: ${currentUser.name} في المحطة: ${confirmedStopName || stopId}`,
        `Trip: ${tripId}`
      );
      addToast(action === 'arrive' ? 'تم تسجيل الوصول للمحطة بنجاح.' : 'تم تسجيل مغادرة المحطة والانتقال للتالية.');
    } catch (err: any) {
      addToast(`فشل تحديث حالة المحطة في السحابة: ${err.message}`, 'error');
    }
  };

  const driverToggleStopCheck = async (tripId: string, stopId: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const effectiveStops = getEffectiveTripStops(trip);
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    let toastMsg = '';
    let confirmedStopName = trip.lastConfirmedStopName;

    const updatedStops = effectiveStops.map((stop) => {
      if (stop.stopId === stopId) {
        const isCurrentlyDone = stop.status === 'departed';
        if (isCurrentlyDone) {
          toastMsg = `تم إلغاء تشيك محطة (${stop.stationNameAr})`;
          return {
            ...stop,
            status: 'pending' as const,
            actualArrivalTime: undefined,
            actualDepartureTime: undefined,
          };
        } else {
          confirmedStopName = stop.stationNameAr;
          toastMsg = `✓ تم تشيك وتأكيد المرور بمحطة (${stop.stationNameAr})`;
          return {
            ...stop,
            status: 'departed' as const,
            actualArrivalTime: stop.actualArrivalTime || nowTime,
            actualDepartureTime: nowTime,
          };
        }
      }
      return stop;
    });

    const firstPendingIndex = updatedStops.findIndex(s => s.status !== 'departed');
    const nextIndex = firstPendingIndex !== -1 ? firstPendingIndex : Math.max(0, updatedStops.length - 1);
    const allDeparted = updatedStops.length > 0 && updatedStops.every(s => s.status === 'departed');
    const anyDeparted = updatedStops.some(s => s.status === 'departed' || s.status === 'arrived');

    const updatedTrip: Trip = {
      ...trip,
      stops: updatedStops,
      currentStopIndex: nextIndex,
      lastConfirmedStopName: confirmedStopName,
      lastConfirmedTime: nowTime,
      status: (allDeparted ? 'completed' : anyDeparted ? 'in_progress' : 'scheduled') as Trip['status'],
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, updatedTrip);
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      if (toastMsg) addToast(toastMsg);
    } catch (err: any) {
      addToast(`فشل حفظ حالة فحص المحطة: ${err.message}`, 'error');
    }
  };

  const driverConfirmReturnDeparture = async (tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const effectiveStops = getEffectiveTripStops(trip);
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());

    const updatedStops = effectiveStops.map((stop, idx) =>
      idx === 0
        ? {
            ...stop,
            status: 'departed' as const,
            actualArrivalTime: stop.actualArrivalTime || nowTime,
            actualDepartureTime: nowTime,
          }
        : stop
    );

    const firstStopName = updatedStops[0]?.stationNameAr || trip.universityNameAr;
    const allDeparted = updatedStops.length === 1;
    const updatedTrip: Trip = {
      ...trip,
      stops: updatedStops,
      currentStopIndex: Math.min(1, Math.max(0, updatedStops.length - 1)),
      lastConfirmedStopName: firstStopName,
      lastConfirmedTime: nowTime,
      status: (allDeparted ? 'completed' : 'in_progress') as Trip['status'],
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, updatedTrip);
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addAuditLog('انطلاق رحلة العودة من الجامعة', `السائق ${trip.driverNameAr} غادر بالحافلة ${trip.busPlate} في رحلة ${trip.code}`, `Trip: ${tripId}`);
      addToast('تم تأكيد انطلاق الحافلة من الجامعة بنجاح! تم تحديث لوحة المشرف والطلاب فوراً.');
    } catch (err: any) {
      addToast(`فشل تأكيد الانطلاق: ${err.message}`, 'error');
    }
  };

  const driverCheckInStudent = async (tripId: string, studentId: string, actualStation?: { id: string; nameAr: string }) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    let toastMsg = 'تم تحديث صعود الطالب بنجاح.';
    const currentBoardedCount = trip.manifest.filter(m => m.boardedStatus === 'boarded').length;

    const updatedManifest = trip.manifest.map(m => {
      if (m.studentId === studentId) {
        const newStatus = m.boardedStatus === 'boarded' ? 'waiting' : 'boarded';
        
        if (newStatus === 'boarded') {
          if (currentBoardedCount >= trip.capacity) {
            addToast(`تنبيه: الحافلة ممتلئة بالكامل (${trip.capacity}/${trip.capacity})!`, 'error');
          }
          if (actualStation && actualStation.id !== m.stationId) {
            toastMsg = `تم صعود ${m.studentName} من محطة (${actualStation.nameAr}) بدلاً من (${m.stationNameAr.split('-')[0]}).`;
          } else {
            toastMsg = `تم تأكيد صعود الطالب ${m.studentName} بنجاح.`;
          }
        } else {
          toastMsg = `تم إلغاء تسجيل صعود الطالب ${m.studentName}.`;
        }

        return {
          ...m,
          boardedStatus: newStatus as 'waiting' | 'boarded',
          boardedAt: newStatus === 'boarded' ? nowTime : undefined,
          actualBoardingStationId: newStatus === 'boarded' && actualStation ? actualStation.id : m.actualBoardingStationId,
          actualBoardingStationNameAr: newStatus === 'boarded' && actualStation ? actualStation.nameAr : m.actualBoardingStationNameAr,
        };
      }
      return m;
    });

    const updatedTrip = { ...trip, manifest: updatedManifest };
    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, { manifest: updatedManifest });
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addToast(toastMsg);
    } catch (err: any) {
      addToast(`فشل تسجيل صعود الطالب: ${err.message}`, 'error');
    }
  };

  const driverBoardWaitingStudent = async (
    tripId: string,
    student: {
      studentId: string;
      studentName: string;
      phone: string;
      stationId?: string;
      stationNameAr?: string;
      studentUniversityId?: string;
      studentUniversityNameAr?: string;
    }
  ) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    const manifest = trip.manifest || [];
    const existing = manifest.find(m => m.studentId === student.studentId);
    const currentBoardedCount = manifest.filter(m => m.boardedStatus === 'boarded').length;
    const isTogglingOff = existing?.boardedStatus === 'boarded';
    const userMatch = allUsers.find(u => u.id === student.studentId);
    const resolvedUniId = student.studentUniversityId || existing?.studentUniversityId || userMatch?.universityId;
    const resolvedUniNameAr =
      student.studentUniversityNameAr ||
      existing?.studentUniversityNameAr ||
      (resolvedUniId ? universities.find(u => u.id === resolvedUniId)?.nameAr : undefined);

    if (!isTogglingOff && currentBoardedCount >= (trip.capacity || 14)) {
      addToast(`تنبيه: وصلت سيارة الانتظار للحد الأقصى للسعة (${trip.capacity} راكب)!`, 'info');
    }

    const updatedManifest: ManifestStudent[] = existing
      ? manifest.map(m =>
          m.studentId === student.studentId
            ? {
                ...m,
                rsvpStatus: isTogglingOff ? m.rsvpStatus : ('confirmed' as const),
                boardedStatus: (isTogglingOff ? 'waiting' : 'boarded') as 'waiting' | 'boarded',
                boardedAt: isTogglingOff ? undefined : nowTime,
                studentUniversityId: resolvedUniId || m.studentUniversityId,
                studentUniversityNameAr: resolvedUniNameAr || m.studentUniversityNameAr,
                actualBoardingStationId: isTogglingOff
                  ? m.actualBoardingStationId
                  : (student.stationId || m.stationId),
                actualBoardingStationNameAr: isTogglingOff
                  ? m.actualBoardingStationNameAr
                  : 'سيارة الانتظار بالجامعة',
              }
            : m
        )
      : [
          ...manifest,
          {
            studentId: student.studentId,
            studentName: student.studentName,
            phone: student.phone,
            stationId: student.stationId || 'st-campus',
            stationNameAr: student.stationNameAr || 'بوابة الجامعة',
            rsvpStatus: 'confirmed',
            boardedStatus: 'boarded',
            boardedAt: nowTime,
            readyForReturn: true,
            readyForReturnAt: nowTime,
            studentUniversityId: resolvedUniId,
            studentUniversityNameAr: resolvedUniNameAr,
            actualBoardingStationId: student.stationId || 'st-campus',
            actualBoardingStationNameAr: 'سيارة الانتظار بالجامعة',
          },
        ];

    const updatedTrip = { ...trip, manifest: updatedManifest };
    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, { manifest: updatedManifest });
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addToast(
        isTogglingOff
          ? `تم إلغاء تسجيل صعود (${student.studentName}) من سيارة الانتظار.`
          : `✓ تم تسجيل صعود (${student.studentName}) داخل سيارة الانتظار الآن.`,
        isTogglingOff ? 'info' : 'success'
      );
    } catch (err: any) {
      addToast(`فشل تسجيل صعود الطالب بسيارة الانتظار: ${err.message}`, 'error');
    }
  };

  const dispatchWaitingReturnBus = async (tripId: string, consolidateFromTripIds: string[] = []) => {
    const primaryTrip = trips.find(t => t.id === tripId);
    if (!primaryTrip) return;

    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    let combinedManifest = [...(primaryTrip.manifest || [])];
    const donorUpdates: Trip[] = [];

    if (consolidateFromTripIds.length > 0) {
      consolidateFromTripIds.forEach(donorId => {
        if (donorId === tripId) return;
        const donor = trips.find(t => t.id === donorId);
        if (!donor) return;

        const boardedFromDonor = (donor.manifest || []).filter(m => m.boardedStatus === 'boarded');
        boardedFromDonor.forEach(m => {
          const alreadyIdx = combinedManifest.findIndex(cm => cm.studentId === m.studentId);
          if (alreadyIdx >= 0) {
            combinedManifest[alreadyIdx] = {
              ...combinedManifest[alreadyIdx],
              boardedStatus: 'boarded',
              rsvpStatus: 'confirmed',
              boardedAt: m.boardedAt || nowTime,
            };
          } else {
            combinedManifest.push({ ...m, boardedStatus: 'boarded', rsvpStatus: 'confirmed' });
          }
        });

        const cleanedDonorManifest = (donor.manifest || []).filter(m => m.boardedStatus !== 'boarded');
        donorUpdates.push({ ...donor, manifest: cleanedDonorManifest });
      });
    }

    const effectiveStops = getEffectiveTripStops(primaryTrip);
    const updatedStops = effectiveStops.map((stop, idx) =>
      idx === 0
        ? {
            ...stop,
            status: 'departed' as const,
            actualArrivalTime: stop.actualArrivalTime || nowTime,
            actualDepartureTime: nowTime,
          }
        : stop
    );

    const firstStopName = updatedStops[0]?.stationNameAr || primaryTrip.universityNameAr;
    const boardedTotal = combinedManifest.filter(m => m.boardedStatus === 'boarded').length;
    const updatedPrimary: Trip = {
      ...primaryTrip,
      manifest: combinedManifest,
      stops: updatedStops,
      currentStopIndex: Math.min(1, Math.max(0, updatedStops.length - 1)),
      lastConfirmedStopName: firstStopName,
      lastConfirmedTime: nowTime,
      status: (updatedStops.length === 1 ? 'completed' : 'in_progress') as Trip['status'],
      notes: consolidateFromTripIds.length > 0
        ? `تم تجميع وانطلاق ${boardedTotal} طالب منتظر بالسيارة من الجامعة`
        : primaryTrip.notes,
    };

    try {
      await Promise.all([
        persistDocument(COLLECTIONS.TRIPS, primaryTrip.id, updatedPrimary),
        ...donorUpdates.map(d => persistDocument(COLLECTIONS.TRIPS, d.id, { manifest: d.manifest })),
      ]);

      setTrips(prev =>
        prev.map(t => {
          if (t.id === primaryTrip.id) return updatedPrimary;
          const donorUp = donorUpdates.find(d => d.id === t.id);
          return donorUp || t;
        })
      );

      addAuditLog(
        'انطلاق سيارة الانتظار بالطلاب',
        `تحركت الحافلة ${primaryTrip.busPlate} (${primaryTrip.driverNameAr}) من ${primaryTrip.universityNameAr} وعلى متنها ${boardedTotal} طالب منتظر.`,
        `Trip: ${primaryTrip.id}`
      );
      addToast(`تم بدء تحرك سيارة الانتظار (${primaryTrip.busPlate}) وعلى متنها ${boardedTotal} طالب للعودة بنجاح!`, 'success');
    } catch (err: any) {
      addToast(`فشل تنفيذ انطلاق سيارة الانتظار: ${err.message}`, 'error');
    }
  };

  const consolidateWaitingBusesOnly = async (targetTripId: string, donorTripIds: string[]) => {
    const targetTrip = trips.find(t => t.id === targetTripId);
    if (!targetTrip || donorTripIds.length === 0) return;

    const mergedManifest = [...(targetTrip.manifest || [])];
    const donorUpdates: Trip[] = [];

    donorTripIds.forEach(donorId => {
      if (donorId === targetTripId) return;
      const donor = trips.find(t => t.id === donorId);
      if (!donor) return;

      (donor.manifest || []).forEach(m => {
        const existingIdx = mergedManifest.findIndex(cm => cm.studentId === m.studentId);
        if (existingIdx >= 0) {
          const prev = mergedManifest[existingIdx];
          mergedManifest[existingIdx] = {
            ...prev,
            boardedStatus: m.boardedStatus === 'boarded' ? 'boarded' : prev.boardedStatus,
            rsvpStatus:
              m.rsvpStatus === 'confirmed' || prev.rsvpStatus === 'confirmed'
                ? 'confirmed'
                : prev.rsvpStatus,
            readyForReturn: Boolean(prev.readyForReturn || m.readyForReturn),
            boardedAt: m.boardedAt || prev.boardedAt,
          };
        } else {
          mergedManifest.push(m);
        }
      });

      donorUpdates.push({
        ...donor,
        manifest: [],
        status: 'merged' as const,
        mergedIntoTripId: targetTripId,
        notes: `تم تفريغ الركاب وتجميعهم في باص (${targetTrip.busPlate}) لتوفير سيارة`,
      });
    });

    const boardedTotal = mergedManifest.filter(m => m.boardedStatus === 'boarded').length;
    const updatedTarget: Trip = {
      ...targetTrip,
      manifest: mergedManifest,
      notes: `تم تجميع ${donorUpdates.length} سيارة انتظار في هذا الباص (${boardedTotal} طالب بالسيارة حالياً)`,
    };

    try {
      await Promise.all([
        persistDocument(COLLECTIONS.TRIPS, targetTrip.id, updatedTarget),
        ...donorUpdates.map(d => persistDocument(COLLECTIONS.TRIPS, d.id, d)),
      ]);

      setTrips(prev =>
        prev.map(t => {
          if (t.id === targetTrip.id) return updatedTarget;
          const donorUp = donorUpdates.find(d => d.id === t.id);
          return donorUp || t;
        })
      );

      addAuditLog(
        'تجميع سيارات انتظار بالجامعة',
        `تم تجميع ركاب ${donorUpdates.length} سيارة في باص ${targetTrip.busPlate} (${targetTrip.universityNameAr}) وتوفير ${donorUpdates.length} سيارة.`,
        `Trip: ${targetTrip.id}`
      );
      addToast(
        `تم تجميع الركاب في باص (${targetTrip.busPlate}) وتوفير ${donorUpdates.length} سيارة بنجاح!`,
        'success'
      );
    } catch (err: any) {
      addToast(`فشل تجميع سيارات الانتظار: ${err.message}`, 'error');
    }
  };

  const reportIncident = async (incidentData: Omit<Incident, 'id' | 'createdAt' | 'status'>) => {
    const relatedTrip = trips.find(t => t.id === incidentData.tripId);
    const newInc: Incident = {
      ...incidentData,
      companyId: activeCompanyId,
      driverId: incidentData.driverId || relatedTrip?.driverId || currentUser?.id || 'driver_unknown',
      reportedById: incidentData.reportedById || currentUser?.id || '',
      id: `inc-${Date.now()}`,
      createdAt: new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date()),
      status: 'pending',
    };

    try {
      await persistDocument(COLLECTIONS.INCIDENTS, newInc.id, newInc);
      setIncidents(prev => [newInc, ...prev]);

      if (incidentData.delayMinutes) {
        const trip = trips.find(t => t.id === incidentData.tripId);
        if (trip) {
          const updatedTrip = {
            ...trip,
            delayMinutes: incidentData.delayMinutes || 0,
            delayReason: incidentData.description,
            status: 'delayed' as const,
          };
          await persistDocument(COLLECTIONS.TRIPS, trip.id, updatedTrip);
          setTrips(prev => prev.map(t => t.id === trip.id ? updatedTrip : t));
        }
      }
      addToast('تم إرسال البلاغ التشغيلي وحفظه في السحابة بنجاح.');
    } catch (err: any) {
      addToast(`فشل تسجيل البلاغ: ${err.message}`, 'error');
    }
  };

  const swapBusOrDriver = async (tripId: string, newBusId: string, newDriverId: string, reason: string) => {
    const targetBus = buses.find(b => b.id === newBusId);
    const targetDriver = drivers.find(d => d.id === newDriverId);
    const trip = trips.find(t => t.id === tripId);

    if (!targetBus || !targetDriver || !trip) return;

    const updatedTrip: Trip = {
      ...trip,
      busId: targetBus.id,
      busPlate: targetBus.plateNumber,
      capacity: targetBus.capacity,
      driverId: targetDriver.id,
      driverNameAr: targetDriver.nameAr,
      driverPhone: targetDriver.phone,
      isUnregisteredEmergencyDriver: false,
      notes: `تم التبديل السريع: ${reason}`,
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, updatedTrip);
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addAuditLog('تبديل سائق أو حافلة', `تم تبديل رحلة ${trip.code} إلى السائق ${targetDriver.nameAr} (${targetBus.plateNumber})`, `Trip: ${tripId}`);
      addToast('تم التبديل السريع وتحديث بيانات الرحلة في قاعدة البيانات.');
    } catch (err: any) {
      addToast(`فشل إجراء التبديل السريع: ${err.message}`, 'error');
    }
  };

  const markCrossUniversityHandoff = async (tripId: string, studentIds: string[], note?: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip || studentIds.length === 0) return;

    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    const updatedManifest = (trip.manifest || []).map(m =>
      studentIds.includes(m.studentId)
        ? {
            ...m,
            externalHandoffStatus: 'handed_off' as const,
            externalHandoffNote: note || 'تم ركوبهم مع مكتب / سيارة أخرى',
            externalHandoffAt: nowTime,
            boardedStatus: 'waiting' as const,
          }
        : m
    );
    const updatedTrip: Trip = { ...trip, manifest: updatedManifest };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, { manifest: updatedManifest });
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addAuditLog(
        'تسليم طلاب لمكتب / سيارة أخرى',
        `تم تأكيد ركوب ${studentIds.length} طالب من رحلة ${trip.code} مع مكتب/سيارة أخرى وإزالة علامة اختلاف الجامعة`,
        `Trip: ${tripId}`
      );
      addToast(`تم تأكيد انتقال ${studentIds.length} طالب وإزالة العلامة الحمراء بنجاح.`, 'success');
    } catch (err: any) {
      addToast(`فشل تحديث حالة تسليم الطلاب: ${err.message}`, 'error');
    }
  };

  const allocateWaitingReturnBus = async (payload: {
    universityId: string;
    lineId?: string;
    busId?: string;
    driverId?: string;
    scheduledTime?: string;
    adHocDriverName?: string;
    adHocDriverPhone?: string;
    adHocBusPlate?: string;
    adHocCapacity?: number;
  }): Promise<Trip | undefined> => {
    const uni = universities.find(u => u.id === payload.universityId);
    const targetLine =
      lines.find(l => l.id === payload.lineId) ||
      lines.find(l => l.universityId === payload.universityId) ||
      lines[0];
    if (!uni && !targetLine) {
      addToast('يرجى تحديد الجامعة أو خط السير أولاً.', 'error');
      return undefined;
    }

    const regBus = payload.busId ? buses.find(b => b.id === payload.busId) : undefined;
    const regDriver = payload.driverId ? drivers.find(d => d.id === payload.driverId) : undefined;

    const isAdHoc = Boolean(!regDriver && payload.adHocDriverName?.trim());
    const busId = regBus?.id || `adhoc-bus-${Date.now()}`;
    const busPlate = regBus?.plateNumber || payload.adHocBusPlate?.trim() || 'سيارة انتظار طوارئ';
    const capacity = regBus?.capacity || payload.adHocCapacity || 14;
    const driverId = regDriver?.id || `adhoc-drv-${Date.now()}`;
    const driverNameAr = regDriver?.nameAr || payload.adHocDriverName?.trim() || 'سائق طوارئ غير مسجل';
    const driverPhone = regDriver?.phone || payload.adHocDriverPhone?.trim() || '';

    const timeLabel = payload.scheduledTime?.trim() || new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    const newTripId = `trip-wait-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const code = `WAIT-${Math.floor(100 + Math.random() * 899)}`;
    const reversedStations = targetLine?.stations ? [...targetLine.stations].reverse() : [];

    const newTrip: Trip = {
      id: newTripId,
      companyId: activeCompanyId,
      code,
      date: activeOperatingDate,
      universityId: uni?.id || targetLine?.universityId || '',
      universityNameAr: uni?.nameAr || 'جامعة',
      lineId: targetLine?.id || '',
      lineNameAr: targetLine?.nameAr || `عودة من ${uni?.nameAr || 'الجامعة'}`,
      direction: 'from_university',
      scheduledTime: timeLabel,
      busId,
      busPlate,
      capacity,
      driverId,
      driverNameAr,
      driverPhone,
      isUnregisteredEmergencyDriver: isAdHoc,
      status: 'scheduled',
      currentStopIndex: 0,
      delayMinutes: 0,
      stops: reversedStations.map((s, idx) => ({
        stopId: `stop-${newTripId}-${s.id}`,
        stationId: s.id,
        stationNameAr: s.nameAr,
        orderIndex: idx + 1,
        scheduledArrivalTime: timeLabel,
        status: 'pending' as const,
      })),
      manifest: [],
      notes: isAdHoc ? 'سيارة انتظار مخصصة فوراً (سائق طوارئ بدون تسجيل)' : 'سيارة انتظار بالجامعة',
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, newTrip.id, newTrip);
      setAllTrips(prev => [newTrip, ...prev]);
      addAuditLog(
        'تخصيص سيارة انتظار بالجامعة',
        `تم تخصيص سيارة (${busPlate}) بقيادة ${driverNameAr} لانتظار طلاب العودة في ${newTrip.universityNameAr}`,
        `Trip: ${newTrip.id}`
      );
      addToast(`✓ تم تخصيص سيارة الانتظار (${driverNameAr} — ${busPlate}) لجامعة ${newTrip.universityNameAr} بنجاح!`, 'success');
      return newTrip;
    } catch (err: any) {
      addToast(`فشل تخصيص سيارة الانتظار: ${err.message}`, 'error');
      return undefined;
    }
  };

  const supervisorQuickSwapOrEmergency = async (
    tripId: string,
    payload: {
      mode: 'existing' | 'unregistered' | 'new_driver';
      newBusId?: string;
      newDriverId?: string;
      adHocDriverName?: string;
      adHocDriverPhone?: string;
      adHocBusPlate?: string;
      adHocCapacity?: number;
      newDriverEmail?: string;
      reason: string;
    }
  ) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    let updatedTrip: Trip | null = null;
    let repName = '';
    let repPhone = '';
    let repPlate = trip.busPlate;
    let isUnregistered = false;

    if (payload.mode === 'existing') {
      const busObj = buses.find(b => b.id === payload.newBusId) || buses.find(b => b.id === trip.busId);
      const drvObj = drivers.find(d => d.id === payload.newDriverId);
      if (!drvObj) {
        addToast('يرجى اختيار السائق البديل.', 'error');
        return;
      }
      repName = drvObj.nameAr;
      repPhone = drvObj.phone;
      repPlate = busObj?.plateNumber || trip.busPlate;
      updatedTrip = {
        ...trip,
        busId: busObj?.id || trip.busId,
        busPlate: repPlate,
        capacity: busObj?.capacity || trip.capacity,
        driverId: drvObj.id,
        driverNameAr: repName,
        driverPhone: repPhone,
        isUnregisteredEmergencyDriver: false,
        notes: `تبديل مباشر: ${payload.reason}`,
      };
    } else if (payload.mode === 'unregistered') {
      if (!payload.adHocDriverName?.trim() || !payload.adHocBusPlate?.trim()) {
        addToast('يرجى إدخال اسم السائق ورقم لوحة السيارة البديلة.', 'error');
        return;
      }
      isUnregistered = true;
      repName = payload.adHocDriverName.trim();
      repPhone = payload.adHocDriverPhone?.trim() || '';
      repPlate = payload.adHocBusPlate.trim();
      updatedTrip = {
        ...trip,
        busId: `adhoc-bus-${Date.now()}`,
        busPlate: repPlate,
        capacity: payload.adHocCapacity || trip.capacity || 14,
        driverId: `adhoc-drv-${Date.now()}`,
        driverNameAr: repName,
        driverPhone: repPhone,
        isUnregisteredEmergencyDriver: true,
        notes: `تعيين طوارئ سريع بدون تسجيل: ${payload.reason}`,
      };
    } else if (payload.mode === 'new_driver') {
      if (!payload.adHocDriverName?.trim() || !payload.adHocDriverPhone?.trim()) {
        addToast('يرجى إدخال اسم السائق ورقم هاتفه للتفعيل السريع.', 'error');
        return;
      }
      const selectedBus = payload.newBusId ? buses.find(b => b.id === payload.newBusId) : buses.find(b => b.id === trip.busId);
      const createdUser = await createCompanyUser({
        name: payload.adHocDriverName.trim(),
        phone: payload.adHocDriverPhone.trim(),
        email: payload.newDriverEmail?.trim() || '',
        role: 'driver',
        status: 'active',
        assignedBusId: selectedBus?.id || undefined,
      }, payload.reason);

      const drvId = `drv-${createdUser.id}`;
      repName = createdUser.name;
      repPhone = createdUser.phone;
      repPlate = selectedBus?.plateNumber || payload.adHocBusPlate?.trim() || trip.busPlate;
      updatedTrip = {
        ...trip,
        busId: selectedBus?.id || trip.busId,
        busPlate: repPlate,
        capacity: selectedBus?.capacity || trip.capacity,
        driverId: drvId,
        driverNameAr: repName,
        driverPhone: repPhone,
        isUnregisteredEmergencyDriver: false,
        notes: `إضافة سائق جديد وتعيينه فوراً: ${payload.reason}`,
      };
    }

    if (!updatedTrip) return;

    const newInc: Incident = {
      id: `inc-${Date.now()}`,
      companyId: activeCompanyId,
      tripId: trip.id,
      tripCode: trip.code,
      type: 'bus_swap',
      description: `${payload.reason} — البديل: ${repName} (${repPlate})`,
      reportedByRole: (authenticatedUser || currentUser).role,
      reportedByName: (authenticatedUser || currentUser).name,
      originalBusId: trip.busId,
      replacementBusId: updatedTrip.busId,
      originalDriverId: trip.driverId,
      replacementDriverId: updatedTrip.driverId,
      replacementDriverName: repName,
      replacementDriverPhone: repPhone,
      replacementBusPlate: repPlate,
      isUnregisteredEmergency: isUnregistered,
      createdAt: new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date()),
      status: 'resolved',
    };

    try {
      await Promise.all([
        persistDocument(COLLECTIONS.TRIPS, trip.id, updatedTrip),
        persistDocument(COLLECTIONS.INCIDENTS, newInc.id, newInc),
      ]);
      setAllTrips(prev => prev.map(t => t.id === trip.id ? updatedTrip! : t));
      setAllIncidents(prev => [newInc, ...prev]);
      addAuditLog(
        isUnregistered ? 'تعيين طوارئ سريع بدون تسجيل' : 'تبديل مباشر لسائق الرحلة',
        `رحلة ${trip.code}: تم التحويل إلى ${repName} (${repPlate}) مع الحفاظ على جميع الطلاب (${trip.manifest.length} راكب). السبب: ${payload.reason}`,
        `Trip: ${trip.id}`
      );
      addToast(`✓ تم التبديل إلى (${repName} — ${repPlate}) مع الحفاظ على كافة بيانات الركاب بنجاح!`, 'success');
    } catch (err: any) {
      addToast(`فشل تنفيذ التبديل السريع: ${err.message}`, 'error');
    }
  };

  const approveConsolidation = async (proposalId: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    const sourceTrip = trips.find(t => t.id === proposal.sourceTripId);
    const targetTrip = trips.find(t => t.id === proposal.targetTripId);
    if (!sourceTrip || !targetTrip) return;

    const mergedManifest = [...targetTrip.manifest, ...sourceTrip.manifest];
    const updatedSource = {
      ...sourceTrip,
      status: 'merged' as const,
      mergedIntoTripId: proposal.targetTripId,
      notes: `تم دمج الرحلة مع رحلة ${proposal.targetTripCode}`,
    };
    const updatedTarget = {
      ...targetTrip,
      manifest: mergedManifest,
      notes: `تم ضم ركاب رحلة ${proposal.sourceTripCode} بإجمالي ${mergedManifest.length} راكب`,
    };
    const updatedProposal = { ...proposal, status: 'approved' as const };

    try {
      await Promise.all([
        persistDocument(COLLECTIONS.TRIPS, sourceTrip.id, updatedSource),
        persistDocument(COLLECTIONS.TRIPS, targetTrip.id, updatedTarget),
        persistDocument(COLLECTIONS.PROPOSALS, proposalId, updatedProposal)
      ]);

      setTrips(prev => prev.map(t => {
        if (t.id === sourceTrip.id) return updatedSource;
        if (t.id === targetTrip.id) return updatedTarget;
        return t;
      }));
      setProposals(prev => prev.map(p => p.id === proposalId ? updatedProposal : p));
      addToast('تم اعتماد دمج الرحلتين بنجاح في قاعدة البيانات.');
    } catch (err: any) {
      addToast(`فشل اعتماد الدمج في السحابة: ${err.message}`, 'error');
    }
  };

  const rejectConsolidation = async (proposalId: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    const updatedProposal = { ...proposal, status: 'rejected' as const };
    try {
      await persistDocument(COLLECTIONS.PROPOSALS, proposalId, updatedProposal);
      setProposals(prev => prev.map(p => p.id === proposalId ? updatedProposal : p));
      addToast('تم رفض مقترح الدمج والإبقاء على الرحلتين بشكل منفصل.', 'info');
    } catch (err: any) {
      addToast(`فشل تحديث حالة مقترح الدمج: ${err.message}`, 'error');
    }
  };

  const importWhatsappAttendance = async (rawText: string, tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return { matched: 0, unassigned: 0 };

    const phoneRegex = /(01[0125]\d{8})/g;
    const detectedPhones: string[] = rawText.match(phoneRegex) || [];
    let matchedCount = 0;

    const updatedManifest = trip.manifest.map(m => {
      if (detectedPhones.includes(m.phone)) {
        matchedCount++;
        return {
          ...m,
          rsvpStatus: 'whatsapp_reported' as const,
        };
      }
      return m;
    });

    const updatedTrip = { ...trip, manifest: updatedManifest };
    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, updatedTrip);
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addToast(`تمت مطابقة ${matchedCount} طلاب من تقرير WhatsApp وحفظها بنجاح.`);
      return { matched: matchedCount, unassigned: Math.max(0, detectedPhones.length - matchedCount) };
    } catch (err: any) {
      addToast(`فشل حفظ بيانات WhatsApp: ${err.message}`, 'error');
      return { matched: 0, unassigned: detectedPhones.length };
    }
  };

  const approveStudentRegistration = async (userId: string) => {
    const target = allUsers.find(u => u.id === userId) || users.find(u => u.id === userId);
    try {
      await persistDocument(COLLECTIONS.USERS, userId, { status: 'active' });
      if (target) {
        await syncPhoneDirectoryEntry({ ...target, status: 'active' }).catch(() => {});

        if (target.role === 'driver') {
          const alreadyHasDriverDoc = allDrivers.some(d => d.userId === target.id || d.phone === target.phone);
          if (!alreadyHasDriverDoc) {
            const newDriver: Driver = {
              id: `drv-${target.id}`,
              companyId: target.companyId || activeCompanyId,
              userId: target.id,
              nameAr: target.name,
              phone: target.phone,
              licenseNumber: 'DL-NEW',
              status: 'active',
              assignedBusId: target.assignedBusId,
            };
            await persistDocument(COLLECTIONS.DRIVERS, newDriver.id, newDriver);
            setAllDrivers(prev => [newDriver, ...prev]);
          }
        }

        if (target.email && target.role !== 'student') {
          const inviteId = emailToInviteId(target.email);
          const safeRole: Exclude<UserRole, 'super_admin'> = target.role === 'super_admin' ? 'admin' : target.role;
          const invite: StaffInvite = {
            id: inviteId,
            email: target.email,
            emailLower: target.email.toLowerCase(),
            companyId: target.companyId || activeCompanyId,
            companyNameAr: companies.find(c => c.id === (target.companyId || activeCompanyId))?.nameAr,
            name: target.name,
            phone: target.phone,
            role: safeRole,
            isGeneralSupervisor: target.isGeneralSupervisor,
            preProvisionedUserId: target.id,
            status: 'pending',
            invitedByName: (authenticatedUser || currentUser).name,
            createdAt: new Date().toISOString().slice(0, 10),
          };
          await persistDocument(COLLECTIONS.STAFF_INVITES, invite.id, invite).catch(() => {});
        }
      }
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'active' } : u));
      addAuditLog(
        'اعتماد وتفعيل حساب جديد',
        `تم اعتماد وتفعيل حساب ${target?.name || userId} (${target?.phone || ''})`,
        `User: ${userId}`
      );
      addToast(`تم اعتماد وتفعيل حساب ${target?.name || 'المستخدم'} بنجاح!`, 'success');
    } catch (err: any) {
      addToast(`فشل تفعيل الحساب في قاعدة البيانات: ${err.message}`, 'error');
    }
  };

  const rejectPendingRegistration = async (userId: string) => {
    const target = allUsers.find(u => u.id === userId) || users.find(u => u.id === userId);
    try {
      await deleteDocument(COLLECTIONS.USERS, userId);
      if (target?.phone) {
        await removePhoneDirectoryEntry(target.phone);
      }
      setAllUsers(prev => prev.filter(u => u.id !== userId));
      addAuditLog(
        'رفض طلب تسجيل معلق',
        `تم رفض وحذف طلب تسجيل ${target?.name || userId} (${target?.phone || ''})`,
        `User: ${userId}`
      );
      addToast(`تم رفض وحذف طلب ${target?.name || 'الطالب'}.`, 'info');
    } catch (err: any) {
      addToast(`فشل رفض الطلب: ${err.message}`, 'error');
    }
  };

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    const before = { ...settings };
    const updated = { ...settings, ...newSettings, companyId: activeCompanyId };
    try {
      await persistDocument(COLLECTIONS.SETTINGS, activeSettingsDocId, updated);
      setSettings(updated);
      addAuditLog('تعديل إعدادات الشركة', `تم تحديث إعدادات التشغيل للشركة`, `Settings: ${activeSettingsDocId}`, {
        targetCollection: COLLECTIONS.SETTINGS,
        targetDocId: activeSettingsDocId,
        beforeState: before,
        afterState: updated,
        reversible: true,
      });
      addToast('تم تحديث الإعدادات التشغيلية وحفظها في السحابة بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('تحديث الإعدادات', `${COLLECTIONS.SETTINGS}/${activeSettingsDocId}`, err);
      addToast(`فشل حفظ الإعدادات: ${err.message}`, 'error');
    }
  };

  const submitExceptionalBooking = async (requestData: Omit<ExceptionalBookingRequest, 'id' | 'requestedAt' | 'status'>) => {
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    const newReq: ExceptionalBookingRequest = {
      ...requestData,
      companyId: activeCompanyId,
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestedAt: nowTime,
      status: 'pending'
    };
    try {
      await persistDocument(COLLECTIONS.EXCEPTIONAL_REQUESTS, newReq.id, newReq);
      setExceptionalRequests(prev => [newReq, ...prev]);
      addAuditLog(
        'تقديم طلب استثنائي بعد الإغلاق',
        `الطالب: ${newReq.studentName} طلب رحلة ${newReq.scheduledTime} بتاريخ ${newReq.date}`,
        `Request: ${newReq.id}`
      );
      addToast('تم إرسال طلبك الاستثنائي للمشرف بنجاح، وستتم مراجعته وتسكينك في الحافلة المناسبة.', 'success');
    } catch (err: any) {
      recordDiagnosticError('طلب استثنائي', `${COLLECTIONS.EXCEPTIONAL_REQUESTS}/${newReq.id}`, err);
      addToast(`فشل إرسال الطلب الاستثنائي: ${err?.message || 'خطأ في الحفظ'}`, 'error');
    }
  };

  const approveExceptionalBooking = async (requestId: string, targetTripId?: string) => {
    const req = exceptionalRequests.find(r => r.id === requestId);
    if (!req) return;

    let matchingTrip = trips.find(t =>
      targetTripId ? t.id === targetTripId : (
        t.date === req.date &&
        t.lineId === req.lineId &&
        t.direction === req.direction &&
        t.scheduledTime === req.scheduledTime
      )
    );

    let isNewTripCreated = false;
    if (!matchingTrip) {
      const lineObj = lines.find(l => l.id === req.lineId) || lines[0];
      const uniObj = universities.find(u => u.id === req.universityId) || universities[0];
      const availBus = buses.find(b => b.status === 'available') || buses[0];
      const availDriver = drivers.find(d => d.status === 'active') || drivers[0];

      const newTripId = `trip-${Date.now()}`;
      matchingTrip = {
        id: newTripId,
        companyId: activeCompanyId,
        code: `TRIP-${Math.floor(100 + Math.random() * 900)}`,
        date: req.date,
        universityId: uniObj?.id || req.universityId,
        universityNameAr: uniObj?.nameAr || req.universityNameAr,
        lineId: lineObj?.id || req.lineId,
        lineNameAr: lineObj?.nameAr || req.lineNameAr,
        direction: req.direction,
        scheduledTime: req.scheduledTime,
        busId: availBus?.id || '',
        busPlate: availBus?.plateNumber || 'غير معين',
        capacity: availBus?.capacity || 14,
        driverId: availDriver?.id || '',
        driverNameAr: availDriver?.nameAr || 'غير معين',
        driverPhone: availDriver?.phone || '',
        status: 'scheduled',
        currentStopIndex: 0,
        delayMinutes: 0,
        stops: (lineObj?.stations || []).map((s, idx) => ({
          stopId: `stop-${idx + 1}-${Date.now()}`,
          stationId: s.id,
          stationNameAr: s.nameAr,
          orderIndex: s.orderIndex,
          scheduledArrivalTime: req.scheduledTime,
          status: 'pending' as const
        })),
        manifest: []
      };
      isNewTripCreated = true;
    }

    const assignedTripId = matchingTrip.id;
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());

    const alreadyIn = matchingTrip.manifest.some(m => m.studentId === req.studentId);
    let updatedManifest: ManifestStudent[];
    if (alreadyIn) {
      updatedManifest = matchingTrip.manifest.map(m =>
        m.studentId === req.studentId
          ? {
              ...m,
              rsvpStatus: 'confirmed' as const,
              studentUniversityId: m.studentUniversityId || req.universityId || matchingTrip!.universityId,
              studentUniversityNameAr: m.studentUniversityNameAr || req.universityNameAr || matchingTrip!.universityNameAr,
            }
          : m
      );
    } else {
      updatedManifest = [
        ...matchingTrip.manifest,
        {
          studentId: req.studentId,
          studentName: req.studentName,
          phone: req.phone,
          stationId: req.stationId,
          stationNameAr: req.stationNameAr,
          studentUniversityId: req.universityId || matchingTrip.universityId,
          studentUniversityNameAr: req.universityNameAr || matchingTrip.universityNameAr,
          rsvpStatus: 'confirmed' as const,
          rsvpConfirmedAt: nowTime,
          boardedStatus: 'waiting' as const
        }
      ];
    }
    const updatedTrip = { ...matchingTrip, manifest: updatedManifest };
    const updatedReq = { ...req, status: 'approved' as const, tripId: assignedTripId };

    try {
      await Promise.all([
        persistDocument(COLLECTIONS.TRIPS, assignedTripId, updatedTrip),
        persistDocument(COLLECTIONS.EXCEPTIONAL_REQUESTS, requestId, updatedReq)
      ]);

      if (isNewTripCreated) {
        setTrips(prev => [updatedTrip, ...prev]);
      } else {
        setTrips(prev => prev.map(t => t.id === assignedTripId ? updatedTrip : t));
      }

      setExceptionalRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
      addAuditLog('قبول طلب استثنائي', `تم قبول طلب الطالب: ${req.studentName} وإلحاقه برحلة ${req.scheduledTime}`, `Trip: ${assignedTripId}`);
      addToast(`تمت الموافقة على طلب الطالب (${req.studentName}) وتسكينه بنجاح.`);
    } catch (err: any) {
      addToast(`فشل اعتماد الطلب الاستثنائي: ${err.message}`, 'error');
    }
  };

  const rejectExceptionalBooking = async (requestId: string) => {
    const req = exceptionalRequests.find(r => r.id === requestId);
    if (!req) return;
    const updatedReq = { ...req, status: 'rejected' as const };
    try {
      await persistDocument(COLLECTIONS.EXCEPTIONAL_REQUESTS, requestId, updatedReq);
      setExceptionalRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
      addAuditLog('رفض طلب استثنائي', `تم رفض طلب الطالب: ${req.studentName}`, `Request: ${requestId}`);
      addToast(`تم رفض الطلب الاستثنائي للطالب (${req.studentName}).`, 'info');
    } catch (err: any) {
      addToast(`فشل تسجيل رفض الطلب: ${err.message}`, 'error');
    }
  };

  const startNewOperatingDay = async (newDate: string) => {
    setActiveOperatingDate(newDate);

    const existingForDate = trips.filter(t => t.date === newDate);
    if (existingForDate.length === 0) {
      const newDayTrips: Trip[] = [];
      let codeNum = 801;

      lines.filter(l => l.activeStatus).forEach((line) => {
        const uni = universities.find(u => u.id === line.universityId) || universities[0];
        const applicableTemplates = tripTemplates.filter(t => t.activeStatus && t.isDefault);

        applicableTemplates.forEach((tmpl, tmplIdx) => {
          const bus = buses.length > 0 ? (buses[tmplIdx % buses.length] || buses[0]) : undefined;
          const driver = drivers.length > 0 ? (drivers[tmplIdx % drivers.length] || drivers[0]) : undefined;
          const busCap = bus?.capacity || 14;

          const lineSubscriptions = subscriptions.filter(s => s.lineId === line.id && s.status === 'active');
          const cleanManifest = lineSubscriptions.slice(0, Math.floor(busCap * 0.75)).map(sub => {
            const st = line.stations.find(s => s.id === sub.stationId) || line.stations[0];
            return {
              studentId: sub.studentId,
              studentName: sub.studentName,
              phone: '01000000000',
              stationId: st?.id || 'st-default',
              stationNameAr: st?.nameAr || 'المحطة المعتمدة',
              rsvpStatus: 'unconfirmed' as const,
              boardedStatus: 'waiting' as const
            };
          });

          newDayTrips.push({
            id: `trip-${newDate}-${line.id}-${tmpl.id}`,
            companyId: activeCompanyId,
            code: `TRIP-${codeNum++}`,
            date: newDate,
            universityId: uni?.id || '',
            universityNameAr: uni?.nameAr || '',
            lineId: line.id,
            lineNameAr: line.nameAr,
            direction: tmpl.direction,
            scheduledTime: tmpl.time,
            busId: bus?.id || '',
            busPlate: bus?.plateNumber || 'غير معين',
            capacity: busCap,
            driverId: driver?.id || '',
            driverNameAr: driver?.nameAr || 'غير معين',
            driverPhone: driver?.phone || '',
            status: 'scheduled',
            currentStopIndex: 0,
            delayMinutes: 0,
            stops: line.stations.map((s, idx) => ({
              stopId: `stop-${idx + 1}-${newDate}-${line.id}-${tmpl.id}`,
              stationId: s.id,
              stationNameAr: s.nameAr,
              orderIndex: s.orderIndex,
              scheduledArrivalTime: tmpl.time,
              status: 'pending' as const
            })),
            manifest: cleanManifest
          });
        });
      });

      try {
        await Promise.all(newDayTrips.map(t => persistDocument(COLLECTIONS.TRIPS, t.id, t)));
        setTrips(prev => [...newDayTrips, ...prev]);
        addAuditLog('بدء يوم تشغيل جديد', `تم فتح وبدء يوم التشغيل الجديد بتاريخ ${newDate} بنجاح وأرشفة الأيام السابقة بأمان`, `Date: ${newDate}`);
        addToast(`تم بدء يوم تشغيل جديد بنجاح (${newDate}) مع الحفاظ على كامل السجلات التاريخية والأرشيف.`, 'success');
      } catch (err: any) {
        addToast(`فشل حفظ رحلات اليوم الجديد في قاعدة البيانات: ${err.message}`, 'error');
      }
    } else {
      addToast(`تم الانتقال إلى يوم التشغيل (${newDate}).`, 'info');
    }
  };

  const autoAssignBusesForPlan = async (planDate: string) => {
    const sortedFleet = [...buses].filter(b => b.activeStatus).sort((a, b) => b.capacity - a.capacity);
    if (sortedFleet.length === 0) {
      addToast('لا توجد حافلات نشطة في هذه الشركة لتوزيعها على الرحلات.', 'error');
      return;
    }

    const updatedTrips = trips.map(t => {
      if (t.date !== planDate) return t;

      const registeredCount = t.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
      let bestBus = sortedFleet.find(b => b.capacity >= registeredCount);
      if (!bestBus) bestBus = sortedFleet[0];

      const assignedDriver = drivers.find(d => d.assignedBusId === bestBus?.id && d.status === 'active') || drivers[0];

      return {
        ...t,
        busId: bestBus?.id || t.busId,
        busPlate: bestBus?.plateNumber || t.busPlate,
        capacity: bestBus?.capacity || t.capacity,
        driverId: assignedDriver?.id || t.driverId,
        driverNameAr: assignedDriver?.nameAr || t.driverNameAr,
        driverPhone: assignedDriver?.phone || t.driverPhone
      };
    });

    try {
      const changed = updatedTrips.filter(t => t.date === planDate);
      await Promise.all(changed.map(t => persistDocument(COLLECTIONS.TRIPS, t.id, t)));
      setTrips(updatedTrips);
      addAuditLog('توزيع الحافلات آلياً', `تم توزيع الحافلات تلقائياً وفقاً لحجم الركاب ليوم ${planDate}`, `PlanDate: ${planDate}`);
      addToast(`تم توزيع واقتراح الحافلات آلياً ليوم (${planDate}) بحسب سعات الأسطول الفعلية (14، 28، 33 راكب).`, 'success');
    } catch (err: any) {
      addToast(`فشل حفظ توزيع الحافلات في السحابة: ${err.message}`, 'error');
    }
  };

  const approveDailyPlan = async (planDate: string) => {
    const updatedTrips = trips.map(t => {
      if (t.date === planDate) {
        return { ...t, status: 'scheduled' as const };
      }
      return t;
    });

    try {
      const changed = updatedTrips.filter(t => t.date === planDate);
      await Promise.all(changed.map(t => persistDocument(COLLECTIONS.TRIPS, t.id, t)));
      setTrips(updatedTrips);
      addAuditLog('اعتماد خطة التشغيل', `تم اعتماد ونشر خطة رحلات يوم ${planDate}`, `PlanDate: ${planDate}`);
      addToast(`تم اعتماد خطة تشغيل يوم (${planDate}) ونشر مواعيد الحافلات بنجاح!`, 'success');
    } catch (err: any) {
      addToast(`فشل اعتماد الخطة في قاعدة البيانات: ${err.message}`, 'error');
    }
  };

  const toggleStudentAssignmentMode = async () => {
    const currentMode = settings.studentAssignmentMode || 'auto_assigned';
    const nextMode: 'auto_assigned' | 'open_boarding' = currentMode === 'auto_assigned' ? 'open_boarding' : 'auto_assigned';
    const before = { ...settings };
    const updated = { ...settings, studentAssignmentMode: nextMode, companyId: activeCompanyId };

    try {
      await persistDocument(COLLECTIONS.SETTINGS, activeSettingsDocId, updated);
      setSettings(updated);
      addAuditLog('تغيير وضع تخصيص الحافلات', `تم التبديل إلى: ${nextMode === 'auto_assigned' ? 'تخصيص آلي محدد للطلاب' : 'صعود مرن مفتوح'}`, 'SystemSettings', {
        targetCollection: COLLECTIONS.SETTINGS,
        targetDocId: activeSettingsDocId,
        beforeState: before,
        afterState: updated,
        reversible: true,
      });
      addToast(
        nextMode === 'auto_assigned'
          ? 'تم تفعيل وضع "التخصيص المسبق للطلاب": يظهر لكل طالب الحافلة المخصصة له تحديداً ورقم اللوحة.'
          : 'تم تفعيل وضع "الصعود المرن المفتوح": يمكن للطلاب ركوب أي حافلة تصل محطتهم.',
        'info'
      );
    } catch (err: any) {
      recordDiagnosticError('تغيير وضع التخصيص', `${COLLECTIONS.SETTINGS}/${activeSettingsDocId}`, err);
      addToast(`فشل حفظ تغيير وضع التخصيص: ${err.message}`, 'error');
    }
  };

  const autoAllocateStudentsToSlotBuses = async (slotFilter?: { date: string; lineId?: string; scheduledTime?: string }) => {
    let matchedTrips = trips;
    if (slotFilter) {
      matchedTrips = trips.filter(t =>
        t.date === slotFilter.date &&
        (!slotFilter.lineId || t.lineId === slotFilter.lineId) &&
        (!slotFilter.scheduledTime || t.scheduledTime === slotFilter.scheduledTime)
      );
    } else {
      matchedTrips = trips.filter(t => t.date === activeOperatingDate);
    }

    if (matchedTrips.length === 0) return;

    const slotMap = new Map<string, Trip[]>();
    matchedTrips.forEach(t => {
      const key = `${t.date}_${t.lineId}_${t.scheduledTime}_${t.direction}`;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key)!.push(t);
    });

    const updatedTripMap = new Map<string, Trip>();

    slotMap.forEach((tripsInSlot) => {
      const studentMap = new Map<string, ManifestStudent>();
      tripsInSlot.forEach(t => {
        t.manifest.forEach(m => {
          if (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded') {
            if (!studentMap.has(m.studentId)) {
              studentMap.set(m.studentId, { ...m });
            }
          }
        });
      });

      const allStudents = Array.from(studentMap.values());
      const sortedTrips = [...tripsInSlot].sort((a, b) => b.capacity - a.capacity);

      let currentStudentIdx = 0;
      sortedTrips.forEach(t => {
        const busStudents: ManifestStudent[] = [];
        for (let i = 0; i < t.capacity && currentStudentIdx < allStudents.length; i++) {
          busStudents.push({
            ...allStudents[currentStudentIdx],
            rsvpStatus: 'confirmed'
          });
          currentStudentIdx++;
        }
        const updated = {
          ...t,
          manifest: busStudents
        };
        updatedTripMap.set(t.id, updated);
      });
    });

    const allUpdatedList = Array.from(updatedTripMap.values());
    const updatedSettingsObj = { ...settings, studentAssignmentMode: 'auto_assigned' as const, companyId: activeCompanyId };

    try {
      await Promise.all([
        ...allUpdatedList.map(t => persistDocument(COLLECTIONS.TRIPS, t.id, t)),
        persistDocument(COLLECTIONS.SETTINGS, activeSettingsDocId, updatedSettingsObj)
      ]);
      setTrips(prev => prev.map(t => updatedTripMap.has(t.id) ? updatedTripMap.get(t.id)! : t));
      setSettings(updatedSettingsObj);
      addAuditLog('تخصيص الطلاب آلياً', 'تم إجراء توزيع متوازن للطلاب على مقاعد وسعات الحافلات المتاحة', 'Operations');
      addToast('تم التخصيص والتوزيع الآلي المتوازن للطلاب على الحافلات بنجاح وفقاً لسعات الأسطول.', 'success');
    } catch (err: any) {
      recordDiagnosticError('تخصيص الطلاب آلياً', COLLECTIONS.TRIPS, err);
      addToast(`فشل حفظ التخصيص الآلي في قاعدة البيانات: ${err.message}`, 'error');
    }
  };

  const batchUpdateStudentBoarding = async (tripId: string, studentIds: string[], status: 'boarded' | 'waiting' | 'no_show') => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());
    const updatedTrip = {
      ...trip,
      manifest: trip.manifest.map(m => {
        if (studentIds.includes(m.studentId)) {
          return {
            ...m,
            boardedStatus: status,
            boardedAt: status === 'boarded' ? (m.boardedAt || nowTime) : undefined
          };
        }
        return m;
      })
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, updatedTrip);
      setTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
      addToast(`تم تحديث حالة ركوب ${studentIds.length} طالب بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تحديث صعود جماعي', `${COLLECTIONS.TRIPS}/${tripId}`, err);
      addToast(`فشل حفظ حالة ركوب الطلاب: ${err.message}`, 'error');
    }
  };

  const reassignStudentToTrip = async (currentTripId: string, targetTripId: string, studentId: string): Promise<boolean> => {
    const currentTrip = trips.find(t => t.id === currentTripId);
    const targetTrip = trips.find(t => t.id === targetTripId);
    if (!currentTrip || !targetTrip || currentTripId === targetTripId) return false;

    const studentRecord = (currentTrip.manifest || []).find(m => m.studentId === studentId);
    if (!studentRecord) return false;

    const alreadyInTarget = (targetTrip.manifest || []).some(m => m.studentId === studentId);
    const targetActiveCount = (targetTrip.manifest || []).filter(
      m =>
        m.externalHandoffStatus !== 'handed_off' &&
        (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded')
    ).length;

    if (!alreadyInTarget && targetActiveCount >= targetTrip.capacity) {
      addToast('عذراً! الحافلة المستهدفة ممتلئة بالكامل.', 'error');
      return false;
    }

    const cleanedRecord: ManifestStudent = {
      ...studentRecord,
      rsvpStatus: studentRecord.rsvpStatus === 'excused' ? 'confirmed' : studentRecord.rsvpStatus,
      boardedStatus: 'waiting',
      boardedAt: undefined,
      externalHandoffStatus: undefined,
      externalHandoffNote: undefined,
      externalHandoffAt: undefined,
    };

    const updatedSource: Trip = {
      ...currentTrip,
      manifest: (currentTrip.manifest || []).filter(m => m.studentId !== studentId)
    };
    const updatedTarget: Trip = {
      ...targetTrip,
      manifest: alreadyInTarget
        ? (targetTrip.manifest || []).map(m => (m.studentId === studentId ? cleanedRecord : m))
        : [...(targetTrip.manifest || []), cleanedRecord]
    };

    try {
      await Promise.all([
        persistDocument(COLLECTIONS.TRIPS, currentTripId, { manifest: updatedSource.manifest }),
        persistDocument(COLLECTIONS.TRIPS, targetTripId, { manifest: updatedTarget.manifest })
      ]);
      setTrips(prev => prev.map(t => {
        if (t.id === currentTripId) return updatedSource;
        if (t.id === targetTripId) return updatedTarget;
        return t;
      }));
      addAuditLog(
        'إعادة تعيين سريع لطالب',
        `نقل الطالب (${studentRecord.studentName}) من حافلة كابتن ${currentTrip.driverNameAr} (${currentTrip.busPlate}) إلى حافلة كابتن ${targetTrip.driverNameAr} (${targetTrip.busPlate}) المتجهة لـ ${targetTrip.universityNameAr}`,
        `Student: ${studentId} -> Trip: ${targetTripId}`
      );
      addToast(
        `تم نقل وتعيين (${studentRecord.studentName}) إلى حافلة كابتن ${targetTrip.driverNameAr} (${targetTrip.busPlate}) المتجهة لـ ${targetTrip.universityNameAr} بنجاح.`,
        'success'
      );
      return true;
    } catch (err: any) {
      recordDiagnosticError('نقل طالب بين رحلتين', `${COLLECTIONS.TRIPS}/${targetTripId}`, err);
      addToast(`فشل نقل الطالب في قاعدة البيانات: ${err.message}`, 'error');
      return false;
    }
  };

  const createTrip = async (newTripData: Partial<Trip>) => {
    const selectedLine = lines.find(l => l.id === newTripData.lineId) || lines[0];
    const selectedUni = universities.find(u => u.id === newTripData.universityId) || universities[0];
    const selectedBus = buses.find(b => b.id === newTripData.busId) || buses[0];
    const selectedDriver = drivers.find(d => d.id === newTripData.driverId) || drivers[0];
    const direction = newTripData.direction || 'to_university';
    const scheduledTime = newTripData.scheduledTime || '07:00 ص';

    const orderedStations = direction === 'from_university'
      ? [...(selectedLine?.stations || [])].reverse()
      : (selectedLine?.stations || []);

    const newTripId = `trip-${Date.now()}`;
    const newTrip: Trip = {
      id: newTripId,
      companyId: activeCompanyId,
      code: newTripData.code || `TRIP-${Math.floor(100 + Math.random() * 900)}`,
      date: newTripData.date || activeOperatingDate,
      universityId: selectedUni?.id || '',
      universityNameAr: selectedUni?.nameAr || '',
      lineId: selectedLine?.id || '',
      lineNameAr: selectedLine?.nameAr || '',
      direction,
      scheduledTime,
      busId: selectedBus?.id || '',
      busPlate: selectedBus?.plateNumber || '',
      capacity: newTripData.capacity || selectedBus?.capacity || 14,
      driverId: selectedDriver?.id || '',
      driverNameAr: selectedDriver?.nameAr || '',
      driverPhone: selectedDriver?.phone || '',
      status: 'scheduled',
      currentStopIndex: 0,
      delayMinutes: 0,
      stops: orderedStations.map((s, idx) => ({
        stopId: `stop-${newTripId}-${s.id}`,
        stationId: s.id,
        stationNameAr: s.nameAr,
        orderIndex: idx + 1,
        scheduledArrivalTime: scheduledTime,
        status: 'pending' as const,
      })),
      manifest: [],
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, newTrip.id, newTrip);
      setTrips(prev => [newTrip, ...prev]);
      addAuditLog('جدولة رحلة جديدة', `تمت جدولة الرحلة ${newTrip.code} بتاريخ ${newTrip.date}`, `Trip: ${newTrip.id}`, {
        targetCollection: COLLECTIONS.TRIPS,
        targetDocId: newTrip.id,
        beforeState: null,
        afterState: newTrip,
        reversible: true,
      });
      addToast(`تمت جدولة رحلة جديدة (${newTrip.code}) وحفظها بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('جدولة رحلة', COLLECTIONS.TRIPS, err);
      addToast(`فشل إنشاء الرحلة في قاعدة البيانات: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // PLATFORM SUPER ADMIN & OWNER INTERVENTION
  // ==========================================
  const createCompany = async (data: Omit<Company, 'id' | 'createdAt'>): Promise<Company> => {
    if (authenticatedUser?.role !== 'super_admin') {
      throw new Error('غير مصرح: إنشاء الشركات مقتصر على مالك المنصة.');
    }
    const today = getCairoTodayDateString(0);
    const id = `comp-${data.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const newCompany: Company = {
      ...data,
      id,
      createdAt: today,
    };
    try {
      await persistDocument(COLLECTIONS.COMPANIES, newCompany.id, newCompany);
      await syncCompanyDirectoryEntry(newCompany);
      // Create default company settings document cleanly
      const compSettings: SystemSettings = { ...initialSettings, companyId: newCompany.id };
      await persistDocument(COLLECTIONS.SETTINGS, `company_${newCompany.id}`, compSettings);
      setAllCompanies(prev => [newCompany, ...prev]);
      setPublicCompanyDirectory(prev => [
        { id: newCompany.id, nameAr: newCompany.nameAr, code: newCompany.code, status: newCompany.status },
        ...prev.filter(x => x.id !== newCompany.id)
      ]);
      setSettingsById(prev => ({ ...prev, [`company_${newCompany.id}`]: compSettings }));
      addAuditLog(
        'إنشاء شركة جديدة',
        `تم إنشاء الشركة "${newCompany.nameAr}" (${newCompany.code}) بخطة ${newCompany.planName}`,
        `Company: ${newCompany.id}`,
        {
          targetCollection: COLLECTIONS.COMPANIES,
          targetDocId: newCompany.id,
          beforeState: null,
          afterState: newCompany,
          reversible: true,
          companyIdOverride: newCompany.id,
        }
      );
      addToast(`تم إنشاء شركة "${newCompany.nameAr}" وتفعيل بيئتها المستقلة بنجاح!`);
      return newCompany;
    } catch (err: any) {
      recordDiagnosticError('إنشاء شركة', COLLECTIONS.COMPANIES, err);
      addToast(`فشل إنشاء الشركة: ${err.message}`, 'error');
      throw err;
    }
  };

  const updateCompany = async (companyId: string, data: Partial<Company>, reason?: string) => {
    const before = companies.find(c => c.id === companyId);
    if (!before) return;
    const after = { ...before, ...data };
    try {
      await persistDocument(COLLECTIONS.COMPANIES, companyId, after);
      await syncCompanyDirectoryEntry(after);
      setAllCompanies(prev => {
        const exists = prev.some(c => c.id === companyId);
        return exists ? prev.map(c => c.id === companyId ? after : c) : [after, ...prev];
      });
      setPublicCompanyDirectory(prev => {
        const entry = { id: after.id, nameAr: after.nameAr, code: after.code, status: after.status };
        return prev.some(x => x.id === companyId)
          ? prev.map(x => x.id === companyId ? entry : x)
          : [entry, ...prev];
      });
      addAuditLog(
        'تعديل بيانات/اشتراك شركة',
        `تم تحديث بيانات شركة ${after.nameAr}`,
        `Company: ${companyId}`,
        {
          targetCollection: COLLECTIONS.COMPANIES,
          targetDocId: companyId,
          beforeState: before,
          afterState: after,
          reversible: true,
          interventionReason: reason,
          companyIdOverride: companyId,
        }
      );
      addToast(`تم حفظ تحديثات شركة "${after.nameAr}" بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تحديث شركة', `${COLLECTIONS.COMPANIES}/${companyId}`, err);
      addToast(`فشل تحديث بيانات الشركة: ${err.message}`, 'error');
      throw err;
    }
  };

  const toggleCompanyStatus = async (companyId: string, reason?: string) => {
    const before = companies.find(c => c.id === companyId);
    if (!before) return;
    const nextStatus = before.status === 'active' ? 'suspended' : 'active';
    const after: Company = {
      ...before,
      status: nextStatus,
      suspendedReason: nextStatus === 'suspended' ? (reason || 'تعليق مؤقت من مالك المنصة') : undefined,
    };
    try {
      await persistDocument(COLLECTIONS.COMPANIES, companyId, after);
      await syncCompanyDirectoryEntry(after);
      setAllCompanies(prev => {
        const exists = prev.some(c => c.id === companyId);
        return exists ? prev.map(c => c.id === companyId ? after : c) : [after, ...prev];
      });
      setPublicCompanyDirectory(prev => {
        const entry = { id: after.id, nameAr: after.nameAr, code: after.code, status: after.status };
        return prev.some(x => x.id === companyId)
          ? prev.map(x => x.id === companyId ? entry : x)
          : [entry, ...prev];
      });
      addAuditLog(
        nextStatus === 'active' ? 'إعادة تفعيل شركة' : 'تعليق شركة مؤقتاً',
        `تم تغيير حالة الشركة "${before.nameAr}" إلى ${nextStatus === 'active' ? 'نشطة' : 'موقوفة مؤقتاً'} مع حفظ جميع البيانات`,
        `Company: ${companyId}`,
        {
          targetCollection: COLLECTIONS.COMPANIES,
          targetDocId: companyId,
          beforeState: before,
          afterState: after,
          reversible: true,
          interventionReason: reason,
          companyIdOverride: companyId,
        }
      );
      addToast(
        nextStatus === 'active'
          ? `تمت إعادة تفعيل شركة "${before.nameAr}" بنجاح.`
          : `تم إيقاف شركة "${before.nameAr}" مؤقتاً عبر القواعد السحابية مع الحفاظ على كافة بياناتها.`
      );
    } catch (err: any) {
      recordDiagnosticError('تعليق/تفعيل شركة', `${COLLECTIONS.COMPANIES}/${companyId}`, err);
      addToast(`فشل تغيير حالة الشركة: ${err.message}`, 'error');
    }
  };

  const seedTwoTestCompaniesAction = async (): Promise<SeedingResult> => {
    const res = await seedTwoTestCompanies(authenticatedUser || currentUser);
    if (res.success) {
      addAuditLog(
        'تهيئة شركتين تجريبيتين',
        'تم إنشاء بيانات شركتين منفصلتين (UniBus مصر + الدلتا للنقل الجامعي) لاختبار العزل والتدقيق',
        'Platform: Seeding'
      );
      addToast(res.message, 'success');
    } else {
      addToast(res.message, 'error');
    }
    return res;
  };

  const backfillLegacyCompanyAction = async (): Promise<number> => {
    if (authenticatedUser?.role !== 'super_admin') return 0;
    const cols = [
      COLLECTIONS.UNIVERSITIES,
      COLLECTIONS.ROUTES,
      COLLECTIONS.BUSES,
      COLLECTIONS.DRIVERS,
      COLLECTIONS.TRIP_TEMPLATES,
      COLLECTIONS.TRIPS,
      COLLECTIONS.USERS,
      COLLECTIONS.SUBSCRIPTIONS,
      COLLECTIONS.INCIDENTS,
      COLLECTIONS.PROPOSALS,
      COLLECTIONS.EXCEPTIONAL_REQUESTS,
    ];
    let updatedCount = 0;
    try {
      for (const colName of cols) {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          const data = d.data();
          if (!data.companyId) {
            await persistDocument(colName, d.id, { companyId: DEFAULT_COMPANY_ID });
            updatedCount++;
          }
        }
      }
      addAuditLog(
        'ربط السجلات القديمة بالشركة الرئيسية',
        `تم وسم ${updatedCount} سجل قديم بمعرف الشركة الرئيسية (${DEFAULT_COMPANY_ID}) لضمان التوافق مع قواعد العزل.`,
        'Platform: Backfill'
      );
      addToast(`تم ربط ${updatedCount} سجل قديم بالشركة الرئيسية بنجاح!`);
      return updatedCount;
    } catch (err: any) {
      recordDiagnosticError('ربط السجلات القديمة', 'AllCollections', err);
      addToast(`فشل ربط السجلات القديمة: ${err.message}`, 'error');
      return 0;
    }
  };

  const createCompanyUser = async (
    data: Omit<User, 'id' | 'companyId'> & { companyId?: string; licenseNumber?: string },
    reason?: string
  ): Promise<User> => {
    const targetCompanyId = data.companyId || activeCompanyId;
    const newId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const safeRole: Exclude<UserRole, 'super_admin'> = data.role === 'super_admin' ? 'admin' : data.role;
      const newUser: User = {
      id: newId,
      companyId: targetCompanyId,
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      role: safeRole,
      isGeneralSupervisor: safeRole === 'supervisor' ? Boolean(data.isGeneralSupervisor) : undefined,
      status: data.status || 'active',
      universityId: data.universityId || undefined,
      lineId: data.lineId || undefined,
      stationId: data.stationId || undefined,
      assignedBusId: data.assignedBusId || undefined,
    };

    try {
      await persistDocument(COLLECTIONS.USERS, newUser.id, newUser);
      await syncPhoneDirectoryEntry(newUser).catch(() => {});
      setAllUsers(prev => [newUser, ...prev]);

      let createdDriverId: string | undefined;
      if (newUser.role === 'driver') {
        const newDriver: Driver = {
          id: `drv-${newUser.id}`,
          companyId: targetCompanyId,
          userId: newUser.id,
          nameAr: newUser.name,
          phone: newUser.phone,
          licenseNumber: data.licenseNumber || 'DL-NEW',
          status: 'active',
          assignedBusId: newUser.assignedBusId,
        };
        createdDriverId = newDriver.id;
        await persistDocument(COLLECTIONS.DRIVERS, newDriver.id, newDriver);
        setAllDrivers(prev => [newDriver, ...prev]);
      }

      // Issue automatic email-verified activation invite if an email was optionally provided
      if (newUser.email) {
        const inviteId = emailToInviteId(newUser.email);
        const compName = companies.find(c => c.id === targetCompanyId)?.nameAr;
        const invite: StaffInvite = {
          id: inviteId,
          email: newUser.email,
          emailLower: newUser.email.toLowerCase(),
          companyId: targetCompanyId,
          companyNameAr: compName,
          name: newUser.name,
          phone: newUser.phone,
          role: safeRole,
          isGeneralSupervisor: safeRole === 'supervisor' ? Boolean(data.isGeneralSupervisor) : undefined,
          assignedBusId: newUser.assignedBusId,
          licenseNumber: data.licenseNumber || undefined,
          universityId: newUser.universityId,
          lineId: newUser.lineId,
          stationId: newUser.stationId,
          preProvisionedUserId: newUser.id,
          preProvisionedDriverId: createdDriverId,
          status: 'pending',
          invitedByName: (authenticatedUser || currentUser).name,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        await persistDocument(COLLECTIONS.STAFF_INVITES, invite.id, invite);
        setAllStaffInvites(prev => [invite, ...prev.filter(x => x.id !== invite.id)]);
      }

      addAuditLog(
        'إضافة مستخدم جديد',
        `تمت إضافة ${newUser.name} (${newUser.role} - ${newUser.phone}) إلى شركة ${targetCompanyId}`,
        `User: ${newUser.id}`,
        {
          targetCollection: COLLECTIONS.USERS,
          targetDocId: newUser.id,
          beforeState: null,
          afterState: newUser,
          reversible: true,
          interventionReason: reason,
          companyIdOverride: targetCompanyId,
        }
      );
      addToast(`تمت إضافة "${newUser.name}" (${newUser.phone}) بنجاح! يمكنه الدخول مباشرة برقم هاتفه واسمه.`);
      return newUser;
    } catch (err: any) {
      recordDiagnosticError('إضافة مستخدم', COLLECTIONS.USERS, err);
      addToast(`فشل إضافة المستخدم: ${err.message}`, 'error');
      throw err;
    }
  };

  const cancelStaffInvite = async (inviteId: string) => {
    try {
      await deleteDocument(COLLECTIONS.STAFF_INVITES, inviteId);
      setAllStaffInvites(prev => prev.filter(i => i.id !== inviteId));
      addToast('تم إلغاء دعوة التفعيل بنجاح.');
    } catch (err: any) {
      recordDiagnosticError('إلغاء دعوة موظف', `${COLLECTIONS.STAFF_INVITES}/${inviteId}`, err);
      addToast(`فشل إلغاء الدعوة: ${err.message}`, 'error');
    }
  };

  const updateUserDetails = async (userId: string, data: Partial<User>, reason?: string) => {
    const before = allUsers.find(u => u.id === userId);
    if (!before) return;
    if (data.role === 'super_admin' && before.role !== 'super_admin') {
      throw new Error('لا يمكن ترقية مستخدم إلى مالك منصة من هذا النموذج.');
    }
    const after: User = { ...before, ...data };
    try {
      await persistDocument(COLLECTIONS.USERS, userId, after);
      await syncPhoneDirectoryEntry(after).catch(() => {});
      setAllUsers(prev => prev.map(u => u.id === userId ? after : u));

      // Sync driver record if exists
      const linkedDriver = allDrivers.find(d => d.userId === userId || d.id === `drv-${userId}`);
      if (linkedDriver) {
        const updatedDriver: Driver = {
          ...linkedDriver,
          nameAr: after.name,
          phone: after.phone,
          assignedBusId: after.assignedBusId,
        };
        await persistDocument(COLLECTIONS.DRIVERS, linkedDriver.id, updatedDriver);
        setAllDrivers(prev => prev.map(d => d.id === linkedDriver.id ? updatedDriver : d));
      }

      addAuditLog(
        'تعديل بيانات مستخدم',
        `تم تعديل بيانات المستخدم ${after.name}`,
        `User: ${userId}`,
        {
          targetCollection: COLLECTIONS.USERS,
          targetDocId: userId,
          beforeState: before,
          afterState: after,
          reversible: true,
          interventionReason: reason,
          companyIdOverride: after.companyId || activeCompanyId,
        }
      );
      addToast(`تم تحديث بيانات "${after.name}" بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تعديل مستخدم', `${COLLECTIONS.USERS}/${userId}`, err);
      addToast(`فشل تحديث بيانات المستخدم: ${err.message}`, 'error');
      throw err;
    }
  };

  const transferUserToCompany = async (userId: string, targetCompanyId: string, reason: string) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    const validation = dataService.validateUserCompanyTransfer(user, targetCompanyId, allTrips);
    if (!validation.allowed) {
      addToast(validation.reason || 'لا يمكن نقل المستخدم حالياً.', 'error');
      throw new Error(validation.reason);
    }

    const linkedDriver = allDrivers.find(d => d.userId === userId || d.id === `drv-${userId}`);
    const sourceCompId = user.companyId || DEFAULT_COMPANY_ID;
    const targetComp = companies.find(c => c.id === targetCompanyId);

    try {
      const transferred = await transferUserCompanyTransaction(
        user,
        targetCompanyId,
        validation.affectedTripIds,
        linkedDriver?.id
      );

      setAllUsers(prev => prev.map(u => u.id === userId ? transferred : u));
      if (validation.affectedTripIds.length > 0) {
        setAllTrips(prev =>
          prev.map(t =>
            validation.affectedTripIds.includes(t.id)
              ? { ...t, manifest: (t.manifest || []).filter(m => m.studentId !== userId) }
              : t
          )
        );
      }
      if (linkedDriver) {
        setAllDrivers(prev =>
          prev.map(d =>
            d.id === linkedDriver.id ? { ...d, companyId: targetCompanyId, assignedBusId: undefined } : d
          )
        );
      }

      addAuditLog(
        'نقل مستخدم إلى شركة أخرى',
        `نقل ${user.name} من ${sourceCompId} إلى ${targetComp?.nameAr || targetCompanyId} مع تنظيف ${validation.affectedTripIds.length} رحلات مفتوحة.`,
        `User: ${userId}`,
        {
          targetCollection: COLLECTIONS.USERS,
          targetDocId: userId,
          beforeState: user,
          afterState: transferred,
          reversible: true,
          interventionReason: reason,
          companyIdOverride: targetCompanyId,
        }
      );
      addToast(`تم نقل "${user.name}" إلى "${targetComp?.nameAr || targetCompanyId}" بأمان ودون خلط سجلات!`);
    } catch (err: any) {
      recordDiagnosticError('نقل مستخدم بين الشركات', `${COLLECTIONS.USERS}/${userId}`, err);
      addToast(`فشل نقل المستخدم: ${err.message}`, 'error');
      throw err;
    }
  };

  const deleteUserSafe = async (userId: string, reason: string) => {
    const targetUser = allUsers.find(u => u.id === userId);
    if (!targetUser) return;
    if (targetUser.role === 'super_admin') {
      addToast('لا يمكن حذف حساب مالك المنصة.', 'error');
      return;
    }
    const deps = dataService.inspectEntityDependencies('user', userId, {
      lines: allLines,
      trips: allTrips,
      users: allUsers,
      drivers: allDrivers,
      buses: allBuses,
    });
    if (deps.blockingCount > 0) {
      addToast(`منع الحذف لحماية البيانات: ${deps.details.join('، ')}`, 'error');
      return;
    }

    try {
      await deleteDocument(COLLECTIONS.USERS, userId);
      await removePhoneDirectoryEntry(targetUser.phone);
      setAllUsers(prev => prev.filter(u => u.id !== userId));
      addAuditLog('حذف حساب مستخدم (تدخل إداري)', `تم حذف ${targetUser.name}`, `User: ${userId}`, {
        targetCollection: COLLECTIONS.USERS,
        targetDocId: userId,
        beforeState: targetUser,
        afterState: null,
        reversible: true,
        interventionReason: reason,
        companyIdOverride: targetUser.companyId || activeCompanyId,
      });
      addToast(`تم حذف حساب "${targetUser.name}" بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('حذف مستخدم', `${COLLECTIONS.USERS}/${userId}`, err);
      addToast(`فشل حذف المستخدم: ${err.message}`, 'error');
    }
  };

  const updateTripDetails = async (tripId: string, data: Partial<Trip>, reason?: string) => {
    const before = allTrips.find(t => t.id === tripId);
    if (!before) return;

    const selectedBus = data.busId ? buses.find(b => b.id === data.busId) : undefined;
    const selectedDriver = data.driverId ? drivers.find(d => d.id === data.driverId) : undefined;
    const selectedLine = data.lineId ? lines.find(l => l.id === data.lineId) : undefined;
    const selectedUni = data.universityId ? universities.find(u => u.id === data.universityId) : undefined;

    const after: Trip = {
      ...before,
      ...data,
      busPlate: selectedBus ? selectedBus.plateNumber : (data.busPlate ?? before.busPlate),
      capacity: selectedBus ? selectedBus.capacity : (data.capacity ?? before.capacity),
      driverNameAr: selectedDriver ? selectedDriver.nameAr : (data.driverNameAr ?? before.driverNameAr),
      driverPhone: selectedDriver ? selectedDriver.phone : (data.driverPhone ?? before.driverPhone),
      lineNameAr: selectedLine ? selectedLine.nameAr : (data.lineNameAr ?? before.lineNameAr),
      universityNameAr: selectedUni ? selectedUni.nameAr : (data.universityNameAr ?? before.universityNameAr),
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, after);
      setAllTrips(prev => prev.map(t => t.id === tripId ? after : t));
      addAuditLog(
        'تعديل تفاصيل رحلة (تدخل إداري)',
        `تم تحديث رحلة ${after.code} (${after.scheduledTime} - ${after.busPlate})`,
        `Trip: ${tripId}`,
        {
          targetCollection: COLLECTIONS.TRIPS,
          targetDocId: tripId,
          beforeState: before,
          afterState: after,
          reversible: true,
          interventionReason: reason,
          companyIdOverride: after.companyId || activeCompanyId,
        }
      );
      addToast(`تم تحديث رحلة (${after.code}) وحفظها بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('تعديل رحلة', `${COLLECTIONS.TRIPS}/${tripId}`, err);
      addToast(`فشل تعديل الرحلة: ${err.message}`, 'error');
      throw err;
    }
  };

  const addStudentToTrip = async (tripId: string, student: User, reason?: string) => {
    const before = trips.find(t => t.id === tripId);
    if (!before) return;
    if ((before.manifest || []).some(m => m.studentId === student.id)) {
      addToast(`الطالب "${student.name}" مسجل بالفعل في هذه الرحلة.`, 'info');
      return;
    }

    const tripLine = lines.find(l => l.id === before.lineId);
    const st = tripLine?.stations.find(s => s.id === student.stationId) || tripLine?.stations[0];
    const nowTime = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date());

    const studentUniName = universities.find(u => u.id === student.universityId)?.nameAr;
    const newPassenger: ManifestStudent = {
      studentId: student.id,
      studentName: student.name,
      phone: student.phone,
      stationId: st?.id || 'st-default',
      stationNameAr: st?.nameAr || 'المحطة المعتمدة',
      rsvpStatus: 'confirmed',
      rsvpConfirmedAt: nowTime,
      boardedStatus: 'waiting',
      studentUniversityId: student.universityId,
      studentUniversityNameAr: studentUniName,
    };

    const after: Trip = {
      ...before,
      manifest: [...(before.manifest || []), newPassenger],
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, after);
      setTrips(prev => prev.map(t => t.id === tripId ? after : t));
      addAuditLog(
        'إضافة طالب إلى رحلة',
        `تمت إضافة ${student.name} إلى رحلة ${before.code}`,
        `Trip: ${tripId}`,
        {
          targetCollection: COLLECTIONS.TRIPS,
          targetDocId: tripId,
          beforeState: before,
          afterState: after,
          reversible: true,
          interventionReason: reason,
        }
      );
      addToast(`تمت إضافة "${student.name}" إلى رحلة ${before.code}.`);
    } catch (err: any) {
      recordDiagnosticError('إضافة طالب لرحلة', `${COLLECTIONS.TRIPS}/${tripId}`, err);
      addToast(`فشل إضافة الطالب للرحلة: ${err.message}`, 'error');
    }
  };

  const removeStudentFromTrip = async (tripId: string, studentId: string, reason?: string) => {
    const before = trips.find(t => t.id === tripId);
    if (!before) return;
    const removed = (before.manifest || []).find(m => m.studentId === studentId);
    if (!removed) return;

    const after: Trip = {
      ...before,
      manifest: (before.manifest || []).filter(m => m.studentId !== studentId),
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, tripId, after);
      setTrips(prev => prev.map(t => t.id === tripId ? after : t));
      addAuditLog(
        'إزالة طالب من رحلة',
        `تمت إزالة ${removed.studentName} من رحلة ${before.code}`,
        `Trip: ${tripId}`,
        {
          targetCollection: COLLECTIONS.TRIPS,
          targetDocId: tripId,
          beforeState: before,
          afterState: after,
          reversible: true,
          interventionReason: reason,
        }
      );
      addToast(`تمت إزالة "${removed.studentName}" من رحلة ${before.code}.`);
    } catch (err: any) {
      recordDiagnosticError('إزالة طالب من رحلة', `${COLLECTIONS.TRIPS}/${tripId}`, err);
      addToast(`فشل إزالة الطالب: ${err.message}`, 'error');
    }
  };

  const splitMergedTrip = async (mergedTripId: string, reason?: string) => {
    const beforeMerged = trips.find(t => t.id === mergedTripId);
    if (!beforeMerged || !beforeMerged.mergedIntoTripId) {
      addToast('هذه الرحلة ليست مدمجة.', 'error');
      return;
    }
    const targetTrip = trips.find(t => t.id === beforeMerged.mergedIntoTripId);
    const restoredMerged: Trip = {
      ...beforeMerged,
      status: 'scheduled',
      mergedIntoTripId: undefined,
      notes: 'تم فصل الرحلة وإعادتها للتشغيل المستقل بواسطة مالك المنصة',
    };

    try {
      await persistDocument(COLLECTIONS.TRIPS, mergedTripId, restoredMerged);
      setTrips(prev => prev.map(t => t.id === mergedTripId ? restoredMerged : t));
      addAuditLog(
        'فصل رحلة مدمجة',
        `تم فك دمج الرحلة ${beforeMerged.code} عن ${targetTrip?.code || beforeMerged.mergedIntoTripId}`,
        `Trip: ${mergedTripId}`,
        {
          targetCollection: COLLECTIONS.TRIPS,
          targetDocId: mergedTripId,
          beforeState: beforeMerged,
          afterState: restoredMerged,
          reversible: true,
          interventionReason: reason,
        }
      );
      addToast(`تم فصل الرحلة (${beforeMerged.code}) وإعادتها لوضع الجدولة بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('فصل رحلة', `${COLLECTIONS.TRIPS}/${mergedTripId}`, err);
      addToast(`فشل فصل الرحلة: ${err.message}`, 'error');
    }
  };

  const deleteTripSafe = async (tripId: string, reason: string) => {
    const targetTrip = trips.find(t => t.id === tripId);
    if (!targetTrip) return;
    const deps = dataService.inspectEntityDependencies('trip', tripId, {
      lines,
      trips,
      users,
      drivers,
      buses,
    });
    if (deps.blockingCount > 0) {
      addToast(`منع الحذف لحماية الركاب: ${deps.details.join('، ')}. أزل الركاب أو انقلهم أولاً.`, 'error');
      return;
    }

    try {
      await deleteDocument(COLLECTIONS.TRIPS, tripId);
      setTrips(prev => prev.filter(t => t.id !== tripId));
      addAuditLog('حذف رحلة (تدخل إداري)', `تم حذف الرحلة ${targetTrip.code}`, `Trip: ${tripId}`, {
        targetCollection: COLLECTIONS.TRIPS,
        targetDocId: tripId,
        beforeState: targetTrip,
        afterState: null,
        reversible: true,
        interventionReason: reason,
      });
      addToast(`تم حذف الرحلة (${targetTrip.code}) بنجاح.`);
    } catch (err: any) {
      recordDiagnosticError('حذف رحلة', `${COLLECTIONS.TRIPS}/${tripId}`, err);
      addToast(`فشل حذف الرحلة: ${err.message}`, 'error');
    }
  };

  const rollbackAuditLog = async (logId: string, reason: string) => {
    const targetLog = platformAuditLogs.find(l => l.id === logId);
    if (!targetLog) return;
    if (authenticatedUser?.role !== 'super_admin') {
      addToast('التراجع عن العمليات الحساسة مقتصر على مالك المنصة فقط.', 'error');
      return;
    }
    try {
      const res = await runAuditRollbackTransaction(targetLog, authenticatedUser);
      // Reflect rollback optimistically in local state immediately
      setAllAuditLogs(prev =>
        prev.map(l =>
          l.id === logId ? { ...l, rolledBackAt: res.rolledBackAt, rolledBackBy: authenticatedUser.name } : l
        )
      );

      // Update local state for common collections as well
      const col = targetLog.targetCollection;
      const docId = targetLog.targetDocId;
      if (col && docId) {
        const applyRestored = <T extends { id: string }>(
          setter: React.Dispatch<React.SetStateAction<T[]>>
        ) => {
          setter(prev => {
            if (res.restoredData === null) {
              return prev.filter(x => x.id !== docId);
            }
            const item = { ...res.restoredData, id: docId } as T;
            return prev.some(x => x.id === docId)
              ? prev.map(x => (x.id === docId ? item : x))
              : [item, ...prev];
          });
        };

        if (col === COLLECTIONS.COMPANIES) applyRestored(setAllCompanies);
        else if (col === COLLECTIONS.USERS) applyRestored(setAllUsers);
        else if (col === COLLECTIONS.TRIPS) applyRestored(setAllTrips);
        else if (col === COLLECTIONS.BUSES) applyRestored(setAllBuses);
        else if (col === COLLECTIONS.UNIVERSITIES) applyRestored(setAllUniversities);
        else if (col === COLLECTIONS.ROUTES) applyRestored(setAllLines);
        else if (col === COLLECTIONS.TRIP_TEMPLATES) applyRestored(setAllTripTemplates);
        else if (col === COLLECTIONS.SETTINGS && res.restoredData) {
          setSettingsById(prev => ({ ...prev, [docId]: res.restoredData as SystemSettings }));
        }
      }

      addAuditLog(
        `تراجع عن عملية (${targetLog.action})`,
        `تم التراجع الآمن عن الإجراء المسجل في ${targetLog.targetEntity}`,
        targetLog.targetEntity,
        {
          interventionReason: reason,
          companyIdOverride: targetLog.companyId || activeCompanyId,
          reversible: false,
        }
      );
      addToast(`تم تنفيذ التراجع الآمن عن "${targetLog.action}" واستعادة الحالة السابقة بنجاح!`);
    } catch (err: any) {
      recordDiagnosticError('تراجع عن عملية', `${COLLECTIONS.AUDIT_LOGS}/${logId}`, err);
      addToast(`فشل التراجع: ${err.message}`, 'error');
      throw err;
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authenticatedUser,
        isAuthReady,
        isAuthenticated,
        refreshCurrentUserProfile,
        setCurrentUser,
        switchRole,
        logout,
        triggerAdminSeed,
        users,
        universities,
        lines,
        buses,
        drivers,
        trips,
        tripTemplates,
        subscriptions,
        incidents,
        proposals,
        auditLogs,
        settings,
        toasts,
        addToast,
        removeToast,
        activeOperatingDate,
        setActiveOperatingDate,
        availableOperatingDates,
        startNewOperatingDay,
        isCutoffPassedForTomorrow,
        toggleSimulateCutoff,
        exceptionalRequests,
        submitExceptionalBooking,
        approveExceptionalBooking,
        rejectExceptionalBooking,
        autoAssignBusesForPlan,
        approveDailyPlan,
        toggleStudentAssignmentMode,
        autoAllocateStudentsToSlotBuses,
        batchUpdateStudentBoarding,
        reassignStudentToTrip,
        createUniversity,
        updateUniversity,
        toggleUniversityStatus,
        deleteUniversity,
        createBus,
        updateBus,
        toggleBusStatus,
        deleteBus,
        createLine,
        updateLine,
        toggleLineStatus,
        deleteLine,
        addStationToLine,
        reorderStation,
        deleteStationFromLine,
        createTripTemplate,
        updateTripTemplate,
        toggleTripTemplateStatus,
        deleteTripTemplate,
        updateUserRole,
        toggleUserStatus,
        confirmStudentRsvp,
        setStudentReturnReady,
        driverUpdateStop,
        driverToggleStopCheck,
        driverConfirmReturnDeparture,
        driverCheckInStudent,
        driverBoardWaitingStudent,
        dispatchWaitingReturnBus,
        consolidateWaitingBusesOnly,
        markCrossUniversityHandoff,
        allocateWaitingReturnBus,
        supervisorQuickSwapOrEmergency,
        reportIncident,
        swapBusOrDriver,
        approveConsolidation,
        rejectConsolidation,
        importWhatsappAttendance,
        approveStudentRegistration,
        rejectPendingRegistration,
        updateSettings,
        createTrip,
        companies,
        publicCompanyDirectory,
        staffInvites: allStaffInvites.filter(i => belongsToCompany(i, activeCompanyId)),
        cancelStaffInvite,
        activeCompanyId,
        activeCompany,
        setActiveCompanyId,
        isCompanySuspended,
        previewRole,
        setPreviewRole,
        isPreviewMode,
        impersonatedUser,
        enterUserAccount,
        exitUserAccount,
        canSwitchRoles,
        allUsers,
        allTrips,
        platformAuditLogs,
        saveDiagnostics,
        clearSaveDiagnostics,
        createCompany,
        updateCompany,
        toggleCompanyStatus,
        seedTwoTestCompaniesAction,
        backfillLegacyCompanyAction,
        createCompanyUser,
        updateUserDetails,
        transferUserToCompany,
        deleteUserSafe,
        updateTripDetails,
        addStudentToTrip,
        removeStudentFromTrip,
        splitMergedTrip,
        deleteTripSafe,
        rollbackAuditLog,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
