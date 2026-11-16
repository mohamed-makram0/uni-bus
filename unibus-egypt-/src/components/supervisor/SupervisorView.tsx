import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { sampleWhatsappText } from '../../data/mockData';
import { Trip, ManifestStudent } from '../../types';
import { FleetDemandPlanner } from './FleetDemandPlanner';
import { matchesArabicSearch } from '../../utils/arabicSearch';
import { computeWaitingBusMetrics } from '../../utils/waitingBusMetrics';
import { playDispatchAlertChime, triggerBrowserNotification } from '../../utils/soundAlerts';
import {
  Shield,
  Bus,
  Users,
  AlertTriangle,
  GitMerge,
  FileText,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
  Phone,
  Clock,
  MapPin,
  Upload,
  ArrowRight,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  Calendar,
  Check,
  Compass,
  UserCheck,
  UserX,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  Info,
  ListOrdered,
  Download,
  Sliders,
  CalendarPlus,
  Radio,
  FileSpreadsheet,
  Sparkles,
  AlertCircle,
  PhoneCall,
  CheckSquare,
  Volume2,
  VolumeX,
  Plus,
  UserPlus
} from 'lucide-react';

interface PassengerJourneyRecord {
  studentId: string;
  studentName: string;
  phone: string;
  universityNameAr: string;
  universityId: string;
  lineNameAr: string;
  lineId: string;
  direction: 'to_university' | 'from_university';
  tripId: string;
  tripCode: string;
  scheduledTime: string;
  driverNameAr: string;
  driverPhone: string;
  busPlate: string;
  busCapacity: number;
  scheduledStationNameAr: string;
  actualStationNameAr?: string;
  boardingTime?: string;
  boardedStatus: 'waiting' | 'boarded' | 'no_show';
  rsvpStatus: 'unconfirmed' | 'confirmed' | 'excused' | 'whatsapp_reported';
  tripStatus: string;
}

