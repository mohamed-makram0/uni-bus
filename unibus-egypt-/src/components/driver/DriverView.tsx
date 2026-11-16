import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { TripStopStatus } from '../../types';
import { matchesArabicSearch } from '../../utils/arabicSearch';
import { computeWaitingBusMetrics } from '../../utils/waitingBusMetrics';
import {
  Bus,
  MapPin,
  Clock,
  Phone,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Users,
  Search,
  Wifi,
  WifiOff,
  UserCheck,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  UserPlus,
  ArrowRight,
  Sparkles,
  Navigation,
  RefreshCw,
  UploadCloud
} from 'lucide-react';

const OFFLINE_QUEUE_KEY = 'unibus_driver_offline_queue';

type DriverOfflineAction =
  | {
      id: string;
      tripId: string;
      type: 'board_waiting';
      student: {
        studentId: string;
        studentName: string;
        phone: string;
        stationId?: string;
        stationNameAr?: string;
        studentUniversityId?: string;
        studentUniversityNameAr?: string;
      };
      queuedAt: string;
    }
  | {
      id: string;
      tripId: string;
      type: 'check_in';
      studentId: string;
      actualStation?: { id: string; nameAr: string };
      queuedAt: string;
    }
  | {
      id: string;
      tripId: string;
      type: 'toggle_stop';
      stopId: string;
      queuedAt: string;
    }
  | {
      id: string;
      tripId: string;
      type: 'confirm_return_departure';
      queuedAt: string;
    };

const loadOfflineQueue = (): DriverOfflineAction[] => {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOfflineQueue = (queue: DriverOfflineAction[]) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage quota errors cleanly
  }
};

