import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useApp } from '../../context/AppContext';
import { matchesArabicSearch } from '../../utils/arabicSearch';
import { computeWaitingBusMetrics } from '../../utils/waitingBusMetrics';
import {
  playDispatchAlertChime,
  triggerBrowserNotification,
  requestBrowserNotificationPermission,
  getBrowserNotificationPermission
} from '../../utils/soundAlerts';
import {
  Settings,
  Bus,
  Users,
  BarChart3,
  Plus,
  CheckCircle2,
  AlertTriangle,
  FolderCog,
  Search,
  Volume2,
  VolumeX,
  GitMerge,
  Phone,
  PhoneCall,
  Bell,
  BellRing,
  X
} from 'lucide-react';

const SettingsPage = lazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage })));

export const AdminView: React.FC = () => {
  const {
    universities,
    lines,
    buses,
    drivers,
    trips,
    users,
    subscriptions,
    proposals,
    incidents,
    activeOperatingDate,
    createTrip,
    dispatchWaitingReturnBus,
    consolidateWaitingBusesOnly,
    markCrossUniversityHandoff,
    allocateWaitingReturnBus,
    addToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'settings' | 'kpis' | 'trips'>('settings');
  const [tripsSearch, setTripsSearch] = useState('');

  // New trip modal/form
  const [showAddTripModal, setShowAddTripModal] = useState(false);
  const [newTripDate, setNewTripDate] = useState(activeOperatingDate || new Date().toISOString().slice(0, 10));
  const [newTripUni, setNewTripUni] = useState(universities[0]?.id || '');
  const [newTripLine, setNewTripLine] = useState(lines[0]?.id || '');
  const [newTripDirection, setNewTripDirection] = useState<'to_university' | 'from_university'>('to_university');
  const [newTripTime, setNewTripTime] = useState('07:00 ص');
  const [newTripBus, setNewTripBus] = useState(buses[0]?.id || '');
  const [newTripDriver, setNewTripDriver] = useState(drivers[0]?.id || '');

  useEffect(() => {
    if (!newTripUni && universities[0]?.id) setNewTripUni(universities[0].id);
    if (!newTripLine && lines[0]?.id) setNewTripLine(lines[0].id);
    if (!newTripBus && buses[0]?.id) setNewTripBus(buses[0].id);
    if (!newTripDriver && drivers[0]?.id) setNewTripDriver(drivers[0].id);
  }, [universities, lines, buses, drivers, newTripUni, newTripLine, newTripBus, newTripDriver]);

  useEffect(() => {
    if (activeOperatingDate) setNewTripDate(activeOperatingDate);
  }, [activeOperatingDate]);

  const handleCreateTripSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTrip({
      universityId: newTripUni || universities[0]?.id || '',
      lineId: newTripLine || lines[0]?.id || '',
      direction: newTripDirection,
      scheduledTime: newTripTime,
      busId: newTripBus || buses[0]?.id || '',
      driverId: newTripDriver || drivers[0]?.id || '',
      date: newTripDate || activeOperatingDate
    });
    setShowAddTripModal(false);
  };

  // Live KPI calculations from actual operating data
  const totalBuses = buses.length;
  const operatingTrips = useMemo(
    () => trips.filter(t => t.date === activeOperatingDate && t.status !== 'cancelled'),
    [trips, activeOperatingDate]
  );
  const tripsForCalc = operatingTrips.length > 0 ? operatingTrips : trips.filter(t => t.status !== 'cancelled');

  const activeBusesSet = new Set<string>();
  buses.filter(b => b.status === 'in_trip').forEach(b => activeBusesSet.add(b.id));
  tripsForCalc.filter(t => t.status === 'in_progress' || t.status === 'delayed').forEach(t => {
    if (t.busId) activeBusesSet.add(t.busId);
  });
  const activeBusesCount = activeBusesSet.size;

  const totalCapacitySum = buses.reduce((acc, b) => acc + (b.capacity || 0), 0);

  const totalTripCapacity = tripsForCalc.reduce((acc, t) => acc + (t.capacity || 0), 0);
  const totalConfirmedPassengers = tripsForCalc.reduce(
    (acc, t) => acc + (t.manifest || []).filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded').length,
    0
  );
  const averageOccupancyRate = totalTripCapacity > 0
    ? Math.min(100, Math.round((totalConfirmedPassengers / totalTripCapacity) * 1000) / 10)
    : 0;

  const avgDelayMinutes = tripsForCalc.length > 0
    ? Math.round((tripsForCalc.reduce((acc, t) => acc + (t.delayMinutes || 0), 0) / tripsForCalc.length) * 10) / 10
    : 0;

  const savedBusesFromConsolidation = proposals.filter(p => p.status === 'approved').length;

  // Live Campus Waiting-Bus & Dispatch Load Metrics for Admin
  const waitingMetrics = useMemo(
    () => computeWaitingBusMetrics(trips, activeOperatingDate),
    [trips, activeOperatingDate]
  );

  // Merge manifest-based cross-university mismatches with O(1) Map lookups
  const mergedMismatches = useMemo(() => {
    const byKey = new Map<string, typeof waitingMetrics.crossUniversityMismatches[number]>();
    waitingMetrics.crossUniversityMismatches.forEach(item => {
      byKey.set(`${item.tripId}::${item.studentId}`, item);
    });

    const usersById = new Map(users.map(u => [u.id, u]));
    const universitiesById = new Map(universities.map(u => [u.id, u]));

    const targetTrips = trips.filter(
      t =>
        (activeOperatingDate ? t.date === activeOperatingDate : true) &&
        t.status !== 'cancelled' &&
        t.status !== 'completed'
    );

    targetTrips.forEach(t => {
      (t.manifest || []).forEach(m => {
        if (m.externalHandoffStatus === 'handed_off') return;
        const userRecord = usersById.get(m.studentId);
        const stUniId = m.studentUniversityId || userRecord?.universityId;
        if (!stUniId || !t.universityId || stUniId === t.universityId) return;
        if (m.boardedStatus === 'no_show' || m.rsvpStatus === 'excused') return;
        const key = `${t.id}::${m.studentId}`;
        if (!byKey.has(key)) {
          const uniName =
            m.studentUniversityNameAr ||
            universitiesById.get(stUniId)?.nameAr ||
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
  }, [waitingMetrics.crossUniversityMismatches, trips, users, universities, activeOperatingDate]);

  // Quick Waiting-Car Allocation Modal State
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

  const pendingIncidentsCount = useMemo(
    () => incidents.filter(i => i.status === 'pending').length,
    [incidents]
  );

  // Sound & Browser Push Notification Alert on new dispatch alerts & cross-university mismatches
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [liveMismatchFeed, setLiveMismatchFeed] = useState<Array<{
    id: string;
    key: string;
    tripId: string;
    studentId: string;
    studentName: string;
    studentUniversityNameAr: string;
    driverNameAr: string;
    driverPhone?: string;
    busPlate: string;
    tripUniversityNameAr: string;
    detectedAt: string;
  }>>([]);
  const seenDispatchAlertIdsRef = useRef<Set<string>>(new Set());
  const seenMismatchKeysRef = useRef<Set<string>>(new Set());
  const mismatchPanelRef = useRef<HTMLDivElement | null>(null);

  const handleEnablePushNotifications = async () => {
    const result = await requestBrowserNotificationPermission();
    setNotificationPermission(result);
    if (result === 'granted') {
      if (soundAlertsEnabled) playDispatchAlertChime('success');
      addToast('تم تفعيل إشعارات الدفع الفورية للمدير بنجاح! ستصلك تنبيهات لحظية فور تفعيل العلامة الحمراء.', 'success');
      triggerBrowserNotification(
        'تم تفعيل تنبيهات مدير UniBus',
        mergedMismatches.length > 0
          ? `يوجد حالياً ${mergedMismatches.length} طلاب في غير وجهتهم الجامعية بانتظار التنسيق.`
          : 'ستتلقى إشعاراً فورياً عند رصد أي طالب في حافلة غير متجهة لجامعته.',
        { tag: 'unibus-push-enabled' }
      );
    } else if (result === 'denied') {
      addToast('تم حظر الإشعارات من المتصفح. يمكنك السماح بها من أيقونة القفل بجانب رابط الموقع.', 'error');
    } else if (result === 'unsupported') {
      addToast('المتصفح الحالي لا يدعم إشعارات سطح المكتب، ستستمر التنبيهات الصوتية واللحظية داخل الشاشة.', 'info');
    }
  };

  useEffect(() => {
    const newAlerts = waitingMetrics.dispatchAlerts.filter(a => !seenDispatchAlertIdsRef.current.has(a.id));
    if (newAlerts.length > 0) {
      newAlerts.forEach(a => seenDispatchAlertIdsRef.current.add(a.id));
      if (soundAlertsEnabled) {
        playDispatchAlertChime('dispatch');
      }
      triggerBrowserNotification(
        'إنذار لوحة المدير: سيارة انتظار جاهزة للانطلاق',
        newAlerts[0].message,
        { tag: `dispatch-${newAlerts[0].id}` }
      );
    }
  }, [waitingMetrics.dispatchAlerts, soundAlertsEnabled]);

  // Real-time Cross-University Red-Flag Push Watcher (reacts immediately to Firestore onSnapshot updates)
  useEffect(() => {
    const currentKeys = new Set(mergedMismatches.map(m => `${m.tripId}::${m.studentId}`));

    // Prune resolved keys so re-activation triggers a fresh push notification
    Array.from(seenMismatchKeysRef.current).forEach(existingKey => {
      if (!currentKeys.has(existingKey)) {
        seenMismatchKeysRef.current.delete(existingKey);
      }
    });

    // Clear feed items whose mismatch has already been resolved/handed off
    setLiveMismatchFeed(prev => prev.filter(ev => currentKeys.has(ev.key)));

    const newlyActivated = mergedMismatches.filter(
      m => !seenMismatchKeysRef.current.has(`${m.tripId}::${m.studentId}`)
    );

    if (newlyActivated.length > 0) {
      const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      newlyActivated.forEach(m => {
        seenMismatchKeysRef.current.add(`${m.tripId}::${m.studentId}`);
      });

      setLiveMismatchFeed(prev => [
        ...newlyActivated.map(m => ({
          id: `${m.tripId}::${m.studentId}::${Date.now()}`,
          key: `${m.tripId}::${m.studentId}`,
          tripId: m.tripId,
          studentId: m.studentId,
          studentName: m.studentName,
          studentUniversityNameAr: m.studentUniversityNameAr || 'جامعة أخرى',
          driverNameAr: m.driverNameAr,
          driverPhone: m.driverPhone,
          busPlate: m.busPlate,
          tripUniversityNameAr: m.tripUniversityNameAr,
          detectedAt: nowStr,
        })),
        ...prev
      ].slice(0, 10));

      const first = newlyActivated[0];
      const firstUniName = first.studentUniversityNameAr || 'جامعة أخرى';
      const pushBody = newlyActivated.length === 1
        ? `الطالب ${first.studentName} (${firstUniName}) موجود مع كابتن ${first.driverNameAr} (${first.busPlate}) المتجه إلى ${first.tripUniversityNameAr}.`
        : `تم رصد ${newlyActivated.length} طلاب في سيارات لا تتجه لجامعتهم (أولهم: ${first.studentName} مع كابتن ${first.driverNameAr}).`;

      if (soundAlertsEnabled) {
        playDispatchAlertChime('dispatch');
      }
      addToast(`🔴 إنذار فوري: ${pushBody}`, 'error');
      triggerBrowserNotification(
        '🔴 تنبيه عاجل: طالب في غير وجهته الجامعية',
        pushBody,
        { tag: 'unibus-cross-university-red-flag', requireInteraction: true }
      );
    }
  }, [mergedMismatches, soundAlertsEnabled, addToast]);

  const filteredTripsList = useMemo(() => {
    if (!tripsSearch.trim()) return trips;
    return trips.filter(t =>
      matchesArabicSearch(
        tripsSearch,
        t.code,
        t.lineNameAr,
        t.universityNameAr,
        t.driverNameAr,
        t.busPlate,
        t.scheduledTime,
        t.date
      )
    );
  }, [trips, tripsSearch]);

  const tripStatusArabicMap: Record<string, { label: string; cls: string }> = {
    in_progress: { label: 'في الطريق', cls: 'bg-amber-100 text-amber-900' },
    delayed: { label: 'متأخرة', cls: 'bg-rose-100 text-rose-900' },
    completed: { label: 'مكتملة', cls: 'bg-emerald-100 text-emerald-900' },
    scheduled: { label: 'مجدولة', cls: 'bg-slate-100 text-slate-700' },
    merged: { label: 'مدمجة', cls: 'bg-purple-100 text-purple-900' },
    cancelled: { label: 'ملغاة', cls: 'bg-rose-50 text-rose-700' }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Admin Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
              <Settings className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">
              لوحة إدارة الشركة
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الجامعات، الحافلات، خطوط السير، المواعيد الافتراضية، وحسابات الموظفين والطلاب.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {notificationPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={() => void handleEnablePushNotifications()}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                notificationPermission === 'granted'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : notificationPermission === 'denied'
                  ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                  : 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 shadow-sm'
              }`}
            >
              {notificationPermission === 'granted' ? (
                <BellRing className="w-4 h-4 text-emerald-600" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              <span>
                {notificationPermission === 'granted'
                  ? 'إشعارات الدفع مفعّلة'
                  : notificationPermission === 'denied'
                  ? 'الإشعارات محظورة بالمتصفح'
                  : 'تفعيل إشعارات الدفع الفورية'}
              </span>
            </button>
          )}

          <button
            onClick={() => setShowAddTripModal(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>جدولة رحلة جديدة</span>
          </button>
        </div>
      </div>

      {/* Live Push Notification Stream for Cross-University Red Flag */}
      {liveMismatchFeed.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border-2 border-rose-600 bg-rose-950 text-white p-4 shadow-md space-y-2.5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xs sm:text-sm font-black">
                  تحديث لحظي فوري: تفعيل العلامة الحمراء لطلاب في غير وجهتهم ({mergedMismatches.length})
                </h2>
                <p className="text-[11px] text-rose-200">
                  تم رصد التغيير تلقائياً من السائقين على الحافلات — يمكنك الاتصال بالكابتن أو تسجيل إركابهم مع سيارة أخرى مباشرة.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => mismatchPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="px-3 py-1.5 bg-white text-rose-950 hover:bg-rose-50 text-xs font-black rounded-xl cursor-pointer whitespace-nowrap"
              >
                الانتقال لقائمة التنسيق ({mergedMismatches.length})
              </button>
              <button
                type="button"
                onClick={() => setLiveMismatchFeed([])}
                className="p-1.5 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-100 cursor-pointer"
                title="إخفاء شريط التحديثات اللحظية"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {liveMismatchFeed.slice(0, 4).map(ev => (
              <div
                key={ev.id}
                className="bg-rose-900/70 border border-rose-700 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-black text-white truncate">
                    {ev.studentName} ({ev.studentUniversityNameAr})
                  </div>
                  <div className="text-[11px] text-rose-100 truncate">
                    كابتن {ev.driverNameAr} · {ev.busPlate} ← {ev.tripUniversityNameAr} · <span className="font-mono">{ev.detectedAt}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ev.driverPhone && (
                    <a
                      href={`tel:${ev.driverPhone}`}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg flex items-center gap-1 whitespace-nowrap"
                    >
                      <PhoneCall className="w-3 h-3" />
                      <span>اتصال</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void markCrossUniversityHandoff(ev.tripId, [ev.studentId], 'تم ركوب الطالب مع مكتب أو سيارة خارجية')}
                    className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-950 font-black text-[11px] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    تم التسليم ✓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Campus Waiting-Bus Count & Vehicle-Load Dispatch Alert Monitor */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
              waitingMetrics.dispatchAlerts.length > 0
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-amber-100 text-amber-800'
            }`}>
              <Bus className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">
                متابعة عربيات الانتظار بالجامعات وجاهزية الانطلاق اللحظي
              </h2>
              <p className="text-[11px] text-slate-500">
                يُظهر عدد الطلاب الموجودين فعلياً داخل سيارات الانتظار ويُطلق إنذاراً فورياً عندما يصبح العدد مناسباً لحمولة سيارة.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
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
              className="text-[11px] font-black px-3 py-1.5 rounded-xl bg-[#0F2537] hover:bg-slate-800 text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تخصيص سيارة انتظار لجامعة</span>
            </button>

            <button
              type="button"
              onClick={() => setSoundAlertsEnabled(prev => !prev)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1 cursor-pointer transition-colors ${
                soundAlertsEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
              title="تشغيل أو كتم التنبيه الصوتي عند اكتمال الحمولة"
            >
              {soundAlertsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{soundAlertsEnabled ? 'صوت الإنذار مفعّل' : 'صامت'}</span>
            </button>

            {pendingIncidentsCount > 0 && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border bg-amber-100 text-amber-900 border-amber-300">
                ⚠️ {pendingIncidentsCount} عطل/بلاغ مفتوح
              </span>
            )}

            {mergedMismatches.length > 0 && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border bg-rose-600 text-white border-rose-700 animate-pulse">
                🔴 {mergedMismatches.length} طالب بغير جامعته
              </span>
            )}

            <span className={`text-xs font-black px-3 py-1 rounded-xl border ${
              waitingMetrics.dispatchAlerts.length > 0
                ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {waitingMetrics.dispatchAlerts.length > 0
                ? `🚨 إنذار جاهزية انطلاق (${waitingMetrics.dispatchAlerts.length})`
                : 'مراقبة الحمولة نشطة'}
            </span>
          </div>
        </div>

        {/* 3 Admin Waiting Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-amber-900 block">
                موجودون في عربيات الانتظار الآن
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-amber-800">
                  {waitingMetrics.waitingInBusesCount}
                </span>
                <span className="text-xs font-bold text-amber-700">
                  طالب في {waitingMetrics.waitingBuses.length} عربية
                </span>
              </div>
            </div>
            <Users className="w-7 h-7 text-amber-500" />
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-900 block">
                الطلبة الذين خلصوا الجامعة
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-emerald-800">
                  {waitingMetrics.finishedUniCount}
                </span>
                <span className="text-xs font-bold text-emerald-700">طالب جاهز</span>
              </div>
            </div>
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>

          <div className={`rounded-xl p-3.5 border ${
            waitingMetrics.dispatchAlerts.length > 0
              ? 'bg-rose-50 border-2 border-rose-400'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
              <span className={waitingMetrics.dispatchAlerts.length > 0 ? 'text-rose-900 font-black' : 'text-slate-700'}>
                العدد المناسب للانطلاق بالقسمة ({waitingMetrics.nearestVehicleTarget} راكب/سيارة)
              </span>
              <span className="font-mono font-black text-slate-900">
                {waitingMetrics.nearestVehicleProgressPercent}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  waitingMetrics.dispatchAlerts.length > 0 ? 'bg-rose-600' : 'bg-amber-500'
                }`}
                style={{ width: `${waitingMetrics.nearestVehicleProgressPercent}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold mt-1.5 block ${
              waitingMetrics.dispatchAlerts.length > 0 ? 'text-rose-800' : 'text-slate-500'
            }`}>
              {waitingMetrics.dispatchAlerts.length > 0
                ? '🚨 بلغ العدد المناسب للانطلاق بالقسمة المتوازنة (بدون اشتراط الامتلاء الكامل)!'
                : `إجمالي طلاب العودة: ${waitingMetrics.totalReturnPoolCount} · متبقي ${Math.max(0, waitingMetrics.nearestVehicleTarget - waitingMetrics.waitingInBusesCount)} للانطلاق`}
            </span>
          </div>
        </div>

        {/* Balanced Student-to-Car Division Strip */}
        {waitingMetrics.divisionGroups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {waitingMetrics.divisionGroups.map(grp => (
              <div
                key={grp.key}
                className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 text-xs flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-black text-sky-950 block">{grp.universityNameAr} · {grp.lineNameAr}</span>
                  <span className="text-[11px] text-sky-800 font-bold block mt-0.5">
                    {grp.totalPoolStudents} طالب ÷ {grp.carsCount} سيارة ={' '}
                    <strong className="font-mono">{grp.averagePerCar} طالب/سيارة</strong>
                    {grp.canSaveCar && ` · يكفي ${grp.recommendedCarsNeeded} سيارة`}
                  </span>
                </div>
                <span className="px-2 py-1 rounded-lg bg-white border border-sky-200 font-mono font-black text-sky-900 shrink-0">
                  {grp.boardedNowCount}/{grp.totalPoolStudents}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Cross-University Mismatch Red Alert for Admin Coordination */}
        {mergedMismatches.length > 0 && (
          <div ref={mismatchPanelRef} className="p-4 rounded-2xl border-2 border-rose-600 bg-rose-50/90 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-rose-950">
                    🔴 تنبيه حرج: يوجد {mergedMismatches.length} طلاب في سيارات لا تتجه إلى جامعتهم
                  </h3>
                  <p className="text-[11px] font-bold text-rose-800 mt-0.5">
                    يظهر لتنسّق الإدارة والمشرف مع مكاتب/سيارات خارجية لتوصيلهم. فور إركابهم مع سيارة أخرى اضغط "تم ركوبهم مكتب/سيارة أخرى" لإزالة العلامة الحمراء عن السائق والإدارة.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {mergedMismatches.map(item => (
                <div
                  key={`${item.tripId}-${item.studentId}`}
                  className="p-3 rounded-xl bg-white border border-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-slate-900">{item.studentName}</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                        جامعته: {item.studentUniversityNameAr}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      موجود حالياً مع: <strong className="text-slate-900">كابتن {item.driverNameAr}</strong> ({item.busPlate}) · متجه إلى: <strong>{item.tripUniversityNameAr}</strong>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                      {item.driverPhone && (
                        <a href={`tel:${item.driverPhone}`} className="text-emerald-700 font-bold hover:underline flex items-center gap-1">
                          <Phone className="w-3 h-3" /> اتصال بالكابتن
                        </a>
                      )}
                      {item.phone && (
                        <a href={`tel:${item.phone}`} className="text-sky-700 font-bold hover:underline flex items-center gap-1">
                          <Phone className="w-3 h-3" /> اتصال بالطالب
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markCrossUniversityHandoff(item.tripId, [item.studentId], 'تم ركوب الطالب مع مكتب أو سيارة خارجية')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black rounded-xl cursor-pointer shrink-0"
                  >
                    تم ركوبهم مكتب/سيارة أخرى ✓
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-Car Live Waiting Indicators (Driver-First Labeling) */}
        {waitingMetrics.waitingBuses.length > 0 && (
          <div className="pt-1 space-y-2">
            <div className="text-[11px] font-black text-slate-700 flex items-center justify-between">
              <span>المنتظرون في كل سيارة الآن (بأسماء السائقين):</span>
              <span className="font-mono text-amber-800">الإجمالي: {waitingMetrics.waitingInBusesCount} طالب</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {waitingMetrics.waitingBuses.map(wb => (
                <div
                  key={wb.trip.id}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    wb.isReadyForDispatch ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <span className="font-black text-slate-900 block">
                      كابتن {wb.trip.driverNameAr || 'غير معين'} · <span className="font-mono text-slate-600">{wb.trip.busPlate}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {wb.trip.universityNameAr} · {wb.trip.lineNameAr}
                    </span>
                  </div>
                  <div className="text-left shrink-0 flex items-center gap-1.5">
                    <span className={`font-mono font-black px-2 py-1 rounded-lg text-xs ${
                      wb.isReadyForDispatch ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-900'
                    }`}>
                      {wb.boardedCount} / {wb.recommendedDepartureTarget}
                    </span>
                    {wb.boardedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void dispatchWaitingReturnBus(wb.trip.id)}
                        className="px-2 py-1 bg-[#0F2537] hover:bg-slate-800 text-white text-[10px] font-black rounded-lg cursor-pointer"
                      >
                        انطلاق
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Dispatch Alert Cards for Admin */}
        {waitingMetrics.dispatchAlerts.length > 0 && (
          <div className="space-y-2 pt-1">
            {waitingMetrics.dispatchAlerts.map(alert => (
              <div
                key={alert.id}
                className="p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                  <div className="text-xs">
                    <span className="font-black text-rose-950 block">
                      إنذار حمولة جاهزة — {alert.universityNameAr} ({alert.lineNameAr})
                    </span>
                    <span className="text-rose-900 font-bold block mt-0.5">
                      {alert.message}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dispatchWaitingReturnBus(alert.recommendedTripId, alert.consolidateTripIds)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>انطلاق كابتن {alert.recommendedDriverNameAr} ({alert.recommendedBusPlate})</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 1-Click Waiting-Bus Consolidation Opportunities for Admin */}
        {waitingMetrics.consolidationOpportunities.length > 0 && (
          <div className="space-y-2 pt-1">
            {waitingMetrics.consolidationOpportunities.map(opp => (
              <div
                key={opp.id}
                className="p-3.5 rounded-xl border-2 border-indigo-300 bg-indigo-50/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <GitMerge className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-black text-indigo-950 block">
                      فرصة تجميع وتوفير {opp.savedCarsCount} سيارة — {opp.universityNameAr} ({opp.lineNameAr})
                    </span>
                    <span className="text-indigo-900 font-bold block mt-0.5">{opp.message}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => consolidateWaitingBusesOnly(opp.targetTripId, opp.donorTripIds)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>تجميع في سيارة كابتن {opp.targetDriverNameAr} ({opp.targetBusPlate}) وتوفير {opp.savedCarsCount} سيارة</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Admin Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-reverse space-x-2 overflow-x-auto pb-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] py-2 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FolderCog className="w-4 h-4 text-amber-400" />
          <span>الإعدادات وإدارة البيانات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('kpis')}
          className={`min-h-[44px] py-2 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'kpis'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <span>مؤشرات الأداء والتشغيل</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trips')}
          className={`min-h-[44px] py-2 px-4 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'trips'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Bus className="w-4 h-4 text-emerald-400" />
          <span>الرحلات المجدولة اليوم ({trips.length})</span>
        </button>
      </div>

      {/* TAB 1: SETTINGS (Requested as Primary Task) */}
      {activeTab === 'settings' && (
        <Suspense fallback={<div className="p-8 text-center text-xs font-bold text-slate-500">جارٍ تحميل الإعدادات...</div>}>
          <SettingsPage />
        </Suspense>
      )}

      {/* TAB 2: KPIs */}
      {activeTab === 'kpis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">متوسط نسبة الإشغال اليومي</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-slate-900 font-mono">{averageOccupancyRate}%</span>
                <span className={`text-xs font-bold ${averageOccupancyRate >= 65 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {averageOccupancyRate >= 65 ? 'ضمن المستهدف' : 'إشغال متوسط'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {totalConfirmedPassengers} راكب من أصل {totalTripCapacity} مقعد
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">متوسط التأخير المروري</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-slate-900 font-mono">{avgDelayMinutes}</span>
                <span className="text-xs text-slate-600 font-bold">دقائق / رحلة</span>
              </div>
              <span className={`text-[11px] mt-1 block ${avgDelayMinutes < 10 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {avgDelayMinutes < 10 ? 'ضمن النطاق المقبول (< 10 دقائق)' : 'تأخير يحتاج متابعة ميدانية'}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">الحافلات العاملة الآن</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-slate-900 font-mono">{activeBusesCount}</span>
                <span className="text-xs text-slate-600 font-bold">من أصل {totalBuses}</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">إجمالي السعة التشغيلية: {totalCapacitySum} راكب</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">وفر رحلات العودة المدمجة</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-emerald-600 font-mono">{savedBusesFromConsolidation}</span>
                <span className="text-xs text-slate-600 font-bold">باص تم توفيره</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {proposals.filter(p => p.status === 'pending').length} توصية دمج قيد المراجعة
              </span>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              <span>مقارنة أداء الخطوط والجامعات</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold">
                    <th className="pb-3 pr-2">الجامعة</th>
                    <th className="pb-3">المدينة / النطاق</th>
                    <th className="pb-3">إجمالي الطلاب الفعليين</th>
                    <th className="pb-3">الحالة التشغيلية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {universities.map((uni) => {
                    const uniStudentIds = new Set<string>();
                    users.filter(u => u.role === 'student' && u.universityId === uni.id).forEach(u => uniStudentIds.add(u.id));
                    subscriptions.filter(s => s.universityId === uni.id).forEach(s => uniStudentIds.add(s.studentId));
                    trips.filter(t => t.universityId === uni.id).forEach(t => (t.manifest || []).forEach(m => uniStudentIds.add(m.studentId)));
                    const dynamicCount = Math.max(uniStudentIds.size, uni.totalStudents || 0);

                    return (
                      <tr key={uni.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-2 font-bold text-slate-900">{uni.nameAr}</td>
                        <td className="py-3 text-slate-500">{uni.city}</td>
                        <td className="py-3 font-mono font-bold text-slate-700">{dynamicCount} طالب</td>
                        <td className="py-3">
                          <span className={`text-[11px] font-bold ${uni.activeStatus ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {uni.activeStatus ? 'نشطة' : 'متوقفة'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TRIPS */}
      {activeTab === 'trips' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">الرحلات المجدولة ({filteredTripsList.length})</h3>
              <span className="text-xs text-slate-400 font-mono">تاريخ التشغيل النشط: {activeOperatingDate}</span>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={tripsSearch}
                onChange={(e) => setTripsSearch(e.target.value)}
                placeholder="بحث بالكود، الجامعة، السائق، اللوحة..."
                className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white outline-hidden"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold">
                  <th className="pb-3 pr-2">كود الرحلة</th>
                  <th className="pb-3">خط السير والجامعة</th>
                  <th className="pb-3">التاريخ والموعد</th>
                  <th className="pb-3">الحافلة والسائق</th>
                  <th className="pb-3">الإشغال</th>
                  <th className="pb-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTripsList.map((trip) => {
                  const confirmedCount = (trip.manifest || []).filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
                  const statusMeta = tripStatusArabicMap[trip.status] || { label: trip.status, cls: 'bg-slate-100 text-slate-700' };

                  return (
                    <tr key={trip.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-2 font-mono font-bold text-slate-900">{trip.code}</td>
                      <td className="py-3">
                        <div className="font-bold text-slate-800">{trip.lineNameAr}</div>
                        <div className="text-[10px] text-slate-400">{trip.universityNameAr}</div>
                      </td>
                      <td className="py-3 font-mono font-bold text-slate-700">
                        <div>{trip.scheduledTime}</div>
                        <div className="text-[10px] text-slate-400">{trip.date}</div>
                      </td>
                      <td className="py-3">
                        <div className="text-slate-800 font-bold">{trip.driverNameAr}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{trip.busPlate} (سعة {trip.capacity})</div>
                      </td>
                      <td className="py-3 font-mono font-bold text-slate-800">
                        {confirmedCount} / {trip.capacity}
                      </td>
                      <td className="py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Trip Modal */}
      {showAddTripModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">جدولة رحلة جديدة</h3>
              <button
                onClick={() => setShowAddTripModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTripSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-600 font-bold block mb-1">تاريخ الرحلة:</label>
                <input
                  type="date"
                  value={newTripDate}
                  onChange={(e) => setNewTripDate(e.target.value)}
                  className="w-full p-2.5 border rounded-xl font-mono bg-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">الجامعة:</label>
                <select
                  value={newTripUni}
                  onChange={(e) => setNewTripUni(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-white"
                >
                  {universities.map(u => (
                    <option key={u.id} value={u.id}>{u.nameAr}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">خط السير:</label>
                <select
                  value={newTripLine}
                  onChange={(e) => setNewTripLine(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-white"
                >
                  {lines.map(l => (
                    <option key={l.id} value={l.id}>{l.nameAr}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-bold block mb-1">الاتجاه:</label>
                  <select
                    value={newTripDirection}
                    onChange={(e) => setNewTripDirection(e.target.value as any)}
                    className="w-full p-2.5 border rounded-xl bg-white"
                  >
                    <option value="to_university">ذهاب إلى الجامعة</option>
                    <option value="from_university">عودة من الجامعة</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1">الموعد:</label>
                  <select
                    value={newTripTime}
                    onChange={(e) => setNewTripTime(e.target.value)}
                    className="w-full p-2.5 border rounded-xl font-mono bg-white"
                  >
                    <option value="07:00 ص">07:00 ص</option>
                    <option value="09:00 ص">09:00 ص</option>
                    <option value="12:00 ظهراً">12:00 ظهراً</option>
                    <option value="01:00 م">01:00 م</option>
                    <option value="02:00 م">02:00 م</option>
                    <option value="03:00 م">03:00 م</option>
                    <option value="04:00 م">04:00 م</option>
                    <option value="05:00 م">05:00 م</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-bold block mb-1">الحافلة:</label>
                  <select
                    value={newTripBus}
                    onChange={(e) => setNewTripBus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl bg-white"
                  >
                    {buses.map(b => (
                      <option key={b.id} value={b.id}>{b.code} - {b.plateNumber} (سعة {b.capacity})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1">السائق:</label>
                  <select
                    value={newTripDriver}
                    onChange={(e) => setNewTripDriver(e.target.value)}
                    className="w-full p-2.5 border rounded-xl bg-white"
                  >
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.nameAr}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#0F2537] hover:bg-slate-800 text-white font-bold rounded-xl"
                >
                  إضافة وتثبيت الرحلة
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTripModal(false)}
                  className="py-3 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Waiting Return Bus Allocation Modal */}
      {showWaitingAllocModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4 text-right">
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
