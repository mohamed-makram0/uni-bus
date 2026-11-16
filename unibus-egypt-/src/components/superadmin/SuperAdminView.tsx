import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminView } from '../admin/AdminView';
import { SupervisorView } from '../supervisor/SupervisorView';
import { DriverView } from '../driver/DriverView';
import { StudentView } from '../student/StudentView';
import { matchesArabicSearch } from '../../utils/arabicSearch';
import { dataService } from '../../services/dataService';
import { Company, User, UserRole, Trip, Bus, AuditLog } from '../../types';
import {
  Building2,
  Shield,
  Wrench,
  Eye,
  History,
  Plus,
  Search,
  Edit3,
  PauseCircle,
  PlayCircle,
  Users,
  Bus as BusIcon,
  Route,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ArrowRightLeft,
  RotateCcw,
  Trash2,
  Sliders,
  Sparkles,
  Database,
  X,
  ArrowRight,
  GitMerge,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Save,
  Clock,
  Phone,
  Mail,
  DollarSign,
  FileWarning,
  XCircle,
  LogIn
} from 'lucide-react';

type MainTab = 'companies' | 'workspace' | 'intervention' | 'preview' | 'audit';
type WorkspaceSubTab = 'admin_hub' | 'supervisor_ops' | 'users_hub' | 'company_settings';
type InterventionEntityType = 'trips' | 'users' | 'buses';

const PLAN_LABELS: Record<Company['planName'], string> = {
  starter: 'الأساسية (Starter)',
  growth: 'النمو (Growth)',
  enterprise: 'المؤسسات (Enterprise)',
};