export const DriverView: React.FC = () => {
  const {
    currentUser,
    canSwitchRoles,
    trips,
    drivers,
    users,
    universities,
    lines,
    activeOperatingDate,
    driverUpdateStop,
    driverToggleStopCheck,
    driverCheckInStudent,
    driverBoardWaitingStudent,
    driverConfirmReturnDeparture,
    markCrossUniversityHandoff,
    reportIncident,
    addToast
  } = useApp();

  // Resolve real driver id even if logged in via userId
  const driverProfile = drivers.find(d => d.userId === currentUser.id || d.id === currentUser.id);
  const resolvedDriverId = driverProfile?.id || currentUser.id || 'drv-1';
  const todayTrips = trips.filter(t => t.date === activeOperatingDate && t.status !== 'cancelled' && t.status !== 'merged');
  const driverTripsPool = todayTrips.length > 0 ? todayTrips : trips.filter(t => t.status !== 'cancelled' && t.status !== 'merged');

  // Assigned trips for this driver (morning & return); General Supervisor/Admin/SuperAdmin can also select any active trip
  const myAssignedTrips = useMemo(() => {
    const mine = driverTripsPool.filter(
      t => t.driverId === resolvedDriverId || t.driverId === currentUser.id
    );
    if (canSwitchRoles) {
      const rest = driverTripsPool.filter(t => !mine.some(m => m.id === t.id));
      return [...mine, ...rest];
    }
    if (mine.length > 0) return mine;
    return trips.filter(t => (t.driverId === resolvedDriverId || t.driverId === 'drv-1') && t.status !== 'cancelled' && t.status !== 'merged');
  }, [driverTripsPool, resolvedDriverId, currentUser.id, canSwitchRoles, trips]);

  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [driverScreenMode, setDriverScreenMode] = useState<'auto' | 'return_waiting' | 'timeline'>('auto');
  const [waitingSearch, setWaitingSearch] = useState('');

  // Active trip defaults to first non-completed assigned trip, or selected assigned trip
  const myTrip =
    myAssignedTrips.find(t => t.id === selectedTripId) ||
    myAssignedTrips.find(t => t.status !== 'completed') ||
    myAssignedTrips[0] ||
    trips[0];

  const [searchQuery, setSearchQuery] = useState('');
  const [showCrossStationModal, setShowCrossStationModal] = useState(false);
  const [crossStationTargetId, setCrossStationTargetId] = useState<string>('');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState<'delay' | 'breakdown'>('delay');
  const [incidentReason, setIncidentReason] = useState('');
  const [delayMins, setDelayMins] = useState(10);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineQueue, setOfflineQueue] = useState<DriverOfflineAction[]>(() => loadOfflineQueue());
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [optimisticBoardingOverrides, setOptimisticBoardingOverrides] = useState<Record<string, boolean>>({});
  const [optimisticStopDoneOverrides, setOptimisticStopDoneOverrides] = useState<Record<string, boolean>>({});
  const [optimisticDepartedTrips, setOptimisticDepartedTrips] = useState<Record<string, boolean>>({});
  const syncingRef = useRef(false);

  // Persist offline queue in localStorage whenever it changes
  useEffect(() => {
    saveOfflineQueue(offlineQueue);
  }, [offlineQueue]);

  // Listen to browser online/offline network transitions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const flushOfflineQueue = useCallback(async () => {
    if (!isOnline || offlineQueue.length === 0 || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncingQueue(true);
    const pendingSnapshot = [...offlineQueue];
    let syncedCount = 0;

    try {
      for (const action of pendingSnapshot) {
        if (action.type === 'board_waiting') {
          await driverBoardWaitingStudent(action.tripId, action.student);
        } else if (action.type === 'check_in') {
          driverCheckInStudent(action.tripId, action.studentId, action.actualStation);
        } else if (action.type === 'toggle_stop') {
          driverToggleStopCheck(action.tripId, action.stopId);
        } else if (action.type === 'confirm_return_departure') {
          await driverConfirmReturnDeparture(action.tripId);
        }
        syncedCount += 1;
        setOfflineQueue(prev => prev.filter(item => item.id !== action.id));
      }

      setOptimisticBoardingOverrides({});
      setOptimisticStopDoneOverrides({});
      setOptimisticDepartedTrips({});
      if (syncedCount > 0) {
        addToast(`تمت مزامنة ${syncedCount} إجراء أوفلاين بنجاح مع غرفة العمليات`, 'success');
      }
    } catch {
      addToast('تعذرت مزامنة بعض الإجراءات المؤجلة — سيتم إعادة المحاولة تلقائياً', 'error');
    } finally {
      syncingRef.current = false;
      setIsSyncingQueue(false);
    }
  }, [
    isOnline,
    offlineQueue,
    driverBoardWaitingStudent,
    driverCheckInStudent,
    driverToggleStopCheck,
    driverConfirmReturnDeparture,
    addToast
  ]);

  // Auto-sync queued offline actions as soon as connection returns
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0 && !syncingRef.current) {
      void flushOfflineQueue();
    }
  }, [isOnline, offlineQueue.length, flushOfflineQueue]);

  const myLine = myTrip ? lines.find(l => l.id === myTrip.lineId) : undefined;
  const effectiveStops = useMemo<TripStopStatus[]>(() => {
    if (!myTrip) return [];
    if (myTrip.stops && myTrip.stops.length > 0) return myTrip.stops;
    if (!myLine?.stations) return [];
    const ordered = myTrip.direction === 'from_university' ? [...myLine.stations].reverse() : myLine.stations;
    return ordered.map((st, idx) => ({
      stopId: `gen-${myTrip.id}-${st.id}`,
      stationId: st.id,
      stationNameAr: st.nameAr,
      orderIndex: idx + 1,
      scheduledArrivalTime: myTrip.scheduledTime,
      actualArrivalTime: undefined,
      actualDepartureTime: undefined,
      status: myTrip.status === 'completed' ? 'departed' : 'pending'
    }));
  }, [myTrip, myLine]);

  const isStudentBoardedEffective = useCallback(
    (studentId: string, serverBoarded: boolean) => {
      if (!myTrip) return serverBoarded;
      const key = `${myTrip.id}:${studentId}`;
      return key in optimisticBoardingOverrides ? optimisticBoardingOverrides[key] : serverBoarded;
    },
    [myTrip, optimisticBoardingOverrides]
  );

  // Balanced student-to-car division target + departed/waiting campus pool for this date
  const campusMetricsToday = useMemo(
    () => computeWaitingBusMetrics(trips, myTrip?.date || activeOperatingDate),
    [trips, myTrip?.date, activeOperatingDate]
  );

  const myWaitingBusDivision = useMemo(() => {
    if (!myTrip) return null;
    return campusMetricsToday.waitingBuses.find(wb => wb.trip.id === myTrip.id) || null;
  }, [campusMetricsToday, myTrip]);

  // Cross-University Mismatch Detection on THIS driver's active trip (Red Alert!)
  const mismatchedStudentsOnTrip = useMemo(() => {
    if (!myTrip) return [];
    return (myTrip.manifest || [])
      .filter(m => {
        if (m.rsvpStatus === 'excused' || m.boardedStatus === 'no_show') return false;
        if (m.externalHandoffStatus === 'handed_off') return false;
        const userRec = users.find(u => u.id === m.studentId);
        const sUniId = m.studentUniversityId || userRec?.universityId;
        return Boolean(sUniId && myTrip.universityId && sUniId !== myTrip.universityId);
      })
      .map(m => {
        const userRec = users.find(u => u.id === m.studentId);
        const sUniId = m.studentUniversityId || userRec?.universityId || '';
        const sUniName =
          m.studentUniversityNameAr ||
          universities.find(u => u.id === sUniId)?.nameAr ||
          'جامعة أخرى';
        return {
          ...m,
          studentUniversityId: sUniId,
          studentUniversityNameAr: sUniName,
        };
      });
  }, [myTrip, users, universities]);

  // Pool of eligible university/line students for 1-tap boarding in Return Waiting mode
  // Automatically deducts students who already departed home on an earlier return car (or boarded another waiting car)!
  const waitingReturnCandidates = useMemo(() => {
    if (!myTrip) return [];
    const departedIds = new Set(campusMetricsToday.departedHomeStudentIds);
    const boardedInOtherBusIds = new Set(
      campusMetricsToday.studentsInsideWaitingBuses
        .filter(s => s.tripId !== myTrip.id)
        .map(s => s.studentId)
    );

    const candidateMap = new Map<string, {
      studentId: string;
      studentName: string;
      phone: string;
      stationId: string;
      stationNameAr: string;
      lineId: string;
      studentUniversityId?: string;
      studentUniversityNameAr?: string;
      isInThisTrip: boolean;
      isBoardedInThisTrip: boolean;
      readyForReturn: boolean;
      readyForReturnAt?: string;
      boardedAt?: string;
      isDifferentUniversity: boolean;
    }>();

    // 1. Registered students at the same university (excluding departed or already in another car)
    users
      .filter(u => u.role === 'student' && (!myTrip.universityId || u.universityId === myTrip.universityId))
      .forEach(u => {
        if (departedIds.has(u.id) || boardedInOtherBusIds.has(u.id)) return;
        const uLine = lines.find(l => l.id === u.lineId);
        const uStation = uLine?.stations.find(s => s.id === u.stationId) || uLine?.stations[0];
        const sUniName = universities.find(uni => uni.id === u.universityId)?.nameAr;
        candidateMap.set(u.id, {
          studentId: u.id,
          studentName: u.name,
          phone: u.phone,
          stationId: uStation?.id || 'st-default',
          stationNameAr: uStation?.nameAr || 'محطة الخط',
          lineId: u.lineId || myTrip.lineId,
          studentUniversityId: u.universityId,
          studentUniversityNameAr: sUniName,
          isInThisTrip: false,
          isBoardedInThisTrip: false,
          readyForReturn: false,
          isDifferentUniversity: Boolean(u.universityId && myTrip.universityId && u.universityId !== myTrip.universityId),
        });
      });

    // 2. Any student appearing in today's trips for the same university (picks up readyForReturn flags)
    trips
      .filter(t => t.date === myTrip.date && t.universityId === myTrip.universityId && t.status !== 'cancelled')
      .forEach(t => {
        (t.manifest || []).forEach(m => {
          if (m.externalHandoffStatus === 'handed_off') return;
          if (departedIds.has(m.studentId) || (boardedInOtherBusIds.has(m.studentId) && t.id !== myTrip.id)) return;
          const prev = candidateMap.get(m.studentId);
          const sUniId = m.studentUniversityId || prev?.studentUniversityId;
          const sUniName = m.studentUniversityNameAr || prev?.studentUniversityNameAr || (sUniId ? universities.find(u => u.id === sUniId)?.nameAr : undefined);
          candidateMap.set(m.studentId, {
            studentId: m.studentId,
            studentName: m.studentName,
            phone: m.phone,
            stationId: m.stationId,
            stationNameAr: m.stationNameAr,
            lineId: t.lineId,
            studentUniversityId: sUniId,
            studentUniversityNameAr: sUniName,
            isInThisTrip: prev?.isInThisTrip || t.id === myTrip.id,
            isBoardedInThisTrip: prev?.isBoardedInThisTrip || (t.id === myTrip.id && m.boardedStatus === 'boarded'),
            readyForReturn: Boolean(prev?.readyForReturn || m.readyForReturn),
            readyForReturnAt: m.readyForReturnAt || prev?.readyForReturnAt,
            boardedAt: t.id === myTrip.id ? m.boardedAt : prev?.boardedAt,
            isDifferentUniversity: Boolean(sUniId && myTrip.universityId && sUniId !== myTrip.universityId),
          });
        });
      });

    // 3. Ensure myTrip.manifest entries override with authoritative boarding status
    (myTrip.manifest || []).forEach(m => {
      if (m.externalHandoffStatus === 'handed_off') return;
      const boardedNow = isStudentBoardedEffective(m.studentId, m.boardedStatus === 'boarded');
      if (departedIds.has(m.studentId) && !boardedNow) return;
      const prev = candidateMap.get(m.studentId);
      const sUniId = m.studentUniversityId || prev?.studentUniversityId;
      const sUniName = m.studentUniversityNameAr || prev?.studentUniversityNameAr || (sUniId ? universities.find(u => u.id === sUniId)?.nameAr : undefined);
      candidateMap.set(m.studentId, {
        studentId: m.studentId,
        studentName: m.studentName,
        phone: m.phone,
        stationId: m.stationId,
        stationNameAr: m.stationNameAr,
        lineId: myTrip.lineId,
        studentUniversityId: sUniId,
        studentUniversityNameAr: sUniName,
        isInThisTrip: true,
        isBoardedInThisTrip: boardedNow,
        readyForReturn: Boolean(prev?.readyForReturn || m.readyForReturn),
        readyForReturnAt: m.readyForReturnAt || prev?.readyForReturnAt,
        boardedAt: m.boardedAt,
        isDifferentUniversity: Boolean(sUniId && myTrip.universityId && sUniId !== myTrip.universityId),
      });
    });

    // Apply any offline optimistic waiting-pool boarding overrides
    Object.entries(optimisticBoardingOverrides).forEach(([key, val]) => {
      if (!key.startsWith(`${myTrip.id}:`)) return;
      const sid = key.slice(myTrip.id.length + 1);
      const existing = candidateMap.get(sid);
      if (existing) {
        candidateMap.set(sid, { ...existing, isBoardedInThisTrip: val });
      }
    });

    return Array.from(candidateMap.values())
      .filter(c =>
        !waitingSearch.trim() ||
        matchesArabicSearch(waitingSearch, c.studentName, c.phone, c.stationNameAr)
      )
      .sort((a, b) => {
        const score = (x: typeof a) => {
          if (x.readyForReturn && !x.isBoardedInThisTrip) return 0;
          if (x.isInThisTrip && !x.isBoardedInThisTrip) return 1;
          if (x.isBoardedInThisTrip) return 2;
          if (x.lineId === myTrip.lineId) return 3;
          return 4;
        };
        return score(a) - score(b);
      });
  }, [users, lines, universities, trips, myTrip, waitingSearch, campusMetricsToday, optimisticBoardingOverrides, isStudentBoardedEffective]);

  if (!myTrip) {
    return (
      <div className="max-w-md mx-auto p-8 text-center bg-white rounded-3xl border border-slate-200 mt-6 shadow-sm">
        <Bus className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">لا توجد رحلة مسندة إليك حالياً</h2>
        <p className="text-xs text-slate-500 mt-1">تُسند الرحلات آلياً من المشرف التشغيلي وفق جدول التشغيل اليومي.</p>
      </div>
    );
  }

  const isStopDepartedEffective = (stopId: string, serverStatus: TripStopStatus['status']) => {
    const key = `${myTrip.id}:${stopId}`;
    return key in optimisticStopDoneOverrides ? optimisticStopDoneOverrides[key] : serverStatus === 'departed';
  };

  const safeBoardWaitingStudent = (
    tripId: string,
    student: {
      studentId: string;
      studentName: string;
      phone: string;
      stationId?: string;
      stationNameAr?: string;
      studentUniversityId?: string;
      studentUniversityNameAr?: string;
    },
    currentlyBoarded: boolean
  ) => {
    if (isOnline) {
      void driverBoardWaitingStudent(tripId, student);
      return;
    }
    const key = `${tripId}:${student.studentId}`;
    setOptimisticBoardingOverrides(prev => ({ ...prev, [key]: !currentlyBoarded }));
    setOfflineQueue(prev => [
      ...prev,
      {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tripId,
        type: 'board_waiting',
        student,
        queuedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    addToast('وضع أوفلاين: تم حفظ تسجيل الراكب وسيُرسل فور عودة الشبكة', 'info');
  };

  const safeCheckInStudent = (
    tripId: string,
    studentId: string,
    actualStation: { id: string; nameAr: string } | undefined,
    currentlyBoarded: boolean
  ) => {
    if (isOnline) {
      driverCheckInStudent(tripId, studentId, actualStation);
      return;
    }
    const key = `${tripId}:${studentId}`;
    setOptimisticBoardingOverrides(prev => ({ ...prev, [key]: !currentlyBoarded }));
    setOfflineQueue(prev => [
      ...prev,
      {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tripId,
        type: 'check_in',
        studentId,
        actualStation,
        queuedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    addToast('وضع أوفلاين: تم حفظ تحضير الطالب محلياً للمزامنة لاحقاً', 'info');
  };

  const safeToggleStopCheck = (tripId: string, stopId: string, currentlyDeparted: boolean) => {
    if (isOnline) {
      driverToggleStopCheck(tripId, stopId);
      return;
    }
    const key = `${tripId}:${stopId}`;
    setOptimisticStopDoneOverrides(prev => ({ ...prev, [key]: !currentlyDeparted }));
    setOfflineQueue(prev => [
      ...prev,
      {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tripId,
        type: 'toggle_stop',
        stopId,
        queuedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    addToast('وضع أوفلاين: تم حفظ حالة المحطة محلياً للمزامنة التلقائية', 'info');
  };

  const safeConfirmReturnDeparture = (tripId: string) => {
    if (isOnline) {
      void driverConfirmReturnDeparture(tripId);
      return;
    }
    setOptimisticDepartedTrips(prev => ({ ...prev, [tripId]: true }));
    setOfflineQueue(prev => [
      ...prev,
      {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tripId,
        type: 'confirm_return_departure',
        queuedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    addToast('وضع أوفلاين: تم تسجيل انطلاق الباص وسيتم إعلام المشرف والطلاب فور الاتصال', 'info');
  };

  const currentStop = effectiveStops[myTrip.currentStopIndex] || effectiveStops[0];
  const nextStop = effectiveStops[myTrip.currentStopIndex + 1];
  const hasDepartedUniversity =
    Boolean(optimisticDepartedTrips[myTrip.id]) ||
    myTrip.status === 'completed' ||
    effectiveStops.some(s => isStopDepartedEffective(s.stopId, s.status));

  // Boarded & expected students counts (includes optimistic offline boarding updates)
  const manifestStudentIds = new Set(myTrip.manifest.map(m => m.studentId));
  const extraOptimisticBoardedCount = Object.entries(optimisticBoardingOverrides).filter(([k, val]) => {
    if (!val || !k.startsWith(`${myTrip.id}:`)) return false;
    const sid = k.slice(myTrip.id.length + 1);
    return !manifestStudentIds.has(sid);
  }).length;
  const boardedCount =
    myTrip.manifest.filter(m => isStudentBoardedEffective(m.studentId, m.boardedStatus === 'boarded')).length +
    extraOptimisticBoardedCount;
  const expectedTotalStudents = myTrip.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported');
  const totalExpectedCount = expectedTotalStudents.length;
  const spareSeats = Math.max(0, myTrip.capacity - boardedCount);

  // Effective UI screen mode: auto opens Return Waiting screen on active un-departed return trips
  const effectiveDriverMode: 'return_waiting' | 'timeline' =
    driverScreenMode === 'auto'
      ? (myTrip.direction === 'from_university' && !hasDepartedUniversity ? 'return_waiting' : 'timeline')
      : driverScreenMode;

  // Arabic-normalized search across ALL students in manifest
  const filteredManifestSearch = myTrip.manifest.filter(m =>
    matchesArabicSearch(
      searchQuery,
      m.studentName,
      m.phone,
      m.stationNameAr,
      m.actualBoardingStationNameAr
    )
  );

  const handleIncidentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentReason.trim()) return;

    reportIncident({
      tripId: myTrip.id,
      tripCode: myTrip.code,
      driverId: myTrip.driverId || currentUser.id,
      reportedById: currentUser.id,
      type: incidentType,
      description: incidentReason,
      reportedByRole: 'driver',
      reportedByName: currentUser.name,
      delayMinutes: incidentType === 'delay' ? delayMins : 20,
    });

    setShowIncidentModal(false);
    setIncidentReason('');
  };

  // Check in all expected students at a specific station in 1 click
  const handleCheckInAllStationStudents = (stationId: string, stationName: string) => {
    const stationPending = myTrip.manifest.filter(
      m =>
        m.stationId === stationId &&
        !isStudentBoardedEffective(m.studentId, m.boardedStatus === 'boarded') &&
        (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported')
    );
    stationPending.forEach(student => {
      safeCheckInStudent(myTrip.id, student.studentId, { id: stationId, nameAr: stationName }, false);
    });
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-40">
      
      {/* 1. Header: Strictly Assigned Trip Info & Live Capacity */}
      <div className="bg-[#0F2537] text-white rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shadow-md">
              <Bus className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold">{currentUser.name}</span>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full font-bold">
                  رحلة مسندة آلياً
                </span>
              </div>
              <span className="text-xs text-amber-300 font-mono font-bold block mt-0.5">
                حافلة {myTrip.busPlate} · {myTrip.lineNameAr} ({myTrip.scheduledTime})
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isOnline
                ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-600'
                : 'bg-rose-900/70 text-rose-300 border border-rose-600'
            }`}
            title="انقر لاختبار وضع عدم الاتصال"
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
            <span>{isOnline ? 'متصل ومحدث' : 'أوفلاين'}</span>
          </button>
        </div>

        {/* Operational Philosophy Banner: "المقاعد لا تخصص - أخذ من في المحطة حتى امتلاء السعة" */}
        <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700 text-xs text-slate-200 leading-relaxed">
          <div className="flex items-center justify-between font-bold text-amber-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-amber-400" />
              <span>نظام الركوب الحر وفق سعة الحافلة</span>
            </span>
            <span className="text-white font-mono bg-slate-700 px-2 py-0.5 rounded-md">
              سعة {myTrip.capacity} راكب
            </span>
          </div>
          <p className="text-[11px] text-slate-300">
            لا يتم تخصيص مقاعد مسبقة بأرقام؛ توجه للمحطة واصعد الطلاب المتواجدين بأسبقية الحضور حتى اكتمال سعة الباص.
          </p>
        </div>

        {/* Counters Strip */}
        <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
          <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <span className="text-[11px] text-slate-400 block">صعدوا الباص الآن</span>
            <span className="text-2xl font-black text-emerald-400 font-mono mt-0.5 block">
              {boardedCount}
            </span>
            <span className="text-[10px] text-slate-400">راكب داخل السيارة</span>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <span className="text-[11px] text-slate-400 block">المقاعد الشاغرة</span>
            <span className="text-2xl font-black text-amber-400 font-mono mt-0.5 block">
              {spareSeats}
            </span>
            <span className="text-[10px] text-slate-400">متاحة للصعود</span>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <span className="text-[11px] text-slate-400 block">إجمالي المتوقع</span>
            <span className="text-2xl font-black text-white font-mono mt-0.5 block">
              {totalExpectedCount}
            </span>
            <span className="text-[10px] text-slate-400">طالب مؤكد بالخط</span>
          </div>
        </div>
      </div>

      {/* RED CROSS-UNIVERSITY MISMATCH ALERT BANNER */}
      {mismatchedStudentsOnTrip.length > 0 && (
        <div className="bg-rose-600 text-white rounded-3xl p-4 border-2 border-rose-800 shadow-lg space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-white text-rose-600 flex items-center justify-center shrink-0 animate-pulse">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-black">
                  علامة حمراء: يوجد {mismatchedStudentsOnTrip.length} طالب في هذه الحافلة لا يتبعون نفس الجامعة ({myTrip.universityNameAr})!
                </h3>
                <p className="text-[11px] text-rose-100 mt-0.5 leading-relaxed">
                  يظهر هذا التنبيه للمدير والمشرف أيضاً لتنسيق التبادل مع مكتب أو سيارة أخرى. عند ركوبهم مع مكتب/سيارة أخرى اضغط على الزر أدناه لإزالة العلامة.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => markCrossUniversityHandoff(myTrip.id, mismatchedStudentsOnTrip.map(s => s.studentId))}
              className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 font-black text-[11px] rounded-xl shadow-xs shrink-0 cursor-pointer"
            >
              ركبوا مكتب آخر (إزالة للكل)
            </button>
          </div>

          <div className="space-y-1.5">
            {mismatchedStudentsOnTrip.map(st => (
              <div
                key={st.studentId}
                className="bg-rose-700/70 border border-rose-400/50 rounded-2xl p-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-black block truncate">{st.studentName}</span>
                  <span className="text-[11px] text-rose-100 block">
                    جامعته: <strong>{st.studentUniversityNameAr}</strong> · {st.phone}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => markCrossUniversityHandoff(myTrip.id, [st.studentId])}
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-rose-700 hover:text-emerald-800 font-black text-[11px] rounded-xl shrink-0 cursor-pointer"
                >
                  تم التسليم لمكتب/سيارة أخرى ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1.2 Assigned Trip Switcher (or full Fleet Trip Picker for General Supervisor / Admin) */}
      {canSwitchRoles && myAssignedTrips.length > 0 && (
        <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-1.5">
          <label className="text-[11px] font-black text-slate-600 block">
            تبديل سريع لأي سيارة / رحلة في الأسطول (وضع المشرف العام / المدير):
          </label>
          <select
            value={myTrip.id}
            onChange={(e) => {
              setSelectedTripId(e.target.value);
              setDriverScreenMode('auto');
            }}
            className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-slate-50 text-slate-900"
          >
            {myAssignedTrips.map(t => (
              <option key={t.id} value={t.id}>
                {t.driverNameAr} · {t.busPlate} — {t.universityNameAr} ({t.direction === 'to_university' ? 'ذهاب' : 'عودة'} {t.scheduledTime})
              </option>
            ))}
          </select>
        </div>
      )}

      {myAssignedTrips.length > 1 && (
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-2xs flex gap-1.5 overflow-x-auto">
          {myAssignedTrips.map(t => {
            const isSelected = t.id === myTrip.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedTripId(t.id);
                  setDriverScreenMode('auto');
                }}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-[#0F2537] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Bus className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="truncate">
                  {t.direction === 'to_university' ? 'ذهاب' : 'عودة'} · {t.driverNameAr.split(' ')[0]} ({t.scheduledTime})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 1.3 Driver Screen Mode Toggle (Return Campus Waiting vs Station Timeline) */}
      <div className="bg-slate-200/80 p-1.5 rounded-2xl flex text-xs font-extrabold gap-1">
        <button
          type="button"
          onClick={() => setDriverScreenMode('return_waiting')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            effectiveDriverMode === 'return_waiting'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <UserPlus className="w-4 h-4 text-emerald-400" />
          <span>شاشة انتظار العودة (ركوب الطلاب بالجامعة)</span>
        </button>

        <button
          type="button"
          onClick={() => setDriverScreenMode('timeline')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            effectiveDriverMode === 'timeline'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin className="w-4 h-4 text-amber-400" />
          <span>تايم لاين المحطات والطريق</span>
        </button>
      </div>

      {/* 1.5 Return Trip Campus Waiting & 1-Click Departure Banner */}
      {myTrip.direction === 'from_university' && (
        <div className={`rounded-3xl p-4 border-2 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          hasDepartedUniversity
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-sky-50 border-sky-300 text-sky-950'
        }`}>
          <div className="flex items-start gap-3">
            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              hasDepartedUniversity ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
            }`}>
              <Navigation className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black">حالة باص العودة بالجامعة:</span>
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                  hasDepartedUniversity ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'
                }`}>
                  {hasDepartedUniversity ? 'انطلقت الحافلة من الجامعة (روّحت)' : 'منتظرة بالجامعة بالطلاب'}
                </span>
              </div>
              <p className="text-[11px] mt-1 leading-relaxed opacity-90">
                {hasDepartedUniversity
                  ? `تم تسجيل مغادرة الجامعة وحُسب الركاب (${boardedCount} طالب) كـ «روّحوا» لدى المشرف.`
                  : `الطلاب الذين تم تسجيل صعودهم (${boardedCount}) يظهرون الآن كمتواجدين داخل السيارة بالخارج لدى الطالب والمشرف والمدير.`}
              </p>
            </div>
          </div>

          {!hasDepartedUniversity && (
            <button
              type="button"
              onClick={() => safeConfirmReturnDeparture(myTrip.id)}
              className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>انطلقت الحافلة من الجامعة الآن (روّحت)</span>
            </button>
          )}
        </div>
      )}

      {/* DEDICATED CAMPUS RETURN WAITING SCREEN: 1-Tap Boarding as Students Enter Waiting Bus */}
      {effectiveDriverMode === 'return_waiting' && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-emerald-200 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <span>تحضير ركاب سيارة الانتظار (أثناء العودة)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                كل ما طالب يركب معاك سيارة الانتظار بالجامعة اضغط عليه لتسجيل وجوده فوراً في لوحة الطالب والمشرف والمدير.
              </p>
            </div>
            <div className="text-left shrink-0 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] text-emerald-800 font-bold block">بالسيارة الآن</span>
              <span className="text-lg font-black font-mono text-emerald-700">{boardedCount} / {myTrip.capacity}</span>
            </div>
          </div>

          {/* Load readiness progress bar using balanced division target */}
          {(() => {
            const balancedTarget = myWaitingBusDivision?.recommendedDepartureTarget || Math.min(14, myTrip.capacity);
            const divisionPct = Math.min(100, Math.round((boardedCount / Math.max(1, balancedTarget)) * 100));
            const reachedBalanced = boardedCount > 0 && boardedCount >= balancedTarget;
            return (
              <div className={`rounded-2xl p-3 border space-y-1.5 ${
                reachedBalanced ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between text-[11px] font-bold gap-2 flex-wrap">
                  <span className={reachedBalanced ? 'text-emerald-900 font-black' : 'text-slate-700'}>
                    العدد المناسب لانطلاقك بالقسمة: {balancedTarget} طالب
                    {myWaitingBusDivision
                      ? ` (من ${myWaitingBusDivision.groupStudentsPoolCount} طالب ÷ ${myWaitingBusDivision.groupCarsCount} سيارة)`
                      : ''}
                  </span>
                  <span className={`font-mono font-black ${reachedBalanced ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {boardedCount} / {balancedTarget} ({divisionPct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      reachedBalanced ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                    style={{ width: `${divisionPct}%` }}
                  />
                </div>
                {reachedBalanced && (
                  <span className="text-[11px] font-black text-emerald-800 block">
                    ✓ اكتمل العدد المناسب لانطلاقك (دون الحاجة لاكتمال سعة الـ {myTrip.capacity} مقعد) — يمكنك الانطلاق الآن!
                  </span>
                )}
              </div>
            );
          })()}

          {/* Search student to tap in */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={waitingSearch}
              onChange={(e) => setWaitingSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو المحطة لتسجيل ركوب الطالب..."
              className="w-full pl-3 pr-9 py-2.5 bg-slate-50 focus:bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-bold"
            />
            {waitingSearch && (
              <button
                type="button"
                onClick={() => setWaitingSearch('')}
                className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>

          {/* 1-Tap Student List */}
          <div className="space-y-2 max-h-[460px] overflow-y-auto pl-1">
            {waitingReturnCandidates.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                لا يوجد طلاب مطابقون للبحث في نطاق هذه الجامعة.
              </div>
            ) : (
              waitingReturnCandidates.map(student => (
                <div
                  key={student.studentId}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 transition-all ${
                    student.isBoardedInThisTrip
                      ? 'bg-emerald-50 border-2 border-emerald-400 shadow-2xs'
                      : student.readyForReturn
                      ? 'bg-sky-50/70 border-2 border-sky-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-900 truncate">
                        {student.studentName}
                      </span>
                      {student.readyForReturn && (
                        <span className="text-[10px] bg-sky-600 text-white px-2 py-0.5 rounded-full font-black">
                          خلص الجامعة {student.readyForReturnAt ? `(${student.readyForReturnAt})` : ''}
                        </span>
                      )}
                      {student.isBoardedInThisTrip && (
                        <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black">
                          ✓ ركب السيارة {student.boardedAt ? `(${student.boardedAt})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{student.phone}</span>
                      <span>·</span>
                      <span>محطته: {student.stationNameAr.split('-')[0]}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      safeBoardWaitingStudent(
                        myTrip.id,
                        {
                          studentId: student.studentId,
                          studentName: student.studentName,
                          phone: student.phone,
                          stationId: student.stationId,
                          stationNameAr: student.stationNameAr,
                          studentUniversityId: student.studentUniversityId,
                          studentUniversityNameAr: student.studentUniversityNameAr,
                        },
                        student.isBoardedInThisTrip
                      )
                    }
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all active:scale-95 cursor-pointer ${
                      student.isBoardedInThisTrip
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        : 'bg-[#0F2537] hover:bg-slate-800 text-white shadow-xs'
                    }`}
                  >
                    {student.isBoardedInThisTrip ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>راكب معك (إلغاء)</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 text-amber-400" />
                        <span>ركب الانتظار +</span>
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {effectiveDriverMode === 'timeline' && (
        <>
          {/* 2. Quick Search & Cross-Station Boarding Tool */}
          {/* REQUIREMENT: "ممكن طالب يسجل انو هيركب من محطة ويركب من محطة اخرى ظبط هذا الموضوع بحيث يكون سهل جدا للسائق" */}
          <div className="bg-amber-50/80 border-2 border-amber-300 rounded-3xl p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-black text-slate-900 block">
                صعد طالب من محطة مختلفة عن محطته المسجلة؟
              </span>
              <span className="text-[11px] text-slate-600 block">
                ابحث عن اسمه أو هاتفه لشطبه وتسجيل صعوده في المحطة الحالية مباشرة بنقرة واحدة
              </span>
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="اكتب اسم الطالب أو هاتفه للتحضير الفوري من أي محطة..."
            className="w-full pl-3 pr-9 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-bold"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              مسح
            </button>
          )}
        </div>

        {/* Search Results Dropdown/Box if typing */}
        {searchQuery.trim().length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-300 p-2 space-y-1.5 shadow-md max-h-64 overflow-y-auto">
            {filteredManifestSearch.length === 0 ? (
              <div className="text-center py-3 text-xs text-slate-400">
                لا يوجد طالب بهذا الاسم أو رقم الهاتف في كشف الرحلة.
              </div>
            ) : (
              filteredManifestSearch.map(student => {
                const isAlreadyBoarded = isStudentBoardedEffective(
                  student.studentId,
                  student.boardedStatus === 'boarded'
                );
                return (
                  <div
                    key={student.studentId}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                      isAlreadyBoarded
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-amber-50/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900">{student.studentName}</span>
                        {isAlreadyBoarded && (
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-md font-black">
                            ✓ صعد الباص
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                          محطته الأصلية: {student.stationNameAr.split('-')[0]}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">{student.phone}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        safeCheckInStudent(
                          myTrip.id,
                          student.studentId,
                          {
                            id: currentStop?.stationId || student.stationId,
                            nameAr: currentStop?.stationNameAr || 'المحطة الحالية'
                          },
                          isAlreadyBoarded
                        );
                        setSearchQuery('');
                      }}
                      className={`px-3 py-1.5 font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                        isAlreadyBoarded
                          ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                          : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {isAlreadyBoarded
                          ? 'تراجع عن الصعود'
                          : `صعد هنا الآن (${currentStop?.stationNameAr.split('-')[0] || 'الحالية'})`}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 3. Core Requirement: Station Timeline with Location Checklist & Station Students */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              <span>تايم لاين محطات الخط وتشيك ليست موقع الحافلة والركاب</span>
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl">
              المحطة الحالية: {Math.min(myTrip.currentStopIndex + 1, Math.max(1, effectiveStops.length))} من {effectiveStops.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            حدّث موقعك في كل محطة بنقرة زر واحدة؛ لتنعكس التحديثات فوراً في شاشات الطلاب والمشرف.
          </p>
        </div>

        {/* Quick 1-Click Action for the active station */}
        {currentStop && (
          <div className="bg-linear-to-r from-amber-500 to-amber-400 text-slate-950 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <span className="w-9 h-9 rounded-xl bg-slate-950 text-amber-400 font-mono font-black flex items-center justify-center text-sm shrink-0">
                {myTrip.currentStopIndex + 1}
              </span>
              <div>
                <span className="text-[11px] font-bold text-slate-900/80 block">المحطة المستهدفة التالية للباص:</span>
                <span className="text-sm font-black block">{currentStop.stationNameAr}</span>
              </div>
            </div>

            <button
              onClick={() =>
                safeToggleStopCheck(
                  myTrip.id,
                  currentStop.stopId,
                  isStopDepartedEffective(currentStop.stopId, currentStop.status)
                )
              }
              className="w-full sm:w-auto px-5 py-3 bg-slate-950 hover:bg-slate-900 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              <span>تشيك بنقرة واحدة (تأكيد المرور بالمحطة)</span>
            </button>
          </div>
        )}

        {/* Sequential Timeline Component */}
        <div className="relative border-r-2 border-slate-200 pr-5 mr-3 space-y-6 pt-2">
          {effectiveStops.map((stop, idx) => {
            const isCurrent = idx === myTrip.currentStopIndex;
            const isDeparted = isStopDepartedEffective(stop.stopId, stop.status);
            const isArrived = stop.status === 'arrived' && !isDeparted;
            const isUpcoming = !isDeparted && !isArrived && idx > myTrip.currentStopIndex;

            // Students who registered for this station
            const expectedHere = myTrip.manifest.filter(
              m => m.stationId === stop.stationId && (m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported')
            );

            // Students who actually boarded at this station (including cross-station switchers)
            const boardedHere = myTrip.manifest.filter(
              m =>
                isStudentBoardedEffective(m.studentId, m.boardedStatus === 'boarded') &&
                (m.actualBoardingStationId === stop.stationId || (!m.actualBoardingStationId && m.stationId === stop.stationId))
            );

            return (
              <div
                key={stop.stopId || idx}
                className={`relative rounded-3xl border transition-all ${
                  isCurrent
                    ? 'bg-amber-50/50 border-amber-400 ring-4 ring-amber-100 shadow-md'
                    : isDeparted
                    ? 'bg-slate-50 border-slate-200 opacity-80'
                    : 'bg-white border-slate-200 shadow-2xs'
                }`}
              >
                {/* Distinctive Station Timeline Pin Indicator */}
                <div
                  className={`absolute -right-[31px] top-5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center transition-all ${
                    isDeparted
                      ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 ring-4 ring-emerald-200 text-white shadow-sm'
                      : isArrived || isCurrent
                      ? 'bg-gradient-to-tr from-amber-500 to-amber-300 ring-4 ring-amber-300 scale-110 text-slate-950 shadow-md'
                      : 'bg-slate-300 text-slate-500'
                  }`}
                >
                  {isDeparted ? (
                    <CheckCircle2 className="w-4 h-4 text-white stroke-[3]" />
                  ) : isArrived ? (
                    <div className="w-2 h-2 bg-slate-950 rounded-full animate-ping"></div>
                  ) : (
                    <span className="text-[10px] font-mono font-bold">{idx + 1}</span>
                  )}
                </div>

                {/* Station Header Block */}
                <div className={`p-4 rounded-t-3xl border-b ${
                  isCurrent ? 'bg-amber-100/70 border-amber-300' : 'bg-slate-50/90 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-mono font-black ${
                        isCurrent ? 'bg-amber-500 text-slate-950' : isDeparted ? 'bg-slate-300 text-slate-700' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900">
                            {stop.stationNameAr}
                          </span>
                          {isArrived && (
                            <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-md animate-pulse">
                              الحافلة متوقفة هنا الآن
                            </span>
                          )}
                          {isDeparted && (
                            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>تمت المغادرة</span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                          الموعد المجدول: {stop.scheduledArrivalTime}
                          {stop.actualArrivalTime && ` · وصلت: ${stop.actualArrivalTime}`}
                          {stop.actualDepartureTime && ` · غادرت: ${stop.actualDepartureTime}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-xl border border-slate-200 font-mono">
                        ركب {boardedHere.length} من {expectedHere.length}
                      </span>

                      {/* Fast Check-in All */}
                      {isCurrent && expectedHere.length > 0 && boardedHere.length < expectedHere.length && (
                        <button
                          onClick={() => handleCheckInAllStationStudents(stop.stationId, stop.stationNameAr)}
                          className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                          title="شطب وصعود جميع ركاب هذه المحطة بنقرة واحدة"
                        >
                          <CheckCheck className="w-4 h-4" />
                          <span>شطب الكل</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* REQUIREMENT: Distinctive 1-Click Station Checklist Button */}
                  <div className="mt-3 pt-3 border-t border-slate-200/80">
                    {!isDeparted ? (
                      <button
                        onClick={() => safeToggleStopCheck(myTrip.id, stop.stopId, isDeparted)}
                        className={`w-full h-13 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98] ${
                          isCurrent
                            ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-600 hover:to-amber-500 text-slate-950 ring-4 ring-amber-300/60 shadow-amber-500/20'
                            : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 shadow-slate-900/10'
                        }`}
                      >
                        <span className="w-6 h-6 rounded-lg bg-black/20 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </span>
                        <span className="text-sm">تشيك بنقرة واحدة: تم الوصول والمرور بمحطة ({stop.stationNameAr.split('-')[0]})</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => safeToggleStopCheck(myTrip.id, stop.stopId, isDeparted)}
                        className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 border-2 border-emerald-400 text-white rounded-2xl font-black text-xs transition-all flex items-center justify-between px-4 shadow-md shadow-emerald-900/20 ring-2 ring-emerald-300/40"
                        title="انقر للتراجع عن التشيك في حال الضغط بالخطأ"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shadow-xs">
                            <CheckCircle2 className="w-4 h-4 text-white stroke-[3]" />
                          </span>
                          <span className="text-sm font-black">✓ تم إنجاز وتشيك المحطة بنجاح</span>
                          <span className="font-mono text-[11px] text-emerald-950 bg-emerald-200 px-2.5 py-0.5 rounded-md font-bold">
                            {stop.actualDepartureTime || 'تم'}
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-200 hover:text-white underline font-bold">تراجع؟</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Checklist of Expected Students at this Station */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-bold mb-1">
                    <span>كشف الطلاب المتوقع صعودهم من {stop.stationNameAr}:</span>
                    <span className="text-[11px] text-slate-400">انقر لشطب الطالب عند صعوده</span>
                  </div>

                  {expectedHere.length === 0 ? (
                    <div className="text-center py-3 text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      لا يوجد طلاب مسجلين مسبقاً في هذه المحطة.
                    </div>
                  ) : (
                    expectedHere.map(student => {
                      const isBoarded = isStudentBoardedEffective(
                        student.studentId,
                        student.boardedStatus === 'boarded'
                      );

                      return (
                        <div
                          key={student.studentId}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                            isBoarded
                              ? 'bg-gradient-to-r from-emerald-50/90 to-teal-50/80 border-2 border-emerald-400 ring-2 ring-emerald-200/50 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-extrabold truncate ${
                                isBoarded ? 'text-emerald-950 line-through decoration-emerald-600 decoration-2 font-bold' : 'text-slate-900'
                              }`}>
                                {student.studentName}
                              </span>

                              {isBoarded ? (
                                <span className="text-[11px] bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-2.5 py-0.5 rounded-lg font-black flex items-center gap-1 shadow-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100 stroke-[3]" />
                                  <span>تم الشطب والصعود</span>
                                </span>
                              ) : (
                                <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                                  بانتظار الصعود
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>{student.phone}</span>
                              {isBoarded && student.boardedAt && (
                                <span className="text-emerald-800 font-bold bg-emerald-100/80 px-2 py-0.2 rounded">
                                  صعد الساعة: {student.boardedAt}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Direct Action Buttons: Call & Distinctive 1-Click Strike-off Checklist */}
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`tel:${student.phone}`}
                              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors active:scale-95 shadow-2xs"
                              title="اتصال هاتفي مباشر بالطالب"
                            >
                              <Phone className="w-4 h-4" />
                            </a>

                            {/* Distinctive Student Checklist Toggle Button */}
                            <button
                              onClick={() =>
                                safeCheckInStudent(
                                  myTrip.id,
                                  student.studentId,
                                  {
                                    id: stop.stationId,
                                    nameAr: stop.stationNameAr
                                  },
                                  isBoarded
                                )
                              }
                              className={`h-11 px-4 rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 shadow-sm ${
                                isBoarded
                                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white ring-2 ring-emerald-300 shadow-emerald-900/20'
                                  : 'bg-white hover:bg-amber-50 text-slate-800 border-2 border-dashed border-amber-400 hover:border-amber-500'
                              }`}
                            >
                              {isBoarded ? (
                                <>
                                  <span className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white stroke-[3]" />
                                  </span>
                                  <span>مشطوب (صعد)</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-5 h-5 rounded-md bg-amber-100 border border-amber-300 flex items-center justify-center">
                                    <Circle className="w-3 h-3 text-amber-600" />
                                  </span>
                                  <span>شطب وصعود</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
          </div>
        </>
      )}

      {/* 4. Report Incident Button */}
      <button
        onClick={() => setShowIncidentModal(true)}
        className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-2xs"
      >
        <AlertTriangle className="w-4 h-4 text-rose-600" />
        <span>الإبلاغ عن طارئ / عطل فني / زحام مروري للغرفة</span>
      </button>

      {/* Incident Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">إبلاغ المشرف عن طارئ</h3>
              <button
                onClick={() => setShowIncidentModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIncidentSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 font-bold block mb-1">نوع البلاغ:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIncidentType('delay')}
                    className={`py-2 text-xs font-bold rounded-lg border ${
                      incidentType === 'delay'
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    تأخير مروري
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncidentType('breakdown')}
                    className={`py-2 text-xs font-bold rounded-lg border ${
                      incidentType === 'breakdown'
                        ? 'bg-rose-600 text-white border-rose-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    عطل فني بالحافلة
                  </button>
                </div>
              </div>

              {incidentType === 'delay' && (
                <div>
                  <label className="text-xs text-slate-600 font-bold block mb-1">مقدار التأخير المتوقع بالدقائق:</label>
                  <input
                    type="number"
                    value={delayMins}
                    onChange={(e) => setDelayMins(Number(e.target.value))}
                    min={5}
                    max={120}
                    className="w-full p-2.5 border rounded-xl font-mono text-sm"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-slate-600 font-bold block mb-1">توضيح السبب:</label>
                <textarea
                  value={incidentReason}
                  onChange={(e) => setIncidentReason(e.target.value)}
                  placeholder="مثال: حادث مروري أو ثقب بالإطار..."
                  rows={3}
                  className="w-full p-2.5 border rounded-xl text-xs"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700"
                >
                  إرسال البلاغ فوراً
                </button>
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(false)}
                  className="py-3 px-4 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suggestion 3: Sticky Mobile One-Hand Bottom Action Bar + Offline Sync Indicator */}
      <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-2.5 bg-[#0F2537]/95 backdrop-blur-md border-t border-slate-700/80 shadow-2xl">
        <div className="max-w-xl mx-auto space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-emerald-300 font-black font-mono border border-slate-700">
                بالسيارة: {boardedCount}/{myTrip.capacity}
              </span>
              {(!isOnline || offlineQueue.length > 0 || isSyncingQueue) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isOnline && offlineQueue.length > 0) void flushOfflineQueue();
                  }}
                  className={`px-2.5 py-1 rounded-lg font-black flex items-center gap-1.5 border cursor-pointer ${
                    !isOnline
                      ? 'bg-rose-900/80 text-rose-200 border-rose-500/60'
                      : isSyncingQueue
                      ? 'bg-sky-900/80 text-sky-200 border-sky-500/60'
                      : 'bg-amber-500 text-slate-950 border-amber-400'
                  }`}
                  title="حالة طابور المزامنة دون اتصال"
                >
                  {isSyncingQueue ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSyncingQueue
                      ? 'جاري مزامنة الطابور...'
                      : !isOnline
                      ? `أوفلاين · طابور الانتظار: ${offlineQueue.length}`
                      : `مزامنة ${offlineQueue.length} إجراء`}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setDriverScreenMode('return_waiting')}
                className={`px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer ${
                  effectiveDriverMode === 'return_waiting'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                الانتظار
              </button>
              <button
                type="button"
                onClick={() => setDriverScreenMode('timeline')}
                className={`px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer ${
                  effectiveDriverMode === 'timeline'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                المحطات
              </button>
            </div>
          </div>

          {effectiveDriverMode === 'return_waiting' && myTrip.direction === 'from_university' && !hasDepartedUniversity ? (
            <button
              type="button"
              onClick={() => safeConfirmReturnDeparture(myTrip.id)}
              className="w-full py-3.5 px-4 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] text-slate-950 font-black text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              <span>انطلقت بالطلاب الآن ({boardedCount} طالب بالسيارة)</span>
            </button>
          ) : currentStop ? (
            <button
              type="button"
              onClick={() =>
                safeToggleStopCheck(
                  myTrip.id,
                  currentStop.stopId,
                  isStopDepartedEffective(currentStop.stopId, currentStop.status)
                )
              }
              className="w-full py-3.5 px-4 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 active:scale-[0.98] text-slate-950 font-black text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تشيك محطة الآن: {currentStop.stationNameAr.split('-')[0]}</span>
            </button>
          ) : null}
        </div>
      </div>

    </div>
  );
};
