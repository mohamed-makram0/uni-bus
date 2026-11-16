import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { matchesArabicSearch } from '../../utils/arabicSearch';
import {
  Bus,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Sliders,
  Check,
  X,
  UserCheck,
  Info,
  Search,
  Building2
} from 'lucide-react';
import { Trip } from '../../types';

const addDaysToIso = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
};

export const FleetDemandPlanner: React.FC = () => {
  const {
    trips,
    buses,
    drivers,
    lines,
    universities,
    activeOperatingDate,
    availableOperatingDates,
    exceptionalRequests,
    isCutoffPassedForTomorrow,
    toggleSimulateCutoff,
    approveExceptionalBooking,
    rejectExceptionalBooking,
    autoAssignBusesForPlan,
    autoAllocateStudentsToSlotBuses,
    approveDailyPlan,
    swapBusOrDriver
  } = useApp();

  const tomorrowDate = addDaysToIso(activeOperatingDate || '2026-10-20', 1);
  const dateOptions = useMemo(() => {
    const set = new Set<string>([
      tomorrowDate,
      activeOperatingDate || '2026-10-20',
      addDaysToIso(activeOperatingDate || '2026-10-20', 2),
      ...(availableOperatingDates || [])
    ]);
    return Array.from(set).sort();
  }, [activeOperatingDate, tomorrowDate, availableOperatingDates]);

  // Selected date for planning (defaults dynamically to tomorrow)
  const [planningDate, setPlanningDate] = useState<string>(tomorrowDate);
  const [filterDirection, setFilterDirection] = useState<'all' | 'to_university' | 'from_university'>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal for manual slot assignment
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  // Trips scheduled on the planning date
  const dateTrips = useMemo(() => {
    return trips.filter(t => t.date === planningDate);
  }, [trips, planningDate]);

  // Filtered trips for table
  const displayedTrips = useMemo(() => {
    return dateTrips.filter(t => {
      if (filterDirection !== 'all' && t.direction !== filterDirection) return false;
      if (filterLine !== 'all' && t.lineId !== filterLine) return false;
      if (searchQuery.trim()) {
        const studentMatches = (t.manifest || []).some(m =>
          matchesArabicSearch(searchQuery, m.studentName, m.phone, m.stationNameAr)
        );
        const tripMatches = matchesArabicSearch(
          searchQuery,
          t.code,
          t.lineNameAr,
          t.universityNameAr,
          t.driverNameAr,
          t.busPlate,
          t.scheduledTime
        );
        if (!studentMatches && !tripMatches) return false;
      }
      return true;
    });
  }, [dateTrips, filterDirection, filterLine, searchQuery]);

  // Auto-Allocation Details grouped by university for the selected planning date
  const allocationByUniversity = useMemo(() => {
    return universities
      .map(uni => {
        const uniTrips = displayedTrips.filter(t => t.universityId === uni.id);
        const totalStudents = uniTrips.reduce(
          (acc, t) => acc + (t.manifest || []).filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length,
          0
        );
        const totalCapacity = uniTrips.reduce((acc, t) => acc + (t.capacity || 0), 0);
        const uniqueBuses = new Set(uniTrips.map(t => t.busId).filter(Boolean)).size;
        return {
          uni,
          uniTrips,
          totalStudents,
          totalCapacity,
          uniqueBuses,
          shortage: Math.max(0, totalStudents - totalCapacity)
        };
      })
      .filter(group => group.uniTrips.length > 0);
  }, [universities, displayedTrips]);

  // Fleet capacity calculator algorithm
  // Calculates best combination of real available bus capacities (14, 28, 33) to satisfy passenger count
  const calculateNeededFleet = (passengerCount: number) => {
    if (passengerCount <= 0) return { busesCount: 0, description: 'لا يوجد طلب' };
    if (passengerCount <= 14) return { busesCount: 1, description: 'حافلة واحدة (سعة 14 راكب)' };
    if (passengerCount <= 28) return { busesCount: 1, description: 'حافلة واحدة (سعة 28 راكب)' };
    if (passengerCount <= 33) return { busesCount: 1, description: 'حافلة واحدة (سعة 33 راكب)' };
    if (passengerCount <= 42) return { busesCount: 2, description: 'حافلتان (سعة 28 + 14 راكب)' };
    if (passengerCount <= 56) return { busesCount: 2, description: 'حافلتان (سعة 28 + 28 راكب)' };
    const approx = Math.ceil(passengerCount / 28);
    return { busesCount: approx, description: `${approx} حافلات (سعات مجمعة)` };
  };

  // Aggregated Demand & Capacity Stats for Planning Date
  const planningStats = useMemo(() => {
    let totalRegistered = 0;
    let totalAssignedSeats = 0;
    let totalAssignedBuses = displayedTrips.length;
    let totalSeatsShortage = 0;
    let totalBusesShortage = 0;

    displayedTrips.forEach(t => {
      const registered = t.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
      totalRegistered += registered;
      totalAssignedSeats += t.capacity;

      const seatDiff = registered - t.capacity;
      if (seatDiff > 0) {
        totalSeatsShortage += seatDiff;
      }

      const needed = calculateNeededFleet(registered);
      if (needed.busesCount > 1) {
        totalBusesShortage += (needed.busesCount - 1);
      }
    });

    const pendingRequestsCount = exceptionalRequests.filter(r => r.date === planningDate && r.status === 'pending').length;

    return {
      totalRegistered,
      totalAssignedSeats,
      totalAssignedBuses,
      totalSeatsShortage,
      totalBusesShortage,
      pendingRequestsCount,
      coveragePercent: totalRegistered > 0 ? Math.min(100, Math.round((totalAssignedSeats / totalRegistered) * 100)) : 100
    };
  }, [displayedTrips, exceptionalRequests, planningDate]);

  // Open modal to edit bus or driver for a trip
  const handleOpenEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setSelectedBusId(trip.busId);
    setSelectedDriverId(trip.driverId);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip || !selectedBusId || !selectedDriverId) return;
    swapBusOrDriver(editingTrip.id, selectedBusId, selectedDriverId, 'إعادة توزيع تشغيلي ضمن خطة الغد');
    setEditingTrip(null);
  };

  // Active pending exceptional requests for this date
  const pendingRequestsForDate = useMemo(() => {
    return exceptionalRequests.filter(r => r.date === planningDate);
  }, [exceptionalRequests, planningDate]);

  return (
    <div className="space-y-6">

      {/* 1. Header & Planning Controls Bar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5 text-amber-600" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                تخطيط السيارات والطلب اليومي لرحلات الغد
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                حساب الطلب الفعلي على الحافلات ومطابقته بسعات الأسطول (14، 28، 33 راكب) واعتماد الرحلات.
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-600">تاريخ الخطة:</span>
            <select
              value={planningDate}
              onChange={(e) => setPlanningDate(e.target.value)}
              className="text-xs font-mono font-bold bg-transparent text-slate-800 outline-hidden cursor-pointer"
            >
              {dateOptions.map(d => (
                <option key={d} value={d}>
                  {d} {d === tomorrowDate ? '(رحلات الغد)' : d === activeOperatingDate ? '(اليوم)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Auto Assign Button */}
          <button
            type="button"
            onClick={() => autoAssignBusesForPlan(planningDate)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="توزيع الحافلات آلياً حسب أعداد الركاب في كل موعد"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span>اقتراح التوزيع الآلي للحافلات</span>
          </button>

          {/* Approve & Publish Plan Button */}
          <button
            type="button"
            onClick={() => approveDailyPlan(planningDate)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="اعتماد ونشر خطة رحلات الغد للطلاب والسائقين"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>اعتماد الخطة ونشر الرحلات</span>
          </button>
        </div>
      </div>

      {/* 2. 10:00 PM Cutoff Alert & Simulation Bar */}
      <div className={`rounded-2xl p-4 border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
        isCutoffPassedForTomorrow
          ? 'bg-rose-50/80 border-rose-200 text-rose-950'
          : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${isCutoffPassedForTomorrow ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'}`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold">
                قاعدة إغلاق التسجيل لرحلات الغد (10:00 مساءً):
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                isCutoffPassedForTomorrow ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {isCutoffPassedForTomorrow ? '⛔ تم إغلاق التسجيل العادي (بعد 10:00 م)' : '✅ التسجيل العادي مفتوح للطلاب (قبل 10:00 م)'}
              </span>
            </div>
            <p className="text-xs mt-1 leading-relaxed opacity-90">
              {isCutoffPassedForTomorrow
                ? 'الطلاب الراغبون في الحجز بعد العاشرة مساءً لا يمكنهم الحجز المباشر، ويتم تحويل طلباتهم تلقائياً إلى المشرف كطلبات استثنائية لمراجعتها أدناه.'
                : 'التسجيل متاح بحرية لجميع الطلاب حتى الساعة العاشرة مساءً، وبعدها يتوقف التعديل المباشر.'}
            </p>
          </div>
        </div>

        {/* Demo Simulation Toggle */}
        <button
          type="button"
          onClick={toggleSimulateCutoff}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors shrink-0 shadow-2xs cursor-pointer flex items-center gap-2"
        >
          <span>محاكاة توقيت 10:00 م</span>
          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md font-mono">
            {isCutoffPassedForTomorrow ? 'التبديل إلى قبل 10:00 م' : 'التبديل إلى بعد 10:00 م'}
          </span>
        </button>
      </div>

      {/* 3. Summary Demand KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-bold block">إجمالي ركاب الغد</span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">{planningStats.totalRegistered}</span>
          <span className="text-[10px] text-slate-400">طالب مؤكد بالرحلات</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-bold block">إجمالي المقاعد المخصصة</span>
          <span className="text-2xl font-black text-indigo-600 font-mono mt-1 block">{planningStats.totalAssignedSeats}</span>
          <span className="text-[10px] text-indigo-600">مقعد متاح بالأسطول</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-bold block">الحافلات المخصصة</span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">{planningStats.totalAssignedBuses}</span>
          <span className="text-[10px] text-slate-400">حافلة مجدولة للغد</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-bold block">عجز المقاعد الكلي</span>
          <span className={`text-2xl font-black font-mono mt-1 block ${planningStats.totalSeatsShortage > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {planningStats.totalSeatsShortage}
          </span>
          <span className="text-[10px] text-slate-400">مقعد بحاجة لتغطية</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-bold block">نسبة التغطية</span>
          <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">{planningStats.coveragePercent}%</span>
          <span className="text-[10px] text-slate-400">من إجمالي ركاب الغد</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-2xs">
          <span className="text-[11px] text-amber-900 font-bold block">طلبات استثنائية معلقة</span>
          <span className="text-2xl font-black text-amber-600 font-mono mt-1 block">{planningStats.pendingRequestsCount}</span>
          <span className="text-[10px] text-amber-700">بعد إغلاق 10:00 م</span>
        </div>
      </div>

      {/* 4. Exceptional Late Booking Requests Queue */}
      {pendingRequestsForDate.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 shadow-xs overflow-hidden">
          <div className="bg-amber-500/10 px-5 py-4 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-extrabold text-amber-950">
                قائمة طلبات التسجيل الاستثنائية لرحلات الغد (بعد العاشرة مساءً)
              </h3>
            </div>
            <span className="text-xs bg-amber-500 text-white font-bold px-2.5 py-0.5 rounded-full">
              {pendingRequestsForDate.filter(r => r.status === 'pending').length} طلب معلق
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">اسم الطالب</th>
                  <th className="p-3.5">الهاتف</th>
                  <th className="p-3.5">الجامعة والخط</th>
                  <th className="p-3.5">المحطة</th>
                  <th className="p-3.5">الموعد المطلوب</th>
                  <th className="p-3.5">سبب التأخر</th>
                  <th className="p-3.5">وقت الطلب</th>
                  <th className="p-3.5 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRequestsForDate.map(req => (
                  <tr key={req.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{req.studentName}</td>
                    <td className="p-3.5 font-mono text-slate-600">{req.phone}</td>
                    <td className="p-3.5">
                      <span className="font-bold text-slate-800 block">{req.universityNameAr}</span>
                      <span className="text-[11px] text-slate-500">{req.lineNameAr}</span>
                    </td>
                    <td className="p-3.5 text-slate-700">{req.stationNameAr}</td>
                    <td className="p-3.5">
                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {req.scheduledTime} ({req.direction === 'to_university' ? 'ذهاب' : 'عودة'})
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 max-w-xs">{req.reason || 'لم يذكر سبب'}</td>
                    <td className="p-3.5 font-mono text-slate-500">{req.requestedAt}</td>
                    <td className="p-3.5">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => approveExceptionalBooking(req.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>موافقة وتسكين</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectExceptionalBooking(req.id)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>رفض</span>
                          </button>
                        </div>
                      ) : (
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-md block text-center ${
                          req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {req.status === 'approved' ? '✓ تمت الموافقة والتسكين' : '✕ تم الرفض'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Main Planning Table (Per Slot, Line, and Direction) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
        
        {/* Table Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-black text-slate-900">
              جدول مطابقة الطلب وسعات الحافلات ليوم ({planningDate})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالطالب، السائق، اللوحة، الخط..."
                className="pl-3 pr-8 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-hidden focus:ring-2 focus:ring-indigo-500 min-w-[210px]"
              />
            </div>

            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value as any)}
              className="p-2 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700"
            >
              <option value="all">جميع الاتجاهات</option>
              <option value="to_university">رحلات الذهاب للجامعة</option>
              <option value="from_university">رحلات العودة</option>
            </select>

            <select
              value={filterLine}
              onChange={(e) => setFilterLine(e.target.value)}
              className="p-2 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 max-w-[200px]"
            >
              <option value="all">جميع خطوط السير</option>
              {lines.map(l => (
                <option key={l.id} value={l.id}>{l.nameAr}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Content */}
        {displayedTrips.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-600">لا توجد رحلات مجدولة لهذا اليوم حتى الآن</p>
            <p className="text-xs text-slate-400">انقر على "اقتراح التوزيع الآلي للحافلات" بالأعلى لبناء الجداول تلقائياً من خطوط الجامعة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">كود الرحلة</th>
                  <th className="p-3.5">الموعد والاتجاه</th>
                  <th className="p-3.5">الخط والجامعة</th>
                  <th className="p-3.5 text-center">الطلاب المسجلون</th>
                  <th className="p-3.5">الحافلة المخصصة</th>
                  <th className="p-3.5 text-center">السعة الحالية</th>
                  <th className="p-3.5 text-center">المقاعد المتبقية / العجز</th>
                  <th className="p-3.5">الحافلة الموصى بها</th>
                  <th className="p-3.5 text-center">السائق المكلف</th>
                  <th className="p-3.5 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedTrips.map(trip => {
                  const registeredCount = trip.manifest.filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported').length;
                  const seatDifference = trip.capacity - registeredCount;
                  const hasShortage = seatDifference < 0;
                  const neededFleet = calculateNeededFleet(registeredCount);

                  return (
                    <tr key={trip.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 font-mono font-black text-slate-900">{trip.code}</td>
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-slate-900 block text-sm">{trip.scheduledTime}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                          trip.direction === 'to_university' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                        }`}>
                          {trip.direction === 'to_university' ? 'ذهاب' : 'عودة'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 block">{trip.lineNameAr}</span>
                        <span className="text-[11px] text-slate-400">{trip.universityNameAr}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="font-mono font-black text-base text-slate-900 px-2 py-0.5 rounded-lg bg-slate-100">
                          {registeredCount}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-slate-900 block">{trip.busPlate}</span>
                        <span className="text-[10px] text-slate-400">سعة {trip.capacity} راكب</span>
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                        {trip.capacity}
                      </td>
                      <td className="p-3.5 text-center">
                        {hasShortage ? (
                          <span className="inline-flex items-center gap-1 font-mono font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px]">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            <span>عجز {-seatDifference} مقاعد</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>فائض {seatDifference} مقاعد</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 block">
                          {neededFleet.description}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="font-bold text-slate-800 block">{trip.driverNameAr}</span>
                        <span className="text-[10px] font-mono text-slate-400">{trip.driverPhone}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(trip)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          تعديل الحافلة/السائق
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5.5 Auto-Allocation Details Panel (Per University & Slot) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                تفاصيل التخصيص الآلي للحافلات والطلاب حسب الجامعة ({planningDate})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                عرض تفصيلي لكل سيارة مخصصة، السائق المكلف، السعة، ونسبة التسكين الفعلي للطلاب داخل كل جامعة.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => autoAllocateStudentsToSlotBuses({ date: planningDate })}
            className="px-4 py-2 bg-[#0F2537] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>توزيع وتسكين جميع طلاب هذا اليوم آلياً</span>
          </button>
        </div>

        {allocationByUniversity.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            لا توجد بيانات تخصيص لعرضها في هذا التاريخ وفق الفلاتر الحالية.
          </div>
        ) : (
          <div className="space-y-4">
            {allocationByUniversity.map(group => (
              <div key={group.uni.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-black text-slate-900">{group.uni.nameAr}</span>
                    <span className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded-md font-bold text-slate-600">
                      {group.uni.city}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-slate-800">
                      {group.uniqueBuses} حافلة · {group.uniTrips.length} رحلة
                    </span>
                    <span className="bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-lg border border-indigo-200 font-bold">
                      {group.totalStudents} / {group.totalCapacity} مقعد
                    </span>
                    {group.shortage > 0 ? (
                      <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-lg border border-rose-200 font-black">
                        عجز {group.shortage} مقعد
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold">
                        مغطاة بالكامل
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-white">
                  {group.uniTrips.map(trip => {
                    const reg = (trip.manifest || []).filter(m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported');
                    const boarded = (trip.manifest || []).filter(m => m.boardedStatus === 'boarded');
                    const tripShortage = Math.max(0, reg.length - trip.capacity);
                    return (
                      <div key={trip.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {trip.busPlate || 'غير محدد'} ({trip.capacity} ر)
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            trip.direction === 'to_university' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                          }`}>
                            {trip.scheduledTime} · {trip.direction === 'to_university' ? 'ذهاب' : 'عودة'}
                          </span>
                        </div>
                        <div className="text-slate-700 font-bold truncate" title={trip.lineNameAr}>{trip.lineNameAr}</div>
                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span>السائق: <strong className="text-slate-900">{trip.driverNameAr || 'غير مسند'}</strong></span>
                          <span className="font-mono font-bold text-indigo-700">
                            مسكنون: {reg.length}/{trip.capacity}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-[11px]">
                          <span className="text-emerald-700 font-bold">صعدوا فعلياً: {boarded.length}</span>
                          {tripShortage > 0 ? (
                            <span className="text-rose-600 font-black">فائض ركاب: +{tripShortage}</span>
                          ) : (
                            <span className="text-slate-500">متاح: {trip.capacity - reg.length} مقعد</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Edit Bus/Driver Modal */}
      {editingTrip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">تخصيص الحافلة والسائق للرحلة</h3>
                <span className="text-xs font-mono text-slate-500">{editingTrip.code} · {editingTrip.scheduledTime}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اختر الحافلة من الأسطول:</label>
                <select
                  value={selectedBusId}
                  onChange={(e) => setSelectedBusId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-800"
                >
                  {buses.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.plateNumber} (سعة {b.capacity} راكب - {b.model})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اختر السائق المكلف:</label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-800"
                >
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nameAr} ({d.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTrip(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  حفظ التعيين
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