const PAYMENT_LABELS: Record<Company['paymentStatus'], { text: string; cls: string }> = {
  paid: { text: 'مدفوع', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  pending: { text: 'قيد التحصيل', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  overdue: { text: 'متأخر السداد', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
};

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'مالك المنصة',
  admin: 'مدير الشركة',
  supervisor: 'مشرف تشغيلي',
  driver: 'سائق',
  student: 'طالب',
};

const TRIP_STATUS_LABELS: Record<Trip['status'], { text: string; cls: string }> = {
  scheduled: { text: 'مجدولة', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  in_progress: { text: 'قيد التشغيل', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  completed: { text: 'مكتملة', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  delayed: { text: 'متأخرة', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  merged: { text: 'مدمجة', cls: 'bg-purple-50 text-purple-800 border-purple-200' },
  cancelled: { text: 'ملغاة', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
};

function addMonthsToDateString(startDate: string, months: number): string {
  try {
    const d = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return startDate;
    d.setUTCMonth(d.getUTCMonth() + Math.max(1, months));
    return d.toISOString().slice(0, 10);
  } catch {
    return startDate;
  }
}

export const SuperAdminView: React.FC = () => {
  const {
    companies,
    staffInvites,
    cancelStaffInvite,
    activeCompanyId,
    activeCompany,
    setActiveCompanyId,
    allUsers,
    allTrips,
    users,
    universities,
    lines,
    buses,
    drivers,
    trips,
    settings,
    auditLogs,
    platformAuditLogs,
    saveDiagnostics,
    clearSaveDiagnostics,
    previewRole,
    setPreviewRole,
    createCompany,
    updateCompany,
    toggleCompanyStatus,
    seedTwoTestCompaniesAction,
    backfillLegacyCompanyAction,
    createCompanyUser,
    updateUserDetails,
    updateUserRole,
    toggleUserStatus,
    transferUserToCompany,
    deleteUserSafe,
    updateBus,
    deleteBus,
    updateTripDetails,
    addStudentToTrip,
    removeStudentFromTrip,
    reassignStudentToTrip,
    splitMergedTrip,
    deleteTripSafe,
    updateSettings,
    rollbackAuditLog,
    authenticatedUser,
    enterUserAccount,
    addToast,
  } = useApp();

  const [mainTab, setMainTab] = useState<MainTab>('companies');
  const [workspaceSubTab, setWorkspaceSubTab] = useState<WorkspaceSubTab>('admin_hub');
  const [selectedPreviewRole, setSelectedPreviewRole] = useState<'admin' | 'supervisor' | 'driver' | 'student'>('supervisor');

  // Seeding / Backfill states
  const [isSeedingTwo, setIsSeedingTwo] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Sync previewRole safely whenever user enters or leaves Preview tab
  useEffect(() => {
    if (mainTab === 'preview') {
      setPreviewRole(selectedPreviewRole);
    } else if (previewRole !== null) {
      setPreviewRole(null);
    }
  }, [mainTab, selectedPreviewRole, previewRole, setPreviewRole]);

  useEffect(() => {
    return () => {
      setPreviewRole(null);
    };
  }, [setPreviewRole]);

  // Live company conflicts (used for badge count + Intervention panel)
  const companyConflicts = useMemo(
    () => dataService.detectCompanyConflicts(trips, buses, drivers),
    [trips, buses, drivers]
  );

  // ==========================================
  // 1. COMPANIES & SUBSCRIPTIONS TAB STATE
  // ==========================================
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [compForm, setCompForm] = useState({
    nameAr: '',
    code: '',
    ownerAdminName: '',
    ownerAdminEmail: '',
    contactPhone: '',
    planName: 'growth' as Company['planName'],
    monthlyPriceEgp: 4500,
    durationMonths: 12,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: addMonthsToDateString(new Date().toISOString().slice(0, 10), 12),
    paymentStatus: 'paid' as Company['paymentStatus'],
    status: 'active' as Company['status'],
    maxBuses: 25,
    maxStudents: 500,
    reason: '',
  });
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // Suspend reason confirmation modal
  const [suspendTarget, setSuspendTarget] = useState<Company | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) =>
      matchesArabicSearch(
        companySearch,
        c.nameAr,
        c.code,
        c.ownerAdminName,
        c.ownerAdminEmail,
        c.contactPhone,
        c.planName
      )
    );
  }, [companies, companySearch]);

  const platformMetrics = useMemo(() => {
    const activeCount = companies.filter((c) => c.status === 'active').length;
    const suspendedCount = companies.filter((c) => c.status === 'suspended').length;
    const monthlyRevenue = companies
      .filter((c) => c.status === 'active')
      .reduce((sum, c) => sum + (c.monthlyPriceEgp || 0), 0);
    const overdueCount = companies.filter((c) => c.paymentStatus === 'overdue').length;
    return { activeCount, suspendedCount, monthlyRevenue, overdueCount };
  }, [companies]);

  const openCreateCompanyModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingCompany(null);
    setCompForm({
      nameAr: '',
      code: '',
      ownerAdminName: '',
      ownerAdminEmail: '',
      contactPhone: '',
      planName: 'growth',
      monthlyPriceEgp: 4500,
      durationMonths: 12,
      startDate: today,
      endDate: addMonthsToDateString(today, 12),
      paymentStatus: 'paid',
      status: 'active',
      maxBuses: 25,
      maxStudents: 500,
      reason: '',
    });
    setShowCompanyModal(true);
  };

  const openEditCompanyModal = (company: Company) => {
    setEditingCompany(company);
    setCompForm({
      nameAr: company.nameAr,
      code: company.code,
      ownerAdminName: company.ownerAdminName,
      ownerAdminEmail: company.ownerAdminEmail,
      contactPhone: company.contactPhone,
      planName: company.planName,
      monthlyPriceEgp: company.monthlyPriceEgp,
      durationMonths: company.durationMonths,
      startDate: company.startDate,
      endDate: company.endDate,
      paymentStatus: company.paymentStatus,
      status: company.status,
      maxBuses: company.maxBuses ?? 25,
      maxStudents: company.maxStudents ?? 500,
      reason: '',
    });
    setShowCompanyModal(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compForm.nameAr.trim()) {
      addToast('يرجى إدخال اسم الشركة.', 'error');
      return;
    }
    const autoGeneratedCode =
      compForm.code.trim() ||
      editingCompany?.code ||
      `CMP-${Date.now().toString(36).toUpperCase()}`;
    setIsSavingCompany(true);
    try {
      const payload = {
        nameAr: compForm.nameAr.trim(),
        code: autoGeneratedCode.toUpperCase(),
        ownerAdminName: compForm.ownerAdminName.trim() || 'مدير الشركة',
        ownerAdminEmail: compForm.ownerAdminEmail.trim(),
        contactPhone: compForm.contactPhone.trim(),
        planName: compForm.planName,
        monthlyPriceEgp: Number(compForm.monthlyPriceEgp) || 0,
        durationMonths: Number(compForm.durationMonths) || 1,
        startDate: compForm.startDate,
        endDate: compForm.endDate,
        paymentStatus: compForm.paymentStatus,
        status: compForm.status,
        maxBuses: Number(compForm.maxBuses) || 0,
        maxStudents: Number(compForm.maxStudents) || 0,
      };
      if (editingCompany) {
        await updateCompany(editingCompany.id, payload, compForm.reason || 'تحديث بيانات واشتراك الشركة');
      } else {
        const created = await createCompany(payload);
        setActiveCompanyId(created.id);
      }
      setShowCompanyModal(false);
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleConfirmSuspendToggle = async () => {
    if (!suspendTarget) return;
    await toggleCompanyStatus(suspendTarget.id, suspendReason.trim() || undefined);
    setSuspendTarget(null);
    setSuspendReason('');
  };

  const handleSeedTwoCompanies = async () => {
    setIsSeedingTwo(true);
    try {
      await seedTwoTestCompaniesAction();
    } finally {
      setIsSeedingTwo(false);
    }
  };

  const handleBackfillLegacy = async () => {
    setIsBackfilling(true);
    try {
      await backfillLegacyCompanyAction();
    } finally {
      setIsBackfilling(false);
    }
  };

  // ==========================================
  // 2. COMPANY WORKSPACE: USERS & SETTINGS STATE
  // ==========================================
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'student' as UserRole,
    isGeneralSupervisor: false,
    status: 'active' as User['status'],
    universityId: '',
    lineId: '',
    stationId: '',
    assignedBusId: '',
    licenseNumber: '',
    reason: '',
  });
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Transfer User modal
  const [transferUserTarget, setTransferUserTarget] = useState<User | null>(null);
  const [transferTargetCompanyId, setTransferTargetCompanyId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isTransferringUser, setIsTransferringUser] = useState(false);

  // Delete User inspection modal
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [deleteUserReason, setDeleteUserReason] = useState('');

  // Company settings editable state synced with active company settings
  const [settingsDraft, setSettingsDraft] = useState(settings);
  useEffect(() => {
    setSettingsDraft(settings);
  }, [settings, activeCompanyId]);

  const filteredCompanyUsers = useMemo(() => {
    return users.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      return matchesArabicSearch(userSearch, u.name, u.email, u.phone, u.id, ROLE_LABELS[u.role]);
    });
  }, [users, userRoleFilter, userSearch]);

  const openAddUserModal = () => {
    setEditingUser(null);
    const defaultLine = lines[0];
    setUserForm({
      name: '',
      phone: '',
      email: '',
      role: 'student',
      isGeneralSupervisor: false,
      status: 'active',
      universityId: universities[0]?.id || '',
      lineId: defaultLine?.id || '',
      stationId: defaultLine?.stations?.[0]?.id || '',
      assignedBusId: buses[0]?.id || '',
      licenseNumber: '',
      reason: '',
    });
    setShowUserModal(true);
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setUserForm({
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isGeneralSupervisor: Boolean(user.isGeneralSupervisor),
      status: user.status,
      universityId: user.universityId || universities[0]?.id || '',
      lineId: user.lineId || lines[0]?.id || '',
      stationId: user.stationId || '',
      assignedBusId: user.assignedBusId || '',
      licenseNumber: '',
      reason: '',
    });
    setShowUserModal(true);
  };

  const handleSaveUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.phone.trim()) {
      addToast('يرجى إدخال الاسم ورقم الهاتف.', 'error');
      return;
    }
    setIsSavingUser(true);
    try {
      if (editingUser) {
        await updateUserDetails(
          editingUser.id,
          {
            name: userForm.name.trim(),
            phone: userForm.phone.trim(),
            email: userForm.email.trim(),
            role: editingUser.role === 'super_admin' ? 'super_admin' : userForm.role,
            isGeneralSupervisor: userForm.role === 'supervisor' ? userForm.isGeneralSupervisor : false,
            status: userForm.status,
            universityId: userForm.role === 'student' ? userForm.universityId || undefined : undefined,
            lineId: userForm.role === 'student' ? userForm.lineId || undefined : undefined,
            stationId: userForm.role === 'student' ? userForm.stationId || undefined : undefined,
            assignedBusId: userForm.role === 'driver' ? userForm.assignedBusId || undefined : undefined,
          },
          userForm.reason.trim() || 'تحديث بيانات المستخدم من لوحة مالك المنصة'
        );
      } else {
        await createCompanyUser(
          {
            name: userForm.name.trim(),
            phone: userForm.phone.trim(),
            email: userForm.email.trim(),
            role: userForm.role,
            isGeneralSupervisor: userForm.role === 'supervisor' ? userForm.isGeneralSupervisor : false,
            status: userForm.status,
            universityId: userForm.role === 'student' ? userForm.universityId || undefined : undefined,
            lineId: userForm.role === 'student' ? userForm.lineId || undefined : undefined,
            stationId: userForm.role === 'student' ? userForm.stationId || undefined : undefined,
            assignedBusId: userForm.role === 'driver' ? userForm.assignedBusId || undefined : undefined,
            licenseNumber: userForm.licenseNumber.trim() || undefined,
            companyId: activeCompanyId,
          },
          userForm.reason.trim() || 'إضافة مستخدم جديد من لوحة مالك المنصة'
        );
      }
      setShowUserModal(false);
    } finally {
      setIsSavingUser(false);
    }
  };

  const openTransferModal = (user: User) => {
    setTransferUserTarget(user);
    const otherComp = companies.find((c) => c.id !== (user.companyId || activeCompanyId));
    setTransferTargetCompanyId(otherComp?.id || '');
    setTransferReason('');
  };

  const handleConfirmUserTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferUserTarget || !transferTargetCompanyId) return;
    if (!transferReason.trim()) {
      addToast('يرجى كتابة سبب نقل المستخدم لتوثيقه في سجل التدقيق.', 'error');
      return;
    }
    setIsTransferringUser(true);
    try {
      await transferUserToCompany(transferUserTarget.id, transferTargetCompanyId, transferReason.trim());
      setTransferUserTarget(null);
      setTransferReason('');
    } finally {
      setIsTransferringUser(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    await deleteUserSafe(deleteUserTarget.id, deleteUserReason.trim() || 'حذف مستخدم من لوحة مالك المنصة');
    setDeleteUserTarget(null);
    setDeleteUserReason('');
  };

  // ==========================================
  // 3. OWNER INTERVENTION MODE STATE
  // ==========================================
  const [interventionSearch, setInterventionSearch] = useState('');
  const [interventionType, setInterventionType] = useState<InterventionEntityType>('trips');
  const [interventionReason, setInterventionReason] = useState('تدخل إداري مباشر لمعالجة تعارض أو تحديث تشغيلي');
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedBusId, setSelectedBusId] = useState<string>('');

  // Structured repair drafts
  const [tripDraft, setTripDraft] = useState<{
    date: string;
    scheduledTime: string;
    direction: Trip['direction'];
    status: Trip['status'];
    busId: string;
    driverId: string;
    notes: string;
  }>({
    date: '',
    scheduledTime: '',
    direction: 'to_university',
    status: 'scheduled',
    busId: '',
    driverId: '',
    notes: '',
  });
  const [studentToAddId, setStudentToAddId] = useState<string>('');
  const [reassignTargetTripByStudent, setReassignTargetTripByStudent] = useState<Record<string, string>>({});

  const [busDraft, setBusDraft] = useState<{
    code: string;
    plateNumber: string;
    capacity: number;
    model: string;
    status: Bus['status'];
    activeStatus: boolean;
    notes: string;
  }>({
    code: '',
    plateNumber: '',
    capacity: 28,
    model: '',
    status: 'available',
    activeStatus: true,
    notes: '',
  });

  const filteredInterventionTrips = useMemo(() => {
    return trips.filter((t) =>
      matchesArabicSearch(
        interventionSearch,
        t.code,
        t.date,
        t.scheduledTime,
        t.lineNameAr,
        t.universityNameAr,
        t.busPlate,
        t.driverNameAr,
        ...(t.manifest || []).map((m) => `${m.studentName} ${m.phone}`)
      )
    );
  }, [trips, interventionSearch]);

  const filteredInterventionUsers = useMemo(() => {
    return users.filter((u) =>
      matchesArabicSearch(interventionSearch, u.name, u.phone, u.email, u.id, ROLE_LABELS[u.role])
    );
  }, [users, interventionSearch]);

  const filteredInterventionBuses = useMemo(() => {
    return buses.filter((b) =>
      matchesArabicSearch(interventionSearch, b.code, b.plateNumber, b.model, b.notes)
    );
  }, [buses, interventionSearch]);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || null,
    [trips, selectedTripId]
  );
  const selectedInterventionUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );
  const selectedBus = useMemo(
    () => buses.find((b) => b.id === selectedBusId) || null,
    [buses, selectedBusId]
  );

  useEffect(() => {
    if (selectedTrip) {
      setTripDraft({
        date: selectedTrip.date,
        scheduledTime: selectedTrip.scheduledTime,
        direction: selectedTrip.direction,
        status: selectedTrip.status,
        busId: selectedTrip.busId,
        driverId: selectedTrip.driverId,
        notes: selectedTrip.notes || '',
      });
    }
  }, [selectedTrip]);

  useEffect(() => {
    if (selectedBus) {
      setBusDraft({
        code: selectedBus.code,
        plateNumber: selectedBus.plateNumber,
        capacity: selectedBus.capacity,
        model: selectedBus.model,
        status: selectedBus.status,
        activeStatus: selectedBus.activeStatus,
        notes: selectedBus.notes || '',
      });
    }
  }, [selectedBus]);

  const companyStudentsNotInTrip = useMemo(() => {
    if (!selectedTrip) return [];
    const manifestIds = new Set((selectedTrip.manifest || []).map((m) => m.studentId));
    return users.filter((u) => u.role === 'student' && !manifestIds.has(u.id));
  }, [users, selectedTrip]);

  // ==========================================
  // 4. AUDIT LOGS & SAFE ROLLBACK STATE
  // ==========================================
  const [auditScope, setAuditScope] = useState<'company' | 'platform'>('platform');
  const [auditSearch, setAuditSearch] = useState('');
  const [onlyReversible, setOnlyReversible] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<AuditLog | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [isRollingBack, setIsRollingBack] = useState(false);

  const visibleAuditLogs = useMemo(() => {
    const source = auditScope === 'platform' ? platformAuditLogs : auditLogs;
    return source.filter((l) => {
      if (onlyReversible && (!l.reversible || !l.targetCollection || !l.targetDocId || l.rolledBackAt)) {
        return false;
      }
      return matchesArabicSearch(
        auditSearch,
        l.action,
        l.actorName,
        l.details,
        l.targetEntity,
        l.interventionReason,
        l.companyNameAr,
        l.companyId
      );
    });
  }, [auditScope, platformAuditLogs, auditLogs, onlyReversible, auditSearch]);

  const handleConfirmRollback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rollbackTarget) return;
    if (!rollbackReason.trim()) {
      addToast('يرجى إدخال سبب التراجع الآمن لتوثيقه في السجل.', 'error');
      return;
    }
    setIsRollingBack(true);
    try {
      await rollbackAuditLog(rollbackTarget.id, rollbackReason.trim());
      setRollbackTarget(null);
      setRollbackReason('');
    } finally {
      setIsRollingBack(false);
    }
  };

  // Helper to inspect current user transfer validation in modal
  const transferValidation = useMemo(() => {
    if (!transferUserTarget || !transferTargetCompanyId) return null;
    return dataService.validateUserCompanyTransfer(transferUserTarget, transferTargetCompanyId, allTrips);
  }, [transferUserTarget, transferTargetCompanyId, allTrips]);

  // Helper to inspect dependencies when deleting a user
  const deleteUserDeps = useMemo(() => {
    if (!deleteUserTarget) return null;
    return dataService.inspectEntityDependencies('user', deleteUserTarget.id, {
      lines,
      trips: allTrips,
      users: allUsers,
      drivers,
      buses,
    });
  }, [deleteUserTarget, lines, allTrips, allUsers, drivers, buses]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5" dir="rtl">
      {/* PLATFORM SUPER ADMIN TOP COMMAND BAR */}
      <section className="bg-[#0F2537] text-white rounded-3xl p-4 sm:p-5 shadow-md border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">لوحة مالك المنصة — التحكم الشامل</h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-300">
                إدارة الشركات المشتركة، التدخل الإداري المباشر، معاينة الواجهات الآمنة، وسجل التدقيق والتراجع على قاعدة البيانات السحابية.
              </p>
            </div>
          </div>

          {/* Active Company Quick Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-900/60 border border-slate-700/80 rounded-2xl p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-300 px-1">
              <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold whitespace-nowrap">الشركة النشطة:</span>
            </div>
            <select
              value={activeCompanyId}
              onChange={(e) => setActiveCompanyId(e.target.value)}
              className="bg-slate-800 text-white text-xs font-bold rounded-xl px-3 py-2 border border-slate-600 focus:outline-none focus:border-amber-400 min-w-[200px]"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr} ({c.code}) — {c.status === 'active' ? 'نشطة' : 'موقوفة'}
                </option>
              ))}
            </select>
            {activeCompany && (
              <span
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border text-center ${
                  activeCompany.status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-400/30'
                }`}
              >
                {activeCompany.status === 'active' ? 'تشغيل نشط' : 'موقوفة مؤقتاً'}
              </span>
            )}
          </div>
        </div>

        {/* 5 MAIN NAVIGATION TABS */}
        <nav className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
          {[
            { id: 'companies' as MainTab, label: 'إدارة الشركات والاشتراكات', icon: Building2, count: companies.length },
            { id: 'workspace' as MainTab, label: 'إدارة الشركة', icon: Sliders },
            {
              id: 'intervention' as MainTab,
              label: 'وضع التدخل الإداري',
              icon: Wrench,
              alertCount: companyConflicts.length + saveDiagnostics.length,
            },
            { id: 'preview' as MainTab, label: 'معاينة الواجهات', icon: Eye },
            { id: 'audit' as MainTab, label: 'سجل التدقيق والتراجع', icon: History, count: platformAuditLogs.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                      active ? 'bg-slate-950/15 text-slate-950' : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {typeof tab.alertCount === 'number' && tab.alertCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-600 text-white tabular-nums">
                    {tab.alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>

      {/* ===================================================================== */}
      {/* TAB 1: COMPANIES & SUBSCRIPTIONS MANAGEMENT                           */}
      {/* ===================================================================== */}
      {mainTab === 'companies' && (
        <div className="space-y-5">
          {/* Platform KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>الشركات المشتركة</span>
                <Building2 className="w-4 h-4 text-[#0F2537]" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{companies.length}</span>
                <span className="text-[11px] font-bold text-emerald-700">
                  {platformMetrics.activeCount} نشطة
                </span>
                {platformMetrics.suspendedCount > 0 && (
                  <span className="text-[11px] font-bold text-rose-700">
                    · {platformMetrics.suspendedCount} موقوفة
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>الإيراد الشهري الفعلي</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
                  {platformMetrics.monthlyRevenue.toLocaleString('en-US')}
                </span>
                <span className="text-xs font-bold text-slate-500">ج.م/شهر</span>
              </div>
              {platformMetrics.overdueCount > 0 && (
                <p className="text-[11px] font-bold text-rose-700 mt-1">
                  {platformMetrics.overdueCount} شركة متأخرة السداد
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>إجمالي المستخدمين بالمنصة</span>
                <Users className="w-4 h-4 text-sky-600" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">{allUsers.length}</div>
              <p className="text-[11px] text-slate-500 mt-1">
                {allUsers.filter((u) => u.role === 'student').length} طالب · {allUsers.filter((u) => u.role === 'driver').length} سائق
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>إجمالي الرحلات المسجلة</span>
                <Route className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">{allTrips.length}</div>
              <p className="text-[11px] text-slate-500 mt-1">
                عبر جميع الشركات في Firestore
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="ابحث باسم الشركة، الكود، مدير الشركة، أو الخطة..."
                className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0F2537]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSeedTwoCompanies}
                disabled={isSeedingTwo}
                className="min-h-[40px] px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isSeedingTwo ? 'جارٍ التهيئة...' : 'تهيئة شركتين تجريبيتين للاختبار'}</span>
              </button>

              <button
                type="button"
                onClick={handleBackfillLegacy}
                disabled={isBackfilling}
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Database className="w-4 h-4" />
                <span>{isBackfilling ? 'جارٍ الربط...' : 'ربط السجلات القديمة بالشركة الرئيسية'}</span>
              </button>

              <button
                type="button"
                onClick={openCreateCompanyModal}
                className="min-h-[40px] px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة شركة جديدة</span>
              </button>
            </div>
          </div>

          {/* Companies Grid */}
          {filteredCompanies.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">لا توجد شركات مطابقة لبحثك.</p>
              <p className="text-xs text-slate-500">
                يمكنك إضافة شركة جديدة يدوياً أو الضغط على "تهيئة شركتين تجريبيتين للاختبار".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredCompanies.map((comp) => {
                const compUsers = allUsers.filter((u) => (u.companyId || 'comp-unibus-main') === comp.id);
                const compTrips = allTrips.filter((t) => (t.companyId || 'comp-unibus-main') === comp.id);
                const compStudentsCount = compUsers.filter((u) => u.role === 'student').length;
                const compDriversCount = compUsers.filter((u) => u.role === 'driver').length;
                const payMeta = PAYMENT_LABELS[comp.paymentStatus] || PAYMENT_LABELS.pending;
                const isSelected = comp.id === activeCompanyId;

                return (
                  <div
                    key={comp.id}
                    className={`bg-white rounded-2xl border p-5 transition-all flex flex-col justify-between gap-4 ${
                      isSelected ? 'border-[#0F2537] ring-2 ring-[#0F2537]/10' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-extrabold text-slate-900">{comp.nameAr}</h3>
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                              {comp.code}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                                محددة الآن
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            المدير: <strong className="text-slate-700">{comp.ownerAdminName}</strong>
                            {comp.ownerAdminEmail && ` · ${comp.ownerAdminEmail}`}
                          </p>
                          {comp.contactPhone && (
                            <p className="text-xs text-slate-500 font-mono">{comp.contactPhone}</p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                              comp.status === 'active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            {comp.status === 'active' ? 'نشطة' : 'موقوفة مؤقتاً'}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${payMeta.cls}`}>
                            {payMeta.text}
                          </span>
                        </div>
                      </div>

                      {comp.status === 'suspended' && comp.suspendedReason && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-800 font-bold">
                          سبب الإيقاف: {comp.suspendedReason}
                        </div>
                      )}

                      {/* Subscription Details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 block">الباقة</span>
                          <span className="font-bold text-slate-800">{PLAN_LABELS[comp.planName]}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">الاشتراك الشهري</span>
                          <span className="font-extrabold text-slate-900 tabular-nums">
                            {comp.monthlyPriceEgp.toLocaleString('en-US')} ج.م
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">المدة</span>
                          <span className="font-bold text-slate-800 tabular-nums">{comp.durationMonths} شهر</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">فترة الاشتراك</span>
                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {comp.startDate} → {comp.endDate}
                          </span>
                        </div>
                      </div>

                      {/* Company Live Stats */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-bold">
                          المستخدمون: <span className="tabular-nums text-slate-900">{compUsers.length}</span>
                        </span>
                        <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-bold">
                          الطلاب: <span className="tabular-nums text-slate-900">{compStudentsCount}</span>
                        </span>
                        <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-bold">
                          السائقون: <span className="tabular-nums text-slate-900">{compDriversCount}</span>
                        </span>
                        <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-bold">
                          الرحلات: <span className="tabular-nums text-slate-900">{compTrips.length}</span>
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCompanyId(comp.id);
                          setMainTab('workspace');
                        }}
                        className="flex-1 min-w-[140px] min-h-[40px] px-3.5 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Sliders className="w-4 h-4" />
                        <span>إدارة الشركة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveCompanyId(comp.id);
                          setMainTab('preview');
                        }}
                        className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditCompanyModal(comp)}
                        className="min-h-[40px] px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل / الاشتراك</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSuspendTarget(comp);
                          setSuspendReason('');
                        }}
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                          comp.status === 'active'
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {comp.status === 'active' ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>تعليق مؤقت</span>
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>إعادة تفعيل</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: COMPANY INTEGRATED WORKSPACE                                   */}
      {/* ===================================================================== */}
      {mainTab === 'workspace' && (
        <div className="space-y-4">
          {/* Persistent Platform Owner Banner */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-amber-950">
                  أنت تدير الآن شركة: {activeCompany?.nameAr || activeCompanyId} ({activeCompany?.code || ''}) بصلاحية مالك المنصة (Super Admin)
                </p>
                <p className="text-[11px] text-amber-800">
                  جميع التعديلات التي تجريها هنا تُحفظ مباشرة في بيانات هذه الشركة فقط وتُوثّق في سجل التدقيق.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMainTab('companies')}
              className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>كل الشركات</span>
            </button>
          </div>

          {/* Workspace Sub-tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 flex flex-wrap gap-2">
            {[
              { id: 'admin_hub' as WorkspaceSubTab, label: 'الهيكل الأساسي ولوحة المدير (الجامعات والباصات والخطوط)', icon: Building2 },
              { id: 'supervisor_ops' as WorkspaceSubTab, label: 'التشغيل اليومي والرحلات (لوحة المشرف)', icon: BusIcon },
              { id: 'users_hub' as WorkspaceSubTab, label: `إدارة المستخدمين والنقل (${users.length})`, icon: Users },
              { id: 'company_settings' as WorkspaceSubTab, label: 'إعدادات وقواعد تشغيل الشركة', icon: Sliders },
            ].map((sub) => {
              const Icon = sub.icon;
              const isActive = workspaceSubTab === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setWorkspaceSubTab(sub.id)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#0F2537] text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{sub.label}</span>
                </button>
              );
            })}
          </div>

          {workspaceSubTab === 'admin_hub' && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-1 sm:p-2">
              <AdminView />
            </div>
          )}

          {workspaceSubTab === 'supervisor_ops' && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-1 sm:p-2">
              <SupervisorView />
            </div>
          )}

          {workspaceSubTab === 'users_hub' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="ابحث بالاسم، البريد، رقم الهاتف..."
                      className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0F2537]"
                    />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="all">جميع الأدوار ({users.length})</option>
                    <option value="student">الطلاب ({users.filter((u) => u.role === 'student').length})</option>
                    <option value="driver">السائقون ({users.filter((u) => u.role === 'driver').length})</option>
                    <option value="supervisor">المشرفون ({users.filter((u) => u.role === 'supervisor').length})</option>
                    <option value="admin">مديرو الشركة ({users.filter((u) => u.role === 'admin').length})</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={openAddUserModal}
                  className="min-h-[40px] px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>إضافة / دعوة مستخدم للشركة</span>
                </button>
              </div>

              {staffInvites.filter(inv => inv.status === 'pending').length > 0 && (
                <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-extrabold text-sky-950">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-sky-700" />
                      دعوات التفعيل التلقائي المعلقة ({staffInvites.filter(inv => inv.status === 'pending').length})
                    </span>
                    <span className="text-[11px] font-normal text-sky-800">
                      بمجرد دخول الموظف بـ Google أو من تبويب «تفعيل موظف / سائق» بنفس البريد سترتبط صلاحياته تلقائياً.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {staffInvites
                      .filter(inv => inv.status === 'pending')
                      .map(inv => (
                        <div key={inv.id} className="bg-white border border-sky-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
                          <div>
                            <p className="font-bold text-slate-900">
                              {inv.name} <span className="text-[11px] text-sky-800">({ROLE_LABELS[inv.role]})</span>
                            </p>
                            <p className="text-[11px] font-mono text-slate-500">{inv.email}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void cancelStaffInvite(inv.id)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            إلغاء الدعوة
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {filteredCompanyUsers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                  لا يوجد مستخدمون مطابقون في شركة {activeCompany?.nameAr}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredCompanyUsers.map((u) => {
                    const uniName = universities.find((un) => un.id === u.universityId)?.nameAr;
                    const lineName = lines.find((l) => l.id === u.lineId)?.nameAr;
                    const busPlate = buses.find((b) => b.id === u.assignedBusId)?.plateNumber;
                    const isSuper = u.role === 'super_admin';

                    return (
                      <div
                        key={u.id}
                        className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900">{u.name}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800">
                              {ROLE_LABELS[u.role]}
                            </span>
                            {u.role === 'supervisor' && u.isGeneralSupervisor && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-200">
                                مشرف عام (مدير + مشرف + سائق)
                              </span>
                            )}
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                u.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : u.status === 'pending_approval'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {u.status === 'active'
                                ? 'نشط'
                                : u.status === 'pending_approval'
                                ? 'بانتظار الاعتماد'
                                : 'موقوف'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3" /> {u.phone}
                            </span>
                            <span className="flex items-center gap-1 font-mono">
                              <Mail className="w-3 h-3" /> {u.email}
                            </span>
                            {uniName && <span>الجامعة: {uniName}</span>}
                            {lineName && <span>الخط: {lineName}</span>}
                            {busPlate && <span>الباص: {busPlate}</span>}
                          </div>
                        </div>

                        {!isSuper && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void enterUserAccount(u.id)}
                              disabled={u.id === authenticatedUser?.id}
                              className="min-h-[36px] px-3 py-1.5 bg-[#0F2537] hover:bg-slate-800 text-amber-300 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-40"
                              title="الدخول الفعلي إلى حساب هذا المستخدم وتنفيذ تعديلات نيابة عنه"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>دخول للحساب والتعديل</span>
                            </button>

                            <select
                              value={u.role}
                              onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                              className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                            >
                              <option value="student">طالب</option>
                              <option value="driver">سائق</option>
                              <option value="supervisor">مشرف تشغيلي</option>
                              <option value="admin">مدير الشركة</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => openEditUserModal(u)}
                              className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openTransferModal(u)}
                              className="min-h-[36px] px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>نقل لشركة</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleUserStatus(u.id)}
                              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                                u.status === 'active'
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                              }`}
                            >
                              {u.status === 'active' ? 'تعطيل' : 'تفعيل'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setDeleteUserTarget(u);
                                setDeleteUserReason('');
                              }}
                              className="min-h-[36px] px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {workspaceSubTab === 'company_settings' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateSettings(settingsDraft);
              }}
              className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    قواعد التشغيل وإعدادات شركة ({activeCompany?.nameAr})
                  </h3>
                  <p className="text-xs text-slate-500">
                    يتم حفظ هذه القواعد بشكل مستقل تماماً لكل شركة دون التأثير على الشركات الأخرى.
                  </p>
                </div>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ إعدادات الشركة</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    موعد إغلاق تسجيل اليوم التالي (Cutoff Time)
                  </label>
                  <input
                    type="time"
                    value={settingsDraft.cutoffTimeTomorrow}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, cutoffTimeTomorrow: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    مهلة إغلاق تأكيد الحضور قبل الرحلة (ساعات)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={48}
                    value={settingsDraft.rsvpDeadlineHours}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, rsvpDeadlineHours: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    أقصى وقت انتظار مسموح عند الدمج (دقائق)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={settingsDraft.maxWaitMinutesForMerge}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        maxWaitMinutesForMerge: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    حد الإشغال المنخفض المقترح للدمج (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={90}
                    value={settingsDraft.lowOccupancyThresholdPercent}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        lowOccupancyThresholdPercent: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    نظام تعيين الطلاب على السيارات
                  </label>
                  <select
                    value={settingsDraft.studentAssignmentMode}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        studentAssignmentMode: e.target.value as 'auto_assigned' | 'open_boarding',
                      }))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="auto_assigned">تخصيص آلي لسيارة محددة (يظهر رقم الباص للطالب)</option>
                    <option value="open_boarding">ركوب مرن بالمحطة (أول باص متاح في الخط)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    هاتف الدعم الفني الخاص بالشركة
                  </label>
                  <input
                    type="text"
                    value={settingsDraft.contactSupportPhone}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, contactSupportPhone: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.allowStudentSelfExcuse}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, allowStudentSelfExcuse: e.target.checked }))
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs font-bold text-slate-800">السماح للطالب بالاعتذار الذاتي عن الرحلة</span>
                </label>

                <label className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.simulateCutoffPassed}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, simulateCutoffPassed: e.target.checked }))
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs font-bold text-amber-950">محاكاة إغلاق الحجز (بعد 10:00 م) لاختبار الطلبات الاستثنائية</span>
                </label>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: OWNER INTERVENTION MODE                                        */}
      {/* ===================================================================== */}
      {mainTab === 'intervention' && (
        <div className="space-y-4">
          {/* Owner Banner + Reason Input */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                    وضع التدخل الإداري — شركة {activeCompany?.nameAr}
                  </h2>
                  <p className="text-xs text-slate-500">
                    اكتشاف التعارضات التشغيلية، فحص الارتباطات قبل الحذف، وتصحيح الرحلات والمستخدمين والباصات مع توثيق سبب التدخل.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                سبب التدخل الإداري (يُسجل تلقائياً في سجل التدقيق مع كل إجراء تصحيحي):
              </label>
              <input
                type="text"
                value={interventionReason}
                onChange={(e) => setInterventionReason(e.target.value)}
                placeholder="مثال: حل تعارض سائق على رحلتين متزامنتين / تصحيح كشف الركاب..."
                className="w-full px-3 py-2 bg-amber-50/70 border border-amber-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Save Failure Diagnostics */}
          {saveDiagnostics.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-rose-900">
                  <FileWarning className="w-4 h-4 text-rose-600" />
                  <h3 className="text-xs sm:text-sm font-extrabold">
                    سجل أخطاء الحفظ والتزامن ({saveDiagnostics.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={clearSaveDiagnostics}
                  className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
                >
                  مسح السجل
                </button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {saveDiagnostics.map((d) => (
                  <div key={d.id} className="bg-white border border-rose-200 rounded-xl p-2.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-rose-900">
                      <span>
                        {d.operation} ({d.target})
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">{d.timestamp}</span>
                    </div>
                    <p className="text-rose-700 mt-0.5 font-mono text-[11px]">{d.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Conflict Detector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertOctagon
                  className={`w-5 h-5 ${companyConflicts.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                />
                <h3 className="text-sm font-extrabold text-slate-900">
                  كاشف التعارضات التلقائي ({companyConflicts.length})
                </h3>
              </div>
              {companyConflicts.length === 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                  لا توجد تعارضات حالياً في هذه الشركة
                </span>
              )}
            </div>

            {companyConflicts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {companyConflicts.map((conf) => (
                  <div
                    key={conf.id}
                    className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                      conf.severity === 'critical'
                        ? 'bg-rose-50/70 border-rose-200'
                        : 'bg-amber-50/70 border-amber-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 ${
                            conf.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        />
                        <span className="text-xs font-extrabold text-slate-900">{conf.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-700 mt-1">{conf.description}</p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setInterventionType('trips');
                          setSelectedTripId(conf.tripId);
                        }}
                        className="px-3 py-1.5 bg-[#0F2537] hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        فتح الرحلة للإصلاح
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unified Search + Split Inspector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                {[
                  { id: 'trips' as InterventionEntityType, label: `الرحلات (${trips.length})` },
                  { id: 'users' as InterventionEntityType, label: `المستخدمون والطلاب (${users.length})` },
                  { id: 'buses' as InterventionEntityType, label: `الباصات (${buses.length})` },
                ].map((et) => (
                  <button
                    key={et.id}
                    type="button"
                    onClick={() => setInterventionType(et.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                      interventionType === et.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {et.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={interventionSearch}
                  onChange={(e) => setInterventionSearch(e.target.value)}
                  placeholder="ابحث بكود الرحلة، اسم الطالب، الهاتف، اللوحة، السائق..."
                  className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0F2537]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left/Right Search Results List (5 cols) */}
              <div className="lg:col-span-5 space-y-2 max-h-[540px] overflow-y-auto pr-0.5">
                {interventionType === 'trips' &&
                  (filteredInterventionTrips.length === 0 ? (
                    <p className="text-xs text-slate-500 p-4 text-center border border-dashed rounded-xl">
                      لا توجد رحلات مطابقة.
                    </p>
                  ) : (
                    filteredInterventionTrips.map((t) => {
                      const stMeta = TRIP_STATUS_LABELS[t.status] || TRIP_STATUS_LABELS.scheduled;
                      const active = t.id === selectedTripId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTripId(t.id)}
                          className={`w-full text-right p-3 rounded-xl border transition-all cursor-pointer ${
                            active
                              ? 'border-[#0F2537] bg-slate-50 ring-2 ring-[#0F2537]/10'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-slate-900 font-mono">{t.code}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stMeta.cls}`}>
                              {stMeta.text}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 mt-1">
                            {t.lineNameAr} — {t.universityNameAr}
                          </p>
                          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 mt-1">
                            <span>{t.date}</span>
                            <span>· {t.scheduledTime}</span>
                            <span>· {t.direction === 'to_university' ? 'ذهاب' : 'عودة'}</span>
                            <span>· الركاب: {(t.manifest || []).length}/{t.capacity}</span>
                          </div>
                        </button>
                      );
                    })
                  ))}

                {interventionType === 'users' &&
                  (filteredInterventionUsers.length === 0 ? (
                    <p className="text-xs text-slate-500 p-4 text-center border border-dashed rounded-xl">
                      لا يوجد مستخدمون مطابقون.
                    </p>
                  ) : (
                    filteredInterventionUsers.map((u) => {
                      const active = u.id === selectedUserId;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedUserId(u.id)}
                          className={`w-full text-right p-3 rounded-xl border transition-all cursor-pointer ${
                            active
                              ? 'border-[#0F2537] bg-slate-50 ring-2 ring-[#0F2537]/10'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-slate-900">{u.name}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              {ROLE_LABELS[u.role]}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono mt-1">
                            {u.phone} · {u.email}
                          </p>
                        </button>
                      );
                    })
                  ))}

                {interventionType === 'buses' &&
                  (filteredInterventionBuses.length === 0 ? (
                    <p className="text-xs text-slate-500 p-4 text-center border border-dashed rounded-xl">
                      لا توجد باصات مطابقة.
                    </p>
                  ) : (
                    filteredInterventionBuses.map((b) => {
                      const active = b.id === selectedBusId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBusId(b.id)}
                          className={`w-full text-right p-3 rounded-xl border transition-all cursor-pointer ${
                            active
                              ? 'border-[#0F2537] bg-slate-50 ring-2 ring-[#0F2537]/10'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-slate-900">
                              {b.code} — {b.plateNumber}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              {b.capacity} مقعد
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {b.model} · الحالة: {b.status === 'available' ? 'متاح' : b.status === 'in_trip' ? 'في رحلة' : 'صيانة'}
                          </p>
                        </button>
                      );
                    })
                  ))}
              </div>

              {/* Inspector & Structured Repair Editor (7 cols) */}
              <div className="lg:col-span-7 bg-slate-50/70 rounded-2xl border border-slate-200 p-4">
                {interventionType === 'trips' && !selectedTrip && (
                  <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Wrench className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold">اختر رحلة من القائمة أو من كاشف التعارضات لفحصها وإصلاحها.</p>
                  </div>
                )}

                {interventionType === 'trips' && selectedTrip && (
                  <div className="space-y-4">
                    {(() => {
                      const deps = dataService.inspectEntityDependencies('trip', selectedTrip.id, {
                        lines,
                        trips,
                        users,
                        drivers,
                        buses,
                      });
                      return (
                        <div
                          className={`p-3 rounded-xl border text-xs ${
                            deps.blockingCount > 0
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          <p className="font-extrabold">{deps.summary}</p>
                          {deps.details.length > 0 && (
                            <ul className="list-disc list-inside mt-1 text-[11px]">
                              {deps.details.map((d, i) => (
                                <li key={i}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}

                    {/* Trip Structured Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">التاريخ</label>
                        <input
                          type="date"
                          value={tripDraft.date}
                          onChange={(e) => setTripDraft((p) => ({ ...p, date: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">الموعد</label>
                        <input
                          type="text"
                          value={tripDraft.scheduledTime}
                          onChange={(e) => setTripDraft((p) => ({ ...p, scheduledTime: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">الاتجاه</label>
                        <select
                          value={tripDraft.direction}
                          onChange={(e) =>
                            setTripDraft((p) => ({ ...p, direction: e.target.value as Trip['direction'] }))
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          <option value="to_university">ذهاب للجامعة</option>
                          <option value="from_university">عودة من الجامعة</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة الرحلة</label>
                        <select
                          value={tripDraft.status}
                          onChange={(e) =>
                            setTripDraft((p) => ({ ...p, status: e.target.value as Trip['status'] }))
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          <option value="scheduled">مجدولة</option>
                          <option value="in_progress">قيد التشغيل</option>
                          <option value="delayed">متأخرة</option>
                          <option value="completed">مكتملة</option>
                          <option value="merged">مدمجة</option>
                          <option value="cancelled">ملغاة</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">الباص</label>
                        <select
                          value={tripDraft.busId}
                          onChange={(e) => setTripDraft((p) => ({ ...p, busId: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          {buses.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code} — {b.plateNumber} ({b.capacity} مقعد)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">السائق</label>
                        <select
                          value={tripDraft.driverId}
                          onChange={(e) => setTripDraft((p) => ({ ...p, driverId: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nameAr} ({d.status === 'active' ? 'متاح' : 'في إجازة'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">ملاحظات تشغيلية</label>
                      <input
                        type="text"
                        value={tripDraft.notes}
                        onChange={(e) => setTripDraft((p) => ({ ...p, notes: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateTripDetails(selectedTrip.id, tripDraft, interventionReason)}
                        className="min-h-[38px] px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>حفظ تعديلات الرحلة</span>
                      </button>

                      {(selectedTrip.status === 'merged' || selectedTrip.mergedIntoTripId) && (
                        <button
                          type="button"
                          onClick={() => splitMergedTrip(selectedTrip.id, interventionReason)}
                          className="min-h-[38px] px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>فصل الرحلة المدمجة</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteTripSafe(selectedTrip.id, interventionReason)}
                        className="min-h-[38px] px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف آمن للرحلة</span>
                      </button>
                    </div>

                    {/* Manifest Control */}
                    <div className="pt-3 border-t border-slate-200 space-y-2.5">
                      <h4 className="text-xs font-extrabold text-slate-900">
                        كشف ركاب الرحلة ({(selectedTrip.manifest || []).length} / {selectedTrip.capacity})
                      </h4>

                      {/* Add Student to Trip */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={studentToAddId}
                          onChange={(e) => setStudentToAddId(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          <option value="">اختر طالباً من الشركة لإضافته للرحلة...</option>
                          {companyStudentsNotInTrip.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name} — {st.phone}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!studentToAddId}
                          onClick={() => {
                            const stu = users.find((u) => u.id === studentToAddId);
                            if (stu) {
                              void addStudentToTrip(selectedTrip.id, stu, interventionReason);
                              setStudentToAddId('');
                            }
                          }}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          إضافة للرحلة
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {(selectedTrip.manifest || []).length === 0 ? (
                          <p className="text-[11px] text-slate-500">لا يوجد ركاب مسجلون في هذه الرحلة.</p>
                        ) : (
                          selectedTrip.manifest.map((m) => {
                            const otherTrips = trips.filter(
                              (ot) => ot.id !== selectedTrip.id && ot.status !== 'cancelled' && ot.status !== 'merged'
                            );
                            const chosenTarget = reassignTargetTripByStudent[m.studentId] || '';
                            return (
                              <div
                                key={m.studentId}
                                className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-900">{m.studentName}</span>
                                  <span className="text-[11px] text-slate-500 mr-2">({m.stationNameAr})</span>
                                  <span className="text-[10px] font-bold mr-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    {m.boardedStatus === 'boarded'
                                      ? 'صعد الباص'
                                      : m.rsvpStatus === 'confirmed'
                                      ? 'مؤكد'
                                      : m.rsvpStatus}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {otherTrips.length > 0 && (
                                    <>
                                      <select
                                        value={chosenTarget}
                                        onChange={(e) =>
                                          setReassignTargetTripByStudent((prev) => ({
                                            ...prev,
                                            [m.studentId]: e.target.value,
                                          }))
                                        }
                                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold max-w-[160px]"
                                      >
                                        <option value="">نقل إلى رحلة...</option>
                                        {otherTrips.map((ot) => (
                                          <option key={ot.id} value={ot.id}>
                                            {ot.code} ({ot.scheduledTime})
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={!chosenTarget}
                                        onClick={() =>
                                          reassignStudentToTrip(selectedTrip.id, chosenTarget, m.studentId)
                                        }
                                        className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 disabled:opacity-40 text-sky-900 border border-sky-200 rounded-lg text-[11px] font-bold cursor-pointer"
                                      >
                                        نقل
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void removeStudentFromTrip(selectedTrip.id, m.studentId, interventionReason)
                                    }
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-[11px] font-bold cursor-pointer"
                                  >
                                    إزالة
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {interventionType === 'users' && !selectedInterventionUser && (
                  <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Users className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold">اختر مستخدماً أو طالباً من القائمة لفحص ارتباطاته وتعديل بياناته أو نقله.</p>
                  </div>
                )}

                {interventionType === 'users' && selectedInterventionUser && (
                  <div className="space-y-4">
                    {(() => {
                      const deps = dataService.inspectEntityDependencies('user', selectedInterventionUser.id, {
                        lines,
                        trips: allTrips,
                        users: allUsers,
                        drivers,
                        buses,
                      });
                      return (
                        <div
                          className={`p-3 rounded-xl border text-xs ${
                            deps.blockingCount > 0
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          <p className="font-extrabold">{deps.summary}</p>
                          {deps.details.length > 0 && (
                            <ul className="list-disc list-inside mt-1 text-[11px]">
                              {deps.details.map((d, i) => (
                                <li key={i}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}

                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <p className="font-extrabold text-sm text-slate-900">{selectedInterventionUser.name}</p>
                      <p className="text-slate-600">الدور: {ROLE_LABELS[selectedInterventionUser.role]}</p>
                      <p className="text-slate-600 font-mono">الهاتف: {selectedInterventionUser.phone}</p>
                      <p className="text-slate-600 font-mono">البريد: {selectedInterventionUser.email}</p>
                      <p className="text-slate-600">
                        الحالة: {selectedInterventionUser.status === 'active' ? 'نشط' : selectedInterventionUser.status}
                      </p>
                    </div>

                    {selectedInterventionUser.role !== 'super_admin' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void enterUserAccount(selectedInterventionUser.id)}
                          disabled={selectedInterventionUser.id === authenticatedUser?.id}
                          className="min-h-[38px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>دخول لحساب المستخدم والتعديل نيابة عنه</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditUserModal(selectedInterventionUser)}
                          className="min-h-[38px] px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل البيانات</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTransferModal(selectedInterventionUser)}
                          className="min-h-[38px] px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>نقل إلى شركة أخرى</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDeleteUserTarget(selectedInterventionUser);
                            setDeleteUserReason(interventionReason);
                          }}
                          className="min-h-[38px] px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>فحص وحذف آمن</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {interventionType === 'buses' && !selectedBus && (
                  <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <BusIcon className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold">اختر باصاً من القائمة لفحص ارتباطاته وتعديل حالته أو سعته.</p>
                  </div>
                )}

                {interventionType === 'buses' && selectedBus && (
                  <div className="space-y-4">
                    {(() => {
                      const deps = dataService.inspectEntityDependencies('bus', selectedBus.id, {
                        lines,
                        trips,
                        users,
                        drivers,
                        buses,
                      });
                      return (
                        <div
                          className={`p-3 rounded-xl border text-xs ${
                            deps.blockingCount > 0
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          <p className="font-extrabold">{deps.summary}</p>
                          {deps.details.length > 0 && (
                            <ul className="list-disc list-inside mt-1 text-[11px]">
                              {deps.details.map((d, i) => (
                                <li key={i}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">كود الباص</label>
                        <input
                          type="text"
                          value={busDraft.code}
                          onChange={(e) => setBusDraft((p) => ({ ...p, code: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم اللوحة</label>
                        <input
                          type="text"
                          value={busDraft.plateNumber}
                          onChange={(e) => setBusDraft((p) => ({ ...p, plateNumber: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">السعة (مقعد)</label>
                        <input
                          type="number"
                          min={4}
                          max={70}
                          value={busDraft.capacity}
                          onChange={(e) => setBusDraft((p) => ({ ...p, capacity: Number(e.target.value) }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة التشغيل</label>
                        <select
                          value={busDraft.status}
                          onChange={(e) =>
                            setBusDraft((p) => ({ ...p, status: e.target.value as Bus['status'] }))
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          <option value="available">متاح</option>
                          <option value="in_trip">في رحلة</option>
                          <option value="maintenance">صيانة</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateBus(selectedBus.id, busDraft)}
                        className="min-h-[38px] px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>حفظ تعديلات الباص</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteBus(selectedBus.id)}
                        className="min-h-[38px] px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف الباص</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: SAFE INTERFACE PREVIEW                                         */}
      {/* ===================================================================== */}
      {mainTab === 'preview' && (
        <div className="space-y-4">
          <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-950 font-extrabold text-sm">
                <Eye className="w-4 h-4 text-sky-700" />
                <span>
                  وضع المعاينة الآمنة للواجهة — شركة: {activeCompany?.nameAr || activeCompanyId}
                </span>
              </div>
              <p className="text-xs text-sky-800">
                تستعرض الآن واجهة ({ROLE_LABELS[selectedPreviewRole]}) دون تسجيل خروج أو فقدان صلاحيات مالك المنصة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['admin', 'supervisor', 'driver', 'student'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedPreviewRole(r)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    selectedPreviewRole === r
                      ? 'bg-[#0F2537] text-white'
                      : 'bg-white text-slate-700 border border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setMainTab('companies')}
                className="min-h-[38px] px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                إنهاء المعاينة
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/60 p-1 sm:p-2">
            {selectedPreviewRole === 'admin' && <AdminView />}
            {selectedPreviewRole === 'supervisor' && <SupervisorView />}
            {selectedPreviewRole === 'driver' && <DriverView />}
            {selectedPreviewRole === 'student' && <StudentView />}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: CENTRAL AUDIT LOG & SAFE ROLLBACK                              */}
      {/* ===================================================================== */}
      {mainTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAuditScope('platform')}
                className={`min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  auditScope === 'platform'
                    ? 'bg-[#0F2537] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                كافة شركات المنصة ({platformAuditLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setAuditScope('company')}
                className={`min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  auditScope === 'company'
                    ? 'bg-[#0F2537] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                الشركة النشطة فقط: {activeCompany?.nameAr} ({auditLogs.length})
              </button>

              <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyReversible}
                  onChange={(e) => setOnlyReversible(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                />
                <span>القابلة للتراجع فقط</span>
              </label>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="ابحث بالإجراء، المنفذ، الشركة، أو سبب التدخل..."
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0F2537]"
              />
            </div>
          </div>

          {visibleAuditLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">لا توجد سجلات مطابقة في سجل التدقيق.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleAuditLogs.map((log) => {
                const canRollback =
                  Boolean(log.reversible) &&
                  Boolean(log.targetCollection) &&
                  Boolean(log.targetDocId) &&
                  !log.rolledBackAt;
                const isExpanded = expandedAuditId === log.id;
                const hasStateDiff = log.beforeState !== undefined || log.afterState !== undefined;

                return (
                  <div
                    key={log.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900">{log.action}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {log.actorName} ({ROLE_LABELS[log.actorRole] || log.actorRole})
                          </span>
                          {(log.companyNameAr || log.companyId) && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-900 border border-sky-200">
                              {log.companyNameAr || log.companyId}
                            </span>
                          )}
                          {log.rolledBackAt && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              تم التراجع بواسطة {log.rolledBackBy || 'مالك المنصة'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700">{log.details}</p>
                        {log.interventionReason && (
                          <p className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 inline-block">
                            سبب التدخل: {log.interventionReason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col sm:items-end gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {log.timestamp}
                        </span>
                        <div className="flex items-center gap-2">
                          {hasStateDiff && (
                            <button
                              type="button"
                              onClick={() => setExpandedAuditId(isExpanded ? null : log.id)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              <span>القيم قبل/بعد</span>
                            </button>
                          )}

                          {canRollback && (
                            <button
                              type="button"
                              onClick={() => {
                                setRollbackTarget(log);
                                setRollbackReason('');
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>تراجع آمن</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && hasStateDiff && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-2.5">
                          <p className="font-extrabold text-rose-900 mb-1">القيمة قبل التعديل (Before)</p>
                          <pre className="font-mono text-[10px] text-slate-700 overflow-x-auto max-h-48" dir="ltr">
                            {JSON.stringify(log.beforeState ?? null, null, 2)}
                          </pre>
                        </div>
                        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-2.5">
                          <p className="font-extrabold text-emerald-900 mb-1">القيمة بعد التعديل (After)</p>
                          <pre className="font-mono text-[10px] text-slate-700 overflow-x-auto max-h-48" dir="ltr">
                            {JSON.stringify(log.afterState ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: CREATE / EDIT COMPANY                                        */}
      {/* ===================================================================== */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCompany}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingCompany ? `تعديل الشركة والاشتراك: ${editingCompany.nameAr}` : 'إضافة شركة نقل جامعي جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCompanyModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">اسم الشركة *</label>
                <input
                  type="text"
                  required
                  value={compForm.nameAr}
                  onChange={(e) => setCompForm((p) => ({ ...p, nameAr: e.target.value }))}
                  placeholder="مثال: شركة النيل للنقل الجامعي"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم مدير الشركة</label>
                <input
                  type="text"
                  value={compForm.ownerAdminName}
                  onChange={(e) => setCompForm((p) => ({ ...p, ownerAdminName: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">بريد مدير الشركة</label>
                <input
                  type="email"
                  value={compForm.ownerAdminEmail}
                  onChange={(e) => setCompForm((p) => ({ ...p, ownerAdminEmail: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">هاتف التواصل</label>
                <input
                  type="text"
                  value={compForm.contactPhone}
                  onChange={(e) => setCompForm((p) => ({ ...p, contactPhone: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">باقة الاشتراك</label>
                <select
                  value={compForm.planName}
                  onChange={(e) =>
                    setCompForm((p) => ({ ...p, planName: e.target.value as Company['planName'] }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="starter">الأساسية (Starter)</option>
                  <option value="growth">النمو (Growth)</option>
                  <option value="enterprise">المؤسسات (Enterprise)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">السعر الشهري (ج.م)</label>
                <input
                  type="number"
                  min={0}
                  value={compForm.monthlyPriceEgp}
                  onChange={(e) => setCompForm((p) => ({ ...p, monthlyPriceEgp: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">مدة الاشتراك (شهور)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={compForm.durationMonths}
                  onChange={(e) => {
                    const months = Number(e.target.value) || 1;
                    setCompForm((p) => ({
                      ...p,
                      durationMonths: months,
                      endDate: addMonthsToDateString(p.startDate, months),
                    }));
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تاريخ البدء</label>
                <input
                  type="date"
                  value={compForm.startDate}
                  onChange={(e) =>
                    setCompForm((p) => ({
                      ...p,
                      startDate: e.target.value,
                      endDate: addMonthsToDateString(e.target.value, p.durationMonths),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تاريخ الانتهاء</label>
                <input
                  type="date"
                  value={compForm.endDate}
                  onChange={(e) => setCompForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">حالة السداد</label>
                <select
                  value={compForm.paymentStatus}
                  onChange={(e) =>
                    setCompForm((p) => ({ ...p, paymentStatus: e.target.value as Company['paymentStatus'] }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="paid">مدفوع</option>
                  <option value="pending">قيد التحصيل</option>
                  <option value="overdue">متأخر السداد</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">حالة الشركة</label>
                <select
                  value={compForm.status}
                  onChange={(e) =>
                    setCompForm((p) => ({ ...p, status: e.target.value as Company['status'] }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="active">نشطة</option>
                  <option value="suspended">موقوفة مؤقتاً</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">حد الباصات</label>
                <input
                  type="number"
                  min={1}
                  value={compForm.maxBuses}
                  onChange={(e) => setCompForm((p) => ({ ...p, maxBuses: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">حد الطلاب</label>
                <input
                  type="number"
                  min={1}
                  value={compForm.maxStudents}
                  onChange={(e) => setCompForm((p) => ({ ...p, maxStudents: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            {editingCompany && (
              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">سبب التعديل (اختياري)</label>
                <input
                  type="text"
                  value={compForm.reason}
                  onChange={(e) => setCompForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="مثال: تجديد اشتراك سنوي / ترقية الباقة"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCompanyModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSavingCompany}
                className="px-5 py-2.5 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {isSavingCompany ? 'جارٍ الحفظ...' : editingCompany ? 'حفظ التعديلات' : 'إنشاء الشركة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: SUSPEND / REACTIVATE COMPANY CONFIRMATION                    */}
      {/* ===================================================================== */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              {suspendTarget.status === 'active'
                ? `تأكيد تعليق شركة "${suspendTarget.nameAr}" مؤقتاً`
                : `تأكيد إعادة تفعيل شركة "${suspendTarget.nameAr}"`}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {suspendTarget.status === 'active'
                ? 'سيتم حظر الدخول التشغيلي لمستخدمي هذه الشركة على مستوى قاعدة البيانات السحابية مع الحفاظ الكامل على جميع البيانات والرحلات دون أي حذف.'
                : 'سيتم فك التعليق واستئناف كافة الصلاحيات التشغيلية لمستخدمي الشركة فوراً.'}
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">السبب (يُسجل في سجل التدقيق)</label>
              <input
                type="text"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={
                  suspendTarget.status === 'active'
                    ? 'مثال: تأخر سداد الاشتراك الشهري'
                    : 'مثال: تم تأكيد السداد واستئناف التشغيل'
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSuspendToggle()}
                className={`px-4 py-2 text-white rounded-xl text-xs font-bold cursor-pointer ${
                  suspendTarget.status === 'active'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {suspendTarget.status === 'active' ? 'تأكيد التعليق المؤقت' : 'تأكيد إعادة التفعيل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: CREATE / EDIT USER                                           */}
      {/* ===================================================================== */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveUserForm}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingUser ? `تعديل المستخدم: ${editingUser.name}` : `إضافة مستخدم جديد (${activeCompany?.nameAr})`}
              </h3>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الهاتف *</label>
                <input
                  type="text"
                  required
                  value={userForm.phone}
                  onChange={(e) => setUserForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني (اختياري لـ Google)</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="اختياري"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">الدور</label>
                <select
                  value={userForm.role}
                  disabled={editingUser?.role === 'super_admin'}
                  onChange={(e) => setUserForm((p) => ({ ...p, role: e.target.value as UserRole }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="student">طالب</option>
                  <option value="driver">سائق</option>
                  <option value="supervisor">مشرف تشغيلي</option>
                  <option value="admin">مدير الشركة</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">حالة الحساب</label>
                <select
                  value={userForm.status}
                  onChange={(e) =>
                    setUserForm((p) => ({ ...p, status: e.target.value as User['status'] }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="active">نشط</option>
                  <option value="pending_approval">بانتظار الاعتماد</option>
                  <option value="suspended">موقوف</option>
                </select>
              </div>

              {userForm.role === 'supervisor' && (
                <div className="sm:col-span-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-indigo-950">
                    <input
                      type="checkbox"
                      checked={userForm.isGeneralSupervisor}
                      onChange={(e) => setUserForm((p) => ({ ...p, isGeneralSupervisor: e.target.checked }))}
                      className="w-4 h-4 accent-indigo-600 rounded"
                    />
                    <span>مشرف عام (يمتلك واجهات مدير + مشرف + سائق معاً مع سهولة التنقل)</span>
                  </label>
                </div>
              )}

              {userForm.role === 'driver' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">الباص المخصص</label>
                    <select
                      value={userForm.assignedBusId}
                      onChange={(e) => setUserForm((p) => ({ ...p, assignedBusId: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">غير محدد</option>
                      {buses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} — {b.plateNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!editingUser && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">رقم الرخصة</label>
                      <input
                        type="text"
                        value={userForm.licenseNumber}
                        onChange={(e) => setUserForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                        placeholder="DL-10023"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                      />
                    </div>
                  )}
                </>
              )}

              {userForm.role === 'student' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">الجامعة</label>
                    <select
                      value={userForm.universityId}
                      onChange={(e) => setUserForm((p) => ({ ...p, universityId: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">اختر الجامعة</option>
                      {universities.map((un) => (
                        <option key={un.id} value={un.id}>
                          {un.nameAr}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">الخط</label>
                    <select
                      value={userForm.lineId}
                      onChange={(e) => {
                        const lId = e.target.value;
                        const foundLine = lines.find((l) => l.id === lId);
                        setUserForm((p) => ({
                          ...p,
                          lineId: lId,
                          stationId: foundLine?.stations?.[0]?.id || '',
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">اختر الخط</option>
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nameAr}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">المحطة</label>
                    <select
                      value={userForm.stationId}
                      onChange={(e) => setUserForm((p) => ({ ...p, stationId: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">اختر المحطة</option>
                      {(lines.find((l) => l.id === userForm.lineId)?.stations || []).map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.nameAr}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">سبب الإجراء / ملاحظة التدقيق</label>
              <input
                type="text"
                value={userForm.reason}
                onChange={(e) => setUserForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="اختياري..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSavingUser}
                className="px-5 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60"
              >
                {isSavingUser ? 'جارٍ الحفظ...' : editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: SAFE TRANSFER USER BETWEEN COMPANIES                         */}
      {/* ===================================================================== */}
      {transferUserTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmUserTransfer}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-xs"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              نقل المستخدم إلى شركة أخرى
            </h3>
            <p className="text-slate-600">
              نقل <strong className="text-slate-900">{transferUserTarget.name}</strong> مع فحص الرحلات الجارية ومنع خلط السجلات عبر معاملة ذرية.
            </p>

            <div>
              <label className="block font-bold text-slate-700 mb-1">الشركة المستهدفة</label>
              <select
                value={transferTargetCompanyId}
                onChange={(e) => setTransferTargetCompanyId(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="">اختر الشركة المستهدفة...</option>
                {companies
                  .filter((c) => c.id !== (transferUserTarget.companyId || activeCompanyId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr} ({c.code})
                    </option>
                  ))}
              </select>
            </div>

            {transferValidation && (
              <div
                className={`p-3 rounded-xl border ${
                  transferValidation.allowed
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {transferValidation.allowed ? (
                  <p className="font-bold">
                    جاهز للنقل الآمن. سيتم تنظيف ({transferValidation.affectedTripIds.length}) حجوزات رحلات مجدولة في الشركة السابقة تلقائياً.
                  </p>
                ) : (
                  <p className="font-bold">{transferValidation.reason}</p>
                )}
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1">سبب النقل *</label>
              <input
                type="text"
                required
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="مثال: انتقال الطالب لفرع الشركة بالمحافظة الأخرى"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferUserTarget(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isTransferringUser || Boolean(transferValidation && !transferValidation.allowed)}
                className="px-4 py-2 bg-[#0F2537] hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer"
              >
                {isTransferringUser ? 'جارٍ النقل...' : 'تنفيذ النقل الآمن'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: SAFE USER DELETE WITH DEPENDENCY CHECK                       */}
      {/* ===================================================================== */}
      {deleteUserTarget && deleteUserDeps && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-xs">
            <h3 className="text-base font-extrabold text-slate-900">
              فحص الارتباطات قبل حذف "{deleteUserTarget.name}"
            </h3>

            <div
              className={`p-3 rounded-xl border ${
                deleteUserDeps.blockingCount > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <p className="font-extrabold">{deleteUserDeps.summary}</p>
              {deleteUserDeps.details.length > 0 && (
                <ul className="list-disc list-inside mt-1 text-[11px]">
                  {deleteUserDeps.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>

            {deleteUserDeps.blockingCount === 0 && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الحذف</label>
                <input
                  type="text"
                  value={deleteUserReason}
                  onChange={(e) => setDeleteUserReason(e.target.value)}
                  placeholder="مثال: حساب مكرر / انتهاء الاشتراك"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteUserTarget(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                إغلاق
              </button>
              {deleteUserDeps.blockingCount === 0 && (
                <button
                  type="button"
                  onClick={() => void handleConfirmDeleteUser()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  تأكيد الحذف الآمن
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: SAFE AUDIT ROLLBACK CONFIRMATION                             */}
      {/* ===================================================================== */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmRollback}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>تأكيد التراجع الآمن عن العملية</span>
              </h3>
              <button
                type="button"
                onClick={() => setRollbackTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <p className="font-extrabold text-amber-950">{rollbackTarget.action}</p>
              <p className="text-amber-900">{rollbackTarget.details}</p>
              <p className="font-mono text-[11px] text-amber-800">
                المسار: {rollbackTarget.targetCollection}/{rollbackTarget.targetDocId}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-extrabold text-slate-800 mb-1">الحالة التي سيتم استعادتها:</p>
              <pre className="font-mono text-[10px] text-slate-700 overflow-x-auto max-h-40" dir="ltr">
                {rollbackTarget.beforeState
                  ? JSON.stringify(rollbackTarget.beforeState, null, 2)
                  : 'null (سيتم حذف السجل المُنشأ حديثاً)'}
              </pre>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">سبب التراجع *</label>
              <input
                type="text"
                required
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="مثال: تصحيح خطأ تشغيلي وإرجاع البيانات للحالة السابقة"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRollbackTarget(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isRollingBack}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-extrabold cursor-pointer disabled:opacity-60"
              >
                {isRollingBack ? 'جارٍ الاستعادة...' : 'تنفيذ التراجع الآمن'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
