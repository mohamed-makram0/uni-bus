import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { University, Bus, Line, Station, TripTemplate, User, UserRole } from '../../types';
import {
  Building2,
  Bus as BusIcon,
  Route,
  Clock,
  Users,
  Plus,
  Pencil,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Layers,
  ShieldCheck,
  CalendarDays,
  UserPlus,
  Mail
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    currentUser,
    universities,
    createUniversity,
    updateUniversity,
    toggleUniversityStatus,
    deleteUniversity,
    buses,
    createBus,
    updateBus,
    toggleBusStatus,
    deleteBus,
    lines,
    createLine,
    updateLine,
    toggleLineStatus,
    deleteLine,
    addStationToLine,
    reorderStation,
    deleteStationFromLine,
    tripTemplates,
    createTripTemplate,
    updateTripTemplate,
    toggleTripTemplateStatus,
    deleteTripTemplate,
    users,
    staffInvites,
    createCompanyUser,
    cancelStaffInvite,
    updateUserRole,
    updateUserDetails,
    toggleUserStatus,
    approveStudentRegistration,
    rejectPendingRegistration
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'universities' | 'buses' | 'routes' | 'schedules' | 'users'>('universities');

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'driver' as Exclude<UserRole, 'super_admin'>,
    isGeneralSupervisor: false,
    assignedBusId: buses[0]?.id || '',
    licenseNumber: '',
    universityId: universities[0]?.id || '',
    lineId: lines[0]?.id || '',
    stationId: lines[0]?.stations?.[0]?.id || '',
  });

  // Modal states
  const [showUniModal, setShowUniModal] = useState(false);
  const [editingUni, setEditingUni] = useState<University | null>(null);
  const [uniForm, setUniForm] = useState({ nameAr: '', city: '', campusLocation: '', activeStatus: true });

  const [showBusModal, setShowBusModal] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [busForm, setBusForm] = useState({ code: '', plateNumber: '', capacity: 14, model: '', status: 'available' as Bus['status'], activeStatus: true, notes: '' });

  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Line | null>(null);
  const [routeForm, setRouteForm] = useState({ nameAr: '', code: '', universityId: '', direction: 'both' as Line['direction'], activeStatus: true });

  const [selectedRouteForStations, setSelectedRouteForStations] = useState<string>(lines[0]?.id || '');
  const [newStationName, setNewStationName] = useState('');
  const [newStationMinutes, setNewStationMinutes] = useState(15);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<TripTemplate | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    time: '07:00 ص',
    direction: 'to_university' as TripTemplate['direction'],
    type: 'morning' as TripTemplate['type'],
    universityId: '',
    lineId: '',
    daysOfWeek: [0, 1, 2, 3, 4],
    activeStatus: true
  });

  // ==========================================
  // UNIVERSITIES HANDLERS
  // ==========================================
  const handleOpenAddUni = () => {
    setEditingUni(null);
    setUniForm({ nameAr: '', city: '', campusLocation: '', activeStatus: true });
    setShowUniModal(true);
  };

  const handleOpenEditUni = (u: University) => {
    setEditingUni(u);
    setUniForm({ nameAr: u.nameAr, city: u.city, campusLocation: u.campusLocation, activeStatus: u.activeStatus });
    setShowUniModal(true);
  };

  const handleUniSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUni) {
        updateUniversity(editingUni.id, uniForm);
      } else {
        createUniversity(uniForm);
      }
      setShowUniModal(false);
    } catch {
      // error handled by toast
    }
  };

  // ==========================================
  // BUSES HANDLERS
  // ==========================================
  const handleOpenAddBus = () => {
    setEditingBus(null);
    setBusForm({ code: `BUS-${Math.floor(100 + Math.random() * 900)}`, plateNumber: '', capacity: 14, model: 'تويوتا هاي أس', status: 'available', activeStatus: true, notes: '' });
    setShowBusModal(true);
  };

  const handleOpenEditBus = (b: Bus) => {
    setEditingBus(b);
    setBusForm({ code: b.code || '', plateNumber: b.plateNumber, capacity: b.capacity, model: b.model, status: b.status, activeStatus: b.activeStatus, notes: b.notes || '' });
    setShowBusModal(true);
  };

  const handleBusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBus) {
        updateBus(editingBus.id, busForm);
      } else {
        createBus(busForm);
      }
      setShowBusModal(false);
    } catch {
      // toast shown
    }
  };

  // ==========================================
  // ROUTES & STATIONS HANDLERS
  // ==========================================
  const handleOpenAddRoute = () => {
    setEditingRoute(null);
    setRouteForm({ nameAr: '', code: `R-${Math.floor(10 + Math.random() * 90)}`, universityId: universities[0]?.id || '', direction: 'both', activeStatus: true });
    setShowRouteModal(true);
  };

  const handleOpenEditRoute = (r: Line) => {
    setEditingRoute(r);
    setRouteForm({ nameAr: r.nameAr, code: r.code, universityId: r.universityId, direction: r.direction, activeStatus: r.activeStatus });
    setShowRouteModal(true);
  };

  const handleRouteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRoute) {
        updateLine(editingRoute.id, routeForm);
      } else {
        createLine(routeForm);
      }
      setShowRouteModal(false);
    } catch {
      // handled
    }
  };

  const handleAddStationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouteForStations || !newStationName.trim()) return;
    addStationToLine(selectedRouteForStations, {
      nameAr: newStationName.trim(),
      scheduledMinutesFromStart: Number(newStationMinutes),
    });
    setNewStationName('');
  };

  // ==========================================
  // SCHEDULES HANDLERS
  // ==========================================
  const handleOpenAddSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({
      time: '07:00 ص',
      direction: 'to_university',
      type: 'morning',
      universityId: universities[0]?.id || '',
      lineId: lines[0]?.id || '',
      daysOfWeek: [0, 1, 2, 3, 4],
      activeStatus: true
    });
    setShowScheduleModal(true);
  };

  const handleOpenEditSchedule = (tmpl: TripTemplate) => {
    setEditingSchedule(tmpl);
    setScheduleForm({
      time: tmpl.time,
      direction: tmpl.direction,
      type: tmpl.type,
      universityId: tmpl.universityId || '',
      lineId: tmpl.lineId || '',
      daysOfWeek: tmpl.daysOfWeek,
      activeStatus: tmpl.activeStatus
    });
    setShowScheduleModal(true);
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSchedule) {
        updateTripTemplate(editingSchedule.id, scheduleForm);
      } else {
        createTripTemplate(scheduleForm);
      }
      setShowScheduleModal(false);
    } catch {
      // handled
    }
  };

  const activeRoute = lines.find(l => l.id === selectedRouteForStations) || lines[0];

  return (
    <div className="space-y-6">
      
      {/* Sub-Tabs Navigation for Settings */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-2 text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('universities')}
          className={`py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'universities'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4 text-sky-400" />
          <span>أ) إدارة الجامعات ({universities.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('buses')}
          className={`py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'buses'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <BusIcon className="w-4 h-4 text-amber-400" />
          <span>ب) إدارة الباصات ({buses.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('routes')}
          className={`py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'routes'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Route className="w-4 h-4 text-emerald-400" />
          <span>ج) إدارة خطوط السير والمحطات ({lines.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('schedules')}
          className={`py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'schedules'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4 text-purple-400" />
          <span>د) مواعيد الرحلات الافتراضية ({tripTemplates.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('users')}
          className={`min-h-[44px] py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'users'
              ? 'bg-[#0F2537] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-400" />
          <span>هـ) المستخدمين والأدوار ({users.length})</span>
        </button>
      </div>

      {/* ========================================================
          A. UNIVERSITIES MANAGEMENT
      ======================================================== */}
      {activeSubTab === 'universities' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-600" />
                <span>إدارة الجامعات المخدومة</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                إضافة وتعديل بيانات الجامعات والحرم الجامعي، وتفعيلها أو إيقافها مع قيود أمان تمنع حذف الجامعات المرتبطة ببيانات تشغيلية.
              </p>
            </div>
            <button
              onClick={handleOpenAddUni}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة جامعة جديدة</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold">
                  <th className="pb-3 pr-2">اسم الجامعة</th>
                  <th className="pb-3">المدينة / النطاق الجغرافي</th>
                  <th className="pb-3">موقع الحرم الرئيسي</th>
                  <th className="pb-3">الطلاب المسجلين</th>
                  <th className="pb-3">الحالة التشغيلية</th>
                  <th className="pb-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {universities.map((uni) => (
                  <tr key={uni.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 pr-2 font-bold text-slate-900">{uni.nameAr}</td>
                    <td className="py-3.5 text-slate-600">{uni.city}</td>
                    <td className="py-3.5 text-slate-500">{uni.campusLocation}</td>
                    <td className="py-3.5 font-mono font-bold text-slate-700">{uni.totalStudents} طالب</td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          uni.activeStatus
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${uni.activeStatus ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        <span>{uni.activeStatus ? 'نشطة للتشغيل' : 'متوقفة مؤقتاً'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => toggleUniversityStatus(uni.id)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            uni.activeStatus
                              ? 'text-amber-700 border-amber-200 hover:bg-amber-50'
                              : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          }`}
                          title={uni.activeStatus ? 'إيقاف الجامعة' : 'تفعيل الجامعة'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditUni(uni)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                          title="تعديل البيانات"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteUniversity(uni.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
                          title="حذف الجامعة (يخضع لفحص الارتباط)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          B. BUSES MANAGEMENT
      ======================================================== */}
      {activeSubTab === 'buses' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BusIcon className="w-5 h-5 text-amber-600" />
                <span>إدارة أسطول الباصات والسعات القصوى</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                تحديد كود الباص، اللوحة المعدنية، السعة القصوى، مع منع تكرار الأكواد ومنع تقليل السعة عن عدد الركاب المحجوزين حالياً.
              </p>
            </div>
            <button
              onClick={handleOpenAddBus}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة باص جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold">
                  <th className="pb-3 pr-2">كود الباص</th>
                  <th className="pb-3">رقم اللوحة</th>
                  <th className="pb-3">السعة القصوى</th>
                  <th className="pb-3">طراز الحافلة</th>
                  <th className="pb-3">الحالة التشغيلية</th>
                  <th className="pb-3">التفعيل</th>
                  <th className="pb-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {buses.map((bus) => (
                  <tr key={bus.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 pr-2 font-mono font-extrabold text-slate-900">{bus.code || bus.id}</td>
                    <td className="py-3.5 font-bold text-slate-800">{bus.plateNumber}</td>
                    <td className="py-3.5 font-mono font-extrabold text-slate-900">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-sm">{bus.capacity}</span> مقعد
                    </td>
                    <td className="py-3.5 text-slate-600">{bus.model}</td>
                    <td className="py-3.5">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          bus.status === 'in_trip'
                            ? 'bg-amber-100 text-amber-800'
                            : bus.status === 'available'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {bus.status === 'in_trip' && 'في رحلة حية'}
                        {bus.status === 'available' && 'جاهز للخدمة'}
                        {bus.status === 'maintenance' && 'صيانة دورية'}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className={`text-[11px] font-bold ${bus.activeStatus ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {bus.activeStatus ? 'مفعل' : 'موقف'}
                      </span>
                    </td>
                    <td className="py-3.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => toggleBusStatus(bus.id)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            bus.activeStatus
                              ? 'text-amber-700 border-amber-200 hover:bg-amber-50'
                              : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          }`}
                          title={bus.activeStatus ? 'إيقاف الباص' : 'تفعيل الباص'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditBus(bus)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                          title="تعديل بيانات الباص"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteBus(bus.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
                          title="حذف الباص (يخضع لفحص الرحلات السابقة)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          C. ROUTES & STATIONS MANAGEMENT
      ======================================================== */}
      {activeSubTab === 'routes' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Route className="w-5 h-5 text-emerald-600" />
                  <span>إدارة خطوط السير والمحطات</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  إنشاء خطوط السير وربطها بالجامعات، وتحديد اتجاه الخط (ذهاب، عودة، أو كلاهما).
                </p>
              </div>
              <button
                onClick={handleOpenAddRoute}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء خط سير جديد</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold">
                    <th className="pb-3 pr-2">كود الخط</th>
                    <th className="pb-3">اسم خط السير</th>
                    <th className="pb-3">الجامعة المرتبطة</th>
                    <th className="pb-3">اتجاه الخط</th>
                    <th className="pb-3">عدد المحطات</th>
                    <th className="pb-3">الحالة</th>
                    <th className="pb-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const linkedUni = universities.find(u => u.id === line.universityId);

                    return (
                      <tr key={line.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 pr-2 font-mono font-bold text-slate-900">{line.code}</td>
                        <td className="py-3.5 font-bold text-slate-800">{line.nameAr}</td>
                        <td className="py-3.5 text-slate-600">{linkedUni?.nameAr || 'غير محدد'}</td>
                        <td className="py-3.5">
                          <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-bold">
                            {line.direction === 'both' ? 'يدعم الاتجاهين (ذهاب وعودة)' : line.direction === 'to_university' ? 'ذهاب فقط' : 'عودة فقط'}
                          </span>
                        </td>
                        <td className="py-3.5 font-mono font-bold text-emerald-700">{line.stations.length} محطة</td>
                        <td className="py-3.5">
                          <span className={`text-[11px] font-bold ${line.activeStatus ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {line.activeStatus ? 'نشط' : 'متوقف'}
                          </span>
                        </td>
                        <td className="py-3.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => toggleLineStatus(line.id)}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                line.activeStatus
                                  ? 'text-amber-700 border-amber-200 hover:bg-amber-50'
                                  : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                              }`}
                              title={line.activeStatus ? 'إيقاف الخط' : 'تفعيل الخط'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEditRoute(line)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                              title="تعديل الخط"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteLine(line.id)}
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
                              title="حذف خط السير (يخضع لفحص الرحلات والاشتراكات)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Station Ordering and Management for Selected Route */}
          {activeRoute && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>محطات خط السير: {activeRoute.nameAr}</span>
                  </h4>
                  <span className="text-xs text-slate-500">
                    يمكنك تعديل ترتيب المحطات برفعها أو خفضها، وإضافة محطات جديدة بالزمن المقدر بالدقائق.
                  </span>
                </div>

                <select
                  value={selectedRouteForStations}
                  onChange={(e) => setSelectedRouteForStations(e.target.value)}
                  className="p-2 border rounded-xl text-xs font-bold bg-slate-50"
                >
                  {lines.map(l => (
                    <option key={l.id} value={l.id}>{l.nameAr}</option>
                  ))}
                </select>
              </div>

              {/* Add station form */}
              <form onSubmit={handleAddStationSubmit} className="flex flex-col sm:flex-row gap-2 items-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <input
                  type="text"
                  placeholder="اسم المحطة الجديدة (مثال: محطة مسجد الصديق)"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  className="flex-1 p-2.5 border rounded-xl bg-white"
                  required
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[11px] whitespace-nowrap">زمن الوصول من البداية (دقيقة):</span>
                  <input
                    type="number"
                    value={newStationMinutes}
                    onChange={(e) => setNewStationMinutes(Number(e.target.value))}
                    min={0}
                    max={180}
                    className="w-20 p-2.5 border rounded-xl bg-white font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة المحطة للخط</span>
                </button>
              </form>

              {/* Stations sequence list with Up/Down buttons */}
              <div className="space-y-2">
                {activeRoute.stations.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl">
                    لا توجد محطات مسجلة لهذا الخط بعد. أضف المحطة الأولى أعلاه.
                  </div>
                ) : (
                  activeRoute.stations.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-mono font-bold flex items-center justify-center text-xs">
                          {st.orderIndex}
                        </span>
                        <div>
                          <span className="font-bold text-slate-800 block text-sm">{st.nameAr}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            + {st.scheduledMinutesFromStart} دقيقة من انطلاق الخط
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => reorderStation(activeRoute.id, st.id, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="رفع المحطة للأعلى"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => reorderStation(activeRoute.id, st.id, 'down')}
                          disabled={idx === activeRoute.stations.length - 1}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="خفض المحطة للأسفل"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStationFromLine(activeRoute.id, st.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                          title="حذف المحطة (يخضع لفحص الأمان)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          D. SCHEDULES MANAGEMENT (مواعيد الرحلات الافتراضية)
      ======================================================== */}
      {activeSubTab === 'schedules' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <span>إدارة قوالب مواعيد الرحلات الافتراضية</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                المواعيد الافتراضية: الذهاب 07:00 ص و 09:00 ص، والعودة 12:00، 13:00، 14:00، 15:00، 16:00، 17:00. قابلة للإضافة والتعديل والإيقاف بالكامل.
              </p>
            </div>
            <button
              onClick={handleOpenAddSchedule}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة موعد رحلة جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Morning Times */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md block w-fit">
                مواعيد رحلات الذهاب الصباحية (إلى الجامعة)
              </span>

              <div className="space-y-2">
                {tripTemplates
                  .filter(t => t.direction === 'to_university')
                  .map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <div>
                          <span className="font-mono font-extrabold text-slate-900 text-sm block">
                            {tmpl.time}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            أيام التشغيل: الأحد إلى الخميس
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleTripTemplateStatus(tmpl.id)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            tmpl.activeStatus ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'text-slate-400 border-slate-200'
                          }`}
                          title={tmpl.activeStatus ? 'إيقاف الموعد' : 'تفعيل الموعد'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditSchedule(tmpl)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                          title="تعديل الموعد"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTripTemplate(tmpl.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                          title="حذف الموعد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Return Times */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
              <span className="text-xs font-bold text-sky-800 bg-sky-100 px-2.5 py-1 rounded-md block w-fit">
                مواعيد رحلات العودة (من الجامعة ظهراً ومساءً)
              </span>

              <div className="space-y-2">
                {tripTemplates
                  .filter(t => t.direction === 'from_university')
                  .map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-sky-500" />
                        <div>
                          <span className="font-mono font-extrabold text-slate-900 text-sm block">
                            {tmpl.time}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            أيام التشغيل: الأحد إلى الخميس
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleTripTemplateStatus(tmpl.id)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            tmpl.activeStatus ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'text-slate-400 border-slate-200'
                          }`}
                          title={tmpl.activeStatus ? 'إيقاف الموعد' : 'تفعيل الموعد'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditSchedule(tmpl)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                          title="تعديل الموعد"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTripTemplate(tmpl.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                          title="حذف الموعد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          E. USERS & ROLES MANAGEMENT
      ======================================================== */}
      {activeSubTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <span>إدارة المستخدمين والأدوار وحالات الحسابات</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                يمكنك إضافة المستخدمين والسائقين بالاسم ورقم الهاتف فوراً (والبريد اختياري للدخول بحساب Google)، واعتماد أو رفض طلبات التسجيل الجديدة.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-400 font-mono font-bold">
                إجمالي الحسابات: {users.length}
              </div>
              <button
                type="button"
                onClick={() => {
                  setInviteForm({
                    name: '',
                    phone: '',
                    email: '',
                    role: 'driver',
                    isGeneralSupervisor: false,
                    assignedBusId: buses[0]?.id || '',
                    licenseNumber: '',
                    universityId: universities[0]?.id || '',
                    lineId: lines[0]?.id || '',
                    stationId: lines[0]?.stations?.[0]?.id || '',
                  });
                  setShowInviteModal(true);
                }}
                className="px-3.5 py-2 bg-[#0F2537] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة موظف / سائق / طالب</span>
              </button>
            </div>
          </div>

          {users.filter(u => u.status === 'pending_approval').length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-3">
              <div className="flex items-center justify-between text-xs font-extrabold text-amber-950">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  <span>طلبات تسجيل جديدة بانتظار موافقة المدير أو المشرف</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-950 font-mono">
                  {users.filter(u => u.status === 'pending_approval').length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {users
                  .filter(u => u.status === 'pending_approval')
                  .map(pendingUser => {
                    const uniName = universities.find(u => u.id === pendingUser.universityId)?.nameAr;
                    const roleBadge =
                      pendingUser.role === 'driver'
                        ? { label: 'سائق', cls: 'bg-amber-100 text-amber-900 border-amber-300' }
                        : pendingUser.role === 'supervisor'
                        ? { label: 'مشرف تشغيلي', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
                        : pendingUser.role === 'admin'
                        ? { label: 'مدير', cls: 'bg-indigo-100 text-indigo-900 border-indigo-300' }
                        : { label: 'طالب', cls: 'bg-sky-100 text-sky-900 border-sky-300' };
                    return (
                      <div key={pendingUser.id} className="bg-white border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-extrabold text-slate-900">{pendingUser.name}</p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${roleBadge.cls}`}>
                              {roleBadge.label}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                            {pendingUser.phone}{uniName ? ` · ${uniName}` : ''}
                            {pendingUser.licenseNumber ? ` · ${pendingUser.licenseNumber}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void approveStudentRegistration(pendingUser.id)}
                            className="min-h-[38px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>اعتماد وتفعيل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void rejectPendingRegistration(pendingUser.id)}
                            className="min-h-[38px] px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>رفض</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {staffInvites.filter(inv => inv.status === 'pending').length > 0 && (
            <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-sky-950">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-sky-700" />
                  دعوات التفعيل المعلقة (بانتظار دخول الموظف لأول مرة)
                </span>
                <span className="font-mono">{staffInvites.filter(inv => inv.status === 'pending').length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {staffInvites
                  .filter(inv => inv.status === 'pending')
                  .map(inv => (
                    <div key={inv.id} className="bg-white border border-sky-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-bold text-slate-900">
                          {inv.name} —{' '}
                          <span className="text-sky-800">
                            {inv.role === 'admin' ? 'مدير شركة' : inv.role === 'supervisor' ? 'مشرف' : inv.role === 'driver' ? 'سائق' : 'طالب'}
                          </span>
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

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold">
                  <th className="pb-3 pr-2">الاسم</th>
                  <th className="pb-3">رقم الهاتف</th>
                  <th className="pb-3">البريد الإلكتروني</th>
                  <th className="pb-3">الدور الحالي</th>
                  <th className="pb-3">حالة الحساب</th>
                  <th className="pb-3 text-center">تعديل الدور والصلاحية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isMe = u.id === currentUser.id;
                  const isProtectedOwner = u.role === 'super_admin';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 pr-2 font-bold text-slate-900">
                        {u.name} {isMe && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-normal mr-1">(أنت)</span>}
                      </td>
                      <td className="py-3.5 font-mono text-slate-600">{u.phone}</td>
                      <td className="py-3.5 font-mono text-slate-500">{u.email}</td>
                      <td className="py-3.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              u.role === 'super_admin'
                                ? 'bg-slate-900 text-amber-300'
                                : u.role === 'admin'
                                ? 'bg-indigo-100 text-indigo-800'
                                : u.role === 'supervisor'
                                ? 'bg-emerald-100 text-emerald-800'
                                : u.role === 'driver'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {u.role === 'super_admin' && 'مالك المنصة'}
                            {u.role === 'admin' && 'مدير الشركة'}
                            {u.role === 'supervisor' && 'مشرف تشغيلي'}
                            {u.role === 'driver' && 'سائق'}
                            {u.role === 'student' && 'طالب'}
                          </span>
                          {u.role === 'supervisor' && u.isGeneralSupervisor && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-600 text-white">
                              مشرف عام
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : u.status === 'pending_approval'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {u.status === 'active' && 'نشط'}
                          {u.status === 'pending_approval' && 'قيد التدقيق'}
                          {u.status === 'suspended' && 'معطل'}
                        </span>
                      </td>
                      <td className="py-3.5 text-center">
                        <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                          {isProtectedOwner ? (
                            <span className="text-[11px] text-slate-400 font-bold">صلاحية منصة محمية</span>
                          ) : (
                            <>
                              <select
                                value={u.role}
                                disabled={isMe}
                                onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                                className="p-1.5 border rounded-lg text-xs bg-white font-bold disabled:opacity-50 disabled:bg-slate-100"
                                title={isMe ? 'لا يمكنك تغيير دورك بنفسك' : 'تغيير دور المستخدم'}
                              >
                                <option value="student">طالب</option>
                                <option value="driver">سائق</option>
                                <option value="supervisor">مشرف تشغيلي</option>
                                <option value="admin">مدير الشركة</option>
                              </select>

                              {u.role === 'supervisor' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateUserDetails(
                                      u.id,
                                      { isGeneralSupervisor: !u.isGeneralSupervisor },
                                      'تحديث صلاحية المشرف العام (مدير + مشرف + سائق)'
                                    )
                                  }
                                  className={`p-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                                    u.isGeneralSupervisor
                                      ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                                      : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                                  }`}
                                  title="تفعيل واجهات (مدير + مشرف + سائق) معاً لهذا المشرف"
                                >
                                  {u.isGeneralSupervisor ? 'مشرف عام ✓' : '+ مشرف عام'}
                                </button>
                              )}

                              <button
                                onClick={() => toggleUserStatus(u.id)}
                                disabled={isMe}
                                className={`p-1.5 rounded-lg border text-xs font-bold transition-colors disabled:opacity-30 ${
                                  u.status === 'active'
                                    ? 'text-rose-700 border-rose-200 hover:bg-rose-50'
                                    : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                }`}
                                title={u.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                              >
                                {u.status === 'active' ? 'تعطيل' : 'تفعيل'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODALS
      ======================================================== */}
      {/* 1. University Modal */}
      {showUniModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingUni ? 'تعديل بيانات الجامعة' : 'إضافة جامعة جديدة'}
              </h3>
              <button onClick={() => setShowUniModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleUniSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 font-bold block mb-1">اسم الجامعة باللغة العربية:</label>
                <input
                  type="text"
                  value={uniForm.nameAr}
                  onChange={(e) => setUniForm({ ...uniForm, nameAr: e.target.value })}
                  placeholder="مثال: جامعة حلوان"
                  className="w-full p-2.5 border rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">المدينة / النطاق الجغرافي:</label>
                <input
                  type="text"
                  value={uniForm.city}
                  onChange={(e) => setUniForm({ ...uniForm, city: e.target.value })}
                  placeholder="مثال: عين حلوان - القاهرة"
                  className="w-full p-2.5 border rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">موقع الحرم الجامعي والبوابة الرئيسية:</label>
                <input
                  type="text"
                  value={uniForm.campusLocation}
                  onChange={(e) => setUniForm({ ...uniForm, campusLocation: e.target.value })}
                  placeholder="مثال: البوابة الرئيسية أمام محطة المترو"
                  className="w-full p-2.5 border rounded-xl"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl">حفظ الجامعة</button>
                <button type="button" onClick={() => setShowUniModal(false)} className="py-2.5 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Bus Modal */}
      {showBusModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingBus ? 'تعديل بيانات الباص' : 'إضافة باص جديد للأسطول'}
              </h3>
              <button onClick={() => setShowBusModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleBusSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-700 font-bold block mb-1">كود الباص (فريد):</label>
                  <input
                    type="text"
                    value={busForm.code}
                    onChange={(e) => setBusForm({ ...busForm, code: e.target.value })}
                    placeholder="مثال: BUS-106"
                    className="w-full p-2.5 border rounded-xl font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-bold block mb-1">رقم اللوحة المعدنية:</label>
                  <input
                    type="text"
                    value={busForm.plateNumber}
                    onChange={(e) => setBusForm({ ...busForm, plateNumber: e.target.value })}
                    placeholder="مثال: ي ج ب 4921"
                    className="w-full p-2.5 border rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-700 font-bold block mb-1">السعة القصوى (راكب):</label>
                  <input
                    type="number"
                    value={busForm.capacity}
                    onChange={(e) => setBusForm({ ...busForm, capacity: Number(e.target.value) })}
                    min={4}
                    max={60}
                    className="w-full p-2.5 border rounded-xl font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-bold block mb-1">طراز وموديل الحافلة:</label>
                  <input
                    type="text"
                    value={busForm.model}
                    onChange={(e) => setBusForm({ ...busForm, model: e.target.value })}
                    placeholder="مثال: ميكروباص تويوتا 2024"
                    className="w-full p-2.5 border rounded-xl"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">الحالة التشغيلية:</label>
                <select
                  value={busForm.status}
                  onChange={(e) => setBusForm({ ...busForm, status: e.target.value as any })}
                  className="w-full p-2.5 border rounded-xl bg-white"
                >
                  <option value="available">جاهز للخدمة</option>
                  <option value="in_trip">في رحلة حالياً</option>
                  <option value="maintenance">صيانة دورية / إيقاف مؤقت</option>
                </select>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">ملاحظات إضافية:</label>
                <input
                  type="text"
                  value={busForm.notes}
                  onChange={(e) => setBusForm({ ...busForm, notes: e.target.value })}
                  placeholder="أي ملاحظات فنية أو تاريخ صيانة..."
                  className="w-full p-2.5 border rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl">حفظ الباص</button>
                <button type="button" onClick={() => setShowBusModal(false)} className="py-2.5 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Route Modal */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingRoute ? 'تعديل خط السير' : 'إنشاء خط سير جديد'}
              </h3>
              <button onClick={() => setShowRouteModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleRouteSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 font-bold block mb-1">اسم خط السير:</label>
                <input
                  type="text"
                  value={routeForm.nameAr}
                  onChange={(e) => setRouteForm({ ...routeForm, nameAr: e.target.value })}
                  placeholder="مثال: خط الشروق / مدينتي ⟵ الجامعة الأمريكية"
                  className="w-full p-2.5 border rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-700 font-bold block mb-1">كود الخط:</label>
                  <input
                    type="text"
                    value={routeForm.code}
                    onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })}
                    placeholder="AUC-SH01"
                    className="w-full p-2.5 border rounded-xl font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-bold block mb-1">الجامعة المرتبطة:</label>
                  <select
                    value={routeForm.universityId}
                    onChange={(e) => setRouteForm({ ...routeForm, universityId: e.target.value })}
                    className="w-full p-2.5 border rounded-xl bg-white"
                    required
                  >
                    {universities.map(u => (
                      <option key={u.id} value={u.id}>{u.nameAr}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">اتجاه الخط المعتمد:</label>
                <select
                  value={routeForm.direction}
                  onChange={(e) => setRouteForm({ ...routeForm, direction: e.target.value as any })}
                  className="w-full p-2.5 border rounded-xl bg-white"
                >
                  <option value="both">يدعم الاتجاهين (ذهاب وعودة)</option>
                  <option value="to_university">ذهاب فقط إلى الجامعة</option>
                  <option value="from_university">عودة فقط من الجامعة</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">حفظ خط السير</button>
                <button type="button" onClick={() => setShowRouteModal(false)} className="py-2.5 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingSchedule ? 'تعديل موعد الرحلة' : 'إضافة موعد رحلة جديد'}
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleScheduleSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-700 font-bold block mb-1">موعد الرحلة:</label>
                  <input
                    type="text"
                    value={scheduleForm.time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                    placeholder="07:00 ص أو 02:00 م"
                    className="w-full p-2.5 border rounded-xl font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-bold block mb-1">الاتجاه:</label>
                  <select
                    value={scheduleForm.direction}
                    onChange={(e) => {
                      const dir = e.target.value as any;
                      setScheduleForm({
                        ...scheduleForm,
                        direction: dir,
                        type: dir === 'to_university' ? 'morning' : 'return'
                      });
                    }}
                    className="w-full p-2.5 border rounded-xl bg-white"
                  >
                    <option value="to_university">ذهاب (صباحاً)</option>
                    <option value="from_university">عودة (ظهراً ومساءً)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">الجامعة المرتبطة (اختياري/عام):</label>
                <select
                  value={scheduleForm.universityId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, universityId: e.target.value })}
                  className="w-full p-2.5 border rounded-xl bg-white"
                >
                  <option value="">عام لجميع الجامعات</option>
                  {universities.map(u => (
                    <option key={u.id} value={u.id}>{u.nameAr}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl">حفظ موعد الرحلة</button>
                <button type="button" onClick={() => setShowScheduleModal(false)} className="py-2.5 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Staff / Driver / User Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">إضافة ودعوة موظف / سائق جديد</h3>
              <button type="button" onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsInviting(true);
                try {
                  await createCompanyUser({
                    name: inviteForm.name,
                    phone: inviteForm.phone,
                    email: inviteForm.email,
                    role: inviteForm.role,
                    isGeneralSupervisor: inviteForm.role === 'supervisor' ? inviteForm.isGeneralSupervisor : false,
                    status: 'active',
                    assignedBusId: inviteForm.role === 'driver' ? inviteForm.assignedBusId || undefined : undefined,
                    licenseNumber: inviteForm.role === 'driver' ? inviteForm.licenseNumber || undefined : undefined,
                    universityId: inviteForm.role === 'student' ? inviteForm.universityId || undefined : undefined,
                    lineId: inviteForm.role === 'student' ? inviteForm.lineId || undefined : undefined,
                    stationId: inviteForm.role === 'student' ? inviteForm.stationId || undefined : undefined,
                  });
                  setShowInviteModal(false);
                } finally {
                  setIsInviting(false);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-slate-700 font-bold block mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="w-full p-2.5 border rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-700 font-bold block mb-1">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-bold block mb-1">الدور الوظيفي *</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Exclude<UserRole, 'super_admin'> })}
                    className="w-full p-2.5 border rounded-xl bg-white font-bold"
                  >
                    <option value="driver">سائق</option>
                    <option value="supervisor">مشرف تشغيلي</option>
                    <option value="admin">مدير الشركة</option>
                    <option value="student">طالب</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">البريد الإلكتروني (اختياري — للدخول بحساب Google)</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="اختياري (مثال: name@gmail.com)"
                  className="w-full p-2.5 border rounded-xl font-mono"
                />
              </div>
              {inviteForm.role === 'supervisor' && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-indigo-950">
                    <input
                      type="checkbox"
                      checked={inviteForm.isGeneralSupervisor}
                      onChange={(e) => setInviteForm({ ...inviteForm, isGeneralSupervisor: e.target.checked })}
                      className="w-4 h-4 accent-indigo-600 rounded"
                    />
                    <span>تعيين كـ "مشرف عام" (يمتلك واجهات مدير + مشرف + سائق)</span>
                  </label>
                </div>
              )}
              {inviteForm.role === 'driver' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-700 font-bold block mb-1">الباص المخصص</label>
                    <select
                      value={inviteForm.assignedBusId}
                      onChange={(e) => setInviteForm({ ...inviteForm, assignedBusId: e.target.value })}
                      className="w-full p-2.5 border rounded-xl bg-white"
                    >
                      <option value="">غير محدد</option>
                      {buses.map(b => (
                        <option key={b.id} value={b.id}>{b.code} — {b.plateNumber}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-700 font-bold block mb-1">رقم الرخصة</label>
                    <input
                      type="text"
                      value={inviteForm.licenseNumber}
                      onChange={(e) => setInviteForm({ ...inviteForm, licenseNumber: e.target.value })}
                      placeholder="DL-2025"
                      className="w-full p-2.5 border rounded-xl font-mono"
                    />
                  </div>
                </div>
              )}
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-[11px]">
                يستطيع الموظف أو الطالب الدخول فوراً باستخدام <strong>رقم الهاتف والاسم</strong> بدون بريد إلكتروني، أو عبر <strong>Google</strong> إذا أضفت بريده.
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isInviting}
                  className="flex-1 py-2.5 bg-[#0F2537] hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  {isInviting ? 'جارٍ الحفظ والتفعيل...' : 'حفظ وتفعيل الحساب'}
                </button>
                <button type="button" onClick={() => setShowInviteModal(false)} className="py-2.5 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