export const SupervisorView: React.FC = () => {
  const {
    trips,
    buses,
    drivers,
    users,
    universities,
    lines,
    subscriptions,
    incidents,
    settings,
    activeOperatingDate,
    setActiveOperatingDate,
    availableOperatingDates,
    startNewOperatingDay,
    exceptionalRequests,
    batchUpdateStudentBoarding,
    reassignStudentToTrip,
    toggleStudentAssignmentMode,
    autoAllocateStudentsToSlotBuses,
    addToast,
    importWhatsappAttendance,
    swapBusOrDriver,
    approveStudentRegistration,
    rejectPendingRegistration,
    confirmStudentRsvp,
    isCutoffPassedForTomorrow,
    approveDailyPlan,
    autoAssignBusesForPlan,
    dispatchWaitingReturnBus,
    consolidateWaitingBusesOnly,
    markCrossUniversityHandoff,
    allocateWaitingReturnBus,
    supervisorQuickSwapOrEmergency
  } = useApp();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'fleet_planning' | 'live' | 'swap' | 'whatsapp' | 'registrations' | 'incidents'
  >('dashboard');

  // Sub-view toggle in dashboard (Trips table vs Demand calculation table vs Passenger Journey log)
  const [dashboardViewMode, setDashboardViewMode] = useState<'trips' | 'demand_table' | 'passengers'>('trips');

  // Selected slot for "عرض الطلاب" modal (PDF Page 4 & 9)
  const [selectedSlotForStudents, setSelectedSlotForStudents] = useState<{
    slotKey: string;
    time: string;
    lineId: string;
    lineNameAr: string;
    universityId: string;
    universityNameAr: string;
    direction: 'to_university' | 'from_university';
    tripsInSlot: Trip[];
    registeredStudents: ManifestStudent[];
  } | null>(null);

  // Filters inside "عرض الطلاب" modal
  const [modalStudentSearch, setModalStudentSearch] = useState<string>('');
  const [modalStationFilter, setModalStationFilter] = useState<string>('all');
  const [modalBusFilter, setModalBusFilter] = useState<string>('all');
  const [modalStatusFilter, setModalStatusFilter] = useState<string>('all');

  // Selected slot / trip for "تحديد السيارات" modal (PDF Page 4)
  const [selectedSlotForVehicles, setSelectedSlotForVehicles] = useState<{
    slotKey: string;
    time: string;
    lineId: string;
    lineNameAr: string;
    universityNameAr: string;
    direction: 'to_university' | 'from_university';
    tripsInSlot: Trip[];
  } | null>(null);
  const [assignTargetTripId, setAssignTargetTripId] = useState<string>('');
  const [assignBusId, setAssignBusId] = useState<string>('');
  const [assignDriverId, setAssignDriverId] = useState<string>('');

  // Student Profile modal (PDF Page 9 - عند النقر على اسم الطالب)
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<{
    studentId: string;
    studentName: string;
    phone: string;
    universityNameAr: string;
    lineNameAr: string;
    stationNameAr: string;
    scheduledTime: string;
    busPlate: string;
    driverNameAr: string;
    driverPhone: string;
    tripId: string;
    boardedStatus: 'waiting' | 'boarded' | 'no_show';
    rsvpStatus: string;
  } | null>(null);

  // Confirmation modal for plan approval (PDF Page 6 - رسالة تأكيد قبل اعتماد الخطة)
  const [showApproveConfirmModal, setShowApproveConfirmModal] = useState<boolean>(false);

  // Filters for the general passenger table (PDF Page 5)
  const [passengerUniversityFilter, setPassengerUniversityFilter] = useState<string>('all');
  const [passengerLineFilter, setPassengerLineFilter] = useState<string>('all');
  const [passengerStationFilter, setPassengerStationFilter] = useState<string>('all');
  const [passengerTimeFilter, setPassengerTimeFilter] = useState<string>('all');
  const [passengerBusFilter, setPassengerBusFilter] = useState<string>('all');

  // Passenger log status filter
  const [passengerStatusFilter, setPassengerStatusFilter] = useState<'all' | 'boarded' | 'waiting' | 'absent'>('all');

  // Passenger log pagination state
  const [passengerPage, setPassengerPage] = useState<number>(1);
  const [passengerPageSize, setPassengerPageSize] = useState<number>(10);

  // Multi-student selection for batch operations
  const [selectedPassengerIds, setSelectedPassengerIds] = useState<string[]>([]);

  // Start new operating day modal state
  const [showNewDayModal, setShowNewDayModal] = useState<boolean>(false);
  const [newDayInputDate, setNewDayInputDate] = useState<string>(() => {
    const base = activeOperatingDate || '2026-10-20';
    const [y, m, d] = base.split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1)).toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (activeOperatingDate) {
      const [y, m, d] = activeOperatingDate.split('-').map(Number);
      setNewDayInputDate(new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1)).toISOString().slice(0, 10));
    }
  }, [activeOperatingDate]);

  // Interactive Summary Card Detail Modal
  const [summaryModalType, setSummaryModalType] = useState<
    | null
    | 'registered_today'
    | 'cars_needed'
    | 'cars_assigned'
    | 'cars_shortage'
    | 'students_no_car'
    | 'finished_uni'
    | 'inside_waiting_buses'
    | 'departed_home_students'
    | 'departed_home_buses'
  >(null);
  const [summaryModalSearch, setSummaryModalSearch] = useState<string>('');

  // Last update timestamp
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>(
    new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())
  );

  // Global Operational Filters
  const [filterDate, setFilterDate] = useState<string>('all');
  const [filterUniversity, setFilterUniversity] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterDirection, setFilterDirection] = useState<'all' | 'to_university' | 'from_university'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'in_progress' | 'delayed' | 'scheduled' | 'completed' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Reset pagination whenever global searchQuery changes
  useEffect(() => {
    setPassengerPage(1);
  }, [searchQuery]);

  // Selected trip for detailed manifest modal / drawer
  const [selectedTripForDetails, setSelectedTripForDetails] = useState<Trip | null>(null);

  // Live monitor expandable state
  const [expandedLiveTripId, setExpandedLiveTripId] = useState<string | null>(null);

  // WhatsApp Import state
  const [whatsappText, setWhatsappText] = useState(sampleWhatsappText);
  const [selectedTripForImport, setSelectedTripForImport] = useState(trips[0]?.id || '');
  const [importResult, setImportResult] = useState<{ matched: number; unassigned: number } | null>(null);

  // Collapsible filter panel to keep Supervisor screen light and focused on Vital Signs
  const [showOpsFilters, setShowOpsFilters] = useState<boolean>(false);

  // Hot swap state (Existing / Unregistered Emergency / Quick New Driver)
  const [swapTripId, setSwapTripId] = useState(trips[0]?.id || '');
  const [swapMode, setSwapMode] = useState<'existing' | 'unregistered' | 'new_driver'>('existing');
  const [newBusId, setNewBusId] = useState(buses[1]?.id || buses[0]?.id || '');
  const [newDriverId, setNewDriverId] = useState(drivers[1]?.id || drivers[0]?.id || '');
  const [adHocDriverName, setAdHocDriverName] = useState('');
  const [adHocDriverPhone, setAdHocDriverPhone] = useState('');
  const [adHocBusPlate, setAdHocBusPlate] = useState('');
  const [adHocCapacity, setAdHocCapacity] = useState(14);
  const [quickDriverName, setQuickDriverName] = useState('');
  const [quickDriverPhone, setQuickDriverPhone] = useState('');
  const [quickDriverEmail, setQuickDriverEmail] = useState('');
  const [quickDriverBusId, setQuickDriverBusId] = useState(buses[0]?.id || '');
  const [quickDriverPlate, setQuickDriverPlate] = useState('');
  const [quickDriverCapacity, setQuickDriverCapacity] = useState(14);
  const [isSubmittingSwap, setIsSubmittingSwap] = useState(false);
  const [swapReason, setSwapReason] = useState('عطل مفاجئ في الحافلة الأصلية');
  const [swapSuccessInfo, setSwapSuccessInfo] = useState<{ tripCode: string; time: string } | null>(null);

  // Per-university waiting-return car allocation modal
  const [showWaitingAllocModal, setShowWaitingAllocModal] = useState(false);
  const [allocUniId, setAllocUniId] = useState(universities[0]?.id || '');
  const [allocLineId, setAllocLineId] = useState(lines[0]?.id || '');
  const [allocUseAdHoc, setAllocUseAdHoc] = useState(false);
  const [allocDriverId, setAllocDriverId] = useState(drivers[0]?.id || '');
  const [allocBusId, setAllocBusId] = useState(buses[0]?.id || '');
  const [allocAdHocDriverName, setAllocAdHocDriverName] = useState('');
  const [allocAdHocDriverPhone, setAllocAdHocDriverPhone] = useState('');
  const [allocAdHocPlate, setAllocAdHocPlate] = useState('');
  const [allocAdHocCapacity, setAllocAdHocCapacity] = useState(14);
  const [isAllocatingWaitingBus, setIsAllocatingWaitingBus] = useState(false);

  // Incident filter state
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  // Available unique dates from trips and system
  const availableDates = useMemo(() => {
    return availableOperatingDates || ['2026-10-19', '2026-10-20', '2026-10-21'];
  }, [availableOperatingDates]);

  // Pending student registrations
  const pendingRegistrations = useMemo(() => {
    return users.filter(u => u.status === 'pending_approval');
  }, [users]);

  // Filtered trips for dashboard and operations table
  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      // Date filter
      if (filterDate !== 'all' && trip.date !== filterDate) return false;

      // University filter
      if (filterUniversity !== 'all' && trip.universityId !== filterUniversity && trip.universityNameAr !== filterUniversity) {
        return false;
      }

      // Line filter
      if (filterLine !== 'all' && trip.lineId !== filterLine && trip.lineNameAr !== filterLine) {
        return false;
      }

      // Direction filter
      if (filterDirection !== 'all' && trip.direction !== filterDirection) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'all' && trip.status !== filterStatus) {
        return false;
      }

      // Search query with Arabic normalization
      if (searchQuery.trim()) {
        const matchTrip = matchesArabicSearch(
          searchQuery,
          trip.code,
          trip.lineNameAr,
          trip.driverNameAr,
          trip.driverPhone,
          trip.busPlate,
          trip.universityNameAr,
          trip.scheduledTime
        );
        const matchStudent = (trip.manifest || []).some(m =>
          matchesArabicSearch(
            searchQuery,
            m.studentName,
            m.phone,
            m.stationNameAr,
            m.actualBoardingStationNameAr
          )
        );
        if (!matchTrip && !matchStudent) {
          return false;
        }
      }

      return true;
    });
  }, [trips, filterDate, filterUniversity, filterLine, filterDirection, filterStatus, searchQuery]);

  // ========================================================
  // ALL PASSENGERS TRAVELING TODAY (Master Log)
  // Contains student name, phone, trip, driver, bus, boarding time, status
  // ========================================================
  const allPassengersToday = useMemo(() => {
    const records: PassengerJourneyRecord[] = [];
    filteredTrips.forEach(trip => {
      (trip.manifest || []).forEach(m => {
        records.push({
          studentId: m.studentId,
          studentName: m.studentName,
          phone: m.phone,
          universityNameAr: trip.universityNameAr,
          universityId: trip.universityId,
          lineNameAr: trip.lineNameAr,
          lineId: trip.lineId,
          direction: trip.direction,
          tripId: trip.id,
          tripCode: trip.code,
          scheduledTime: trip.scheduledTime,
          driverNameAr: trip.driverNameAr,
          driverPhone: trip.driverPhone,
          busPlate: trip.busPlate,
          busCapacity: trip.capacity,
          scheduledStationNameAr: m.stationNameAr,
          actualStationNameAr: m.actualBoardingStationNameAr,
          boardingTime: m.boardedAt,
          boardedStatus: m.boardedStatus,
          rsvpStatus: m.rsvpStatus,
          tripStatus: trip.status
        });
      });
    });

    // Apply passenger status filter, multi-criteria filters, and search query
    return records.filter(p => {
      if (passengerStatusFilter === 'boarded' && p.boardedStatus !== 'boarded') return false;
      if (passengerStatusFilter === 'waiting' && p.boardedStatus !== 'waiting') return false;
      if (passengerStatusFilter === 'absent' && p.rsvpStatus !== 'excused' && p.boardedStatus !== 'no_show') return false;

      if (passengerUniversityFilter !== 'all' && p.universityId !== passengerUniversityFilter && p.universityNameAr !== passengerUniversityFilter) return false;
      if (passengerLineFilter !== 'all' && p.lineId !== passengerLineFilter && p.lineNameAr !== passengerLineFilter) return false;
      if (passengerStationFilter !== 'all' && p.scheduledStationNameAr !== passengerStationFilter) return false;
      if (passengerTimeFilter !== 'all' && p.scheduledTime !== passengerTimeFilter) return false;
      if (passengerBusFilter !== 'all' && p.busPlate !== passengerBusFilter) return false;

      if (searchQuery.trim()) {
        const matched = matchesArabicSearch(
          searchQuery,
          p.studentName,
          p.phone,
          p.driverNameAr,
          p.driverPhone,
          p.tripCode,
          p.busPlate,
          p.lineNameAr,
          p.universityNameAr,
          p.scheduledStationNameAr,
          p.actualStationNameAr
        );
        if (!matched) {
          return false;
        }
      }

      return true;
    });
  }, [
    filteredTrips,
    passengerStatusFilter,
    passengerUniversityFilter,
    passengerLineFilter,
    passengerStationFilter,
    passengerTimeFilter,
    passengerBusFilter,
    searchQuery
  ]);

  // Unique student passengers count traveling today
  const uniqueTravelingStudentsCount = useMemo(() => {
    const set = new Set<string>();
    filteredTrips.forEach(t => {
      (t.manifest || []).forEach(m => set.add(m.studentId));
    });
    return set.size;
  }, [filteredTrips]);

  // ========================================================
  // MATHEMATICALLY REVISED & COHESIVE 12 OPERATIONAL INDICATORS
  // Clear distinction between Registered, RSVP, Allocated, Boarded, Arrived
  // ========================================================
  const metrics = useMemo(() => {
    // 1. Total Registered Students in the System
    const allKnownStudentIds = new Set<string>();
    users.filter(u => u.role === 'student').forEach(u => allKnownStudentIds.add(u.id));
    subscriptions.forEach(s => allKnownStudentIds.add(s.studentId));
    trips.forEach(t => (t.manifest || []).forEach(m => allKnownStudentIds.add(m.studentId)));
    const totalRegisteredStudents = allKnownStudentIds.size;

    // 2. Active Subscribed Students
    const activeSubscribedIds = new Set<string>();
    subscriptions.filter(s => s.status === 'active').forEach(s => activeSubscribedIds.add(s.studentId));
    users.filter(u => u.role === 'student' && u.status === 'active').forEach(u => activeSubscribedIds.add(u.id));
    const activeSubscribedStudents = activeSubscribedIds.size;

    // Filtered morning and return trips
    const morningTrips = filteredTrips.filter(t => t.direction === 'to_university');
    const returnTrips = filteredTrips.filter(t => t.direction === 'from_university');

    // 3. Students with confirmed RSVP attendance for today's trips
    const rsvpConfirmedIds = new Set<string>();
    filteredTrips.forEach(t => {
      (t.manifest || []).forEach(m => {
        if (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported') {
          rsvpConfirmedIds.add(m.studentId);
        }
      });
    });
    const totalRsvpConfirmedToday = rsvpConfirmedIds.size;

    // 4. Students allocated to buses today (manifest assignments)
    const allocatedStudentIds = new Set<string>();
    filteredTrips.forEach(t => {
      (t.manifest || []).forEach(m => {
        allocatedStudentIds.add(m.studentId);
      });
    });
    const totalAllocatedStudentsToday = allocatedStudentIds.size;

    // 5. Students boarded onto buses today
    const boardedStudentIds = new Set<string>();
    filteredTrips.forEach(t => {
      (t.manifest || []).forEach(m => {
        if (m.boardedStatus === 'boarded') {
          boardedStudentIds.add(m.studentId);
        }
      });
    });
    const totalBoardedStudentsToday = boardedStudentIds.size;

    // 6. Absent / Excused students today
    const absentStudentIds = new Set<string>();
    filteredTrips.forEach(t => {
      (t.manifest || []).forEach(m => {
        if (m.rsvpStatus === 'excused' || m.boardedStatus === 'no_show') {
          absentStudentIds.add(m.studentId);
        }
      });
    });
    const totalAbsentStudentsToday = absentStudentIds.size;

    // 7. Students who arrived at university
    const arrivedAtUnivStudentIds = new Set<string>();
    morningTrips.forEach(t => {
      const isTripAtUniv =
        t.status === 'completed' ||
        (t.stops &&
          t.stops.length > 0 &&
          (t.stops[t.stops.length - 1].status === 'arrived' ||
            t.stops[t.stops.length - 1].status === 'departed'));

      if (isTripAtUniv) {
        (t.manifest || []).forEach(m => {
          if (m.boardedStatus === 'boarded') {
            arrivedAtUnivStudentIds.add(m.studentId);
          }
        });
      }
    });
    const studentsArrivedAtUniv = arrivedAtUnivStudentIds.size;

    // 8. Students returned to their homes/destinations
    const returnedStudentIds = new Set<string>();
    returnTrips.forEach(t => {
      if (t.status === 'completed') {
        (t.manifest || []).forEach(m => {
          if (m.boardedStatus === 'boarded') {
            returnedStudentIds.add(m.studentId);
          }
        });
      }
    });
    const studentsReturnedHome = returnedStudentIds.size;

    // 9. Total buses demanded based on passenger volumes & actual bus capacities (14, 28, 33)
    let totalBusesDemanded = 0;
    let totalSeatShortage = 0;
    filteredTrips.forEach(t => {
      const registered = t.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
      if (registered > t.capacity) {
        totalSeatShortage += (registered - t.capacity);
      }
      const neededCount = registered <= 0 ? 1 : registered <= 14 ? 1 : registered <= 28 ? 1 : registered <= 33 ? 1 : Math.ceil(registered / 28);
      totalBusesDemanded += neededCount;
    });

    // 10. Buses deployed currently
    const deployedBusesSet = new Set<string>();
    filteredTrips.forEach(t => {
      if (t.busId) deployedBusesSet.add(t.busId);
    });
    const totalBusesDeployed = deployedBusesSet.size;

    // 11. Fleet/seat shortage
    const busesShortage = Math.max(0, totalBusesDemanded - filteredTrips.length);

    // 12. Trip status counts
    const inProgressTripsCount = filteredTrips.filter(t => t.status === 'in_progress').length;
    const completedTripsCount = filteredTrips.filter(t => t.status === 'completed').length;
    const delayedTripsCount = filteredTrips.filter(t => t.status === 'delayed').length;
    const scheduledTripsCount = filteredTrips.filter(t => t.status === 'scheduled').length;
    const availableBusesCount = buses.filter(b => b.status === 'available' && b.activeStatus).length;

    return {
      totalRegisteredStudents,
      activeSubscribedStudents,
      totalRsvpConfirmedToday,
      totalAllocatedStudentsToday,
      totalBoardedStudentsToday,
      totalAbsentStudentsToday,
      studentsArrivedAtUniv,
      studentsReturnedHome,
      totalBusesDemanded: totalBusesDemanded || filteredTrips.length,
      totalBusesDeployed,
      totalSeatShortage,
      busesShortage,
      inProgressTripsCount,
      completedTripsCount,
      delayedTripsCount,
      scheduledTripsCount,
      availableBusesCount
    };
  }, [users, subscriptions, trips, filteredTrips, buses]);

  // Operational Risks & Issue Detection
  const operationalRisks = useMemo(() => {
    const list: { id: string; type: 'overflow' | 'unassigned' | 'driver' | 'overlap'; text: string; severity: 'high' | 'medium' }[] = [];

    filteredTrips.forEach(t => {
      const confirmed = t.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
      if (confirmed > t.capacity) {
        list.push({
          id: `ovf-${t.id}`,
          type: 'overflow',
          text: `الرحلة (${t.code} - ${t.scheduledTime}) على ${t.lineNameAr}: عدد الركاب (${confirmed}) يتجاوز سعة الحافلة (${t.capacity} مقعد). يوجد عجز ${confirmed - t.capacity} مقاعد.`,
          severity: 'high'
        });
      }
      if (!t.busId || !t.busPlate) {
        list.push({
          id: `nobus-${t.id}`,
          type: 'unassigned',
          text: `الرحلة (${t.code} - ${t.scheduledTime}) بدون حافلة مخصصة.`,
          severity: 'high'
        });
      }
      if (!t.driverId || !t.driverNameAr) {
        list.push({
          id: `nodrv-${t.id}`,
          type: 'driver',
          text: `الرحلة (${t.code} - ${t.scheduledTime}) بدون سائق مخصص.`,
          severity: 'high'
        });
      }
    });

    return list;
  }, [filteredTrips]);

  // CSV Export for Passenger Table
  const exportPassengerDataToCSV = () => {
    const recordsToExport = selectedPassengerIds.length > 0
      ? allPassengersToday.filter((p: PassengerJourneyRecord) => selectedPassengerIds.includes(p.studentId))
      : allPassengersToday;

    if (recordsToExport.length === 0) {
      if (addToast) addToast('لا توجد سجلات ركاب للتصدير', 'error');
      return;
    }

    const headers = [
      'اسم الطالب',
      'الهاتف',
      'الجامعة',
      'خط السير',
      'المحطة المعتمدة',
      'كود الرحلة',
      'موعد الرحلة',
      'الاتجاه',
      'لوحة الحافلة',
      'سعة الحافلة',
      'اسم السائق',
      'هاتف السائق',
      'حالة تأكيد الحجز',
      'حالة الركوب الفعلية',
      'وقت الصعود',
      'محطة الصعود الفعلية'
    ];

    const rows = recordsToExport.map((p: PassengerJourneyRecord) => [
      `"${p.studentName}"`,
      `"${p.phone}"`,
      `"${p.universityNameAr}"`,
      `"${p.lineNameAr}"`,
      `"${p.scheduledStationNameAr}"`,
      `"${p.tripCode}"`,
      `"${p.scheduledTime}"`,
      `"${p.direction === 'to_university' ? 'ذهاب للجامعة' : 'عودة'}"`,
      `"${p.busPlate}"`,
      p.busCapacity,
      `"${p.driverNameAr}"`,
      `"${p.driverPhone}"`,
      `"${p.rsvpStatus === 'confirmed' ? 'مؤكد' : p.rsvpStatus === 'excused' ? 'معتذر' : p.rsvpStatus === 'whatsapp_reported' ? 'واتساب' : 'غير مؤكد'}"`,
      `"${p.boardedStatus === 'boarded' ? 'ركب الحافلة' : p.boardedStatus === 'no_show' ? 'غائب' : 'في الانتظار'}"`,
      `"${p.boardingTime || '-'}"`,
      `"${p.actualStationNameAr || '-'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `UniBus_Egypt_Daily_Manifest_${filterDate === 'all' ? activeOperatingDate : filterDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (addToast) addToast(`تم تصدير ملف إكسل/CSV بنجاح (${recordsToExport.length} سجل طالب).`, 'success');
  };

  // Refresh handler
  const handleRefresh = () => {
    const time = new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
    setLastUpdatedTime(time);
    if (addToast) {
      addToast(`تم تحديث المؤشرات التشغيلية والرحلات في تمام ${time}`, 'info');
    }
  };

  // Hot Swap preview objects
  const currentSwapTrip = useMemo(() => {
    return trips.find(t => t.id === swapTripId);
  }, [trips, swapTripId]);

  const selectedNewBus = useMemo(() => {
    return buses.find(b => b.id === newBusId);
  }, [buses, newBusId]);

  const selectedNewDriver = useMemo(() => {
    return drivers.find(d => d.id === newDriverId);
  }, [drivers, newDriverId]);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    if (incidentFilter === 'all') return incidents;
    return incidents.filter(i => i.status === incidentFilter);
  }, [incidents, incidentFilter]);

  const handleWhatsappImport = async () => {
    if (!selectedTripForImport) {
      if (addToast) addToast('يرجى اختيار الرحلة المستهدفة أولاً', 'error');
      return;
    }
    const res = await importWhatsappAttendance(whatsappText, selectedTripForImport);
    setImportResult(res);
    if (addToast) {
      addToast(`تم استيراد الحضور: تطابق ${res.matched} طالب، وغير مسجلين ${res.unassigned}`, 'success');
    }
  };

  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSwapTrip) {
      if (addToast) addToast('يرجى تحديد الرحلة المستهدفة أولاً', 'error');
      return;
    }

    setIsSubmittingSwap(true);
    try {
      await supervisorQuickSwapOrEmergency(swapTripId, {
        mode: swapMode,
        reason: swapReason,
        newBusId: swapMode === 'existing' ? newBusId : swapMode === 'new_driver' ? quickDriverBusId : undefined,
        newDriverId: swapMode === 'existing' ? newDriverId : undefined,
        adHocDriverName: swapMode === 'unregistered' ? adHocDriverName : swapMode === 'new_driver' ? quickDriverName : undefined,
        adHocDriverPhone: swapMode === 'unregistered' ? adHocDriverPhone : swapMode === 'new_driver' ? quickDriverPhone : undefined,
        adHocBusPlate: swapMode === 'unregistered' ? adHocBusPlate : swapMode === 'new_driver' ? quickDriverPlate : undefined,
        adHocCapacity: swapMode === 'unregistered' ? adHocCapacity : swapMode === 'new_driver' ? quickDriverCapacity : undefined,
        newDriverEmail: swapMode === 'new_driver' ? quickDriverEmail : undefined,
      });

      setSwapSuccessInfo({
        tripCode: currentSwapTrip.code,
        time: new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(new Date())
      });
    } finally {
      setIsSubmittingSwap(false);
    }
  };

  // ========================================================
  // Calculation of required vehicles per slot & line with Totals & Shortage
  // ========================================================
  const fleetDemandTableData = useMemo(() => {
    const targetDate = filterDate !== 'all' ? filterDate : activeOperatingDate;
    const activeTrips = trips.filter(t => {
      if (t.date !== targetDate) return false;
      if (filterUniversity !== 'all' && t.universityId !== filterUniversity && t.universityNameAr !== filterUniversity) return false;
      if (filterLine !== 'all' && t.lineId !== filterLine && t.lineNameAr !== filterLine) return false;
      if (filterDirection !== 'all' && t.direction !== filterDirection) return false;
      if (searchQuery.trim()) {
        const matchTrip = matchesArabicSearch(
          searchQuery,
          t.code,
          t.lineNameAr,
          t.universityNameAr,
          t.driverNameAr,
          t.busPlate,
          t.scheduledTime
        );
        const matchStudent = (t.manifest || []).some(m =>
          matchesArabicSearch(searchQuery, m.studentName, m.phone, m.stationNameAr)
        );
        if (!matchTrip && !matchStudent) return false;
      }
      return true;
    });

    // Group by unique slot (lineId + scheduledTime + direction)
    const slotGroups = new Map<string, {
      slotKey: string;
      time: string;
      lineId: string;
      lineNameAr: string;
      universityId: string;
      universityNameAr: string;
      direction: 'to_university' | 'from_university';
      tripsInSlot: Trip[];
      registeredStudents: ManifestStudent[];
    }>();

    activeTrips.forEach(t => {
      const key = `${t.lineId}_${t.scheduledTime}_${t.direction}`;
      if (!slotGroups.has(key)) {
        slotGroups.set(key, {
          slotKey: key,
          time: t.scheduledTime,
          lineId: t.lineId,
          lineNameAr: t.lineNameAr,
          universityId: t.universityId,
          universityNameAr: t.universityNameAr,
          direction: t.direction,
          tripsInSlot: [],
          registeredStudents: []
        });
      }
      const group = slotGroups.get(key)!;
      group.tripsInSlot.push(t);
      (t.manifest || []).forEach(m => {
        if (!group.registeredStudents.some(existing => existing.studentId === m.studentId)) {
          group.registeredStudents.push(m);
        }
      });
    });

    const rows = Array.from(slotGroups.values()).map(group => {
      const registeredCount = group.registeredStudents.filter(
        m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded'
      ).length;

      const assignedCapacity = group.tripsInSlot.reduce((sum, t) => sum + (t.capacity || 0), 0);
      const assignedBusesCount = group.tripsInSlot.filter(t => t.busPlate).length;

      // Real fleet capacity calculations (14, 28, 33)
      let busesNeeded = 0;
      if (registeredCount === 0) {
        busesNeeded = group.tripsInSlot.length > 0 ? 1 : 0;
      } else if (registeredCount <= 14) {
        busesNeeded = 1; // 1 Microbus (14)
      } else if (registeredCount <= 28) {
        busesNeeded = 1; // 1 Minibus (28)
      } else if (registeredCount <= 33) {
        busesNeeded = 1; // 1 Mercedes Minibus (33)
      } else {
        busesNeeded = Math.ceil(registeredCount / 28);
      }

      const seatShortage = Math.max(0, registeredCount - assignedCapacity);
      const seatSurplus = Math.max(0, assignedCapacity - registeredCount);
      const busesShortage = Math.max(0, busesNeeded - assignedBusesCount);

      return {
        ...group,
        registeredCount,
        assignedCapacity,
        assignedBusesCount,
        busesNeeded,
        seatShortage,
        seatSurplus,
        busesShortage,
        hasDeficit: seatShortage > 0 || busesShortage > 0,
        assignedPlates: group.tripsInSlot.map(t => `${t.busPlate} (${t.capacity}ر)`).join('، ')
      };
    });

    const totalRegistered = rows.reduce((acc, r) => acc + r.registeredCount, 0);
    const totalCapacity = rows.reduce((acc, r) => acc + r.assignedCapacity, 0);
    const totalAssignedBuses = rows.reduce((acc, r) => acc + r.assignedBusesCount, 0);
    const totalNeededBuses = rows.reduce((acc, r) => acc + r.busesNeeded, 0);
    const totalSeatShortage = rows.reduce((acc, r) => acc + r.seatShortage, 0);
    const totalSeatSurplus = rows.reduce((acc, r) => acc + r.seatSurplus, 0);

    return {
      rows,
      totals: {
        totalRegistered,
        totalCapacity,
        totalAssignedBuses,
        totalNeededBuses,
        totalSeatShortage,
        totalSeatSurplus,
        netBalance: totalCapacity - totalRegistered
      }
    };
  }, [trips, filterDate, activeOperatingDate, filterUniversity, filterLine, filterDirection, searchQuery]);

  // Live Return & Campus Status Lists (for clickable summary cards)
  const returnCampusLive = useMemo(() => {
    const finishedMap = new Map<string, {
      studentId: string;
      studentName: string;
      phone: string;
      universityNameAr: string;
      lineNameAr: string;
      stationNameAr: string;
      scheduledTime: string;
      readyForReturnAt?: string;
      busPlate: string;
      driverNameAr: string;
      driverPhone: string;
    }>();

    const insideWaitingList: {
      studentId: string;
      studentName: string;
      phone: string;
      universityNameAr: string;
      lineNameAr: string;
      stationNameAr: string;
      scheduledTime: string;
      busPlate: string;
      driverNameAr: string;
      driverPhone: string;
      tripCode: string;
    }[] = [];

    const departedHomeList: typeof insideWaitingList = [];
    const departedBusesList: Trip[] = [];
    const departedIds = new Set<string>();

    filteredTrips.forEach(t => {
      if (t.direction !== 'from_university') return;
      const hasDepartedCampus =
        t.status === 'completed' ||
        (t.status === 'in_progress' && (t.stops || []).some(s => s.status === 'departed'));
      if (hasDepartedCampus) {
        departedBusesList.push(t);
        (t.manifest || []).forEach(m => {
          if (m.boardedStatus === 'boarded') {
            departedIds.add(m.studentId);
          }
        });
      }
    });

    filteredTrips.forEach(t => {
      const manifest = t.manifest || [];

      manifest.forEach(m => {
        if (m.readyForReturn && !departedIds.has(m.studentId) && !finishedMap.has(m.studentId)) {
          finishedMap.set(m.studentId, {
            studentId: m.studentId,
            studentName: m.studentName,
            phone: m.phone,
            universityNameAr: t.universityNameAr,
            lineNameAr: t.lineNameAr,
            stationNameAr: m.stationNameAr,
            scheduledTime: t.scheduledTime,
            readyForReturnAt: m.readyForReturnAt,
            busPlate: t.busPlate,
            driverNameAr: t.driverNameAr,
            driverPhone: t.driverPhone
          });
        }
      });

      if (t.direction === 'from_university') {
        const hasDepartedCampus =
          t.status === 'completed' ||
          (t.status === 'in_progress' && (t.stops || []).some(s => s.status === 'departed'));

        manifest.forEach(m => {
          if (m.boardedStatus === 'boarded') {
            const item = {
              studentId: m.studentId,
              studentName: m.studentName,
              phone: m.phone,
              universityNameAr: t.universityNameAr,
              lineNameAr: t.lineNameAr,
              stationNameAr: m.actualBoardingStationNameAr || m.stationNameAr,
              scheduledTime: t.scheduledTime,
              busPlate: t.busPlate,
              driverNameAr: t.driverNameAr,
              driverPhone: t.driverPhone,
              tripCode: t.code
            };
            if (hasDepartedCampus) {
              departedHomeList.push(item);
            } else if ((t.status === 'scheduled' || t.status === 'in_progress') && !departedIds.has(m.studentId)) {
              insideWaitingList.push(item);
            }
          }
        });
      }
    });

    return {
      finishedUniStudents: Array.from(finishedMap.values()),
      studentsInsideWaitingBuses: insideWaitingList,
      studentsDepartedHome: departedHomeList,
      busesDepartedHome: departedBusesList
    };
  }, [filteredTrips]);

  // Shared Waiting Bus Load Metrics & Smart Dispatch Alerts
  const waitingMetrics = useMemo(
    () =>
      computeWaitingBusMetrics(
        trips,
        filterDate !== 'all' ? filterDate : activeOperatingDate,
        filterUniversity
      ),
    [trips, filterDate, activeOperatingDate, filterUniversity]
  );

  // Merge manifest-based cross-university mismatches with users-lookup fallback
  const mergedMismatches = useMemo(() => {
    const byKey = new Map<string, typeof waitingMetrics.crossUniversityMismatches[number]>();
    waitingMetrics.crossUniversityMismatches.forEach(item => {
      byKey.set(`${item.tripId}::${item.studentId}`, item);
    });

    filteredTrips
      .filter(t => t.status !== 'cancelled' && t.status !== 'completed')
      .forEach(t => {
        (t.manifest || []).forEach(m => {
          if (m.externalHandoffStatus === 'handed_off') return;
          const userRecord = users.find(u => u.id === m.studentId);
          const stUniId = m.studentUniversityId || userRecord?.universityId;
          if (!stUniId || !t.universityId || stUniId === t.universityId) return;
          if (m.boardedStatus === 'no_show' || m.rsvpStatus === 'excused') return;
          const key = `${t.id}::${m.studentId}`;
          if (!byKey.has(key)) {
            const uniName =
              m.studentUniversityNameAr ||
              universities.find(u => u.id === stUniId)?.nameAr ||
              'جامعة أخرى';
            byKey.set(key, {
              tripId: t.id,
              tripCode: t.code,
              tripUniversityId: t.universityId,
              tripUniversityNameAr: t.universityNameAr,
              lineId: t.lineId,
              lineNameAr: t.lineNameAr,
              busPlate: t.busPlate,
              driverId: t.driverId,
              driverNameAr: t.driverNameAr,
              driverPhone: t.driverPhone,
              scheduledTime: t.scheduledTime,
              direction: t.direction,
              studentId: m.studentId,
              studentName: m.studentName,
              phone: m.phone,
              studentUniversityId: stUniId,
              studentUniversityNameAr: uniName,
              stationNameAr: m.stationNameAr,
              boardedStatus: m.boardedStatus,
            });
          }
        });
      });

    return Array.from(byKey.values());
  }, [waitingMetrics.crossUniversityMismatches, filteredTrips, users, universities]);

  // Quick Reassign state for cross-university mismatched students
  const [quickReassignTargets, setQuickReassignTargets] = useState<Record<string, string>>({});
  const [reassigningMismatchKey, setReassigningMismatchKey] = useState<string | null>(null);

  const handleQuickReassignMismatch = async (
    currentTripId: string,
    targetTripId: string,
    studentId: string
  ) => {
    const key = `${currentTripId}::${studentId}`;
    if (!targetTripId) return;
    setReassigningMismatchKey(key);
    try {
      const ok = await reassignStudentToTrip(currentTripId, targetTripId, studentId);
      if (ok) {
        setQuickReassignTargets(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } finally {
      setReassigningMismatchKey(null);
    }
  };

  const pendingIncidentsCount = useMemo(
    () => incidents.filter(i => i.status === 'pending').length,
    [incidents]
  );

  // Sound & Browser Notification Alert whenever a NEW waiting-bus dispatch alert fires
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);
  const seenDispatchAlertIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newAlerts = waitingMetrics.dispatchAlerts.filter(a => !seenDispatchAlertIdsRef.current.has(a.id));
    if (newAlerts.length > 0) {
      newAlerts.forEach(a => seenDispatchAlertIdsRef.current.add(a.id));
      if (soundAlertsEnabled) {
        playDispatchAlertChime('dispatch');
      }
      triggerBrowserNotification(
        'تنبيه جاهزية انطلاق سيارة انتظار',
        newAlerts[0].message
      );
    }
  }, [waitingMetrics.dispatchAlerts, soundAlertsEnabled]);

  // Core 5 Indicators for Simple Operational Overview (PDF Page 1 & 2)
  const studentsRegisteredToday = useMemo(() => {
    return metrics.totalRsvpConfirmedToday || fleetDemandTableData.totals.totalRegistered || uniqueTravelingStudentsCount;
  }, [metrics.totalRsvpConfirmedToday, fleetDemandTableData.totals.totalRegistered, uniqueTravelingStudentsCount]);

  const carsNeededToday = useMemo(() => {
    return fleetDemandTableData.totals.totalNeededBuses;
  }, [fleetDemandTableData.totals.totalNeededBuses]);

  const carsAssignedToday = useMemo(() => {
    return fleetDemandTableData.totals.totalAssignedBuses;
  }, [fleetDemandTableData.totals.totalAssignedBuses]);

  const carsShortageToday = useMemo(() => {
    return Math.max(0, carsNeededToday - carsAssignedToday);
  }, [carsNeededToday, carsAssignedToday]);

  const studentsWithoutCarToday = useMemo(() => {
    return fleetDemandTableData.totals.totalSeatShortage > 0
      ? fleetDemandTableData.totals.totalSeatShortage
      : (carsShortageToday > 0 ? carsShortageToday * 14 : 0);
  }, [fleetDemandTableData.totals.totalSeatShortage, carsShortageToday]);

  // Compile urgent actionable issues for "ما الذي يحتاج إلى حل الآن؟" (PDF Page 2)
  const urgentIssues = useMemo(() => {
    const list: {
      id: string;
      title: string;
      desc: string;
      severity: 'high' | 'medium';
      actionLabel: string;
      actionType: 'car_shortage' | 'students_unassigned' | 'driver_unassigned' | 'overflow' | 'delay';
      targetTrip?: Trip;
    }[] = [];

    if (carsShortageToday > 0) {
      list.push({
        id: 'car-shortage',
        title: 'نحتاج سيارة إضافية',
        desc: `يوجد عجز في التغطية بمقدار ${carsShortageToday} سيارة (${fleetDemandTableData.totals.totalSeatShortage} مقعد إضافي مطلوب لتغطية ركاب اليوم).`,
        severity: 'high',
        actionLabel: 'تحديد سيارة',
        actionType: 'car_shortage'
      });
    }

    if (studentsWithoutCarToday > 0) {
      list.push({
        id: 'unassigned-students',
        title: 'يوجد طلاب لم نحدد لهم سيارة',
        desc: `يوجد ${studentsWithoutCarToday} طالب مسجلين بحاجة لتوزيعهم على مقاعد الحافلات وتوفير سيارات لهم.`,
        severity: 'high',
        actionLabel: 'توزيع الطلاب آلياً',
        actionType: 'students_unassigned'
      });
    }

    const unassignedDriverTrip = filteredTrips.find(t => !t.driverId || !t.driverNameAr);
    if (unassignedDriverTrip) {
      list.push({
        id: `nodrv-${unassignedDriverTrip.id}`,
        title: 'يوجد موعد لم يتم تحديد سائق له',
        desc: `الرحلة (${unassignedDriverTrip.code} - ${unassignedDriverTrip.scheduledTime}) على خط ${unassignedDriverTrip.lineNameAr} بدون سائق مسند.`,
        severity: 'high',
        actionLabel: 'تعيين سائق',
        actionType: 'driver_unassigned',
        targetTrip: unassignedDriverTrip
      });
    }

    const overflowTrip = filteredTrips.find(t => {
      const conf = t.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
      return conf > t.capacity;
    });
    if (overflowTrip) {
      const conf = overflowTrip.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
      list.push({
        id: `ovf-${overflowTrip.id}`,
        title: 'توجد سيارة بها ركاب أكثر من سعتها',
        desc: `الرحلة (${overflowTrip.code} - ${overflowTrip.scheduledTime}) تضم ${conf} طالب وسعة الحافلة ${overflowTrip.capacity} مقعد.`,
        severity: 'high',
        actionLabel: 'معالجة الزيادة',
        actionType: 'overflow',
        targetTrip: overflowTrip
      });
    }

    const delayedTrip = filteredTrips.find(t => t.status === 'delayed');
    if (delayedTrip) {
      list.push({
        id: `delay-${delayedTrip.id}`,
        title: 'توجد رحلة متأخرة أو بها مشكلة',
        desc: `الرحلة (${delayedTrip.code} - ${delayedTrip.scheduledTime}) متأخرة بمقدار ${delayedTrip.delayMinutes} دقيقة.`,
        severity: 'medium',
        actionLabel: 'متابعة الرحلة',
        actionType: 'delay',
        targetTrip: delayedTrip
      });
    }

    return list;
  }, [carsShortageToday, studentsWithoutCarToday, fleetDemandTableData.totals.totalSeatShortage, filteredTrips]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 dir-rtl text-right">
      
      {/* ======================================================== */}
      {/* 1. Header Banner & Quick Controls */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-[#0F2537] text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Shield className="w-6 h-6 text-emerald-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  غرفة العمليات والمؤشرات التشغيلية للمشرف
                </h1>
                <span className="text-[11px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md border border-slate-200">
                  UniBus Egypt
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                متابعة دقيقة لأعداد وركاب اليوم، حركة الحافلات والسائقين، سجلات الركوب الفعلية، وإدارة الطوارئ.
              </p>
            </div>
          </div>
        </div>

        {/* Live Refresh and Quick Actions Box */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-medium">آخر تحديث مباشر:</span>
            <span className="text-xs font-mono font-bold text-slate-800 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{lastUpdatedTime}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="تحديث الإحصائيات الآن"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewDayModal(true)}
            className="px-3.5 py-2 bg-[#0F2537] hover:bg-[#1a3850] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="بدء وتجهيز يوم تشغيلي جديد وأرشفة اليوم الحالي بأمان"
          >
            <CalendarPlus className="w-4 h-4 text-emerald-400" />
            <span>بدء يوم تشغيل جديد</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. Sticky Navigation Tabs */}
      {/* ======================================================== */}
      <div className="sticky top-16 z-30 bg-slate-50/95 backdrop-blur-md -mx-3 px-3 sm:-mx-6 sm:px-6 pt-2 border-b border-slate-200/90 shadow-2xs">
        <div className="flex space-x-reverse space-x-1 sm:space-x-2 overflow-x-auto pb-2 text-xs font-bold scrollbar-none">
        
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>المؤشرات والتشغيل اليومي</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fleet_planning')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'fleet_planning'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4 text-amber-400" />
          <span>تخطيط السيارات والطلب اليومي</span>
          {exceptionalRequests.filter(r => r.status === 'pending').length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-amber-500 text-white font-bold animate-pulse">
              {exceptionalRequests.filter(r => r.status === 'pending').length} استثنائي
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('live')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'live'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Bus className="w-4 h-4 text-amber-400" />
          <span>مراقبة الحافلات الحية</span>
          <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
            activeTab === 'live' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {trips.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('swap')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'swap'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <RefreshCw className="w-4 h-4 text-sky-400" />
          <span>طوارئ وتبديل السائقين</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'whatsapp'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4 text-green-400" />
          <span>كشف الواتساب</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('registrations')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'registrations'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-400" />
          <span>طلبات التسجيل</span>
          {pendingRegistrations.length > 0 && (
            <span className="text-[11px] px-1.5 py-0.2 rounded-full font-mono bg-indigo-500 text-white">
              {pendingRegistrations.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('incidents')}
          className={`py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] cursor-pointer ${
            activeTab === 'incidents'
              ? 'bg-[#0F2537] text-white shadow-sm ring-1 ring-[#0F2537]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>البلاغات</span>
          <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
            activeTab === 'incidents' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {incidents.length}
          </span>
        </button>

        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. Streamlined Collapsible Filter Bar */}
      {/* ======================================================== */}
      {(activeTab === 'dashboard' || activeTab === 'live') && (
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Filter className="w-4 h-4 text-emerald-600" />
              <span>بحث سريع وفلاتر التشغيل</span>
              {(filterDate !== 'all' || filterUniversity !== 'all' || filterLine !== 'all' || filterDirection !== 'all' || filterStatus !== 'all' || searchQuery) && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">فلاتر مفعلة</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOpsFilters(prev => !prev)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>{showOpsFilters ? 'إخفاء الفلاتر' : 'تخصيص الفلاتر'}</span>
                {showOpsFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterDate('all');
                  setFilterUniversity('all');
                  setFilterLine('all');
                  setFilterDirection('all');
                  setFilterStatus('all');
                  setSearchQuery('');
                  setPassengerStatusFilter('all');
                }}
                className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
              >
                إعادة ضبط
              </button>
            </div>
          </div>

          {showOpsFilters && (
            <div className="space-y-3 pt-2 border-t border-slate-100">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            
            {/* 1. Date Filter */}
            <div>
              <label className="text-[11px] text-slate-500 font-bold block mb-1">تاريخ التشغيل:</label>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50/70 font-medium text-slate-700 focus:ring-2 focus:ring-[#0F2537] outline-hidden"
              >
                <option value="all">جميع التواريخ المسجلة</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>
                    {d} {d === activeOperatingDate ? '(تاريخ اليوم التشغيلي)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. University Filter */}
            <div>
              <label className="text-[11px] text-slate-500 font-bold block mb-1">الجامعة:</label>
              <select
                value={filterUniversity}
                onChange={(e) => setFilterUniversity(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50/70 font-medium text-slate-700 focus:ring-2 focus:ring-[#0F2537] outline-hidden"
              >
                <option value="all">كل الجامعات</option>
                {universities.map(u => (
                  <option key={u.id} value={u.id}>{u.nameAr}</option>
                ))}
              </select>
            </div>

            {/* 3. Line Filter */}
            <div>
              <label className="text-[11px] text-slate-500 font-bold block mb-1">خط السير:</label>
              <select
                value={filterLine}
                onChange={(e) => setFilterLine(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50/70 font-medium text-slate-700 focus:ring-2 focus:ring-[#0F2537] outline-hidden"
              >
                <option value="all">كل خطوط السير</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id}>{l.nameAr}</option>
                ))}
              </select>
            </div>

            {/* 4. Direction Filter */}
            <div>
              <label className="text-[11px] text-slate-500 font-bold block mb-1">اتجاه الرحلة:</label>
              <select
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value as any)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50/70 font-medium text-slate-700 focus:ring-2 focus:ring-[#0F2537] outline-hidden"
              >
                <option value="all">الكل (ذهاب وعودة)</option>
                <option value="to_university">رحلات الذهاب للجامعة</option>
                <option value="from_university">رحلات العودة للمنزل</option>
              </select>
            </div>

            {/* 5. Status Filter */}
            <div>
              <label className="text-[11px] text-slate-500 font-bold block mb-1">حالة الرحلة:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50/70 font-medium text-slate-700 focus:ring-2 focus:ring-[#0F2537] outline-hidden"
              >
                <option value="all">كل الحالات</option>
                <option value="in_progress">في الطريق الآن</option>
                <option value="delayed">متأخرة عن الموعد</option>
                <option value="scheduled">مجدولة لم تبدأ</option>
                <option value="completed">اكتملت بنجاح</option>
                <option value="cancelled">ملغاة</option>
              </select>
            </div>

          </div>

          {/* Search bar inside collapsible filter */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="بحث بالاسم، كود الرحلة، السائق، رقم اللوحة، الخط، أو اسم الطالب المسافر..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-[#0F2537] outline-hidden bg-slate-50/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. Tab 1: Streamlined Vital Signs Dashboard */}
      {/* ======================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">

          {/* VITAL SIGNS TOP BAR (High-Signal Operational Overview) */}
          <div className="bg-[#0F2537] text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-black">أهم العلامات الحيوية للتشغيل اليوم</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAllocUniId(universities[0]?.id || '');
                    const matchingLine = lines.find(l => l.universityId === (universities[0]?.id || '')) || lines[0];
                    setAllocLineId(matchingLine?.id || '');
                    setAllocDriverId(drivers[0]?.id || '');
                    setAllocBusId(buses[0]?.id || '');
                    setAllocUseAdHoc(false);
                    setShowWaitingAllocModal(true);
                  }}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>تخصيص سيارة انتظار لجامعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('swap')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-sky-300" />
                  <span>طوارئ وأعطال السائقين</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="text-[10px] text-white/70 block">المنتظرون بالسيارات الآن</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black font-mono text-amber-300">{waitingMetrics.waitingInBusesCount}</span>
                  <span className="text-[11px] text-white/80">في {waitingMetrics.waitingBuses.length} سيارة</span>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="text-[10px] text-white/70 block">خلصوا جامعة (جاهزون)</span>
                <div className="text-xl font-black font-mono text-emerald-300 mt-0.5">
                  {waitingMetrics.finishedUniCount || returnCampusLive.finishedUniStudents.length}
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${carsShortageToday > 0 || studentsWithoutCarToday > 0 ? 'bg-rose-500/20 border-rose-400' : 'bg-white/10 border-white/10'}`}>
                <span className="text-[10px] text-white/80 block">عجز سيارات / بدون سيارة</span>
                <div className="text-xl font-black font-mono mt-0.5">
                  {carsShortageToday} / {studentsWithoutCarToday}
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${mergedMismatches.length > 0 ? 'bg-rose-600/90 border-rose-300 animate-pulse' : 'bg-white/10 border-white/10'}`}>
                <span className="text-[10px] text-white/90 block">طلاب في غير جامعتهم</span>
                <div className="text-xl font-black font-mono mt-0.5">
                  {mergedMismatches.length}
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${pendingIncidentsCount > 0 ? 'bg-amber-500/25 border-amber-300' : 'bg-white/10 border-white/10'}`}>
                <span className="text-[10px] text-white/80 block">أعطال وبلاغات مفتوحة</span>
                <div className="text-xl font-black font-mono mt-0.5">
                  {pendingIncidentsCount}
                </div>
              </div>
            </div>
          </div>

          {/* RED ALERT BANNER: CROSS-UNIVERSITY STUDENT MISMATCHES */}
          {mergedMismatches.length > 0 && (
            <div className="p-4 rounded-2xl border-2 border-rose-600 bg-rose-50 shadow-sm space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-rose-950">
                    🔴 تنبيه للمشرف والإدارة: يوجد {mergedMismatches.length} طلاب في سيارات لا تتجه إلى جامعتهم
                  </h3>
                  <p className="text-[11px] font-bold text-rose-800 mt-0.5">
                    يمكنك إعادة تعيين الطالب فوراً لحافلة أخرى متاحة في نفس الخط بضغطة زر واحدة، أو تأكيد إركابه مع مكتب/سيارة خارجية لإزالة العلامة الحمراء فوراً.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {mergedMismatches.map(item => {
                  const mismatchKey = `${item.tripId}::${item.studentId}`;
                  const sourceTrip = trips.find(t => t.id === item.tripId);
                  const targetDate = sourceTrip?.date || (filterDate !== 'all' ? filterDate : activeOperatingDate);

                  const sameLineBuses = trips
                    .filter(t => {
                      if (t.id === item.tripId) return false;
                      if (t.status === 'cancelled' || t.status === 'completed' || t.status === 'merged') return false;
                      if (targetDate && t.date !== targetDate) return false;
                      if (t.lineId !== item.lineId) return false;
                      const occupied = (t.manifest || []).filter(
                        m =>
                          m.externalHandoffStatus !== 'handed_off' &&
                          (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded')
                      ).length;
                      return occupied < (t.capacity || 0);
                    })
                    .sort((a, b) => {
                      const aMatchesStudentUni = a.universityId === item.studentUniversityId ? 0 : 1;
                      const bMatchesStudentUni = b.universityId === item.studentUniversityId ? 0 : 1;
                      if (aMatchesStudentUni !== bMatchesStudentUni) return aMatchesStudentUni - bMatchesStudentUni;
                      const aSameDir = a.direction === item.direction ? 0 : 1;
                      const bSameDir = b.direction === item.direction ? 0 : 1;
                      if (aSameDir !== bSameDir) return aSameDir - bSameDir;
                      return (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
                    });

                  const selectedTargetId =
                    quickReassignTargets[mismatchKey] &&
                    sameLineBuses.some(b => b.id === quickReassignTargets[mismatchKey])
                      ? quickReassignTargets[mismatchKey]
                      : (sameLineBuses[0]?.id || '');

                  const isReassigning = reassigningMismatchKey === mismatchKey;

                  return (
                    <div
                      key={`${item.tripId}-${item.studentId}`}
                      className="p-3.5 rounded-xl bg-white border border-rose-300 space-y-2.5 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-900">{item.studentName}</span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                              جامعته: {item.studentUniversityNameAr}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">
                              · خط: {item.lineNameAr}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            يركب حالياً مع: <strong className="text-slate-900">كابتن {item.driverNameAr}</strong> ({item.busPlate}) · متجه لـ <strong>{item.tripUniversityNameAr}</strong>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-mono pt-0.5">
                            {item.driverPhone && (
                              <a href={`tel:${item.driverPhone}`} className="text-emerald-700 font-bold hover:underline flex items-center gap-1">
                                <PhoneCall className="w-3 h-3" /> اتصال بالكابتن
                              </a>
                            )}
                            {item.phone && (
                              <a href={`tel:${item.phone}`} className="text-sky-700 font-bold hover:underline flex items-center gap-1">
                                <PhoneCall className="w-3 h-3" /> اتصال بالطالب
                              </a>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void markCrossUniversityHandoff(item.tripId, [item.studentId], 'تم إركاب الطالب مع مكتب / سيارة أخرى')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black rounded-xl cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          تم ركوبهم مكتب/سيارة أخرى ✓
                        </button>
                      </div>

                      {/* Quick Reassign to Available Same-Line Bus */}
                      <div className="pt-2 border-t border-rose-100">
                        <label className="text-[11px] font-black text-slate-700 block mb-1.5">
                          إعادة تعيين سريع لحافلة متاحة في نفس الخط ({item.lineNameAr}):
                        </label>
                        {sameLineBuses.length > 0 ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <select
                              value={selectedTargetId}
                              onChange={(e) =>
                                setQuickReassignTargets(prev => ({
                                  ...prev,
                                  [mismatchKey]: e.target.value,
                                }))
                              }
                              aria-label={`اختر الحافلة البديلة للطالب ${item.studentName}`}
                              className="flex-1 min-w-0 px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[11px] font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-hidden"
                            >
                              {sameLineBuses.map(busTrip => {
                                const occupied = (busTrip.manifest || []).filter(
                                  m =>
                                    m.externalHandoffStatus !== 'handed_off' &&
                                    (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded')
                                ).length;
                                const freeSeats = Math.max(0, (busTrip.capacity || 0) - occupied);
                                const isExactUni = busTrip.universityId === item.studentUniversityId;
                                const dirLabel = busTrip.direction === 'to_university' ? 'ذهاب' : 'عودة';
                                return (
                                  <option key={busTrip.id} value={busTrip.id}>
                                    {isExactUni ? '✓ [نفس الجامعة] ' : ''}
                                    كابتن {busTrip.driverNameAr || 'غير معين'} ({busTrip.busPlate}) — {busTrip.universityNameAr} · {dirLabel} {busTrip.scheduledTime} · متاح {freeSeats} مقعد
                                  </option>
                                );
                              })}
                            </select>

                            <button
                              type="button"
                              disabled={!selectedTargetId || isReassigning}
                              onClick={() => void handleQuickReassignMismatch(item.tripId, selectedTargetId, item.studentId)}
                              className="px-3.5 py-2 bg-[#0F2537] hover:bg-slate-800 disabled:opacity-50 text-amber-300 text-[11px] font-black rounded-xl cursor-pointer shrink-0 flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isReassigning ? 'animate-spin' : ''}`} />
                              <span>{isReassigning ? 'جارٍ النقل...' : 'إعادة تعيين ونقل فوري'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                            لا توجد حافلات أخرى بمقاعد متاحة في خط ({item.lineNameAr}) حالياً — يمكنك تسليمهم لسيارة خارجية أو إضافة سيارة من لوحة الموقف.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* 1. 10:00 PM Cutoff & Daily Registration Organizer Bar (PDF Page 7) */}
          <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            !isCutoffPassedForTomorrow
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className={`p-2.5 rounded-xl shrink-0 ${
                  !isCutoffPassedForTomorrow ? 'bg-emerald-600 text-white' : 'bg-emerald-400 text-slate-900'
                }`}>
                  <Clock className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                      !isCutoffPassedForTomorrow
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-400 text-slate-900'
                    }`}>
                      {!isCutoffPassedForTomorrow ? 'التسجيل مفتوح' : 'تم إغلاق التسجيل'}
                    </span>
                    <h3 className="text-sm sm:text-base font-black">
                      {!isCutoffPassedForTomorrow
                        ? 'تسجيل رحلات الغد متاح للطلاب (يُغلق تلقائياً في تمام 10:00 مساءً)'
                        : 'تم إغلاق التسجيل اليومي الساعة 10:00 مساءً وحساب الاحتياج الفعلي للغد'}
                    </h3>
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${
                    !isCutoffPassedForTomorrow ? 'text-emerald-800' : 'text-slate-300'
                  }`}>
                    {!isCutoffPassedForTomorrow
                      ? `عدد الطلاب المسجلين حتى الآن: ${studentsRegisteredToday} طالب. تتحدث أعداد السيارات المطلوبة تلقائياً مع كل تسجيل جديد (${carsNeededToday} سيارة مطلوبة حالياً).`
                      : `تم حساب السيارات المطلوبة لليوم التالي (${carsNeededToday} سيارة). يستطيع المشرف الآن مراجعة خطة الرحلات واعتمادها رسمياً.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                {isCutoffPassedForTomorrow && (
                  <button
                    type="button"
                    onClick={() => setShowApproveConfirmModal(true)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                    title="مراجعة واعتماد خطة التشغيل ونشر مواعيد الحافلات للطلاب والسائقين"
                  >
                    <Check className="w-4 h-4" />
                    <span>اعتماد الخطة ونشر المواعيد</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. The 5 Core Cards at Top of Screen (PDF Page 1 & 2) */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>ملخص التشغيل والسيارات اليومية (انقر على أي مربع لعرض التفاصيل)</span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('fleet_planning')}
                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-black transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تفاصيل التخصيص الآلي</span>
                </button>
                <span className="text-xs text-slate-500 font-mono">
                  تاريخ اليوم: {filterDate === 'all' ? activeOperatingDate : filterDate}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              
              {/* 1. الطلاب المسجلون اليوم */}
              <button
                type="button"
                onClick={() => { setSummaryModalSearch(''); setSummaryModalType('registered_today'); }}
                className="text-right bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
              >
                <div className="text-slate-500 text-xs font-bold mb-2 flex items-center justify-between">
                  <span>1. الطلاب المسجلون اليوم</span>
                  <Users className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                </div>
                <div className="text-3xl font-black text-slate-900 font-mono">
                  {studentsRegisteredToday}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-tight flex items-center justify-between">
                  <span>طلبوا المواصلات اليوم</span>
                  <span className="text-indigo-600 font-bold">التفاصيل ←</span>
                </p>
              </button>

              {/* 2. السيارات المطلوبة */}
              <button
                type="button"
                onClick={() => { setSummaryModalSearch(''); setSummaryModalType('cars_needed'); }}
                className="text-right bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
              >
                <div className="text-slate-500 text-xs font-bold mb-2 flex items-center justify-between">
                  <span>2. السيارات المطلوبة</span>
                  <Bus className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-3xl font-black text-indigo-800 font-mono">
                  {carsNeededToday}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-tight flex items-center justify-between">
                  <span>يحتاجها التشغيل اليوم</span>
                  <span className="text-indigo-600 font-bold">التفاصيل ←</span>
                </p>
              </button>

              {/* 3. السيارات التي تم تحديدها */}
              <button
                type="button"
                onClick={() => { setSummaryModalSearch(''); setSummaryModalType('cars_assigned'); }}
                className="text-right bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group"
              >
                <div className="text-slate-500 text-xs font-bold mb-2 flex items-center justify-between">
                  <span>3. السيارات التي تم تحديدها</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-3xl font-black text-slate-900 font-mono">
                  {carsAssignedToday}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-tight flex items-center justify-between">
                  <span>مخصصة للرحلات</span>
                  <span className="text-emerald-700 font-bold">التفاصيل ←</span>
                </p>
              </button>

              {/* 4. السيارات الناقصة */}
              <button
                type="button"
                onClick={() => { setSummaryModalSearch(''); setSummaryModalType('cars_shortage'); }}
                className={`text-right p-5 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                  carsShortageToday > 0
                    ? 'bg-rose-50/70 border-rose-300 text-rose-950 shadow-xs'
                    : 'bg-emerald-50/40 border-emerald-200 text-slate-900'
                }`}
              >
                <div className="text-xs font-bold mb-2 flex items-center justify-between">
                  <span className={carsShortageToday > 0 ? 'text-rose-900' : 'text-emerald-900'}>
                    4. السيارات الناقصة
                  </span>
                  <AlertTriangle className={`w-4 h-4 ${carsShortageToday > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
                </div>
                <div className={`text-3xl font-black font-mono ${carsShortageToday > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {carsShortageToday}
                </div>
                <p className={`text-[11px] mt-2 leading-tight flex items-center justify-between ${carsShortageToday > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>
                  <span>{carsShortageToday === 0 ? 'التغطية مكتملة 100%' : 'سيارات إضافية مطلوبة'}</span>
                  <span className="underline">التفاصيل ←</span>
                </p>
              </button>

              {/* 5. طلاب بدون سيارة */}
              <button
                type="button"
                onClick={() => { setSummaryModalSearch(''); setSummaryModalType('students_no_car'); }}
                className={`text-right p-5 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                  studentsWithoutCarToday > 0
                    ? 'bg-amber-50/70 border-amber-300 text-amber-950 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <div className="text-xs font-bold mb-2 flex items-center justify-between">
                  <span className={studentsWithoutCarToday > 0 ? 'text-amber-900' : 'text-slate-600'}>
                    5. طلاب بدون سيارة
                  </span>
                  <UserX className={`w-4 h-4 ${studentsWithoutCarToday > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                </div>
                <div className={`text-3xl font-black font-mono ${studentsWithoutCarToday > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                  {studentsWithoutCarToday}
                </div>
                <p className={`text-[11px] mt-2 leading-tight flex items-center justify-between ${studentsWithoutCarToday > 0 ? 'text-amber-800 font-bold' : 'text-slate-400'}`}>
                  <span>{studentsWithoutCarToday === 0 ? 'الجميع محدد لهم مقاعد' : 'بحاجة لتخصيص مقاعد'}</span>
                  <span className="underline">التفاصيل ←</span>
                </p>
              </button>

            </div>

            {/* 2.5 Live Return & Campus Status Clickable Square Cards */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-sky-600" />
                  <span>متابعة موقف العودة بالجامعة الآن (انقر على أي مربع لعرض قائمة الطلاب والباصات)</span>
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSoundAlertsEnabled(prev => !prev)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1 cursor-pointer transition-colors ${
                      soundAlertsEnabled
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                    }`}
                    title="تشغيل أو كتم التنبيه الصوتي لإنذار سيارات الانتظار"
                  >
                    {soundAlertsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>{soundAlertsEnabled ? 'التنبيه الصوتي مفعّل' : 'التنبيه صامت'}</span>
                  </button>

                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl border ${
                    waitingMetrics.dispatchAlerts.length > 0
                      ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {waitingMetrics.dispatchAlerts.length > 0
                      ? `🚨 إنذار جاهزية انطلاق (${waitingMetrics.dispatchAlerts.length})`
                      : `المنتظرون بالسيارات: ${waitingMetrics.waitingInBusesCount} / ${waitingMetrics.nearestVehicleTarget} لحمولة سيارة`}
                  </span>
                </div>
              </div>

              {/* SMART DISPATCH ALERT BANNER when waiting-bus count matches balanced/vehicle capacity */}
              {waitingMetrics.dispatchAlerts.length > 0 && (
                <div className="mb-3 space-y-2">
                  {waitingMetrics.dispatchAlerts.map(alert => {
                    const alertTrip = trips.find(t => t.id === alert.recommendedTripId);
                    const alertDriverPhone = alertTrip?.driverPhone;
                    return (
                    <div
                      key={alert.id}
                      className="p-4 rounded-2xl border-2 border-rose-500 bg-linear-to-r from-rose-50 via-amber-50 to-rose-50 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 animate-pulse shadow-xs">
                          <AlertTriangle className="w-5 h-5" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black bg-rose-600 text-white px-2.5 py-0.5 rounded-full">
                              إنذار: حمولة سيارة مكتملة وجاهزة للانطلاق!
                            </span>
                            <span className="text-xs font-extrabold text-slate-900">
                              {alert.universityNameAr} · {alert.lineNameAr}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 font-bold mt-1 leading-relaxed">
                            {alert.message}
                          </p>
                          <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-3 flex-wrap">
                            <span>السيارة المرشحة: <strong className="font-mono text-slate-900">{alert.recommendedBusPlate}</strong> ({alert.recommendedVehicleLabel})</span>
                            <span>·</span>
                            <span>السائق: <strong>{alert.recommendedDriverNameAr}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto flex-wrap">
                        {alertDriverPhone && (
                          <a
                            href={`tel:${alertDriverPhone}`}
                            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-black rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-emerald-700" />
                            <span>اتصال بالكابتن</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => { setSummaryModalSearch(''); setSummaryModalType('inside_waiting_buses'); }}
                          className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl cursor-pointer"
                        >
                          عرض الطلاب ({alert.waitingStudentsCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => dispatchWaitingReturnBus(alert.recommendedTripId, alert.consolidateTripIds)}
                          className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>بدء تحرك السيارة بالطلاب الآن</span>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* 1-CLICK CONSOLIDATION OPPORTUNITIES FOR UNDER-HALF WAITING BUSES */}
              {waitingMetrics.consolidationOpportunities.length > 0 && (
                <div className="mb-3 space-y-2">
                  {waitingMetrics.consolidationOpportunities.map(opp => (
                    <div
                      key={opp.id}
                      className="p-3.5 rounded-2xl border-2 border-indigo-300 bg-indigo-50/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <GitMerge className="w-4 h-4" />
                        </span>
                        <div className="text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px]">
                              توفير {opp.savedCarsCount} سيارة بضغطة واحدة
                            </span>
                            <span className="font-extrabold text-indigo-950">
                              {opp.universityNameAr} · {opp.lineNameAr}
                            </span>
                          </div>
                          <p className="text-indigo-900 font-bold mt-1 leading-relaxed">{opp.message}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                        <button
                          type="button"
                          onClick={() => consolidateWaitingBusesOnly(opp.targetTripId, opp.donorTripIds)}
                          className="flex-1 md:flex-none px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>تجميع في باص {opp.targetBusPlate} وتوفير {opp.savedCarsCount} سيارة</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Card A: خلصوا جامعة */}
                <button
                  type="button"
                  onClick={() => { setSummaryModalSearch(''); setSummaryModalType('finished_uni'); }}
                  className="text-right p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-1.5">
                    <span>خلصوا جامعة (جاهزون للعودة)</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-black font-mono text-emerald-800">
                    {waitingMetrics.finishedUniCount || returnCampusLive.finishedUniStudents.length}
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1.5 flex items-center justify-between">
                    <span>أكدوا انتهاء المحاضرات</span>
                    <span className="font-bold">عرض الكشف ←</span>
                  </p>
                </button>

                {/* Card B: متواجدون بالسيارات بالخارج */}
                <button
                  type="button"
                  onClick={() => { setSummaryModalSearch(''); setSummaryModalType('inside_waiting_buses'); }}
                  className={`text-right p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                    waitingMetrics.dispatchAlerts.length > 0
                      ? 'border-2 border-rose-400 bg-amber-50 ring-2 ring-rose-200'
                      : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-1.5">
                    <span>متواجدون بالسيارات بالخارج</span>
                    <Users className={`w-4 h-4 ${waitingMetrics.dispatchAlerts.length > 0 ? 'text-rose-600 animate-bounce' : 'text-amber-600'}`} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black font-mono text-amber-800">
                      {waitingMetrics.waitingInBusesCount}
                    </span>
                    <span className="text-[11px] font-bold text-amber-700">
                      في {waitingMetrics.waitingBuses.length} سيارة
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 mt-1.5 flex items-center justify-between">
                    <span>{waitingMetrics.dispatchAlerts.length > 0 ? '⚠️ جاهزون للانطلاق الآن!' : 'صعدوا الباص ولم ينطلق بعد'}</span>
                    <span className="font-bold">عرض الكشف ←</span>
                  </p>
                </button>

                {/* Card C: طلاب روّحوا */}
                <button
                  type="button"
                  onClick={() => { setSummaryModalSearch(''); setSummaryModalType('departed_home_students'); }}
                  className="text-right p-4 rounded-2xl border border-sky-200 bg-sky-50/50 hover:bg-sky-50 hover:border-sky-400 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-sky-900 mb-1.5">
                    <span>روّحوا (طلاب غادروا)</span>
                    <UserCheck className="w-4 h-4 text-sky-600" />
                  </div>
                  <div className="text-3xl font-black font-mono text-sky-800">
                    {returnCampusLive.studentsDepartedHome.length}
                  </div>
                  <p className="text-[11px] text-sky-800 mt-1.5 flex items-center justify-between">
                    <span>تحركت حافلتهم من الجامعة</span>
                    <span className="font-bold">عرض الكشف ←</span>
                  </p>
                </button>

                {/* Card D: باصات روّحت */}
                <button
                  type="button"
                  onClick={() => { setSummaryModalSearch(''); setSummaryModalType('departed_home_buses'); }}
                  className="text-right p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900 mb-1.5">
                    <span>باصات روّحت (تحركت للعودة)</span>
                    <Bus className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-3xl font-black font-mono text-indigo-800">
                    {returnCampusLive.busesDepartedHome.length}
                  </div>
                  <p className="text-[11px] text-indigo-800 mt-1.5 flex items-center justify-between">
                    <span>حافلات عودة انطلقت بالفعل</span>
                    <span className="font-bold">عرض الباصات ←</span>
                  </p>
                </button>
              </div>

              {/* Per-Waiting-Bus Live Load & Balanced Division Strip */}
              {waitingMetrics.waitingBuses.length > 0 && (
                <div className="mt-3 bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-black text-slate-800">
                    <span>حاسبة القسمة المتوازنة وموقف سيارات الانتظار ({waitingMetrics.waitingBuses.length}):</span>
                    <span className="text-[11px] font-bold text-slate-500">
                      يُحسب العدد المناسب لانطلاق كل سيارة بقسمة الطلاب على السيارات (دون اشتراط الامتلاء 100%)
                    </span>
                  </div>

                  {/* Division Summary per University/Line */}
                  {waitingMetrics.divisionGroups.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {waitingMetrics.divisionGroups.map(grp => (
                        <div
                          key={grp.key}
                          className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-black text-sky-950 block">
                              {grp.universityNameAr} · {grp.lineNameAr}
                            </span>
                            <span className="text-[11px] text-sky-800 font-bold block mt-0.5">
                              {grp.totalPoolStudents} طالب ÷ {grp.carsCount} سيارة ={' '}
                              <strong className="font-mono text-sky-950">{grp.averagePerCar} طالب/سيارة</strong>
                              {grp.canSaveCar && (
                                <span className="text-emerald-700 font-black">
                                  {' '}· يكفي {grp.recommendedCarsNeeded} سيارة عند التجميع
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-white border border-sky-200 font-mono font-black text-sky-900 shrink-0">
                            {grp.boardedNowCount} / {grp.totalPoolStudents}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {waitingMetrics.waitingBuses.map(wb => (
                      <div
                        key={wb.trip.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                          wb.isReadyForDispatch
                            ? 'bg-rose-50/60 border-rose-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-black text-slate-900 block">
                              كابتن {wb.trip.driverNameAr || 'غير معين'} · <span className="font-mono text-slate-600">{wb.trip.busPlate}</span>
                            </span>
                            <span className="text-[10px] text-slate-500">{wb.trip.universityNameAr} · {wb.trip.lineNameAr}</span>
                          </div>
                          <div className="text-left shrink-0">
                            <span className={`font-mono font-black px-2 py-0.5 rounded-lg text-xs block ${
                              wb.isReadyForDispatch ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-800'
                            }`}>
                              {wb.boardedCount} / {wb.recommendedDepartureTarget}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono block text-center mt-0.5">
                              سعة {wb.capacity}
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              wb.isReadyForDispatch ? 'bg-rose-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${wb.divisionPercent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] font-bold text-slate-600">
                            {wb.isReadyForDispatch ? `🚨 ${wb.dispatchReasonLabel}` : wb.dispatchReasonLabel}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {wb.trip.driverPhone && (
                              <a
                                href={`tel:${wb.trip.driverPhone}`}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-black rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                                title={`اتصال بالكابتن ${wb.trip.driverNameAr || ''} (${wb.trip.driverPhone})`}
                              >
                                <PhoneCall className="w-3 h-3" />
                                <span>اتصال</span>
                              </a>
                            )}
                            {wb.boardedCount > 0 && (
                              <button
                                type="button"
                                onClick={() => dispatchWaitingReturnBus(wb.trip.id)}
                                className="px-2.5 py-1 bg-[#0F2537] hover:bg-slate-800 text-white text-[10px] font-black rounded-lg cursor-pointer shrink-0"
                              >
                                انطلاق الآن
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-University Quick Waiting-Car Allocation & Persistent Car Counters */}
              <div className="mt-3 bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-slate-900 block">
                      تخصيص سيارات انتظار العودة حسب كل جامعة (بأسماء السائقين)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      مؤشر مستمر يظهر المنتظرين في كل سيارة انتظار وإجمالي كل جامعة مع تخصيص فوري بضغطة واحدة.
                    </span>
                  </div>
                  <span className="text-xs font-mono font-black px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-200">
                    إجمالي المنتظرين بالسيارات: {waitingMetrics.waitingInBusesCount} طالب
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {universities.map(uni => {
                    const uniWaitingBuses = waitingMetrics.waitingBuses.filter(wb => wb.trip.universityId === uni.id);
                    const uniWaitingTotal = uniWaitingBuses.reduce((sum, wb) => sum + wb.boardedCount, 0);
                    const uniFinishedCount = returnCampusLive.finishedUniStudents.filter(s => s.universityNameAr === uni.nameAr).length;
                    return (
                      <div key={uni.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-slate-900">{uni.nameAr}</span>
                          <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                            {uniWaitingTotal} منتظر · {uniFinishedCount} جاهز
                          </span>
                        </div>
                        {uniWaitingBuses.length > 0 ? (
                          <div className="space-y-1">
                            {uniWaitingBuses.map(wb => (
                              <div key={wb.trip.id} className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px]">
                                <span className="font-bold text-slate-800 truncate">
                                  كابتن {wb.trip.driverNameAr || 'غير معين'} ({wb.trip.busPlate})
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {wb.trip.driverPhone && (
                                    <a
                                      href={`tel:${wb.trip.driverPhone}`}
                                      className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-[10px] rounded inline-flex items-center gap-1 whitespace-nowrap"
                                      title={`اتصال مباشر بالكابتن ${wb.trip.driverNameAr}`}
                                    >
                                      <PhoneCall className="w-3 h-3" />
                                      <span>اتصال</span>
                                    </a>
                                  )}
                                  <span className="font-mono font-black text-amber-800 shrink-0">
                                    {wb.boardedCount} طالب
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">لا توجد سيارات انتظار مخصصة حالياً</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setAllocUniId(uni.id);
                            const matched = lines.find(l => l.universityId === uni.id) || lines[0];
                            setAllocLineId(matched?.id || '');
                            setAllocDriverId(drivers[0]?.id || '');
                            setAllocBusId(buses[0]?.id || '');
                            setAllocUseAdHoc(false);
                            setShowWaitingAllocModal(true);
                          }}
                          className="w-full py-1.5 bg-[#0F2537] hover:bg-slate-800 text-amber-300 font-black text-[11px] rounded-lg cursor-pointer"
                        >
                          + تخصيص سيارة انتظار لـ {uni.nameAr}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Section: "ما الذي يحتاج إلى حل الآن؟" (PDF Page 2) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  ما الذي يحتاج إلى حل الآن؟
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-bold">
                {urgentIssues.length === 0 ? 'كل الأمور منتظمة' : `${urgentIssues.length} تنبيه يتطلب المعالجة`}
              </span>
            </div>

            {urgentIssues.length === 0 ? (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-black text-xs block">لا توجد مشكلات تشغيلية معلقة الآن</span>
                  <span className="text-[11px] text-emerald-700">
                    كافة الحافلات والمواعيد تعمل وفق الخطة بنجاح وبكامل طاقتها الاستيعابية، وجميع الطلاب محددة لهم سيارات مناسبة.
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {urgentIssues.map(issue => (
                  <div
                    key={issue.id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                      issue.severity === 'high'
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-amber-50/40 border-amber-200'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                        issue.severity === 'high' ? 'text-rose-600' : 'text-amber-600'
                      }`} />
                      <div>
                        <h4 className="font-black text-xs text-slate-900">{issue.title}</h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{issue.desc}</p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (issue.actionType === 'car_shortage' || issue.actionType === 'overflow') {
                            setDashboardViewMode('demand_table');
                          } else if (issue.actionType === 'students_unassigned') {
                            autoAllocateStudentsToSlotBuses();
                          } else if (issue.actionType === 'driver_unassigned' && issue.targetTrip) {
                            setAssignTargetTripId(issue.targetTrip.id);
                            setSelectedSlotForVehicles({
                              slotKey: `${issue.targetTrip.lineId}_${issue.targetTrip.scheduledTime}_${issue.targetTrip.direction}`,
                              time: issue.targetTrip.scheduledTime,
                              lineId: issue.targetTrip.lineId,
                              lineNameAr: issue.targetTrip.lineNameAr,
                              universityNameAr: issue.targetTrip.universityNameAr,
                              direction: issue.targetTrip.direction,
                              tripsInSlot: [issue.targetTrip]
                            });
                          } else if (issue.actionType === 'delay' && issue.targetTrip) {
                            setSelectedTripForDetails(issue.targetTrip);
                          }
                        }}
                        className="px-3.5 py-1.5 bg-[#0F2537] hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <span>{issue.actionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* Master View Switcher (Trips Table vs Passengers Journey Log) */}
          {/* ======================================================== */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDashboardViewMode('trips')}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  dashboardViewMode === 'trips'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Bus className="w-4 h-4 text-emerald-600" />
                <span>جدول متابعة الرحلات اليومية ({filteredTrips.length} رحلة)</span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardViewMode('demand_table')}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  dashboardViewMode === 'demand_table'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                <span>حساب السيارات المطلوبة ({fleetDemandTableData.rows.length} موعد ومسار)</span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardViewMode('passengers')}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  dashboardViewMode === 'passengers'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListOrdered className="w-4 h-4 text-indigo-600" />
                <span>سجل ركاب اليوم وتفاصيل الركوب ({allPassengersToday.length} راكب)</span>
              </button>
            </div>

            {/* Quick Summary Pill on Switcher */}
            <div className="text-[11px] font-medium text-slate-600 px-3 py-1 flex items-center gap-3">
              <span>إجمالي الطلاب المسافرين اليوم: <strong className="font-mono text-slate-900 font-bold">{uniqueTravelingStudentsCount}</strong> طالب</span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* View 1: Daily Trips Operations Table */}
          {/* ======================================================== */}
          {dashboardViewMode === 'trips' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                    <Bus className="w-4 h-4 text-emerald-600" />
                    <span>جدول متابعة حالة التشغيل اليومي للرحلات</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    انقر على أي رحلة لعرض قائمة الطلاب المسجلين وحالة صعودهم ومسار المحطات بالتفصيل.
                  </p>
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  إجمالي السعة المقعدية: <strong className="text-slate-800">{filteredTrips.reduce((acc, t) => acc + (t.capacity || 0), 0)}</strong> مقعد
                </div>
              </div>

              {filteredTrips.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <Bus className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="font-bold text-xs text-slate-700">لا توجد رحلات تطابق الفلاتر المحددة</p>
                  <p className="text-[11px] text-slate-400">جرب تغيير التاريخ أو الجامعة أو مسح كلمة البحث.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-3 px-4">كود وموعد الرحلة</th>
                        <th className="py-3 px-4">الجامعة</th>
                        <th className="py-3 px-4">خط السير</th>
                        <th className="py-3 px-4">الاتجاه</th>
                        <th className="py-3 px-4">السائق والحافلة</th>
                        <th className="py-3 px-4 text-center">المخصصون</th>
                        <th className="py-3 px-4 text-center">صعدوا فعلياً</th>
                        <th className="py-3 px-4 text-center">المقاعد المتاحة</th>
                        <th className="py-3 px-4 text-center">الحالة</th>
                        <th className="py-3 px-4 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTrips.map((trip) => {
                        const manifest = trip.manifest || [];
                        const confirmedCount = manifest.filter(
                          m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported'
                        ).length;
                        const boardedCount = manifest.filter(m => m.boardedStatus === 'boarded').length;
                        const availableSeats = Math.max(0, trip.capacity - confirmedCount);

                        return (
                          <tr
                            key={trip.id}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                            onClick={() => setSelectedTripForDetails(trip)}
                          >
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                                  {trip.code}
                                </span>
                                <span className="text-slate-600 text-[11px] font-sans font-medium">
                                  {trip.scheduledTime}
                                </span>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                              {trip.universityNameAr}
                            </td>

                            <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate" title={trip.lineNameAr}>
                              {trip.lineNameAr}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                trip.direction === 'to_university'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                              }`}>
                                {trip.direction === 'to_university' ? 'ذهاب (جامعة)' : 'عودة (منزل)'}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="text-slate-900 font-black">كابتن {trip.driverNameAr || 'غير معين'}</div>
                                  <div className="text-[11px] text-slate-500 font-mono">{trip.busPlate || 'بدون حافلة'}</div>
                                </div>
                                {trip.driverPhone && (
                                  <a
                                    href={`tel:${trip.driverPhone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-emerald-800 text-[10px] font-bold rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                                    title={`اتصال مباشر بالسائق (${trip.driverPhone})`}
                                  >
                                    <PhoneCall className="w-3 h-3" />
                                    <span>اتصال</span>
                                  </a>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                              {manifest.length}
                            </td>

                            <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-700">
                              {boardedCount}
                            </td>

                            <td className="py-3.5 px-4 text-center font-mono">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                availableSeats === 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {availableSeats}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                  trip.status === 'in_progress'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : trip.status === 'delayed'
                                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                    : trip.status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : trip.status === 'merged'
                                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  trip.status === 'in_progress'
                                    ? 'bg-amber-500 animate-pulse'
                                    : trip.status === 'delayed'
                                    ? 'bg-rose-500'
                                    : trip.status === 'completed'
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-400'
                                }`} />
                                <span>
                                  {trip.status === 'in_progress' && 'في الطريق'}
                                  {trip.status === 'delayed' && 'متأخرة'}
                                  {trip.status === 'completed' && 'مكتملة'}
                                  {trip.status === 'scheduled' && 'مجدولة'}
                                  {trip.status === 'merged' && 'مدمجة'}
                                  {trip.status === 'cancelled' && 'ملغاة'}
                                </span>
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTripForDetails(trip);
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-[#0F2537] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>التفاصيل</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    
                    {/* TOTAL SUMMARY FOOTER ROW */}
                    <tfoot className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-300 text-xs">
                      <tr>
                        <td colSpan={5} className="py-3.5 px-4 text-right">
                          <span className="flex items-center gap-2">
                            <span className="bg-[#0F2537] text-white px-2 py-0.5 rounded text-[10px]">المجموع الإجمالي</span>
                            <span>إجمالي الرحلات المعروضة ({filteredTrips.length} رحلة)</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-sm text-slate-900">
                          {filteredTrips.reduce((acc, t) => acc + (t.manifest?.length || 0), 0)} طالب
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-sm text-emerald-700">
                          {filteredTrips.reduce((acc, t) => acc + (t.manifest || []).filter(m => m.boardedStatus === 'boarded').length, 0)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-sm text-slate-700">
                          {filteredTrips.reduce((acc, t) => {
                            const conf = (t.manifest || []).filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
                            return acc + Math.max(0, t.capacity - conf);
                          }, 0)}
                        </td>
                        <td colSpan={2} className="py-3.5 px-4 text-center text-slate-500 font-normal">
                          إجمالي السعة: {filteredTrips.reduce((acc, t) => acc + (t.capacity || 0), 0)} مقعد
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* View: Vehicle Demand & Fleet Coverage Calculation Table */}
          {/* ======================================================== */}
          {dashboardViewMode === 'demand_table' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-sky-600" />
                    <span>جدول حساب عدد السيارات المطلوبة لكل موعد ومسار وتغطية الأسطول</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    حساب دقيق للاحتياج الفعلي من الحافلات بناءً على عدد الطلاب المسجلين وسعات الأسطول الفعلية (14، 28، 33 راكب) مع بيان النقص والفائض.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => autoAllocateStudentsToSlotBuses()}
                    className="px-3.5 py-2 bg-[#0F2537] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="توزيع الطلاب آلياً بشكل متوازن على الحافلات"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>توزيع وتسكين الطلاب آلياً</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleStudentAssignmentMode}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border cursor-pointer ${
                      settings.studentAssignmentMode === 'auto_assigned'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-sky-50 text-sky-900 border-sky-300'
                    }`}
                    title="التبديل بين التخصيص المسبق للطلاب أو الصعود المفتوح"
                  >
                    <Sliders className="w-4 h-4" />
                    <span>
                      {settings.studentAssignmentMode === 'auto_assigned'
                        ? 'وضع التخصيص: مسبق محدد'
                        : 'وضع التخصيص: صعود مرن مفتوح'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Mode Explanation Banner */}
              <div className="mx-4 p-3 rounded-xl border text-xs flex items-center justify-between gap-3 bg-slate-50 border-slate-200">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="text-slate-700">
                    {settings.studentAssignmentMode === 'auto_assigned'
                      ? 'النظام يعمل بوضع "التخصيص المسبق للطلاب": يظهر لكل طالب الحافلة المحددة له ولوحتها واسم السائق.'
                      : 'النظام يعمل بوضع "الصعود المرن المفتوح": الحافلات تخدم المحطات بنظام الحضور المباشر بدون إسناد طالب لحافلة معينة.'}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-bold text-slate-500 shrink-0">
                  سعات الأسطول المتاحة: 14، 28، 33 راكب
                </span>
              </div>

              {/* The 5 Simple Operational Questions & Answers (PDF Page 3) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mx-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-bold block mb-1">كام طالب طلب المواصلات؟</span>
                  <div className="text-2xl font-black text-slate-900 font-mono">{studentsRegisteredToday} طالب</div>
                  <span className="text-[10px] text-slate-400 mt-1 block">إجمالي الطلاب المسجلين اليوم</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-bold block mb-1">كام عربية نحتاج؟</span>
                  <div className="text-2xl font-black text-indigo-700 font-mono">{carsNeededToday} سيارة</div>
                  <span className="text-[10px] text-slate-400 mt-1 block">بناءً على سعات 14 و28 و33</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-bold block mb-1">كام عربية عندنا؟</span>
                  <div className="text-2xl font-black text-slate-800 font-mono">{buses.length} سيارة</div>
                  <span className="text-[10px] text-slate-400 mt-1 block">إجمالي أسطول السيارات المتاح</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-bold block mb-1">كام عربية حددنا؟</span>
                  <div className="text-2xl font-black text-emerald-700 font-mono">{carsAssignedToday} سيارة</div>
                  <span className="text-[10px] text-slate-400 mt-1 block">تم تجهيزها وتخصيصها بالرحلات</span>
                </div>
                <div className={`p-3.5 rounded-xl border ${
                  carsShortageToday > 0 ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}>
                  <span className="text-[11px] font-bold block mb-1">كام عربية ناقصة؟</span>
                  <div className={`text-2xl font-black font-mono ${carsShortageToday > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {carsShortageToday} سيارة
                  </div>
                  <span className="text-[10px] mt-1 block">
                    {carsShortageToday === 0 ? 'لا يوجد عجز، التغطية كاملة' : 'عجز يحتاج لتوفير سيارات فوراً'}
                  </span>
                </div>
              </div>

              {/* The Calculation Table */}
              <div className="overflow-auto max-h-[550px] border-t border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50/95 backdrop-blur-xs text-slate-700 font-black border-b border-slate-300 text-[11px] sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="py-3 px-3">موعد الرحلة</th>
                      <th className="py-3 px-3">الجامعة</th>
                      <th className="py-3 px-3">الخط أو الطريق</th>
                      <th className="py-3 px-3 text-center">عدد الطلاب</th>
                      <th className="py-3 px-3">سعة السيارة (14، 28، 33)</th>
                      <th className="py-3 px-3 text-center">السيارات المطلوبة</th>
                      <th className="py-3 px-3 text-center">السيارات المحددة</th>
                      <th className="py-3 px-3 text-center">السيارات الناقصة</th>
                      <th className="py-3 px-3 text-center">الحالة</th>
                      <th className="py-3 px-3 text-center">إجراءات الموعد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fleetDemandTableData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          لا توجد مواعيد أو رحلات مسجلة لهذا التاريخ.
                        </td>
                      </tr>
                    ) : (
                      fleetDemandTableData.rows.map((row) => {
                        return (
                          <tr key={row.slotKey} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 font-mono font-black text-slate-900 whitespace-nowrap">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                {row.time}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-800 font-bold whitespace-nowrap">
                              {row.universityNameAr}
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-700">
                              <div>{row.lineNameAr}</div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded inline-block mt-0.5 ${
                                row.direction === 'to_university' ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800'
                              }`}>
                                {row.direction === 'to_university' ? 'ذهاب للجامعة' : 'عودة للمنزل'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-black text-slate-900 text-sm">
                              {row.registeredCount} طالب
                            </td>
                            <td className="py-3 px-3 text-slate-700 text-[11px]">
                              {row.assignedPlates ? (
                                <span className="font-mono text-slate-800 font-bold">{row.assignedPlates}</span>
                              ) : (
                                <span className="text-slate-400">سعة مقترحة (14 / 28 / 33)</span>
                              )}
                              <span className="text-[10px] text-slate-400 block font-mono">
                                السعة المتاحة: {row.assignedCapacity} مقعد
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-black text-indigo-700 text-sm">
                              {row.busesNeeded} سيارة
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                              {row.assignedBusesCount} سيارة
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold">
                              {row.busesShortage > 0 ? (
                                <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  نقص {row.busesShortage}
                                </span>
                              ) : (
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  0 (مكتمل)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {row.seatShortage > 0 ? (
                                <span className="bg-rose-100 text-rose-900 border border-rose-300 font-black text-[11px] px-2.5 py-1 rounded-xl flex items-center justify-center gap-1 shadow-2xs">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                  <span>عجز: نقص {row.seatShortage} مقاعد</span>
                                </span>
                              ) : row.busesShortage > 0 ? (
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] px-2.5 py-1 rounded-xl flex items-center justify-center gap-1 shadow-2xs">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>مطلوب {row.busesShortage} باص إضافي</span>
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[11px] px-2.5 py-1 rounded-xl flex items-center justify-center gap-1 shadow-2xs">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>مغطى بالكامل</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSlotForStudents(row)}
                                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                  title="عرض قائمة الطلاب المسجلين لهذا الموعد وتفاصيل الركوب"
                                >
                                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>عرض الطلاب</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSlotForVehicles(row);
                                    if (row.tripsInSlot[0]) {
                                      setAssignTargetTripId(row.tripsInSlot[0].id);
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                  title="تحديد وإسناد سيارات وسائقين متاحين لهذا الموعد"
                                >
                                  <Bus className="w-3.5 h-3.5 text-amber-700" />
                                  <span>تحديد السيارات</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    autoAllocateStudentsToSlotBuses({
                                      date: filterDate !== 'all' ? filterDate : activeOperatingDate,
                                      lineId: row.lineId,
                                      scheduledTime: row.time
                                    });
                                  }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-[#0F2537] hover:text-white text-slate-700 font-bold text-[11px] rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                  title="تسكين طلاب هذا الموعد آلياً على الحافلات"
                                >
                                  <span>تسكين آلي</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* TOTAL ROW WITH SHORTAGE CALCULATION */}
                  <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-xs">
                    <tr>
                      <td colSpan={3} className="py-4 px-4 text-right">
                        <span className="flex items-center gap-2">
                          <span className="bg-[#0F2537] text-white px-2 py-0.5 rounded text-[10px]">المجموع الكلي</span>
                          <span>إجمالي كافة المواعيد والمسارات ({fleetDemandTableData.rows.length} موعد)</span>
                        </span>
                      </td>
                      <td className="py-4 px-3 text-center font-mono text-base text-slate-900">
                        {fleetDemandTableData.totals.totalRegistered} طالب
                      </td>
                      <td className="py-4 px-3 text-slate-700 text-xs font-mono">
                        السعة الإجمالية: {fleetDemandTableData.totals.totalCapacity} مقعد
                      </td>
                      <td className="py-4 px-3 text-center font-mono text-base text-indigo-800">
                        {fleetDemandTableData.totals.totalNeededBuses} سيارة
                      </td>
                      <td className="py-4 px-3 text-center font-mono text-base text-slate-900">
                        {fleetDemandTableData.totals.totalAssignedBuses} سيارة
                      </td>
                      <td className="py-4 px-3 text-center font-mono text-base text-rose-600">
                        {fleetDemandTableData.totals.totalNeededBuses - fleetDemandTableData.totals.totalAssignedBuses > 0
                          ? `نقص ${fleetDemandTableData.totals.totalNeededBuses - fleetDemandTableData.totals.totalAssignedBuses}`
                          : '0'}
                      </td>
                      <td colSpan={2} className="py-4 px-4 text-center">
                        {fleetDemandTableData.totals.totalSeatShortage > 0 ? (
                          <div className="bg-rose-100 text-rose-900 border border-rose-300 px-3 py-1.5 rounded-xl font-black text-xs inline-flex items-center gap-1.5 shadow-2xs">
                            <AlertTriangle className="w-4 h-4 text-rose-600" />
                            <span>إجمالي النقص في التغطية: عجز {fleetDemandTableData.totals.totalSeatShortage} مقعد</span>
                          </div>
                        ) : (
                          <div className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-1.5 rounded-xl font-black text-xs inline-flex items-center gap-1.5 shadow-2xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>التغطية مكتملة 100% (فائض إجمالي {fleetDemandTableData.totals.netBalance} مقعد)</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* View 2: Passenger Journeys Master Log (Today's Traveling Students) */}
          {/* Shows student name, boarding time, driver they rode with, bus */}
          {/* ======================================================== */}
          {dashboardViewMode === 'passengers' && (() => {
            const totalPassengerPages = Math.ceil(allPassengersToday.length / passengerPageSize) || 1;
            const validPage = Math.min(passengerPage, totalPassengerPages);
            const paginatedPassengers = passengerPageSize >= 999
              ? allPassengersToday
              : allPassengersToday.slice((validPage - 1) * passengerPageSize, validPage * passengerPageSize);

            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
                
                <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-indigo-600" />
                      <span>سجل ركاب اليوم وتفاصيل الركوب (أسماء الطلاب، المواعيد، ومع من ركب كل طالب)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      كشف شامل لجميع الركاب المسافرين اليوم مع توضيح وقت الصعود، السائق، الحافلة، ومحطة الركوب.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* CSV Export Button */}
                    <button
                      type="button"
                      onClick={exportPassengerDataToCSV}
                      className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="تصدير كشف الركاب الحالي بصيغة CSV المتوافقة مع Excel"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تصدير إكسل/CSV</span>
                    </button>

                    {/* Sub-filters for passengers log */}
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => { setPassengerStatusFilter('all'); setPassengerPage(1); }}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          passengerStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        الكل ({allPassengersToday.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPassengerStatusFilter('boarded'); setPassengerPage(1); }}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          passengerStatusFilter === 'boarded' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        صعدوا ({allPassengersToday.filter(p => p.boardedStatus === 'boarded').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPassengerStatusFilter('waiting'); setPassengerPage(1); }}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          passengerStatusFilter === 'waiting' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        انتظار ({allPassengersToday.filter(p => p.boardedStatus === 'waiting').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPassengerStatusFilter('absent'); setPassengerPage(1); }}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          passengerStatusFilter === 'absent' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        غائبون ({allPassengersToday.filter(p => p.rsvpStatus === 'excused' || p.boardedStatus === 'no_show').length})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Search & Multi-criteria Filters Bar: «ابحث عن طالب أو اختر تصفية» (PDF Page 5) */}
                <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 mx-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Search className="w-4 h-4 text-emerald-600" />
                      <span>ابحث عن طالب أو اختر تصفية</span>
                    </span>
                    {(passengerUniversityFilter !== 'all' || passengerLineFilter !== 'all' || passengerStationFilter !== 'all' || passengerTimeFilter !== 'all' || passengerBusFilter !== 'all' || searchQuery || passengerStatusFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setPassengerUniversityFilter('all');
                          setPassengerLineFilter('all');
                          setPassengerStationFilter('all');
                          setPassengerTimeFilter('all');
                          setPassengerBusFilter('all');
                          setPassengerStatusFilter('all');
                          setSearchQuery('');
                          setPassengerPage(1);
                        }}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>مسح الفلاتر وإعادة الضبط</span>
                      </button>
                    )}
                  </div>

                  {/* Direct inline student search input */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setPassengerPage(1); }}
                      placeholder="اكتب اسم الطالب، رقم الهاتف، اسم السائق، المحطة، أو لوحة الحافلة..."
                      className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[#0F2537] outline-hidden font-medium text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                    {/* 1. الجامعة */}
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">الجامعة:</label>
                      <select
                        value={passengerUniversityFilter}
                        onChange={(e) => { setPassengerUniversityFilter(e.target.value); setPassengerPage(1); }}
                        className="w-full p-2 border border-slate-200 rounded-xl bg-white font-medium text-slate-700 outline-hidden"
                      >
                        <option value="all">كل الجامعات</option>
                        {universities.map(u => (
                          <option key={u.id} value={u.id}>{u.nameAr}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. الخط */}
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">الخط:</label>
                      <select
                        value={passengerLineFilter}
                        onChange={(e) => { setPassengerLineFilter(e.target.value); setPassengerPage(1); }}
                        className="w-full p-2 border border-slate-200 rounded-xl bg-white font-medium text-slate-700 outline-hidden"
                      >
                        <option value="all">كل الخطوط</option>
                        {lines.map(l => (
                          <option key={l.id} value={l.id}>{l.nameAr}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. المحطة */}
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">المحطة:</label>
                      <select
                        value={passengerStationFilter}
                        onChange={(e) => { setPassengerStationFilter(e.target.value); setPassengerPage(1); }}
                        className="w-full p-2 border border-slate-200 rounded-xl bg-white font-medium text-slate-700 outline-hidden"
                      >
                        <option value="all">كل المحطات</option>
                        {Array.from(new Set(lines.flatMap(l => (l.stations || []).map(s => s.nameAr)))).map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>

                    {/* 4. الموعد */}
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">الموعد:</label>
                      <select
                        value={passengerTimeFilter}
                        onChange={(e) => { setPassengerTimeFilter(e.target.value); setPassengerPage(1); }}
                        className="w-full p-2 border border-slate-200 rounded-xl bg-white font-medium text-slate-700 outline-hidden font-mono"
                      >
                        <option value="all">كل المواعيد</option>
                        {Array.from(new Set(trips.map(t => t.scheduledTime))).sort().map(tm => (
                          <option key={tm} value={tm}>{tm}</option>
                        ))}
                      </select>
                    </div>

                    {/* 5. السيارة */}
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">السيارة:</label>
                      <select
                        value={passengerBusFilter}
                        onChange={(e) => { setPassengerBusFilter(e.target.value); setPassengerPage(1); }}
                        className="w-full p-2 border border-slate-200 rounded-xl bg-white font-medium text-slate-700 outline-hidden font-mono"
                      >
                        <option value="all">كل الحافلات</option>
                        {buses.map(b => (
                          <option key={b.id} value={b.plateNumber}>{b.plateNumber} ({b.capacity} راكب)</option>
                        ))}
                      </select>
                    </div>

                    {/* 6. حالة الطالب */}
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">حالة الطالب:</label>
                      <select
                        value={passengerStatusFilter}
                        onChange={(e) => { setPassengerStatusFilter(e.target.value as any); setPassengerPage(1); }}
                        className="w-full p-2 border border-slate-200 rounded-xl bg-white font-medium text-slate-700 outline-hidden"
                      >
                        <option value="all">كل الحالات</option>
                        <option value="boarded">ركب السيارة</option>
                        <option value="waiting">في الانتظار (لم يركب)</option>
                        <option value="absent">غائب / معتذر</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Top Pagination & Navigation Toolbar */}
                <div className="px-4 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50/70 p-2.5 rounded-xl border border-slate-200 mx-4">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold">عدد الصفوف بالصفحة:</span>
                    <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
                      {[10, 25, 50, 9999].map(sz => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => { setPassengerPageSize(sz); setPassengerPage(1); }}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                            passengerPageSize === sz ? 'bg-[#0F2537] text-white' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {sz === 9999 ? 'الكل' : sz}
                        </button>
                      ))}
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] mr-2">
                      (معروض {paginatedPassengers.length} من {allPassengersToday.length} راكب)
                    </span>
                  </div>

                  {passengerPageSize < 999 && totalPassengerPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={validPage <= 1}
                        onClick={() => setPassengerPage(prev => Math.max(1, prev - 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
                      >
                        السابق
                      </button>
                      <span className="px-2 font-mono text-xs text-slate-700 font-bold">
                        {validPage} / {totalPassengerPages}
                      </span>
                      <button
                        type="button"
                        disabled={validPage >= totalPassengerPages}
                        onClick={() => setPassengerPage(prev => Math.min(totalPassengerPages, prev + 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
                      >
                        التالي
                      </button>
                    </div>
                  )}
                </div>

                {/* Batch Action Toolbar when students are selected */}
                {selectedPassengerIds.length > 0 && (
                  <div className="bg-[#0F2537] text-white p-3 px-5 rounded-xl mx-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold">تم تحديد {selectedPassengerIds.length} طالب</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          filteredTrips.forEach(t => {
                            batchUpdateStudentBoarding(t.id, selectedPassengerIds, 'boarded');
                          });
                          setSelectedPassengerIds([]);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>تأكيد صعود المحدد</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          filteredTrips.forEach(t => {
                            batchUpdateStudentBoarding(t.id, selectedPassengerIds, 'no_show');
                          });
                          setSelectedPassengerIds([]);
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>تسجيل غياب المحدد</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportPassengerDataToCSV}
                        className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تصدير المحدد (CSV)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedPassengerIds([])}
                        className="text-slate-300 hover:text-white px-2 py-1 text-xs cursor-pointer"
                      >
                        إلغاء التحديد
                      </button>
                    </div>
                  </div>
                )}

                {allPassengersToday.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 space-y-2">
                    <Users className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="font-bold text-xs text-slate-700">لا يوجد ركاب يطابقون خيارات الفلترة المحددة</p>
                    <p className="text-[11px] text-slate-400">جرب مسح كلمة البحث أو اختيار كل الحالات.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto overflow-y-auto max-h-[520px] border-y border-slate-200">
                    <table id="passenger-log-table" className="w-full text-right text-xs">
                      <thead className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-black border-b border-slate-300 text-[11px] sticky top-0 z-10 shadow-2xs">
                        <tr>
                          <th className="py-3 px-3 text-center w-10">
                            <input
                              type="checkbox"
                              checked={selectedPassengerIds.length > 0 && selectedPassengerIds.length === paginatedPassengers.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPassengerIds(paginatedPassengers.map(p => p.studentId));
                                } else {
                                  setSelectedPassengerIds([]);
                                }
                              }}
                              className="rounded border-slate-300 cursor-pointer"
                              title="تحديد الكل في هذه الصفحة"
                            />
                          </th>
                          <th className="py-3 px-2 text-center whitespace-nowrap hidden sm:table-cell">#</th>
                          <th className="py-3 px-3 whitespace-nowrap">اسم الطالب</th>
                          <th className="py-3 px-3 whitespace-nowrap hidden md:table-cell">الهاتف</th>
                          <th className="py-3 px-3 whitespace-nowrap hidden lg:table-cell">الجامعة</th>
                          <th className="py-3 px-3 whitespace-nowrap">خط السير والاتجاه</th>
                          <th className="py-3 px-3 whitespace-nowrap">الرحلة والموعد</th>
                          <th className="py-3 px-3 whitespace-nowrap hidden md:table-cell">السائق (مع من ركب)</th>
                          <th className="py-3 px-3 whitespace-nowrap hidden md:table-cell">الحافلة</th>
                          <th className="py-3 px-3 whitespace-nowrap hidden lg:table-cell">محطة الصعود</th>
                          <th className="py-3 px-3 text-center whitespace-nowrap hidden sm:table-cell">موعد الركوب</th>
                          <th className="py-3 px-3 text-center whitespace-nowrap">حالة الركوب</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedPassengers.map((p, idx) => {
                          const isSelected = selectedPassengerIds.includes(p.studentId);
                          const serialNum = (passengerPageSize < 999 ? (validPage - 1) * passengerPageSize : 0) + idx + 1;
                          return (
                            <tr
                              key={`${p.tripId}-${p.studentId}-${idx}`}
                              className={`transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50/70'}`}
                            >
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedPassengerIds(prev =>
                                      prev.includes(p.studentId)
                                        ? prev.filter(id => id !== p.studentId)
                                        : [...prev, p.studentId]
                                    );
                                  }}
                                  className="rounded border-slate-300 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-2 text-center font-mono text-slate-400 text-[11px] whitespace-nowrap hidden sm:table-cell">
                                {serialNum}
                              </td>

                            <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentProfile({
                                    studentId: p.studentId,
                                    studentName: p.studentName,
                                    phone: p.phone,
                                    universityNameAr: p.universityNameAr,
                                    lineNameAr: p.lineNameAr,
                                    stationNameAr: p.scheduledStationNameAr,
                                    scheduledTime: p.scheduledTime,
                                    busPlate: p.busPlate,
                                    driverNameAr: p.driverNameAr,
                                    driverPhone: p.driverPhone,
                                    tripId: p.tripId,
                                    boardedStatus: p.boardedStatus,
                                    rsvpStatus: p.rsvpStatus
                                  });
                                }}
                                className="text-right font-black hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1.5"
                                title="عرض ملف الطالب والاتصال السريع"
                              >
                                <span>{p.studentName}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                              </button>
                            </td>

                            <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap hidden md:table-cell">
                              <a href={`tel:${p.phone}`} className="text-emerald-700 hover:underline">
                                {p.phone}
                              </a>
                            </td>

                            <td className="py-3 px-3 text-slate-800 whitespace-nowrap font-medium hidden lg:table-cell">
                              {p.universityNameAr}
                            </td>

                            <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                              <div className="font-medium">{p.lineNameAr}</div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded inline-block mt-0.5 ${
                                p.direction === 'to_university' ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'
                              }`}>
                                {p.direction === 'to_university' ? 'ذهاب' : 'عودة'}
                              </span>
                            </td>

                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                                {p.tripCode}
                              </span>
                              <span className="text-slate-500 mr-1.5 text-[11px] font-sans">
                                {p.scheduledTime}
                              </span>
                            </td>

                            <td className="py-3 px-3 whitespace-nowrap hidden md:table-cell">
                              <div className="font-bold text-slate-900">{p.driverNameAr}</div>
                              <a href={`tel:${p.driverPhone}`} className="text-[10px] text-slate-400 font-mono hover:text-emerald-700">
                                {p.driverPhone}
                              </a>
                            </td>

                            <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700 hidden md:table-cell">
                              {p.busPlate}
                            </td>

                            <td className="py-3 px-3 text-slate-700 whitespace-nowrap hidden lg:table-cell">
                              <div>{p.scheduledStationNameAr}</div>
                              {p.actualStationNameAr && p.actualStationNameAr !== p.scheduledStationNameAr && (
                                <span className="text-[10px] text-amber-700 font-bold block">
                                  (ركب من: {p.actualStationNameAr})
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-center whitespace-nowrap hidden sm:table-cell">
                              {p.boardingTime ? (
                                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                                  {p.boardingTime}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">بانتظار الصعود</span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                                p.boardedStatus === 'boarded'
                                  ? 'bg-emerald-600 text-white'
                                  : p.boardedStatus === 'no_show'
                                  ? 'bg-rose-100 text-rose-800'
                                  : p.rsvpStatus === 'excused'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {p.boardedStatus === 'boarded' && 'صعد الحافلة'}
                                {p.boardedStatus === 'no_show' && 'لم يحضر'}
                                {p.rsvpStatus === 'excused' && p.boardedStatus !== 'boarded' && 'معتذر مسبقاً'}
                                {p.boardedStatus === 'waiting' && p.rsvpStatus !== 'excused' && 'في الانتظار'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      </tbody>

                      {/* TOTAL SUMMARY FOOTER ROW FOR PASSENGERS */}
                      <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300 text-xs">
                        <tr>
                          <td colSpan={12} className="py-3.5 px-4">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                              <span className="flex items-center gap-2">
                                <span className="bg-[#0F2537] text-white px-2 py-0.5 rounded text-[10px]">مجموع ركاب اليوم</span>
                                <span>إجمالي سجلات الركاب ({allPassengersToday.length} سجل راكب)</span>
                              </span>
                              <div className="font-mono text-xs text-slate-800">
                                طلاب فريدون مسافرون: <strong className="text-indigo-700">{uniqueTravelingStudentsCount}</strong> طالب
                              </div>
                              <div className="flex items-center gap-3 font-mono text-xs">
                                <span className="text-emerald-800 font-bold">
                                  صعدوا: {allPassengersToday.filter(p => p.boardedStatus === 'boarded').length}
                                </span>
                                <span className="text-slate-600 font-bold">
                                  في الانتظار: {allPassengersToday.filter(p => p.boardedStatus === 'waiting').length}
                                </span>
                                <span className="text-rose-700 font-bold">
                                  غائبون: {allPassengersToday.filter(p => p.rsvpStatus === 'excused' || p.boardedStatus === 'no_show').length}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* ======================================================== */}
      {/* Fleet Demand & Next-Day Planning Tab */}
      {/* ======================================================== */}
      {activeTab === 'fleet_planning' && (
        <FleetDemandPlanner />
      )}

      {/* ======================================================== */}
      {/* 5. Tab 3: Live Fleet Monitor (Cards & Stations Timeline) */}
      {/* ======================================================== */}
      {activeTab === 'live' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTrips.map((trip) => {
              const manifest = trip.manifest || [];
              const confirmedCount = manifest.filter(
                m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported'
              ).length;
              const boardedCount = manifest.filter(m => m.boardedStatus === 'boarded').length;
              const capacity = trip.capacity > 0 ? trip.capacity : 14;
              const occupancyPercent = Math.round((confirmedCount / capacity) * 100);
              const isExpanded = expandedLiveTripId === trip.id;
              const tripLine = lines.find(l => l.id === trip.lineId);
              const effectiveTripStops =
                trip.stops && trip.stops.length > 0
                  ? trip.stops
                  : (tripLine?.stations
                      ? (trip.direction === 'from_university' ? [...tripLine.stations].reverse() : tripLine.stations).map((st, sIdx) => ({
                          stopId: `gen-${trip.id}-${st.id}`,
                          stationId: st.id,
                          stationNameAr: st.nameAr,
                          orderIndex: sIdx + 1,
                          scheduledArrivalTime: trip.scheduledTime,
                          status: trip.status === 'completed' ? ('departed' as const) : ('pending' as const)
                        }))
                      : []);

              return (
                <div
                  key={trip.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition-all space-y-4 ${
                    trip.status === 'delayed'
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : trip.status === 'in_progress'
                      ? 'border-amber-300/80 shadow-sm'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/80">
                        {trip.code}
                      </span>
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{trip.scheduledTime}</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        trip.direction === 'to_university'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/50'
                          : 'bg-indigo-50 text-indigo-800 border border-indigo-200/50'
                      }`}>
                        {trip.direction === 'to_university' ? 'ذهاب للجامعة' : 'عودة للمنزل'}
                      </span>
                    </div>

                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 ${
                        trip.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : trip.status === 'delayed'
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : trip.status === 'merged'
                          ? 'bg-purple-100 text-purple-900 border border-purple-300'
                          : trip.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        trip.status === 'in_progress'
                          ? 'bg-amber-500 animate-pulse'
                          : trip.status === 'delayed'
                          ? 'bg-rose-500'
                          : trip.status === 'merged'
                          ? 'bg-purple-500'
                          : trip.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-slate-400'
                      }`} />
                      <span>
                        {trip.status === 'in_progress' && 'في الطريق الآن'}
                        {trip.status === 'delayed' && 'متأخرة عن الموعد'}
                        {trip.status === 'merged' && 'تم الدمج'}
                        {trip.status === 'scheduled' && 'مجدولة لم تبدأ'}
                        {trip.status === 'completed' && 'اكتملت بنجاح'}
                        {trip.status === 'cancelled' && 'ملغاة'}
                      </span>
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{trip.lineNameAr}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">{trip.universityNameAr}</p>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 font-medium">
                        الإشغال المؤكد: <strong className="font-mono text-slate-900 font-bold">{confirmedCount}</strong> /{' '}
                        <strong className="font-mono text-slate-900 font-bold">{capacity}</strong> مقعد
                      </span>
                      <span className={`font-mono font-black text-xs px-2 py-0.5 rounded ${
                        occupancyPercent < 40
                          ? 'bg-amber-100 text-amber-800'
                          : occupancyPercent > 90
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {occupancyPercent}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          occupancyPercent < 40
                            ? 'bg-amber-500'
                            : occupancyPercent > 90
                            ? 'bg-rose-500'
                            : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(occupancyPercent, 100)}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                      <span className="font-bold text-slate-700">
                        صعد الحافلة فعلياً: <strong className="font-mono text-emerald-700">{boardedCount}</strong> طالب
                      </span>
                      {trip.lastConfirmedStopName ? (
                        <span className="text-sky-700 font-bold flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                          <Compass className="w-3 h-3" />
                          <span>آخر محطة: {trip.lastConfirmedStopName}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">لم يتم تأكيد محطة بعد</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {trip.driverNameAr.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-black text-slate-900">كابتن {trip.driverNameAr || 'غير معين'}</div>
                        <div className="font-mono text-slate-500 text-[11px]">لوحة: {trip.busPlate || 'غير محدد'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${trip.driverPhone}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 min-h-[32px] transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>اتصال</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setExpandedLiveTripId(isExpanded ? null : trip.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg min-h-[32px] transition-colors cursor-pointer"
                      >
                        <span>المحطات ({effectiveTripStops.length})</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedTripForDetails(trip)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0F2537] px-2.5 py-1.5 rounded-lg min-h-[32px] transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>الركاب</span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Stations Timeline */}
                  {isExpanded && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2.5">
                      <div className="font-bold text-slate-800 flex items-center justify-between pb-1 border-b border-slate-200 text-[11px]">
                        <span>تسلسل محطات الخط والوصول المؤكد:</span>
                        <span className="text-slate-400 font-mono">الترتيب من نقطة الانطلاق</span>
                      </div>

                      <div className="space-y-1.5">
                        {effectiveTripStops.map((stop, idx) => (
                          <div
                            key={stop.stopId || idx}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                              stop.status === 'arrived'
                                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80 font-bold'
                                : stop.status === 'departed'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-white text-slate-700 border border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                stop.status === 'arrived'
                                  ? 'bg-emerald-600 text-white'
                                  : stop.status === 'departed'
                                  ? 'bg-slate-400 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {idx + 1}
                              </span>
                              <span>{stop.stationNameAr}</span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="font-mono text-slate-400">
                                {stop.scheduledArrivalTime}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                stop.status === 'arrived'
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : stop.status === 'departed'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                {stop.status === 'arrived' && 'وصلت'}
                                {stop.status === 'departed' && 'غادرت'}
                                {stop.status === 'pending' && 'في الانتظار'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. Tab 5: Emergency Ad-Hoc / Quick Driver Swap */}
      {/* ======================================================== */}
      {activeTab === 'swap' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-sky-600" />
              <span>إدارة الأعطال والطوارئ وتبديل السائقين والسيارات فوراً</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              عند تعطل سيارة أو غياب سائق: بدّل بسائق مسجل مباشرة، أو عيّن سيارة طوارئ فورية بدون حساب، أو أضف سائقاً جديداً للسيستم وعيّنه في خطوة واحدة مع الحفاظ الكامل على الركاب والمحطات.
            </p>
          </div>

          {swapSuccessInfo && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  تم تنفيذ التحديث للرحلة <strong className="font-mono">{swapSuccessInfo.tripCode}</strong> بنجاح في تمام الساعة {swapSuccessInfo.time} مع الحفاظ على جميع الطلاب المسجلين.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSwapSuccessInfo(null)}
                className="text-emerald-700 font-bold hover:underline cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-black">
            <button
              type="button"
              onClick={() => setSwapMode('existing')}
              className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
                swapMode === 'existing'
                  ? 'bg-[#0F2537] text-white border-[#0F2537]'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="block">1. استبدال مباشر بأسطول مسجل</span>
              <span className={`text-[10px] font-medium block mt-0.5 ${swapMode === 'existing' ? 'text-slate-300' : 'text-slate-500'}`}>
                تبديل السائق أو الحافلة مع الحفاظ على كل شيء
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSwapMode('unregistered')}
              className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
                swapMode === 'unregistered'
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="block">2. حل طوارئ سريع بدون تسجيل حساب</span>
              <span className={`text-[10px] font-medium block mt-0.5 ${swapMode === 'unregistered' ? 'text-slate-900' : 'text-slate-500'}`}>
                إدخال اسم ورقم سيارة خارجية فوراً أثناء العطل
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSwapMode('new_driver')}
              className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
                swapMode === 'new_driver'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="block">3. إضافة سائق جديد للسيستم وتعيينه</span>
              <span className={`text-[10px] font-medium block mt-0.5 ${swapMode === 'new_driver' ? 'text-emerald-100' : 'text-slate-500'}`}>
                إضافة + دعوة سريعة وتسكينه على الرحلة فوراً
              </span>
            </button>
          </div>

          <form onSubmit={handleSwapSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-slate-700 font-bold block mb-1.5">الرحلة المستهدفة (مع اسم السائق الحالي):</label>
              <select
                value={swapTripId}
                onChange={(e) => setSwapTripId(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:ring-2 focus:ring-sky-500 outline-hidden font-bold"
              >
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    كابتن {t.driverNameAr || 'غير معين'} ({t.busPlate}) — {t.code} · {t.lineNameAr} ({t.scheduledTime})
                  </option>
                ))}
              </select>
            </div>

            {swapMode === 'existing' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-700 font-bold block mb-1.5">السائق البديل:</label>
                  <select
                    value={newDriverId}
                    onChange={(e) => setNewDriverId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:ring-2 focus:ring-sky-500 outline-hidden font-bold"
                  >
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        كابتن {d.nameAr} ({d.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-700 font-bold block mb-1.5">الحافلة البديلة المتاحة:</label>
                  <select
                    value={newBusId}
                    onChange={(e) => setNewBusId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:ring-2 focus:ring-sky-500 outline-hidden font-medium"
                  >
                    {buses.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.plateNumber} (سعة {b.capacity} راكب) - {b.model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {swapMode === 'unregistered' && (
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">اسم السائق الطارئ *</label>
                  <input
                    type="text"
                    required
                    value={adHocDriverName}
                    onChange={(e) => setAdHocDriverName(e.target.value)}
                    placeholder="أحمد محمود"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">هاتف السائق</label>
                  <input
                    type="tel"
                    value={adHocDriverPhone}
                    onChange={(e) => setAdHocDriverPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">لوحة السيارة البديلة *</label>
                  <input
                    type="text"
                    required
                    value={adHocBusPlate}
                    onChange={(e) => setAdHocBusPlate(e.target.value)}
                    placeholder="س ط ر 984"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">السعة (مقعد)</label>
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={adHocCapacity}
                    onChange={(e) => setAdHocCapacity(Number(e.target.value) || 14)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
              </div>
            )}

            {swapMode === 'new_driver' && (
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">اسم السائق الجديد *</label>
                  <input
                    type="text"
                    required
                    value={quickDriverName}
                    onChange={(e) => setQuickDriverName(e.target.value)}
                    placeholder="كابتن مصطفى علي"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={quickDriverPhone}
                    onChange={(e) => setQuickDriverPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">البريد الإلكتروني للدعوة *</label>
                  <input
                    type="email"
                    required
                    value={quickDriverEmail}
                    onChange={(e) => setQuickDriverEmail(e.target.value)}
                    placeholder="driver@gmail.com"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ربط بحافلة من الأسطول:</label>
                  <select
                    value={quickDriverBusId}
                    onChange={(e) => setQuickDriverBusId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="">إدخال لوحة جديدة بالخانة التالية</option>
                    {buses.map(b => (
                      <option key={b.id} value={b.id}>{b.plateNumber} ({b.capacity}ر)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">لوحة سيارة السائق الجديد</label>
                  <input
                    type="text"
                    value={quickDriverPlate}
                    onChange={(e) => setQuickDriverPlate(e.target.value)}
                    placeholder="أ ب ج 441"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">السعة (عند اللوحة الجديدة)</label>
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={quickDriverCapacity}
                    onChange={(e) => setQuickDriverCapacity(Number(e.target.value) || 14)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
              </div>
            )}

            {currentSwapTrip && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">السائق الحالي:</span>{' '}
                  <strong className="text-slate-900">كابتن {currentSwapTrip.driverNameAr || 'غير معين'}</strong> ({currentSwapTrip.busPlate})
                  {currentSwapTrip.driverPhone && (
                    <a
                      href={`tel:${currentSwapTrip.driverPhone}`}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <PhoneCall className="w-3 h-3" />
                      <span>اتصال بالسائق ({currentSwapTrip.driverPhone})</span>
                    </a>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">الركاب المسجلون (سيتم الحفاظ عليهم بالكامل):</span>{' '}
                  <strong className="font-mono text-emerald-700">{currentSwapTrip.manifest?.length || 0} طالب</strong>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-700 font-bold block mb-1.5">سبب التبديل / الإجراء (للتوثيق في سجل العمليات):</label>
              <input
                type="text"
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:ring-2 focus:ring-sky-500 outline-hidden font-medium"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingSwap}
              className="w-full sm:w-auto px-6 py-3 bg-[#0F2537] hover:bg-slate-800 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-2xs transition-colors flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
            >
              {swapMode === 'new_driver' ? <UserPlus className="w-4 h-4 text-emerald-400" /> : <RefreshCw className="w-4 h-4 text-sky-400" />}
              <span>
                {isSubmittingSwap
                  ? 'جارٍ التنفيذ والحفظ...'
                  : swapMode === 'existing'
                  ? 'تنفيذ التبديل السريع مع الحفاظ على كل البيانات'
                  : swapMode === 'unregistered'
                  ? 'تعيين سيارة الطوارئ للرحلة فوراً (بدون تسجيل)'
                  : 'إضافة السائق للنظام وتعيينه على الرحلة فوراً'}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. Tab 6: WhatsApp Attendance Import */}
      {/* ======================================================== */}
      {activeTab === 'whatsapp' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              <span>استيراد وتدقيق تقارير الحضور من رسائل WhatsApp أو ملفات Excel</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              ألصق نص كشف حضور WhatsApp اليومي لمطابقة أرقام الهواتف وتأكيد حضور الطلاب المسجلين بالرحلة قبل انطلاقها.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-700 font-bold block mb-1.5">اختر الرحلة المستهدفة للربط:</label>
              <select
                value={selectedTripForImport}
                onChange={(e) => setSelectedTripForImport(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:ring-2 focus:ring-green-500 outline-hidden font-medium"
              >
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.lineNameAr} ({t.scheduledTime})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-700 font-bold block mb-1.5">نص الرسالة أو كشف الحضور المستلم:</label>
            <textarea
              value={whatsappText}
              onChange={(e) => setWhatsappText(e.target.value)}
              rows={6}
              className="w-full p-3.5 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 bg-slate-50/70 leading-relaxed focus:ring-2 focus:ring-green-500 outline-hidden"
              placeholder="ألصق رسالة الواتساب هنا..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleWhatsappImport}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-2 min-h-[44px] cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>فحص ومطابقة الحضور واعتماد الاستيراد</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setWhatsappText(sampleWhatsappText);
                setImportResult(null);
              }}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors min-h-[44px] cursor-pointer"
            >
              إعادة تحميل النص التجريبي
            </button>
          </div>

          {importResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>تم اكتمال الاستيراد والمطابقة بنجاح!</span>
              </div>
              <div className="text-emerald-800 font-mono text-[11px] leading-relaxed">
                · تم العثور على ومطابقة <strong className="text-emerald-950 font-bold">{importResult.matched}</strong> طالب مسجلين بالرحلة وتحديث حالتهم إلى «واتساب».
              </div>
              {importResult.unassigned > 0 && (
                <div className="text-amber-800 font-mono text-[11px]">
                  · يوجد <strong className="text-amber-950 font-bold">{importResult.unassigned}</strong> أرقام في الرسالة لم يتم مطابقتها مع طلاب هذا الخط.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 10. Tab 7: Pending Student Registrations */}
      {/* ======================================================== */}
      {activeTab === 'registrations' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>طلبات تسجيل الحسابات الجديدة بانتظار الاعتماد ({pendingRegistrations.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              تظهر هنا طلبات الطلاب والسائقين والمشرفين المسجلين برقم الهاتف والاسم — لا يتم تفعيل أي حساب إلا بعد موافقتك.
            </p>
          </div>

          {pendingRegistrations.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-800">لا توجد طلبات تسجيل معلقة حالياً</p>
              <p className="text-slate-400">جميع الحسابات المسجلة تم مراجعتها وتفعيلها بنجاح.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRegistrations.map((student) => {
                const uniName = universities.find(u => u.id === student.universityId)?.nameAr;
                const lineObj = lines.find(l => l.id === student.lineId);
                const stationName = lineObj?.stations.find(s => s.id === student.stationId)?.nameAr;
                const roleBadge =
                  student.role === 'driver'
                    ? { label: 'سائق', cls: 'bg-amber-100 text-amber-900 border border-amber-300' }
                    : student.role === 'supervisor'
                    ? { label: 'مشرف تشغيلي', cls: 'bg-emerald-100 text-emerald-900 border border-emerald-300' }
                    : { label: 'طالب', cls: 'bg-sky-100 text-sky-900 border border-sky-300' };
                return (
                  <div
                    key={student.id}
                    className="p-4 sm:p-5 rounded-2xl border border-amber-200 bg-amber-50/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{student.name}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${roleBadge.cls}`}>
                          {roleBadge.label}
                        </span>
                        <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded">
                          قيد التدقيق
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2.5">
                        <span className="font-mono font-bold text-slate-800">الهاتف: {student.phone}</span>
                        {student.licenseNumber && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>الرخصة/اللوحة: {student.licenseNumber}</span>
                          </>
                        )}
                        {student.email && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="font-mono">{student.email}</span>
                          </>
                        )}
                        {uniName && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>الجامعة: {uniName}</span>
                          </>
                        )}
                        {lineObj?.nameAr && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>الخط: {lineObj.nameAr}</span>
                          </>
                        )}
                        {stationName && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>المحطة: {stationName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          void approveStudentRegistration(student.id);
                          if (addToast) addToast(`تم اعتماد وتفعيل حساب الطالب ${student.name} بنجاح.`, 'success');
                        }}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>اعتماد وتفعيل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void rejectPendingRegistration(student.id)}
                        className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>رفض وحذف</span>
                      </button>
                      <a
                        href={`tel:${student.phone}`}
                        className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 min-h-[44px]"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>اتصال</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 11. Tab 8: Operational Incidents & Logs */}
      {/* ======================================================== */}
      {activeTab === 'incidents' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span>سجل البلاغات والحوادث التشغيلية الميدانية</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                استعراض فوري لجميع البلاغات المسجلة من السائقين أو المشرفين (أعطال الحافلات، التأخيرات، والتبديل السريع).
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setIncidentFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  incidentFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                الكل ({incidents.length})
              </button>
              <button
                type="button"
                onClick={() => setIncidentFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  incidentFilter === 'pending' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                قيد المتابعة ({incidents.filter(i => i.status === 'pending').length})
              </button>
              <button
                type="button"
                onClick={() => setIncidentFilter('resolved')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  incidentFilter === 'resolved' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                تمت المعالجة ({incidents.filter(i => i.status === 'resolved').length})
              </button>
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl text-slate-500 text-xs">
              لا توجد بلاغات تشغيلية مسجلة في هذا القسم حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIncidents.map((incident) => {
                const typeLabels: Record<string, string> = {
                  breakdown: 'عطل حافلة مفاجئ',
                  delay: 'تأخير في حركة السير',
                  driver_absence: 'غياب سائق طارئ',
                  route_change: 'تعديل مسار الخط',
                  bus_swap: 'تبديل حافلة وسائق'
                };

                return (
                  <div
                    key={incident.id}
                    className={`p-4 rounded-xl border space-y-3 ${
                      incident.status === 'pending'
                        ? 'border-amber-200 bg-amber-50/20'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-mono">
                          رحلة: {incident.tripCode}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {typeLabels[incident.type] || incident.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {incident.createdAt}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          incident.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {incident.status === 'pending' ? 'قيد المتابعة التشغيلية' : 'تمت المعالجة'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 bg-slate-50/80 p-3 rounded-lg border border-slate-100 leading-relaxed">
                      {incident.description}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1">
                      <span>
                        المبلّغ: <strong className="text-slate-700">{incident.reportedByName}</strong> ({incident.reportedByRole === 'driver' ? 'سائق' : incident.reportedByRole === 'supervisor' ? 'مشرف' : 'إدارة'})
                      </span>
                      <div className="flex items-center gap-2">
                        {incident.delayMinutes && (
                          <span className="text-rose-600 font-bold">
                            مقدار التأخير: {incident.delayMinutes} دقيقة
                          </span>
                        )}
                        {incident.status === 'pending' && incident.tripId && (
                          <button
                            type="button"
                            onClick={() => {
                              setSwapTripId(incident.tripId);
                              setSwapMode('unregistered');
                              setSwapReason(`حل سريع لبلاغ ${incident.tripCode}: ${incident.description}`);
                              setActiveTab('swap');
                            }}
                            className="px-3 py-1 bg-[#0F2537] hover:bg-slate-800 text-amber-300 font-black rounded-lg text-[11px] cursor-pointer"
                          >
                            حل سريع / تبديل سائق للعطل ←
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 12. Modal / Details Drawer for Trip & Passenger Manifest */}
      {/* ======================================================== */}
      {selectedTripForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-5 sm:p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-[#0F2537] text-white font-mono font-bold text-xs px-2.5 py-1 rounded-md">
                  {selectedTripForDetails.code}
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  تفاصيل الرحلة والركاب المسجلين
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTripForDetails(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Trip Details Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">الجامعة:</span>
                <span className="font-bold text-slate-800">{selectedTripForDetails.universityNameAr}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">الموعد والاتجاه:</span>
                <span className="font-bold text-slate-800">
                  {selectedTripForDetails.scheduledTime} ({selectedTripForDetails.direction === 'to_university' ? 'ذهاب' : 'عودة'})
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">السائق:</span>
                <span className="font-bold text-slate-800">{selectedTripForDetails.driverNameAr}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">الحافلة والسعة:</span>
                <span className="font-bold text-slate-800 font-mono">
                  {selectedTripForDetails.busPlate} ({selectedTripForDetails.capacity} مقعد)
                </span>
              </div>
            </div>

            {/* Manifest Student List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>كشف الطلاب المسجلين بالرحلة ({(selectedTripForDetails.manifest || []).length} طالب):</span>
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  صعد الحافلة: {(selectedTripForDetails.manifest || []).filter(m => m.boardedStatus === 'boarded').length}
                </span>
              </div>

              {(selectedTripForDetails.manifest || []).length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl text-slate-400 text-xs">
                  لا يوجد طلاب مسجلون على كشف هذه الرحلة حتى الآن.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">اسم الطالب</th>
                        <th className="py-2.5 px-3">محطة الصعود</th>
                        <th className="py-2.5 px-3">الهاتف</th>
                        <th className="py-2.5 px-3 text-center">تأكيد الحضور</th>
                        <th className="py-2.5 px-3 text-center">حالة الصعود</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedTripForDetails.manifest || []).map((student, idx) => (
                        <tr key={student.studentId || idx} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {student.studentName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {student.stationNameAr}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            <a href={`tel:${student.phone}`} className="text-emerald-700 hover:underline">
                              {student.phone}
                            </a>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              student.rsvpStatus === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : student.rsvpStatus === 'whatsapp_reported'
                                ? 'bg-green-100 text-green-800'
                                : student.rsvpStatus === 'excused'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {student.rsvpStatus === 'confirmed' && 'مؤكد بالهاتف'}
                              {student.rsvpStatus === 'whatsapp_reported' && 'واتساب'}
                              {student.rsvpStatus === 'excused' && 'معتذر'}
                              {student.rsvpStatus === 'unconfirmed' && 'غير مؤكد'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              student.boardedStatus === 'boarded'
                                ? 'bg-emerald-600 text-white'
                                : student.boardedStatus === 'no_show'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {student.boardedStatus === 'boarded' && 'صعد الباص'}
                              {student.boardedStatus === 'no_show' && 'لم يحضر'}
                              {student.boardedStatus === 'waiting' && 'في الانتظار'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTripForDetails(null)}
                className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Start New Operating Day Modal */}
      {showNewDayModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900">بدء وتجهيز يوم تشغيل جديد</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewDayModal(false)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2 leading-relaxed">
              <p>
                <strong>الأمان والأرشفة:</strong> عند بدء يوم تشغيل جديد، يتم الاحتفاظ بجميع بيانات وسجلات اليوم السابق في الأرشيف دون حذف أي رحلة أو اشتراك أو مستخدم.
              </p>
              <p>
                سيتم تجهيز رحلات اليوم الجديد وفق خطوط الجامعات المعتمدة وتجهيز كشوف الركاب لليوم المختار.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">حدد تاريخ يوم التشغيل الجديد:</label>
              <input
                type="date"
                value={newDayInputDate}
                onChange={(e) => setNewDayInputDate(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-800 bg-white"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewDayModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newDayInputDate) return;
                  startNewOperatingDay(newDayInputDate);
                  setFilterDate(newDayInputDate);
                  setShowNewDayModal(false);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد وبدء اليوم الجديد</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. View Slot Students Modal (PDF Page 4 & 9) */}
      {selectedSlotForStudents && (() => {
        const allStudents = selectedSlotForStudents.registeredStudents || [];
        const boardedCount = allStudents.filter(m => m.boardedStatus === 'boarded').length;
        const waitingCount = allStudents.filter(m => m.boardedStatus === 'waiting').length;
        const unassignedCarCount = allStudents.filter(m => {
          const stTrip = selectedSlotForStudents.tripsInSlot.find(t => (t.manifest || []).some(x => x.studentId === m.studentId));
          return !stTrip || !stTrip.busPlate;
        }).length;

        const filteredModalStudents = allStudents.filter(m => {
          if (modalStatusFilter === 'boarded' && m.boardedStatus !== 'boarded') return false;
          if (modalStatusFilter === 'waiting' && m.boardedStatus !== 'waiting') return false;
          if (modalStatusFilter === 'no_show' && m.boardedStatus !== 'no_show') return false;
          if (modalStationFilter !== 'all' && m.stationNameAr !== modalStationFilter) return false;
          
          if (modalBusFilter !== 'all') {
            const stTrip = selectedSlotForStudents.tripsInSlot.find(t => (t.manifest || []).some(x => x.studentId === m.studentId));
            if (!stTrip || stTrip.busPlate !== modalBusFilter) return false;
          }

          if (modalStudentSearch.trim()) {
            if (!matchesArabicSearch(modalStudentSearch, m.studentName, m.phone, m.stationNameAr)) {
              return false;
            }
          }

          return true;
        });

        const uniqueModalStations = Array.from(new Set(allStudents.map(m => m.stationNameAr).filter(Boolean)));
        const uniqueModalBuses = Array.from(new Set(selectedSlotForStudents.tripsInSlot.map(t => t.busPlate).filter(Boolean)));

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 text-right overflow-hidden">
              
              <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      كشف ركاب الموعد: {selectedSlotForStudents.time} - {selectedSlotForStudents.lineNameAr}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedSlotForStudents.universityNameAr} ({selectedSlotForStudents.direction === 'to_university' ? 'ذهاب للجامعة' : 'عودة للمنزل'})
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlotForStudents(null);
                    setModalStudentSearch('');
                    setModalStationFilter('all');
                    setModalBusFilter('all');
                    setModalStatusFilter('all');
                  }}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-slate-100 bg-white">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">إجمالي المسجلين</span>
                  <div className="text-xl font-black text-slate-900 font-mono">{allStudents.length} طالب</div>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 font-bold block">ركبوا السيارة</span>
                  <div className="text-xl font-black text-emerald-700 font-mono">{boardedCount} طالب</div>
                </div>
                <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-600 font-bold block">لم يركبوا بعد</span>
                  <div className="text-xl font-black text-slate-800 font-mono">{waitingCount} طالب</div>
                </div>
                <div className={`p-2.5 rounded-xl border ${unassignedCarCount > 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-bold block text-slate-600">بدون سيارة محددة</span>
                  <div className={`text-xl font-black font-mono ${unassignedCarCount > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                    {unassignedCarCount} طالب
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="بحث بالاسم أو الهاتف..."
                    value={modalStudentSearch}
                    onChange={(e) => setModalStudentSearch(e.target.value)}
                    className="w-full pl-3 pr-8 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-hidden"
                  />
                </div>

                <select
                  value={modalStationFilter}
                  onChange={(e) => setModalStationFilter(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded-lg bg-white text-xs text-slate-700 outline-hidden font-medium"
                >
                  <option value="all">كل المحطات ({uniqueModalStations.length})</option>
                  {uniqueModalStations.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>

                <select
                  value={modalBusFilter}
                  onChange={(e) => setModalBusFilter(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded-lg bg-white text-xs text-slate-700 outline-hidden font-medium font-mono"
                >
                  <option value="all">كل السيارات</option>
                  {uniqueModalBuses.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                <select
                  value={modalStatusFilter}
                  onChange={(e) => setModalStatusFilter(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded-lg bg-white text-xs text-slate-700 outline-hidden font-medium"
                >
                  <option value="all">كل حالات الركوب</option>
                  <option value="boarded">ركب السيارة</option>
                  <option value="waiting">في الانتظار (لم يركب بعد)</option>
                  <option value="no_show">لم يحضر</option>
                </select>
              </div>

              <div className="overflow-auto flex-1 p-2">
                {filteredModalStudents.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    لا يوجد طلاب يطابقون خيارات البحث في هذا الموعد.
                  </div>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">اسم الطالب</th>
                        <th className="py-2.5 px-3">الهاتف</th>
                        <th className="py-2.5 px-3">المحطة المعتمدة</th>
                        <th className="py-2.5 px-3">السيارة المحددة</th>
                        <th className="py-2.5 px-3">السائق</th>
                        <th className="py-2.5 px-3 text-center">حالة الطالب بالكلمات الصريحة</th>
                        <th className="py-2.5 px-3 text-center">إجراء سريع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredModalStudents.map((student, idx) => {
                        const stTrip = selectedSlotForStudents.tripsInSlot.find(t => (t.manifest || []).some(x => x.studentId === student.studentId)) || selectedSlotForStudents.tripsInSlot[0];
                        const hasCarAssigned = !!(stTrip && stTrip.busPlate);

                        let statusText = 'مسجل';
                        let statusColor = 'bg-slate-100 text-slate-700';

                        if (student.boardedStatus === 'boarded') {
                          if (stTrip && (stTrip.status === 'completed' || (stTrip.stops && stTrip.stops[stTrip.stops.length - 1]?.status === 'arrived'))) {
                            statusText = selectedSlotForStudents.direction === 'to_university' ? 'وصل إلى الجامعة' : 'وصل إلى وجهته';
                            statusColor = 'bg-emerald-600 text-white';
                          } else {
                            statusText = 'ركب السيارة';
                            statusColor = 'bg-emerald-100 text-emerald-800 border border-emerald-300';
                          }
                        } else if (student.boardedStatus === 'no_show') {
                          statusText = 'لم يركب';
                          statusColor = 'bg-rose-100 text-rose-800 border border-rose-300';
                        } else if (hasCarAssigned) {
                          statusText = 'تم تحديد سيارة';
                          statusColor = 'bg-sky-100 text-sky-800 border border-sky-300';
                        } else if (student.rsvpStatus === 'unconfirmed') {
                          statusText = 'لم يتم التأكيد';
                          statusColor = 'bg-amber-100 text-amber-800 border border-amber-300';
                        }

                        return (
                          <tr key={student.studentId || idx} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentProfile({
                                    studentId: student.studentId,
                                    studentName: student.studentName,
                                    phone: student.phone,
                                    universityNameAr: selectedSlotForStudents.universityNameAr,
                                    lineNameAr: selectedSlotForStudents.lineNameAr,
                                    stationNameAr: student.stationNameAr,
                                    scheduledTime: selectedSlotForStudents.time,
                                    busPlate: stTrip?.busPlate || 'لم تحدد بعد',
                                    driverNameAr: stTrip?.driverNameAr || 'لم يحدد بعد',
                                    driverPhone: stTrip?.driverPhone || '',
                                    tripId: stTrip?.id || '',
                                    boardedStatus: student.boardedStatus,
                                    rsvpStatus: student.rsvpStatus
                                  });
                                }}
                                className="text-right font-black hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                                title="عرض ملف الطالب والاتصال السريع"
                              >
                                <span>{student.studentName}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                              <a href={`tel:${student.phone}`} className="text-emerald-700 hover:underline">
                                {student.phone}
                              </a>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{student.stationNameAr}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-800 font-bold whitespace-nowrap">
                              {stTrip?.busPlate || <span className="text-amber-600 font-sans text-[11px]">بدون سيارة</span>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {stTrip?.driverNameAr || <span className="text-slate-400">غير مسند</span>}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                                {statusText}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {stTrip && (
                                <div className="flex items-center justify-center gap-1">
                                  {student.boardedStatus !== 'boarded' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        batchUpdateStudentBoarding(stTrip.id, [student.studentId], 'boarded');
                                        if (addToast) addToast(`تم تسجيل ركوب الطالب ${student.studentName}`, 'success');
                                      }}
                                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded cursor-pointer"
                                    >
                                      تأكيد الركوب
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        batchUpdateStudentBoarding(stTrip.id, [student.studentId], 'waiting');
                                      }}
                                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] rounded cursor-pointer"
                                    >
                                      إلغاء الركوب
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">
                  معروض {filteredModalStudents.length} من أصل {allStudents.length} طالب
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSlotForStudents(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  إغلاق
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 2. Assign Vehicles & Drivers Modal (Prompt 1 Page 4) */}
      {selectedSlotForVehicles && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-right border border-slate-200">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Bus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تحديد سيارات وسائقي الموعد ({selectedSlotForVehicles.time})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedSlotForVehicles.lineNameAr} - {selectedSlotForVehicles.universityNameAr}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlotForVehicles(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">رحلات هذا الموعد:</span>
                <span className="font-bold text-slate-900">{selectedSlotForVehicles.tripsInSlot.length} رحلة</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">الحافلات المخصصة حالياً:</span>
                <span className="font-mono text-slate-900 font-bold">
                  {selectedSlotForVehicles.tripsInSlot.map(t => `${t.busPlate || 'بدون لوحة'} (${t.capacity}ر)`).join('، ')}
                </span>
              </div>
            </div>

            {/* Form to Assign Bus and Driver */}
            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اختر الرحلة المستهدفة:</label>
                <select
                  value={assignTargetTripId || selectedSlotForVehicles.tripsInSlot[0]?.id || ''}
                  onChange={(e) => setAssignTargetTripId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-medium text-slate-800"
                >
                  {selectedSlotForVehicles.tripsInSlot.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.code} - {t.driverNameAr || 'بدون سائق'} - {t.busPlate || 'بدون حافلة'} ({t.capacity} مقعد)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اختر الحافلة من الأسطول (سعات 14، 28، 33 راكب):</label>
                <select
                  value={assignBusId}
                  onChange={(e) => setAssignBusId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-medium text-slate-800 font-mono"
                >
                  <option value="">-- اختر حافلة متاحة للتشغيل --</option>
                  {buses.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.plateNumber} - سعة {b.capacity} راكب ({b.model || 'حافلة'}) {b.status === 'available' ? '✅ متاح' : '⚠️ بالخدمة'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اختر السائق المسند:</label>
                <select
                  value={assignDriverId}
                  onChange={(e) => setAssignDriverId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-medium text-slate-800"
                >
                  <option value="">-- اختر سائقاً معتمداً --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nameAr} ({d.phone}) {d.status === 'active' ? '✅ متاح' : '⚠️ في إجازة'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const targetDate = filterDate !== 'all' ? filterDate : activeOperatingDate;
                  autoAssignBusesForPlan(targetDate);
                  setSelectedSlotForVehicles(null);
                  if (addToast) addToast('تم توزيع وتعيين أسطول السيارات آلياً بنجاح.', 'success');
                }}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>توزيع أسطول آلي</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlotForVehicles(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = assignTargetTripId || selectedSlotForVehicles.tripsInSlot[0]?.id;
                    if (!targetId || !assignBusId || !assignDriverId) {
                      if (addToast) addToast('يرجى اختيار الحافلة والسائق معاً', 'error');
                      return;
                    }
                    swapBusOrDriver(targetId, assignBusId, assignDriverId, 'تخصيص سيارة وسائق معتمد لرحلة الموعد');
                    setSelectedSlotForVehicles(null);
                    setAssignBusId('');
                    setAssignDriverId('');
                    if (addToast) addToast('تم إسناد الحافلة والسائق للموعد بنجاح', 'success');
                  }}
                  className="px-5 py-2.5 bg-[#0F2537] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>تأكيد إسناد الحافلة والسائق</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. Student Profile & Direct Phone Call Modal (Prompt 2 Page 2) */}
      {selectedStudentProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right border border-slate-200">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">{selectedStudentProfile.studentName}</h3>
                  <span className="text-xs text-slate-500 font-medium">ملف الطالب وبيانات رحلة اليوم</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentProfile(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Student Information Grid */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">رقم الهاتف:</span>
                <span className="font-mono font-bold text-slate-900">{selectedStudentProfile.phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">الجامعة:</span>
                <span className="font-bold text-slate-800">{selectedStudentProfile.universityNameAr}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">خط السير والمحطة:</span>
                <span className="text-slate-800 font-medium">{selectedStudentProfile.lineNameAr} ({selectedStudentProfile.stationNameAr})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">موعد الرحلة:</span>
                <span className="font-mono font-bold text-slate-800">{selectedStudentProfile.scheduledTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">الحافلة المحددة:</span>
                <span className="font-mono font-bold text-indigo-700">{selectedStudentProfile.busPlate || 'لم تحدد بعد'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">السائق (مع من يركب):</span>
                <span className="font-bold text-slate-800">{selectedStudentProfile.driverNameAr || 'لم يحدد بعد'}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-bold">حالة الركوب الحالية:</span>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  selectedStudentProfile.boardedStatus === 'boarded' ? 'bg-emerald-600 text-white' :
                  selectedStudentProfile.boardedStatus === 'no_show' ? 'bg-rose-100 text-rose-800' :
                  'bg-slate-200 text-slate-800'
                }`}>
                  {selectedStudentProfile.boardedStatus === 'boarded' ? 'ركب السيارة' :
                   selectedStudentProfile.boardedStatus === 'no_show' ? 'لم يركب (غائب)' : 'في الانتظار'}
                </span>
              </div>
            </div>

            {/* Direct Call Actions */}
            <div className="space-y-2">
              <a
                href={`tel:${selectedStudentProfile.phone}`}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <PhoneCall className="w-4 h-4" />
                <span>اتصال مباشر بالطالب ({selectedStudentProfile.phone})</span>
              </a>

              {selectedStudentProfile.driverPhone && (
                <a
                  href={`tel:${selectedStudentProfile.driverPhone}`}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>اتصال بالسائق {selectedStudentProfile.driverNameAr} ({selectedStudentProfile.driverPhone})</span>
                </a>
              )}
            </div>

            {/* Quick Status Modifiers */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-500">تعديل الحالة:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudentProfile.tripId) {
                      batchUpdateStudentBoarding(selectedStudentProfile.tripId, [selectedStudentProfile.studentId], 'boarded');
                      setSelectedStudentProfile(prev => prev ? { ...prev, boardedStatus: 'boarded' } : null);
                      if (addToast) addToast(`تم تأكيد ركوب الطالب ${selectedStudentProfile.studentName}`, 'success');
                    }
                  }}
                  className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold rounded-lg cursor-pointer"
                >
                  ركب
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudentProfile.tripId) {
                      batchUpdateStudentBoarding(selectedStudentProfile.tripId, [selectedStudentProfile.studentId], 'waiting');
                      setSelectedStudentProfile(prev => prev ? { ...prev, boardedStatus: 'waiting' } : null);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer"
                >
                  انتظار
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudentProfile.tripId) {
                      batchUpdateStudentBoarding(selectedStudentProfile.tripId, [selectedStudentProfile.studentId], 'no_show');
                      setSelectedStudentProfile(prev => prev ? { ...prev, boardedStatus: 'no_show' } : null);
                      if (addToast) addToast(`تم تسجيل غياب الطالب ${selectedStudentProfile.studentName}`, 'info');
                    }
                  }}
                  className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-bold rounded-lg cursor-pointer"
                >
                  لم يحضر
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. Approve Plan Confirmation Modal (Prompt 1 Page 7) */}
      {showApproveConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right border border-slate-200">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">تأكيد اعتماد خطة الرحلات رسمياً</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowApproveConfirmModal(false)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5 leading-relaxed text-slate-700">
              <p className="font-bold text-slate-900">
                مراجعة الجاهزية التشغيلية لليوم المحدد ({filterDate === 'all' ? activeOperatingDate : filterDate}):
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span>الطلاب المسجلون:</span>
                  <strong className="font-mono">{studentsRegisteredToday} طالب</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>السيارات المطلوبة:</span>
                  <strong className="font-mono text-indigo-700">{carsNeededToday} سيارة</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>السيارات المحددة:</span>
                  <strong className="font-mono text-emerald-700">{carsAssignedToday} سيارة</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>عجز السيارات:</span>
                  <strong className={`font-mono ${carsShortageToday > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {carsShortageToday > 0 ? `نقص ${carsShortageToday} سيارة` : '0 (مكتملة 100%)'}
                  </strong>
                </div>
              </div>

              {carsShortageToday > 0 && (
                <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-bold text-[11px] flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>تنبيه: يوجد نقص في تغطية السيارات اليوم. يُرجى التأكد من استئجار أو توفير سيارات إضافية قبل النشر.</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApproveConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                مراجعة وتعديل الخطة
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetDate = filterDate !== 'all' ? filterDate : activeOperatingDate;
                  approveDailyPlan(targetDate);
                  setShowApproveConfirmModal(false);
                  if (addToast) addToast(`تم اعتماد خطة التشغيل ونشر المواعيد بنجاح لتاريخ ${targetDate}.`, 'success');
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد الاعتماد ونشر المواعيد</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. Clickable Summary Card Detail Modal */}
      {summaryModalType && (() => {
        const modalTitles: Record<NonNullable<typeof summaryModalType>, string> = {
          registered_today: 'تفاصيل الطلاب المسجلين اليوم',
          cars_needed: 'تفاصيل السيارات المطلوبة حسب كل موعد ومسار',
          cars_assigned: 'السيارات والسائقون المخصصون للرحلات اليوم',
          cars_shortage: 'تفاصيل العجز في السيارات والمواعيد المحتاجة لتغطية',
          students_no_car: 'تفاصيل المواعيد التي بها عجز مقاعد للطلاب',
          finished_uni: 'الطلاب الذين أنهوا الجامعة وجاهزون للعودة',
          inside_waiting_buses: 'الطلاب المتواجدون داخل السيارات بالخارج الآن',
          departed_home_students: 'الطلاب الذين غادروا الجامعة بالفعل (روّحوا)',
          departed_home_buses: 'حافلات العودة التي انطلقت من الجامعة بالفعل'
        };

        const isBusSlotView = summaryModalType === 'cars_needed' || summaryModalType === 'cars_shortage' || summaryModalType === 'students_no_car';
        const isTripsView = summaryModalType === 'cars_assigned' || summaryModalType === 'departed_home_buses';

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 text-right overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                <div>
                  <h3 className="text-base font-black text-slate-900">{modalTitles[summaryModalType]}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    عرض مباشر للبيانات التشغيلية الفعلية مع إمكانية البحث والاتصال السريع.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSummaryModalType(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3.5 border-b border-slate-100 bg-white flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={summaryModalSearch}
                    onChange={(e) => setSummaryModalSearch(e.target.value)}
                    placeholder="بحث بالاسم، الهاتف، الحافلة، السائق، الجامعة، الخط..."
                    className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white outline-hidden"
                  />
                </div>
                {isBusSlotView && (
                  <button
                    type="button"
                    onClick={() => { setSummaryModalType(null); setActiveTab('fleet_planning'); }}
                    className="px-3.5 py-2 bg-[#0F2537] text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    فتح التخصيص الآلي الكامل ←
                  </button>
                )}
              </div>

              <div className="overflow-auto flex-1 p-4">
                {summaryModalType === 'registered_today' && (() => {
                  const rows = allPassengersToday.filter(p =>
                    !summaryModalSearch.trim() ||
                    matchesArabicSearch(summaryModalSearch, p.studentName, p.phone, p.universityNameAr, p.lineNameAr, p.busPlate, p.driverNameAr, p.scheduledStationNameAr)
                  );
                  return rows.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">لا توجد سجلات طلاب مطابقة.</div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">الطالب</th>
                          <th className="py-2.5 px-3">الهاتف</th>
                          <th className="py-2.5 px-3">الجامعة والخط</th>
                          <th className="py-2.5 px-3">الموعد والحافلة</th>
                          <th className="py-2.5 px-3">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((r, i) => (
                          <tr key={`${r.tripId}-${r.studentId}-${i}`} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{r.studentName}</td>
                            <td className="py-2.5 px-3 font-mono">
                              <a href={`tel:${r.phone}`} className="text-emerald-700 hover:underline">{r.phone}</a>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-800">{r.universityNameAr}</div>
                              <div className="text-[11px] text-slate-500">{r.lineNameAr} ({r.scheduledStationNameAr})</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              <div>{r.scheduledTime} ({r.direction === 'to_university' ? 'ذهاب' : 'عودة'})</div>
                              <div className="text-[11px] text-slate-500">{r.busPlate} · {r.driverNameAr}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.boardedStatus === 'boarded' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {r.boardedStatus === 'boarded' ? 'ركب الحافلة' : 'مسجل'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}

                {isBusSlotView && (() => {
                  const rows = fleetDemandTableData.rows.filter(r => {
                    if (summaryModalType === 'cars_shortage' && r.busesShortage <= 0) return false;
                    if (summaryModalType === 'students_no_car' && r.seatShortage <= 0) return false;
                    if (summaryModalSearch.trim()) {
                      return matchesArabicSearch(summaryModalSearch, r.universityNameAr, r.lineNameAr, r.time, r.assignedPlates);
                    }
                    return true;
                  });
                  return rows.length === 0 ? (
                    <div className="text-center py-10 text-xs text-emerald-700 font-bold bg-emerald-50 rounded-2xl border border-emerald-200">
                      ممتاز! لا توجد حالات عجز في هذا المؤشر حالياً.
                    </div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">الموعد والاتجاه</th>
                          <th className="py-2.5 px-3">الجامعة والخط</th>
                          <th className="py-2.5 px-3 text-center">الطلاب</th>
                          <th className="py-2.5 px-3 text-center">مطلوب / محدد</th>
                          <th className="py-2.5 px-3">السيارات والعجز</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(r => (
                          <tr key={r.slotKey} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {r.time} ({r.direction === 'to_university' ? 'ذهاب' : 'عودة'})
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-800">{r.universityNameAr}</div>
                              <div className="text-[11px] text-slate-500">{r.lineNameAr}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold">{r.registeredCount}</td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              {r.busesNeeded} / {r.assignedBusesCount}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-mono text-[11px] text-slate-700">{r.assignedPlates || 'بدون سيارة'}</div>
                              {r.seatShortage > 0 && (
                                <span className="text-[10px] font-bold text-rose-700">عجز {r.seatShortage} مقعد</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}

                {isTripsView && (() => {
                  const baseTrips = summaryModalType === 'departed_home_buses' ? returnCampusLive.busesDepartedHome : filteredTrips;
                  const rows = baseTrips.filter(t =>
                    !summaryModalSearch.trim() ||
                    matchesArabicSearch(summaryModalSearch, t.code, t.busPlate, t.driverNameAr, t.driverPhone, t.lineNameAr, t.universityNameAr, t.scheduledTime)
                  );
                  return rows.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">لا توجد حافلات مطابقة حالياً.</div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">الحافلة والسعة</th>
                          <th className="py-2.5 px-3">السائق والهاتف</th>
                          <th className="py-2.5 px-3">الجامعة والخط</th>
                          <th className="py-2.5 px-3">الموعد</th>
                          <th className="py-2.5 px-3 text-center">الصعود</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(t => {
                          const boarded = (t.manifest || []).filter(m => m.boardedStatus === 'boarded').length;
                          return (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                {t.busPlate} ({t.capacity} ر)
                                <div className="text-[10px] text-slate-400">{t.code}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">{t.driverNameAr}</div>
                                <a href={`tel:${t.driverPhone}`} className="text-[11px] font-mono text-emerald-700 hover:underline">{t.driverPhone}</a>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">{t.universityNameAr}</div>
                                <div className="text-[11px] text-slate-500">{t.lineNameAr}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono">{t.scheduledTime}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">{boarded} طالب</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}

                {(summaryModalType === 'finished_uni' || summaryModalType === 'inside_waiting_buses' || summaryModalType === 'departed_home_students') && (() => {
                  const sourceList =
                    summaryModalType === 'finished_uni'
                      ? returnCampusLive.finishedUniStudents
                      : summaryModalType === 'inside_waiting_buses'
                      ? returnCampusLive.studentsInsideWaitingBuses
                      : returnCampusLive.studentsDepartedHome;
                  const rows = sourceList.filter(s =>
                    !summaryModalSearch.trim() ||
                    matchesArabicSearch(summaryModalSearch, s.studentName, s.phone, s.universityNameAr, s.lineNameAr, s.stationNameAr, s.busPlate, s.driverNameAr)
                  );
                  return rows.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">لا يوجد طلاب في هذه القائمة حالياً.</div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">اسم الطالب</th>
                          <th className="py-2.5 px-3">الهاتف</th>
                          <th className="py-2.5 px-3">الجامعة والخط</th>
                          <th className="py-2.5 px-3">الحافلة والسائق</th>
                          <th className="py-2.5 px-3">الموعد / التحديث</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((s, idx) => (
                          <tr key={`${s.studentId}-${idx}`} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{s.studentName}</td>
                            <td className="py-2.5 px-3 font-mono">
                              <a href={`tel:${s.phone}`} className="text-emerald-700 hover:underline">{s.phone}</a>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-800">{s.universityNameAr}</div>
                              <div className="text-[11px] text-slate-500">{s.lineNameAr} ({s.stationNameAr})</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-mono font-bold text-slate-900">{s.busPlate}</div>
                              <div className="text-[11px] text-slate-500">
                                {s.driverNameAr}{' '}
                                {s.driverPhone && (
                                  <a href={`tel:${s.driverPhone}`} className="text-emerald-700 hover:underline font-mono">
                                    ({s.driverPhone})
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                              <div>{s.scheduledTime}</div>
                              {'readyForReturnAt' in s && s.readyForReturnAt && (
                                <span className="text-emerald-700 font-bold">تأكيد: {s.readyForReturnAt}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSummaryModalType(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Per-University Waiting-Return Car Allocation Modal */}
      {showWaitingAllocModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4 text-right border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">تخصيص سيارة انتظار عودة للجامعة</h3>
              <button
                type="button"
                onClick={() => setShowWaitingAllocModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsAllocatingWaitingBus(true);
                try {
                  await allocateWaitingReturnBus({
                    universityId: allocUniId,
                    lineId: allocLineId,
                    busId: allocUseAdHoc ? undefined : allocBusId,
                    driverId: allocUseAdHoc ? undefined : allocDriverId,
                    adHocDriverName: allocUseAdHoc ? allocAdHocDriverName : undefined,
                    adHocDriverPhone: allocUseAdHoc ? allocAdHocDriverPhone : undefined,
                    adHocBusPlate: allocUseAdHoc ? allocAdHocPlate : undefined,
                    adHocCapacity: allocUseAdHoc ? allocAdHocCapacity : undefined,
                  });
                  setShowWaitingAllocModal(false);
                } finally {
                  setIsAllocatingWaitingBus(false);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-slate-700 font-bold block mb-1">الجامعة:</label>
                <select
                  value={allocUniId}
                  onChange={(e) => {
                    setAllocUniId(e.target.value);
                    const matched = lines.find(l => l.universityId === e.target.value);
                    if (matched) setAllocLineId(matched.id);
                  }}
                  className="w-full p-2.5 border rounded-xl bg-white font-bold"
                  required
                >
                  {universities.map(u => (
                    <option key={u.id} value={u.id}>{u.nameAr}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">خط السير:</label>
                <select
                  value={allocLineId}
                  onChange={(e) => setAllocLineId(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-white font-bold"
                  required
                >
                  {lines.map(l => (
                    <option key={l.id} value={l.id}>{l.nameAr}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={allocUseAdHoc}
                  onChange={(e) => setAllocUseAdHoc(e.target.checked)}
                  className="w-4 h-4 accent-amber-600"
                />
                <span>تعيين سيارة وسائق طوارئ سريع بدون تسجيل حساب</span>
              </label>

              {!allocUseAdHoc ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-700 font-bold block mb-1">السائق:</label>
                    <select
                      value={allocDriverId}
                      onChange={(e) => setAllocDriverId(e.target.value)}
                      className="w-full p-2.5 border rounded-xl bg-white font-bold"
                      required
                    >
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>كابتن {d.nameAr}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-700 font-bold block mb-1">السيارة:</label>
                    <select
                      value={allocBusId}
                      onChange={(e) => setAllocBusId(e.target.value)}
                      className="w-full p-2.5 border rounded-xl bg-white font-mono"
                      required
                    >
                      {buses.map(b => (
                        <option key={b.id} value={b.id}>{b.plateNumber} ({b.capacity}ر)</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="اسم السائق *"
                    value={allocAdHocDriverName}
                    onChange={(e) => setAllocAdHocDriverName(e.target.value)}
                    className="p-2.5 border rounded-xl font-bold"
                  />
                  <input
                    type="tel"
                    placeholder="رقم الهاتف"
                    value={allocAdHocDriverPhone}
                    onChange={(e) => setAllocAdHocDriverPhone(e.target.value)}
                    className="p-2.5 border rounded-xl font-mono"
                  />
                  <input
                    type="text"
                    required
                    placeholder="لوحة السيارة *"
                    value={allocAdHocPlate}
                    onChange={(e) => setAllocAdHocPlate(e.target.value)}
                    className="p-2.5 border rounded-xl font-mono"
                  />
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={allocAdHocCapacity}
                    onChange={(e) => setAllocAdHocCapacity(Number(e.target.value) || 14)}
                    className="p-2.5 border rounded-xl font-mono"
                    placeholder="السعة"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isAllocatingWaitingBus}
                  className="flex-1 py-2.5 bg-[#0F2537] hover:bg-slate-800 text-white font-black rounded-xl cursor-pointer"
                >
                  {isAllocatingWaitingBus ? 'جارٍ التخصيص...' : 'تخصيص سيارة الانتظار الآن'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWaitingAllocModal(false)}
                  className="py-2.5 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
