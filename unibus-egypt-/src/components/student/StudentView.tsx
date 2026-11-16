import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Trip, TripStopStatus } from '../../types';
import { computeWaitingBusMetrics } from '../../utils/waitingBusMetrics';
import {
  playDispatchAlertChime,
  triggerBrowserNotification,
  requestBrowserNotificationPermission
} from '../../utils/soundAlerts';
import {
  Bus,
  MapPin,
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Navigation,
  ArrowRight,
  Shield,
  Sparkles,
  CalendarCheck,
  ChevronLeft,
  UserCheck,
  Info,
  Calendar,
  X,
  Send,
  AlertCircle,
  Volume2,
  VolumeX
} from 'lucide-react';

export const StudentView: React.FC = () => {
  const {
    currentUser,
    trips,
    tripTemplates,
    confirmStudentRsvp,
    setStudentReturnReady,
    settings,
    universities,
    lines,
    activeOperatingDate,
    isCutoffPassedForTomorrow,
    exceptionalRequests,
    submitExceptionalBooking,
    addToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'tracking' | 'booking'>('tracking');
  const [bookingDirection, setBookingDirection] = useState<'to_university' | 'from_university'>('to_university');
  const [selectedOperatingDate, setSelectedOperatingDate] = useState<string>(activeOperatingDate);

  useEffect(() => {
    if (activeOperatingDate) {
      setSelectedOperatingDate(activeOperatingDate);
    }
  }, [activeOperatingDate]);

  // Modal for exceptional request after 10 PM
  const [showExceptionalModal, setShowExceptionalModal] = useState<boolean>(false);
  const [exceptionalReason, setExceptionalReason] = useState<string>('');
  const [exceptionalTargetSlot, setExceptionalTargetSlot] = useState<{
    scheduledTime: string;
    direction: 'to_university' | 'from_university';
    tripId?: string;
  } | null>(null);

  const myUniversity = universities.find(u => u.id === currentUser.universityId) || universities[0];
  const myLine = lines.find(l => l.id === currentUser.lineId) || lines[0];
  const myStation = myLine?.stations.find(s => s.id === currentUser.stationId) || myLine?.stations[1] || myLine?.stations[0];

  // Dynamic date helpers anchored to activeOperatingDate
  const addDaysToIso = (isoDate: string, days: number): string => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
    return dt.toISOString().slice(0, 10);
  };

  const formatArabicDayLabel = (isoDate: string): string => {
    if (isoDate === activeOperatingDate) return 'اليوم';
    if (isoDate === addDaysToIso(activeOperatingDate, 1)) return 'غداً';
    try {
      const [y, m, d] = isoDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
      return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
    } catch {
      return isoDate;
    }
  };

  const tomorrowDate = addDaysToIso(activeOperatingDate, 1);
  const bookingDateOptions = [
    activeOperatingDate,
    tomorrowDate,
    addDaysToIso(activeOperatingDate, 2),
    addDaysToIso(activeOperatingDate, 3),
  ];

  const isSameDay = selectedOperatingDate === activeOperatingDate;
  const isViewingTomorrow = selectedOperatingDate === tomorrowDate;
  const isFutureBeyondTomorrow = selectedOperatingDate > tomorrowDate;
  const isSameDayDepartureBlocked = isSameDay && bookingDirection === 'to_university';
  const isTomorrowCutoffClosed = isViewingTomorrow && isCutoffPassedForTomorrow;

  // Trips running on the student's line for selected date & for today
  const myLineTrips = trips.filter(t => t.lineId === myLine?.id && t.date === selectedOperatingDate && t.status !== 'cancelled');
  const todayLineTrips = trips.filter(t => t.lineId === myLine?.id && t.date === activeOperatingDate && t.status !== 'cancelled');

  // Booked trips for the currently selected booking date
  const myBookedTripsForSelectedDate = myLineTrips.filter(t =>
    t.manifest.some(m => m.studentId === currentUser.id && m.rsvpStatus === 'confirmed')
  );

  // Today's booked trips for Header badges & Live Bus Tracking
  const myBookedTripsToday = todayLineTrips.filter(t =>
    t.manifest.some(m => m.studentId === currentUser.id && m.rsvpStatus === 'confirmed')
  );

  const bookedMorningTrip = myBookedTripsToday.find(t => t.direction === 'to_university');
  const bookedReturnTrip = myBookedTripsToday.find(t => t.direction === 'from_university');

  // Student's pending or approved exceptional/advance requests for selectedOperatingDate
  const myExceptionalRequest = exceptionalRequests.find(
    r => r.studentId === currentUser.id && r.date === selectedOperatingDate && r.direction === bookingDirection
  ) || exceptionalRequests.find(
    r => r.studentId === currentUser.id && r.date === selectedOperatingDate
  );

  // Return readiness state ("خلص الجامعة وجاهز وينتظر رحلة العودة") for today
  const todayReturnReadyEntry = trips
    .filter(t => t.date === activeOperatingDate)
    .flatMap(t => t.manifest || [])
    .find(m => m.studentId === currentUser.id && m.readyForReturn === true);
  const isReadyForReturn = Boolean(todayReturnReadyEntry);

  // Live University Bus Availability & Waiting Students Metrics (without exposing bus plate/driver details in Booking tab)
  const campusWaitingMetrics = useMemo(
    () => computeWaitingBusMetrics(trips, activeOperatingDate, myUniversity?.id),
    [trips, activeOperatingDate, myUniversity?.id]
  );

  const arrivedMorningBusesCount = trips.filter(t => {
    if (t.date !== activeOperatingDate || t.universityId !== myUniversity?.id || t.status === 'cancelled') return false;
    return t.direction === 'to_university' && t.stops && t.stops.length > 0 && t.stops[t.stops.length - 1].status === 'arrived';
  }).length;

  const waitingBusesAtCampusCount = campusWaitingMetrics.waitingBuses.length + arrivedMorningBusesCount;
  const waitingBusStudentsCount = campusWaitingMetrics.waitingInBusesCount;
  const finishedUniStudentsCount = campusWaitingMetrics.finishedUniCount;

  // Currently selected booked trip for tracking (defaults to morning booked, or return booked)
  const [selectedBookedDirection, setSelectedBookedDirection] = useState<'morning' | 'return'>('morning');

  // The actual bus/trip the student is viewing in tracking (uses today's booked trips, or selectedOperatingDate booked trips if tracking future)
  const trackingTripsPool = myBookedTripsToday.length > 0 ? myBookedTripsToday : myBookedTripsForSelectedDate;
  const trackingMorningTrip = trackingTripsPool.find(t => t.direction === 'to_university');
  const trackingReturnTrip = trackingTripsPool.find(t => t.direction === 'from_university');
  const myBookedTrips = trackingTripsPool;

  const currentTrip = selectedBookedDirection === 'morning'
    ? (trackingMorningTrip || trackingReturnTrip)
    : (trackingReturnTrip || trackingMorningTrip);

  // Other buses running on the same line and direction for the student's slot/window
  const otherBusesInSlot = currentTrip
    ? trips.filter(
        t =>
          t.lineId === myLine?.id &&
          t.date === currentTrip.date &&
          t.direction === currentTrip.direction &&
          t.id !== currentTrip.id &&
          t.status !== 'cancelled'
      )
    : [];

  // Helper to ensure trips always have stops populated from line stations if empty
  const getTripStops = (trip: Trip): TripStopStatus[] => {
    if (trip.stops && trip.stops.length > 0) return trip.stops;
    if (!myLine?.stations) return [];
    const orderedStations = trip.direction === 'from_university' ? [...myLine.stations].reverse() : myLine.stations;
    return orderedStations.map((st, idx) => ({
      stopId: `gen-${trip.id}-${st.id}`,
      stationId: st.id,
      stationNameAr: st.nameAr,
      orderIndex: idx + 1,
      scheduledArrivalTime: trip.scheduledTime,
      actualArrivalTime: undefined,
      actualDepartureTime: undefined,
      status: trip.status === 'completed' ? ('departed' as const) : ('pending' as const)
    }));
  };

  // Helper to determine bus position relative to student station
  const getBusRelativePosition = (trip: Trip) => {
    if (trip.status === 'completed') {
      return {
        badge: 'اكتملت الرحلة',
        color: 'bg-slate-100 text-slate-700 border-slate-200',
        description: 'وصلت الحافلة إلى وجهتها النهائية واكتملت الرحلة بنجاح.',
        state: 'completed'
      };
    }

    if (trip.status === 'scheduled') {
      return {
        badge: 'في نقطة الانطلاق (لم تتحرك بعد)',
        color: 'bg-sky-50 text-sky-800 border-sky-200',
        description: `الحافلة مجدولة للتحرك الساعة ${trip.scheduledTime} من محطة البداية.`,
        state: 'waiting_start'
      };
    }

    const stops = getTripStops(trip);
    const currentStop = stops[trip.currentStopIndex];
    const myStationIndex = stops.findIndex(s => s.stationId === myStation?.id);

    if (myStationIndex === -1) {
      return {
        badge: 'في الطريق',
        color: 'bg-amber-50 text-amber-800 border-amber-200',
        description: `آخر محطة مؤكدة من السائق: ${trip.lastConfirmedStopName || 'في الطريق'}`,
        state: 'moving'
      };
    }

    if (trip.currentStopIndex < myStationIndex) {
      const stopsLeft = myStationIndex - trip.currentStopIndex;
      const isArrivedCurrent = currentStop?.status === 'arrived';

      if (stopsLeft === 1 && isArrivedCurrent) {
        return {
          badge: 'اقتربت جداً من محطتك!',
          color: 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold animate-pulse ring-2 ring-amber-300',
          description: `الحافلة الآن في محطة (${currentStop?.stationNameAr || trip.lastConfirmedStopName}) وهي المحطة السابقة لمحطتك مباشرة. استعد للركوب!`,
          state: 'approaching'
        };
      }

      return {
        badge: 'في منتصف الطريق (قادمة باتجاهك)',
        color: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
        description: `الحافلة وصلت محطة (${currentStop?.stationNameAr || trip.lastConfirmedStopName})، ويتبقى ${stopsLeft} محطات لتصل إلى محطتك (${myStation?.nameAr}).`,
        state: 'midway'
      };
    }

    if (trip.currentStopIndex === myStationIndex) {
      if (currentStop?.status === 'arrived') {
        return {
          badge: 'الحافلة في محطتك الآن!',
          color: 'bg-emerald-100 text-emerald-950 border-emerald-400 font-black ring-2 ring-emerald-400 animate-pulse',
          description: `وصلت الحافلة إلى محطتك (${myStation?.nameAr}) الآن وتنتظر صعود الطلاب!`,
          state: 'at_my_station'
        };
      } else {
        return {
          badge: 'غادرت محطتك للتو',
          color: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
          description: `غادرت الحافلة محطتك (${myStation?.nameAr}) وهي في طريقها للمحطة التالية.`,
          state: 'departed_my_station'
        };
      }
    }

    return {
      badge: 'تجاوزت محطتك متجهة للحرم الجامعي',
      color: 'bg-slate-100 text-slate-700 border-slate-200',
      description: `الحافلة مرت بمحطتك بالفعل وواصلت طريقها إلى ${trip.universityNameAr}.`,
      state: 'passed'
    };
  };

  const selectedTripStops = currentTrip ? getTripStops(currentTrip) : [];
  const busPositionInfo = currentTrip ? getBusRelativePosition(currentTrip) : null;

  // Active passengers calculation for the currently selected bus
  const boardedStudents = currentTrip?.manifest.filter(m => m.boardedStatus === 'boarded') || [];
  const boardedCount = boardedStudents.length;
  const confirmedCount = currentTrip?.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length || 0;
  const busCapacity = currentTrip?.capacity || 14;
  const spareSeats = Math.max(0, busCapacity - boardedCount);
  const occupancyPercentage = Math.min(100, Math.round((boardedCount / busCapacity) * 100));

  // Sound & Browser Notification Alert when student's bus approaches/arrives at station
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);
  const lastNotifiedBusStateRef = useRef<string>('');

  useEffect(() => {
    const state = busPositionInfo?.state;
    if (!state || !currentTrip) return;
    const key = `${currentTrip.id}_${state}`;
    if (key !== lastNotifiedBusStateRef.current && (state === 'approaching' || state === 'at_my_station')) {
      lastNotifiedBusStateRef.current = key;
      if (soundAlertsEnabled) {
        playDispatchAlertChime('student_alert');
      }
      triggerBrowserNotification(
        state === 'at_my_station' ? 'حافلتك وصلت محطتك الآن!' : 'حافلتك اقتربت من محطتك!',
        busPositionInfo.description
      );
    }
  }, [busPositionInfo, currentTrip, soundAlertsEnabled]);

  const remainingForWaitingDispatch = Math.max(0, campusWaitingMetrics.nearestVehicleTarget - waitingBusStudentsCount);
  const waitingReadinessTone =
    waitingBusesAtCampusCount === 0
      ? { cls: 'bg-slate-100 text-slate-700 border-slate-200', label: 'بانتظار وصول سيارة للجامعة' }
      : remainingForWaitingDispatch === 0
      ? { cls: 'bg-emerald-600 text-white border-emerald-700 animate-pulse', label: 'جاهزة للانطلاق الآن! توجه للسيارة' }
      : remainingForWaitingDispatch <= 4
      ? { cls: 'bg-amber-100 text-amber-950 border-amber-300', label: `وشيكة الانطلاق: متبقي ${remainingForWaitingDispatch} طلاب فقط` }
      : { cls: 'bg-sky-50 text-sky-900 border-sky-200', label: `متبقي ${remainingForWaitingDispatch} طلاب على اكتمال عدد التحرك` };

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-5 pb-24">
      
      {/* 1. Header Profile & Route Summary */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-500">حساب طالب معتمد · اشتراك ساري</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-1">
            أهلاً بك، {currentUser.name}
          </h1>
          <p className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800">{myUniversity?.nameAr}</span>
            <span>·</span>
            <span>خط سيرك: <strong className="text-slate-800">{myLine?.nameAr}</strong></span>
            <span>·</span>
            <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
              محطتك: {myStation?.nameAr}
            </span>
          </p>
        </div>

        {/* Selected Today's Schedule Badges */}
        <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">رحلة الذهاب:</span>
            {bookedMorningTrip ? (
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                {bookedMorningTrip.scheduledTime} (مؤكد)
              </span>
            ) : (
              <span className="text-slate-400 font-medium">لم تحدد بعد</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">رحلة العودة:</span>
            {bookedReturnTrip ? (
              <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                {bookedReturnTrip.scheduledTime} (مؤكد)
              </span>
            ) : (
              <span className="text-slate-400 font-medium">لم تحدد بعد</span>
            )}
          </div>
        </div>
      </div>

      {/* 1.5 Campus Return Readiness, Color-Coded Countdown & 3 Primary Quick Actions */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-sky-200 shadow-xs space-y-4">
        {/* Top Color-Coded Waiting Status & Sound Alert Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-2 ${waitingReadinessTone.cls}`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{waitingReadinessTone.label}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !soundAlertsEnabled;
              setSoundAlertsEnabled(next);
              if (next) requestBrowserNotificationPermission();
            }}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              soundAlertsEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {soundAlertsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundAlertsEnabled ? 'تنبيه الوصول مفعّل' : 'التنبيه صامت'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Count of students inside waiting bus outside university */}
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold text-amber-900 block">
                طلاب داخل سيارة الانتظار بالخارج
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-800">
                  {waitingBusStudentsCount}
                </span>
                <span className="text-xs font-bold text-amber-700">طالب</span>
              </div>
              <span className="text-[10px] text-amber-800/80 font-medium block mt-0.5">
                {waitingBusesAtCampusCount > 0
                  ? `في ${waitingBusesAtCampusCount} سيارة انتظار · المستهدف المتوازن للتحرك: ${campusWaitingMetrics.nearestVehicleTarget} طالب`
                  : 'لا توجد سيارة منتظرة حالياً بالخارج'}
              </span>
            </div>
            <span className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <Bus className="w-5 h-5" />
            </span>
          </div>

          {/* Count of students who finished university */}
          <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold text-emerald-900 block">
                الطلبة الذين خلصوا الجامعة
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-800">
                  {finishedUniStudentsCount}
                </span>
                <span className="text-xs font-bold text-emerald-700">طالب</span>
              </div>
              <span className="text-[10px] text-emerald-800/80 font-medium block mt-0.5">
                أعلموا المشرف بانتظار العودة
              </span>
            </div>
            <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </span>
          </div>
        </div>

        {/* 3 Essential Action Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setStudentReturnReady(activeOperatingDate, currentUser.id, !isReadyForReturn)}
            className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] cursor-pointer ${
              isReadyForReturn
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-200'
                : 'bg-linear-to-r from-[#0F2537] to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${isReadyForReturn ? 'text-emerald-100' : 'text-amber-400'}`} />
            <span>{isReadyForReturn ? '✓ خلصت الجامعة (إلغاء؟)' : '1. خلصت الجامعة الآن'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 border cursor-pointer ${
              activeTab === 'tracking'
                ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
            }`}
          >
            <Navigation className="w-4 h-4 text-amber-600 shrink-0" />
            <span>2. تتبع باصي الآن</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedOperatingDate(tomorrowDate);
              setActiveTab('booking');
            }}
            className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 border cursor-pointer ${
              activeTab === 'booking'
                ? 'bg-sky-50 border-sky-400 text-sky-950 ring-2 ring-sky-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
            }`}
          >
            <CalendarCheck className="w-4 h-4 text-sky-600 shrink-0" />
            <span>3. حجز الغد / العودة</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs (Only 2 Tabs: Tracking His Bus, and Quick Booking) */}
      <div className="bg-slate-200/80 p-1.5 rounded-2xl flex text-xs font-extrabold gap-1">
        <button
          onClick={() => setActiveTab('tracking')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'tracking'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 bg-transparent'
          }`}
        >
          <Navigation className="w-4 h-4 text-amber-400" />
          <span>موقع باصي والركاب المباشر</span>
        </button>

        <button
          onClick={() => setActiveTab('booking')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'booking'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 bg-transparent'
          }`}
        >
          <CalendarCheck className="w-4 h-4 text-emerald-400" />
          <span>تسجيل موعد الذهاب والعودة</span>
        </button>
      </div>

      {/* ========================================================
          TAB 1: LIVE BUS LOCATION & PASSENGER OCCUPANCY
          (Strictly restricted to the student's booked trip/bus)
      ======================================================== */}
      {activeTab === 'tracking' && (
        <div className="space-y-4">

          {/* Case 1: Student is NOT booked on any trip today */}
          {myBookedTrips.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
                <Calendar className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  لست مسجلاً في أي رحلة حالياً
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                  لم تقم بتأكيد موعد الذهاب أو العودة لليوم بعد. لتتمكن من تتبع باصك ومعرفة موقعه وعدد الطلاب بداخلها، يرجى تسجيل موعدك أولاً.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('booking')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0F2537] hover:bg-slate-800 text-white font-bold text-xs rounded-2xl shadow-md transition-all active:scale-95"
              >
                <CalendarCheck className="w-4 h-4 text-amber-400" />
                <span>تسجيل موعد الذهاب أو العودة الآن</span>
              </button>
            </div>
          ) : (
            <>
              {/* If booked on BOTH morning and return: clean toggle between ONLY those 2 buses */}
              {bookedMorningTrip && bookedReturnTrip && (
                <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs flex gap-2">
                  <button
                    onClick={() => setSelectedBookedDirection('morning')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                      selectedBookedDirection === 'morning'
                        ? 'bg-amber-50 border border-amber-300 text-slate-900 ring-2 ring-amber-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Bus className="w-4 h-4 text-amber-500" />
                    <span>باص رحلة الذهاب ({bookedMorningTrip.scheduledTime})</span>
                  </button>

                  <button
                    onClick={() => setSelectedBookedDirection('return')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                      selectedBookedDirection === 'return'
                        ? 'bg-sky-50 border border-sky-300 text-slate-900 ring-2 ring-sky-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Bus className="w-4 h-4 text-sky-600" />
                    <span>باص رحلة العودة ({bookedReturnTrip.scheduledTime})</span>
                  </button>
                </div>
              )}

              {/* Main Bus Tracking Card (Only for student's booked bus) */}
              {currentTrip && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  
                  {/* Header with Bus Plate & Status */}
                  <div className="bg-[#0F2537] text-white p-5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shadow-md">
                          <Bus className="w-6 h-6" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold block">
                              {settings.studentAssignmentMode === 'auto_assigned'
                                ? `حافلتك المخصصة: باص ${currentTrip.busPlate}`
                                : `حافلة متجهة على خطك: باص ${currentTrip.busPlate}`}
                            </span>
                            <span className="text-xs bg-slate-800 text-amber-300 px-2 py-0.5 rounded-md font-mono font-bold">
                              {currentTrip.code}
                            </span>
                          </div>
                          <span className="text-xs text-slate-300 block mt-0.5">
                            السائق: <strong>{currentTrip.driverNameAr}</strong> · موعدك المسجل: <strong>{currentTrip.scheduledTime}</strong> ({currentTrip.direction === 'to_university' ? 'رحلة الذهاب صباحاً' : 'رحلة العودة'})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${currentTrip.driverPhone}`}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                          title="اتصال هاتفي مباشر بالسائق"
                        >
                          <Phone className="w-4 h-4" />
                          <span>اتصال بالسائق ({currentTrip.driverPhone})</span>
                        </a>
                      </div>
                    </div>

                    {/* Exact Location State Banner: هل هي مشت أم في منتصف الطريق أم في محطتك */}
                    {busPositionInfo && (
                      <div className="mt-4 pt-4 border-t border-slate-700/80 space-y-2">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-400 font-extrabold">موقع الحافلة بالنسبة لمحطتك:</span>
                            <span className={`px-3 py-1 rounded-xl text-xs font-black border ${busPositionInfo.color}`}>
                              {busPositionInfo.badge}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-300 font-mono">
                            آخر تسجيل مؤكد من السائق: {currentTrip.lastConfirmedTime || '07:14 ص'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-200 bg-slate-800/80 p-3 rounded-xl border border-slate-700 leading-relaxed">
                          📢 <strong>تحديث المسار:</strong> {busPositionInfo.description}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-5 space-y-6">

                    {/* REQUIREMENT: عدد الطلبة الموجودة في السيارة التي تتحرك في الخط (يشوف العربية فيها كم واحد) */}
                    <div className="bg-linear-to-b from-amber-50/60 to-slate-50 border-2 border-amber-200 rounded-3xl p-5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                            <Users className="w-5 h-5 text-amber-600" />
                            <span>كم طالب موجود في حافلتك الآن؟</span>
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            العدد الفعلي للركاب الذين صعدوا الباص مع السائق حتى هذه اللحظة.
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold bg-white px-3 py-1 rounded-xl border border-slate-200 text-slate-700 shadow-2xs">
                          سعة الحافلة: {busCapacity} راكب
                        </span>
                      </div>

                      {/* Big numbers strip */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                        <div className="bg-white p-4 rounded-2xl border-2 border-emerald-300 shadow-xs">
                          <span className="text-xs text-slate-600 font-bold block">
                            الطلاب داخل السيارة الآن
                          </span>
                          <div className="flex items-baseline justify-center gap-1 mt-1">
                            <span className="text-4xl font-black text-emerald-700 font-mono">
                              {boardedCount}
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                              من {busCapacity} طالب
                            </span>
                          </div>
                          <span className="text-[11px] text-emerald-800 font-bold mt-1 block">
                            صعدوا بالفعل مع السائق
                          </span>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                          <span className="text-xs text-slate-600 font-bold block">
                            المقاعد الشاغرة المتبقية
                          </span>
                          <div className="flex items-baseline justify-center gap-1 mt-1">
                            <span className="text-4xl font-black text-amber-600 font-mono">
                              {spareSeats}
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                              مقاعد فارغة
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 mt-1 block">
                            متاحة للصعود في المحطات التالية
                          </span>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                          <span className="text-xs text-slate-600 font-bold block">
                            إجمالي الحجوزات المؤكدة
                          </span>
                          <div className="flex items-baseline justify-center gap-1 mt-1">
                            <span className="text-4xl font-black text-slate-800 font-mono">
                              {confirmedCount}
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                              طالب مسجل
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 mt-1 block">
                            مسجلين لحضور هذه الرحلة
                          </span>
                        </div>
                      </div>

                      {/* Capacity & Occupancy Bar (No individual seat numbers - open capacity pool) */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-amber-500" />
                            <span>مستوى إشغال الحافلة اللحظي (سعة إجمالية بدون ترقيم للمقاعد)</span>
                          </span>
                          <span className="text-xs font-bold text-emerald-700 font-mono">
                            نسبة الامتلاء: {occupancyPercentage}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                boardedCount >= busCapacity ? 'bg-rose-600' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${occupancyPercentage}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>{boardedCount >= busCapacity ? '⚠️ الحافلة ممتلئة بالكامل' : `متبقي ${spareSeats} مقاعد شاغرة للركاب القادمين`}</span>
                            <span className="font-mono">{boardedCount} / {busCapacity}</span>
                          </div>
                        </div>
                      </div>

                      {/* List of currently boarded students preview */}
                      <div className="pt-2 border-t border-slate-200 text-xs">
                        <span className="text-slate-700 text-xs block mb-2 font-extrabold flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-emerald-600" />
                          <span>قائمة الطلاب الموجودين داخل الحافلة حالياً ({boardedCount}):</span>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {boardedStudents.map((m, idx) => (
                            <span
                              key={idx}
                              className="bg-gradient-to-r from-emerald-100 via-teal-50 to-emerald-100 border border-emerald-400 text-emerald-950 text-xs font-black px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-xs"
                            >
                              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-2xs font-bold">✓</span>
                              <span>{m.studentName}</span>
                              <span className="text-[10px] text-emerald-800 bg-white/90 px-1.5 py-0.2 rounded font-bold border border-emerald-200">
                                ركب من {m.stationNameAr.split('-')[0]}
                              </span>
                            </span>
                          ))}
                          {boardedCount === 0 && (
                            <div className="text-slate-500 text-xs bg-white p-3 rounded-xl border border-slate-200 w-full text-center">
                              لم يصعد أي طالب بعد في هذه الحافلة (ما زالت في بداية خط السير أو بانتظار الركاب).
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Multi-Bus & Fleet Assignment Status Section */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5 shadow-2xs">
                      {/* Allocation Mode Banner */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${settings.studentAssignmentMode === 'auto_assigned' ? 'bg-emerald-500' : 'bg-sky-500'} animate-pulse`} />
                          <span className="text-xs font-bold text-slate-700">
                            نظام تخصيص المقاعد الحالي:
                          </span>
                        </div>
                        {settings.studentAssignmentMode === 'auto_assigned' ? (
                          <span className="text-[11px] font-black bg-emerald-50 text-emerald-900 border border-emerald-300 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>🎯 تم تخصيصك رسمياً في هذه الحافلة (باص {currentTrip.busPlate})</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-black bg-sky-50 text-sky-900 border border-sky-300 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs">
                            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                            <span>⚡ صعود مرن حر: يمكنك ركوب أي حافلة تصل لمحطتك في هذا الموعد</span>
                          </span>
                        )}
                      </div>

                      {/* Does another bus follow this current bus? */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <Bus className="w-4 h-4 text-sky-600" />
                            <span>هل توجد سيارات أخرى ستتجه إليك بعد السيارة الحالية؟</span>
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">
                            {otherBusesInSlot.length > 0 ? `${otherBusesInSlot.length} حافلة إضافية على الخط` : 'حافلة واحدة فقط'}
                          </span>
                        </div>

                        {otherBusesInSlot.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl text-xs space-y-2">
                              <span className="text-sky-950 font-bold block text-[11px]">
                                نعم، توجد حافلات أخرى تسير في هذا الخط وتتبع الحافلة الحالية:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {otherBusesInSlot.map((otherTrip) => {
                                  const otherBoarded = otherTrip.manifest.filter(m => m.boardedStatus === 'boarded').length;
                                  return (
                                    <div key={otherTrip.id} className="p-2.5 bg-white rounded-lg border border-sky-200/90 shadow-2xs space-y-1">
                                      <div className="flex items-center justify-between font-mono text-[11px]">
                                        <span className="font-bold text-slate-900 flex items-center gap-1">
                                          <Bus className="w-3 h-3 text-sky-600" />
                                          <span>لوحة: {otherTrip.busPlate}</span>
                                        </span>
                                        <span className="bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded font-sans font-bold text-[10px]">
                                          موعد: {otherTrip.scheduledTime}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-600 flex justify-between">
                                        <span>السائق: <strong>{otherTrip.driverNameAr}</strong></span>
                                        <a href={`tel:${otherTrip.driverPhone}`} className="text-emerald-700 hover:underline font-mono">
                                          {otherTrip.driverPhone}
                                        </a>
                                      </div>
                                      <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-slate-100">
                                        <span>سعة: {otherTrip.capacity} راكب</span>
                                        <span className="text-emerald-700 font-bold">ركب بها: {otherBoarded}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                            <Info className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>
                              هذه هي الحافلة الوحيدة المجدولة لهذا الموعد على خطك، وتم تجهيزها بسعة كافية لاستيعاب جميع الطلاب المسجلين بالمحطات.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Visual Stations Route Timeline */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-amber-500" />
                          <span>محطات خط السير وموقع الحافلة اللحظي بالنسبة لمحطتك</span>
                        </h3>
                        <span className="text-xs bg-sky-50 text-sky-900 border border-sky-200 px-2.5 py-1 rounded-lg font-bold">
                          محطتك المقررة: <strong className="text-sky-950">{myStation?.nameAr}</strong>
                        </span>
                      </div>

                      {/* Timeline Component */}
                      <div className="relative border-r-2 border-slate-200 pr-5 mr-3 space-y-3.5">
                        {selectedTripStops.map((stop, idx) => {
                          const isPassed = stop.status === 'departed';
                          const isCurrent = stop.status === 'arrived';
                          const isMyStop = stop.stationId === myStation?.id;

                          return (
                            <div
                              key={stop.stopId || idx}
                              className={`relative p-4 rounded-2xl border transition-all ${
                                isMyStop
                                  ? 'bg-sky-50/90 border-sky-400 ring-2 ring-sky-300 shadow-sm'
                                  : isCurrent
                                  ? 'bg-amber-50 border-amber-400 shadow-sm ring-2 ring-amber-200'
                                  : isPassed
                                  ? 'bg-slate-50 border-slate-200 opacity-75'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              {/* Distinctive Dot on line */}
                              <div
                                className={`absolute -right-[29px] top-4.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center transition-all ${
                                  isPassed
                                    ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs'
                                    : isCurrent
                                    ? 'bg-gradient-to-tr from-amber-500 to-amber-300 ring-4 ring-amber-300 scale-125 text-slate-950 shadow-md'
                                    : isMyStop
                                    ? 'bg-gradient-to-tr from-sky-600 to-sky-400 ring-4 ring-sky-200 text-white'
                                    : 'bg-slate-300'
                                }`}
                              >
                                {isPassed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-white stroke-[3]" />
                                ) : isCurrent ? (
                                  <div className="w-2 h-2 bg-slate-950 rounded-full animate-ping"></div>
                                ) : null}
                              </div>

                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-sm text-slate-900">
                                      {stop.stationNameAr}
                                    </span>

                                    {isMyStop && (
                                      <span className="bg-sky-600 text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-lg shadow-2xs">
                                        📍 محطتك المقررة للركوب
                                      </span>
                                    )}

                                    {isCurrent && (
                                      <span className="bg-amber-500 text-slate-950 font-black text-[11px] px-2.5 py-0.5 rounded-lg flex items-center gap-1 animate-pulse shadow-2xs">
                                        <Bus className="w-3.5 h-3.5" />
                                        <span>الباص متوقف هنا الآن!</span>
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-2 font-mono flex-wrap">
                                    <span>الموعد المجدول: {stop.scheduledArrivalTime || currentTrip.scheduledTime}</span>
                                    {stop.actualArrivalTime && (
                                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.2 rounded">
                                        وصل فعلياً: {stop.actualArrivalTime}
                                      </span>
                                    )}
                                    {stop.actualDepartureTime && (
                                      <span className="text-slate-500">
                                        · غادر: {stop.actualDepartureTime}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="text-left shrink-0">
                                  {isPassed ? (
                                    <span className="text-[11px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" />
                                      <span>تم المرور بنجاح</span>
                                    </span>
                                  ) : isCurrent ? (
                                    <span className="text-[11px] font-black text-amber-950 bg-amber-200 px-2.5 py-1 rounded-lg ring-2 ring-amber-300">
                                      متوقف بالمحطة الآن
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                      قادم لاحقاً
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cancel reservation button if needed */}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 bg-slate-50 p-4 rounded-2xl">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          حالة حجزك في هذه الرحلة:
                        </span>
                        <span className="text-xs text-emerald-800 font-bold">
                          ✅ مقعدك مؤكد في رحلة ({currentTrip.scheduledTime})
                        </span>
                      </div>

                      <button
                        onClick={() => confirmStudentRsvp(currentTrip.id, currentUser.id, 'excused')}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold rounded-xl transition-colors"
                      >
                        إلغاء الحجز / الاعتذار عن هذه الرحلة
                      </button>
                    </div>

                  </div>
                </div>
              )}
            </>
          )}

          {/* Testing tip banner */}
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-sky-900">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>التحديث المتزامن:</strong> عندما يقوم السائق في شاشته بتأكيد صعود الطلاب أو تسجيل الوصول للمحطات، يتم تحديث موقع الباص وعدد الركاب هنا في نفس اللحظة تلقائياً.
            </div>
          </div>

        </div>
      )}

      {/* ========================================================
          TAB 2: FAST & EASY TRIP BOOKING (تسجيل المواعيد فقط - بدون تفاصيل الباصات)
      ======================================================== */}
      {activeTab === 'booking' && (() => {
        // Group trips by scheduledTime for the selected direction (NO bus plates / drivers shown here!)
        const tripsForDirection = myLineTrips.filter(t => t.direction === bookingDirection);
        const slotMap = new Map<string, {
          scheduledTime: string;
          trips: Trip[];
          bookedTrip?: Trip;
          totalCapacity: number;
          totalConfirmed: number;
        }>();

        tripsForDirection.forEach(t => {
          if (!slotMap.has(t.scheduledTime)) {
            slotMap.set(t.scheduledTime, {
              scheduledTime: t.scheduledTime,
              trips: [],
              bookedTrip: undefined,
              totalCapacity: 0,
              totalConfirmed: 0,
            });
          }
          const entry = slotMap.get(t.scheduledTime)!;
          entry.trips.push(t);
          entry.totalCapacity += t.capacity || 0;
          entry.totalConfirmed += (t.manifest || []).filter(
            m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported'
          ).length;
          if ((t.manifest || []).some(m => m.studentId === currentUser.id && m.rsvpStatus === 'confirmed')) {
            entry.bookedTrip = t;
          }
        });

        // Also include default active templates for tomorrow / future days when trips aren't generated yet
        if (slotMap.size === 0 || isViewingTomorrow || isFutureBeyondTomorrow) {
          tripTemplates
            .filter(tmpl =>
              tmpl.activeStatus &&
              tmpl.direction === bookingDirection &&
              (!tmpl.lineId || tmpl.lineId === myLine?.id) &&
              (!tmpl.universityId || tmpl.universityId === myUniversity?.id)
            )
            .forEach(tmpl => {
              if (!slotMap.has(tmpl.time)) {
                slotMap.set(tmpl.time, {
                  scheduledTime: tmpl.time,
                  trips: [],
                  bookedTrip: undefined,
                  totalCapacity: 0,
                  totalConfirmed: 0,
                });
              }
            });
        }

        const timeSlots = Array.from(slotMap.values());

        const handleSlotBooking = async (slot: typeof timeSlots[number]) => {
          if (slot.bookedTrip) {
            await confirmStudentRsvp(slot.bookedTrip.id, currentUser.id, 'excused');
            return;
          }

          if (isSameDayDepartureBlocked) {
            addToast('التسجيل لرحلات الذهاب مغلق في نفس اليوم. يمكنك التسجيل للغد أو الأيام القادمة.', 'error');
            return;
          }

          if (isTomorrowCutoffClosed) {
            setExceptionalTargetSlot({
              scheduledTime: slot.scheduledTime,
              direction: bookingDirection,
              tripId: slot.trips[0]?.id,
            });
            setShowExceptionalModal(true);
            return;
          }

          // Pick the first non-full trip in this time slot (student does not see/choose specific bus)
          const availableTrip = slot.trips.find(t => {
            const conf = (t.manifest || []).filter(
              m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported'
            ).length;
            return conf < (t.capacity || 14);
          });

          if (availableTrip) {
            await confirmStudentRsvp(availableTrip.id, currentUser.id, 'confirmed');
            setSelectedBookedDirection(bookingDirection === 'to_university' ? 'morning' : 'return');
          } else if (slot.trips.length === 0) {
            // Advance registration when supervisor hasn't published trips for that future date yet
            await submitExceptionalBooking({
              studentId: currentUser.id,
              studentName: currentUser.name,
              phone: currentUser.phone,
              universityId: myUniversity?.id || 'uni-1',
              universityNameAr: myUniversity?.nameAr || '',
              lineId: myLine?.id || 'line-1',
              lineNameAr: myLine?.nameAr || '',
              stationId: myStation?.id || 'st-default',
              stationNameAr: myStation?.nameAr || 'المحطة المعتمدة',
              date: selectedOperatingDate,
              direction: bookingDirection,
              scheduledTime: slot.scheduledTime,
              reason: `تسجيل موعد مسبق ليوم ${selectedOperatingDate}`
            });
          } else {
            addToast('عذراً، هذا الموعد مكتمل العدد حالياً.', 'error');
          }
        };

        return (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-emerald-600" />
                  <span>تسجيل موعد الذهاب والعودة</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  يقتصر الإجراء هنا على تسجيل الموعد المناسب فقط؛ وتظهر تفاصيل الحافلة المخصصة في صفحة «موقع باصي والركاب المباشر».
                </p>
              </div>

              {/* Dynamic Day Selector (Today, Tomorrow, Future Days) */}
              <div className="flex flex-wrap bg-slate-100 p-1 rounded-2xl text-xs font-bold gap-1 shrink-0">
                {bookingDateOptions.map((dateOpt, idx) => {
                  const isTomorrowOpt = dateOpt === tomorrowDate;
                  return (
                    <button
                      key={dateOpt}
                      type="button"
                      onClick={() => setSelectedOperatingDate(dateOpt)}
                      className={`px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                        selectedOperatingDate === dateOpt
                          ? 'bg-[#0F2537] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{idx <= 1 ? `${formatArabicDayLabel(dateOpt)} (${dateOpt.slice(5)})` : formatArabicDayLabel(dateOpt)}</span>
                      {isTomorrowOpt && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isCutoffPassedForTomorrow ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                        }`}>
                          {isCutoffPassedForTomorrow ? 'مغلق' : 'متاح'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* University Campus Bus Availability Banner (No bus plate/driver details exposed) */}
            <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              waitingBusesAtCampusCount > 0
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-start gap-2.5">
                <Bus className={`w-5 h-5 shrink-0 mt-0.5 ${waitingBusesAtCampusCount > 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                <div>
                  <strong className="font-extrabold block">
                    حالة توافر الباصات والمنتظرين بالجامعة الآن ({myUniversity?.nameAr}):
                  </strong>
                  <span className="mt-0.5 block">
                    {waitingBusesAtCampusCount > 0
                      ? `توجد سيارة منتظرة في الخارج الآن ويوجد بداخلها (${waitingBusStudentsCount}) طالب · إجمالي من خلصوا الجامعة (${finishedUniStudentsCount}) طالب.`
                      : `لا توجد سيارة منتظرة بالخارج حالياً — إجمالي الطلاب الذين خلصوا الجامعة الآن (${finishedUniStudentsCount}) طالب.`}
                  </span>
                </div>
              </div>
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl shrink-0 ${
                waitingBusesAtCampusCount > 0
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-slate-950'
              }`}>
                {waitingBusesAtCampusCount > 0 ? `${waitingBusStudentsCount} طالب بالسيارة` : 'بانتظار الوصول'}
              </span>
            </div>

            {/* Cutoff / Same-Day Rule Notification */}
            {isSameDay && (
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
                bookingDirection === 'to_university'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}>
                <Info className={`w-5 h-5 shrink-0 mt-0.5 ${bookingDirection === 'to_university' ? 'text-rose-600' : 'text-sky-600'}`} />
                <div>
                  <strong className="font-extrabold block mb-0.5">
                    {bookingDirection === 'to_university'
                      ? 'لا يمكن تسجيل موعد الذهاب في نفس اليوم'
                      : 'تسجيل موعد العودة متاح اليوم بشكل طبيعي'}
                  </strong>
                  <span>
                    {bookingDirection === 'to_university'
                      ? 'قواعد التشغيل تمنع تسجيل رحلة الذهاب في نفس اليوم؛ يمكنك اختيار «غداً» أو أي يوم قادم لتسجيل موعد الذهاب (قبل 10:00 مساءً).'
                      : 'يمكنك تسجيل أو تعديل موعد العودة اليوم وتأكيد جاهزيتك فور انتهاء محاضراتك.'}
                  </span>
                </div>
              </div>
            )}

            {isViewingTomorrow && (
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
                isCutoffPassedForTomorrow
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${isCutoffPassedForTomorrow ? 'text-rose-600' : 'text-emerald-600'}`} />
                <div>
                  <strong className="font-extrabold block mb-0.5">
                    {isCutoffPassedForTomorrow
                      ? 'تم إغلاق التسجيل المباشر لرحلات الغد بعد الساعة 10:00 مساءً'
                      : 'التسجيل لرحلات الغد مفتوح حتى الساعة 10:00 مساءً'}
                  </strong>
                  <span>
                    {isCutoffPassedForTomorrow
                      ? 'يُغلق الحجز تماماً بعد 10:00 م من الليلة السابقة للرحلة. يمكنك إرسال طلب استثنائي للمشرف للمراجعة.'
                      : 'يمكنك تسجيل موعد الذهاب والعودة للغد أو الأيام القادمة قبل الساعة 10:00 مساءً.'}
                  </span>
                </div>
              </div>
            )}

            {isFutureBeyondTomorrow && (
              <div className="p-4 rounded-2xl border bg-emerald-50 border-emerald-200 text-emerald-900 text-xs leading-relaxed flex items-start gap-3">
                <CalendarCheck className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
                <div>
                  <strong className="font-extrabold block mb-0.5">التسجيل المسبق مفتوح ليوم {formatArabicDayLabel(selectedOperatingDate)}</strong>
                  <span>يمكنك تسجيل مواعيد الذهاب والعودة مسبقاً قبلها بأكثر من يوم وحتى الساعة 10:00 م من الليلة التي تسبق الرحلة.</span>
                </div>
              </div>
            )}

            {/* Pending Exceptional / Pre-booked Request Banner if applicable */}
            {myExceptionalRequest && (
              <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                myExceptionalRequest.status === 'approved'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : myExceptionalRequest.status === 'rejected'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">حالة طلب التسجيل لموعد ({myExceptionalRequest.scheduledTime}): </span>
                    <span className="font-extrabold">
                      {myExceptionalRequest.status === 'approved'
                        ? 'تمت الموافقة وتثبيت الموعد بنجاح!'
                        : myExceptionalRequest.status === 'rejected'
                        ? 'تم الاعتذار لعدم توفر سعة'
                        : 'مسجل ومعلق لمراجعة واعتماد المشرف...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Direction toggle */}
            <div className="flex bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setBookingDirection('to_university')}
                className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                  bookingDirection === 'to_university'
                    ? 'bg-[#0F2537] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                رحلات الذهاب (صباحاً إلى الجامعة)
              </button>
              <button
                type="button"
                onClick={() => setBookingDirection('from_university')}
                className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                  bookingDirection === 'from_university'
                    ? 'bg-[#0F2537] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                رحلات العودة (ظهراً ومساءً من الجامعة)
              </button>
            </div>

            {/* Return Readiness Confirmation Checkbox ("خلص الجامعة وجاهز وينتظر رحلة العودة") */}
            {bookingDirection === 'from_university' && (
              <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                isReadyForReturn
                  ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200/70'
                  : 'bg-slate-50 border-slate-200 hover:border-sky-300'
              }`}>
                <input
                  type="checkbox"
                  checked={isReadyForReturn}
                  onChange={(e) => setStudentReturnReady(activeOperatingDate, currentUser.id, e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-black text-slate-900">
                      خلص الجامعة وجاهز وينتظر رحلة العودة
                    </span>
                    {isReadyForReturn && (
                      <span className="text-[11px] font-black bg-emerald-600 text-white px-2.5 py-0.5 rounded-full">
                        مسجل الآن للمشرف {todayReturnReadyEntry?.readyForReturnAt ? `(${todayReturnReadyEntry.readyForReturnAt})` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    فعّل هذه الخانة فور انتهائك من الجامعة ليتم احتسابك مباشرة ضمن الطلاب الجاهزين للعودة في شاشة المشرف الميداني.
                  </p>
                </div>
              </label>
            )}

            {/* Simplified Time-Slot Cards (NO bus list, NO plates, NO drivers, NO per-bus occupancy) */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-600 block">
                {bookingDirection === 'to_university'
                  ? `مواعيد رحلات الذهاب المتاحة لخط (${myLine?.nameAr}):`
                  : `مواعيد رحلات العودة المتاحة من (${myUniversity?.nameAr}):`}
              </span>

              {timeSlots.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  لا توجد مواعيد مفعلة حالياً لهذا الاتجاه في خطك.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {timeSlots.map((slot) => {
                    const isBooked = Boolean(slot.bookedTrip);
                    const hasPublishedTrips = slot.trips.length > 0;
                    const isFull = hasPublishedTrips && slot.totalConfirmed >= slot.totalCapacity && !isBooked;
                    const isBlockedForMorningToday = isSameDayDepartureBlocked && !isBooked;

                    return (
                      <div
                        key={`${bookingDirection}-${slot.scheduledTime}`}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                          isBooked
                            ? 'bg-gradient-to-br from-emerald-50 via-teal-50/70 to-emerald-100/60 border-2 border-emerald-500 ring-4 ring-emerald-200/50 shadow-md'
                            : isFull || isBlockedForMorningToday
                            ? 'bg-slate-50 border-slate-200 opacity-75'
                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xl font-black font-mono text-slate-900">
                            {slot.scheduledTime}
                          </span>
                          {isBooked ? (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center gap-1 shadow-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100 stroke-[3]" />
                              <span>موعدك المسجل</span>
                            </span>
                          ) : (
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                isBlockedForMorningToday
                                  ? 'bg-rose-100 text-rose-800'
                                  : isFull
                                  ? 'bg-rose-100 text-rose-800'
                                  : isTomorrowCutoffClosed
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-50 text-emerald-800'
                              }`}
                            >
                              {isBlockedForMorningToday
                                ? 'مغلق اليوم'
                                : isFull
                                ? 'مكتمل'
                                : isTomorrowCutoffClosed
                                ? 'بعد 10:00 م'
                                : 'متاح للتسجيل'}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">الاتجاه:</span>
                            <span className="font-bold text-slate-800">
                              {bookingDirection === 'to_university' ? 'ذهاب للجامعة' : 'عودة من الجامعة'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">التاريخ:</span>
                            <span className="font-mono font-bold text-slate-700">{selectedOperatingDate}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                          {isBooked ? (
                            <button
                              type="button"
                              onClick={() => handleSlotBooking(slot)}
                              className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              إلغاء تسجيل الموعد
                            </button>
                          ) : isBlockedForMorningToday ? (
                            <button
                              type="button"
                              disabled
                              className="w-full py-2.5 bg-slate-200 text-slate-500 text-xs font-bold rounded-xl cursor-not-allowed"
                            >
                              غير متاح التسجيل للذهاب اليوم
                            </button>
                          ) : isTomorrowCutoffClosed ? (
                            <button
                              type="button"
                              onClick={() => handleSlotBooking(slot)}
                              className="w-full py-2.5 text-xs font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                              <AlertCircle className="w-4 h-4 text-amber-100" />
                              <span>طلب تسجيل استثنائي (بعد 10 م)</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSlotBooking(slot)}
                              disabled={isFull}
                              className={`w-full py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                isFull
                                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  : bookingDirection === 'to_university'
                                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-md shadow-emerald-900/20 active:scale-[0.98] border border-emerald-400'
                                  : 'bg-gradient-to-r from-sky-600 via-teal-600 to-sky-700 hover:from-sky-700 hover:to-teal-800 text-white shadow-md shadow-sky-900/20 active:scale-[0.98] border border-sky-400'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4 text-white/90 stroke-[3]" />
                              <span>تأكيد تسجيل الموعد</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Exceptional Late Booking Modal */}
      {showExceptionalModal && exceptionalTargetSlot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-right border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-slate-900">طلب تسجيل استثنائي بعد 10:00 م</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowExceptionalModal(false); setExceptionalTargetSlot(null); }}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-950 space-y-1">
              <p>
                الموعد المطلوب: <strong>{exceptionalTargetSlot.scheduledTime}</strong> ({exceptionalTargetSlot.direction === 'to_university' ? 'رحلة الذهاب' : 'رحلة العودة'})
              </p>
              <p>الخط: <strong>{myLine?.nameAr}</strong> · محطتك: <strong>{myStation?.nameAr}</strong></p>
              <p className="text-[11px] text-amber-800">
                سيتم إرسال طلبك فوراً للمشرف الميداني ليقوم بمراجعته وتسكينك في الحافلة المناسبة.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">سبب التأخر في التسجيل قبل العاشرة (اختياري):</label>
              <textarea
                value={exceptionalReason}
                onChange={(e) => setExceptionalReason(e.target.value)}
                placeholder="مثال: تغيير موعد المحاضرة أو ظرف طارئ..."
                rows={3}
                className="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white outline-hidden font-medium text-slate-800"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowExceptionalModal(false); setExceptionalTargetSlot(null); }}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  await submitExceptionalBooking({
                    studentId: currentUser.id,
                    studentName: currentUser.name,
                    phone: currentUser.phone,
                    universityId: myUniversity?.id || 'uni-1',
                    universityNameAr: myUniversity?.nameAr || '',
                    lineId: myLine?.id || 'line-1',
                    lineNameAr: myLine?.nameAr || '',
                    stationId: myStation?.id || 'st-default',
                    stationNameAr: myStation?.nameAr || 'المحطة المعتمدة',
                    tripId: exceptionalTargetSlot.tripId,
                    date: selectedOperatingDate,
                    direction: exceptionalTargetSlot.direction,
                    scheduledTime: exceptionalTargetSlot.scheduledTime,
                    reason: exceptionalReason
                  });
                  setShowExceptionalModal(false);
                  setExceptionalTargetSlot(null);
                  setExceptionalReason('');
                }}
                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال الطلب للمشرف</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Operations Contact Bar */}
      <div className="bg-[#0F2537] text-white rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2 text-center sm:text-right">
          <Shield className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-xs">
            غرفة طوارئ العمليات جاهزة للمساعدة في أي استفسار أو تأخير على خطك.
          </span>
        </div>
        <a
          href={`tel:${settings.contactSupportPhone}`}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-colors shrink-0"
        >
          <Phone className="w-4 h-4" />
          <span>اتصال بالطوارئ: {settings.contactSupportPhone}</span>
        </a>
      </div>

    </div>
  );
};
