import React, { useState, useMemo, useEffect } from 'react';
import {
  Bus,
  User as UserIcon,
  Phone,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  Building2,
  BookmarkCheck,
  UserCheck,
  Mail,
  IdCard
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  loginWithGoogle,
  loginWithPhoneAndName,
  registerWithPhoneAndName
} from '../../services/authService';
import { DEFAULT_COMPANY_ID } from '../../services/firestoreDb';
import { initialUniversities, initialLines } from '../../data/mockData';
import { PWAInstallButton } from '../common/PWAInstallButton';

const ROLE_LABELS_AR: Record<string, string> = {
  super_admin: 'صاحب المنصة والمطور',
  admin: 'مدير الشركة',
  supervisor: 'مشرف تشغيلي',
  driver: 'سائق',
  student: 'طالب',
};

export const LoginScreen: React.FC = () => {
  const { setCurrentUser, universities, lines, publicCompanyDirectory, addToast } = useApp();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const companyOptions = useMemo(() => {
    const activeEntries = publicCompanyDirectory.filter(c => c.status === 'active');
    if (activeEntries.length > 0) return activeEntries;
    return [
      {
        id: DEFAULT_COMPANY_ID,
        nameAr: 'شركة النقل الجامعي الرئيسية',
        code: 'MAIN',
        status: 'active' as const,
      },
    ];
  }, [publicCompanyDirectory]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(DEFAULT_COMPANY_ID);

  useEffect(() => {
    if (companyOptions.length > 0 && !companyOptions.some(c => c.id === selectedCompanyId)) {
      setSelectedCompanyId(companyOptions[0].id);
    }
  }, [companyOptions, selectedCompanyId]);

  const catalogUniversities = useMemo(() => {
    const scoped = universities.filter(u => (u.companyId || DEFAULT_COMPANY_ID) === selectedCompanyId);
    if (scoped.length > 0) return scoped;
    if (selectedCompanyId === DEFAULT_COMPANY_ID) {
      return universities.length > 0 ? universities : initialUniversities;
    }
    return [];
  }, [universities, selectedCompanyId]);

  const catalogLines = useMemo(() => {
    const scoped = lines.filter(l => (l.companyId || DEFAULT_COMPANY_ID) === selectedCompanyId);
    if (scoped.length > 0) return scoped;
    if (selectedCompanyId === DEFAULT_COMPANY_ID) {
      return lines.length > 0 ? lines : initialLines;
    }
    return [];
  }, [lines, selectedCompanyId]);

  // 1-time Phone + Name Login state
  const [loginPhone, setLoginPhone] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Registration state (Student / Driver / Supervisor via Phone + Name)
  const [regRole, setRegRole] = useState<'student' | 'driver' | 'supervisor'>('student');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regLicense, setRegLicense] = useState('');
  const [regUniId, setRegUniId] = useState('');
  const [regLineId, setRegLineId] = useState('');
  const [regStationId, setRegStationId] = useState('');

  // Keep university -> line -> station cascading valid when company changes
  useEffect(() => {
    const validUni = catalogUniversities.find(u => u.id === regUniId) || catalogUniversities[0];
    setRegUniId(validUni?.id || '');
  }, [catalogUniversities, regUniId]);

  const filteredLinesForUni = useMemo(() => {
    if (!regUniId) return catalogLines;
    const byUni = catalogLines.filter(l => l.universityId === regUniId);
    return byUni.length > 0 ? byUni : catalogLines;
  }, [catalogLines, regUniId]);

  useEffect(() => {
    const validLine = filteredLinesForUni.find(l => l.id === regLineId) || filteredLinesForUni[0];
    setRegLineId(validLine?.id || '');
  }, [filteredLinesForUni, regLineId]);

  const catalogStations = useMemo(() => {
    const selectedLine = filteredLinesForUni.find(l => l.id === regLineId);
    if (selectedLine && selectedLine.stations.length > 0) return selectedLine.stations;
    return filteredLinesForUni.flatMap(l => l.stations);
  }, [filteredLinesForUni, regLineId]);

  useEffect(() => {
    const validStation = catalogStations.find(s => s.id === regStationId) || catalogStations[0];
    setRegStationId(validStation?.id || '');
  }, [catalogStations, regStationId]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      setCurrentUser(user);
      const roleLabel = ROLE_LABELS_AR[user.role] || user.role;
      addToast(`مرحباً ${user.name}! تم تسجيل الدخول بنجاح (${roleLabel}).`, 'success');
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل تسجيل الدخول بحساب Google.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const user = await loginWithPhoneAndName(loginPhone, loginName);
      setCurrentUser(user);
      const roleLabel = ROLE_LABELS_AR[user.role] || user.role;
      addToast(`مرحباً ${user.name}! تم تسجيل دخولك وحفظ الجلسة (${roleLabel}).`, 'success');
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تسجيل الدخول. تأكد من رقم الهاتف والاسم المسجل.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await registerWithPhoneAndName({
        name: regName,
        phone: regPhone,
        role: regRole,
        email: regRole === 'supervisor' && regEmail.trim() ? regEmail.trim() : undefined,
        licenseNumber: regRole === 'driver' && regLicense.trim() ? regLicense.trim() : undefined,
        companyId: selectedCompanyId || DEFAULT_COMPANY_ID,
        universityId: regRole === 'student' ? (regUniId || catalogUniversities[0]?.id || '') : undefined,
        lineId: regRole === 'student' ? (regLineId || filteredLinesForUni[0]?.id || undefined) : undefined,
        stationId: regRole === 'student' ? (regStationId || catalogStations[0]?.id || '') : undefined,
      });
      setCurrentUser(res.user);
      if (res.alreadyExisted) {
        addToast('هذا الرقم مسجل مسبقاً — تم استرجاع حسابك وحفظ الجلسة على جهازك.', 'info');
      } else {
        addToast('تم إرسال طلب إنشاء الحساب بنجاح! حسابك بانتظار موافقة المشرف أو المدير.', 'info');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل إرسال طلب إنشاء الحساب.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 sm:p-6" dir="rtl">
      <div className="w-full max-w-md space-y-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-[#0F2537] text-white p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm shrink-0">
                  <Bus className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-lg font-extrabold tracking-tight text-white leading-none">رحلات الجامعات</h1>
                  <p className="text-xs text-slate-300 mt-1">منظومة إدارة نقل الطلاب والحافلات</p>
                </div>
              </div>
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              سجّل برقم الهاتف والاسم فقط لمرة واحدة — تُحفظ بياناتك تلقائياً، ويتم تفعيل الحساب فور موافقة المشرف أو المدير.
            </p>
          </div>

          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-center">
            <button
              type="button"
              onClick={() => { setTab('login'); setErrorMsg(null); }}
              className={`min-h-[44px] px-2 pb-2 text-xs font-bold transition-colors cursor-pointer ${
                tab === 'login'
                  ? 'text-amber-700 border-b-2 border-amber-500 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setErrorMsg(null); }}
              className={`min-h-[44px] px-2 pb-2 text-xs font-bold transition-colors cursor-pointer ${
                tab === 'register'
                  ? 'text-amber-700 border-b-2 border-amber-500 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              إنشاء حساب جديد
            </button>
          </div>

          <div className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {tab === 'login' && (
              <div className="space-y-4">
                <form onSubmit={handlePhoneLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف *</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                      <input
                        type="tel"
                        required
                        value={loginPhone}
                        onChange={(e) => setLoginPhone(e.target.value)}
                        placeholder="01012345678"
                        inputMode="tel"
                        className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الاسم المسجل *</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={loginName}
                        onChange={(e) => setLoginName(e.target.value)}
                        placeholder="اكتب اسمك كما سجلته"
                        className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-medium"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
                    <BookmarkCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>تُحفظ بياناتك على هذا الهاتف لتدخل مباشرة دون إعادة كتابتها.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    {loading ? 'جارٍ التحقق من الحساب...' : 'دخول وحفظ الجلسة'}
                  </button>
                </form>

                <div className="flex items-center gap-2 text-slate-400 text-[11px] pt-1">
                  <div className="h-px bg-slate-200 flex-1" />
                  <span>دخول المطور ومدير الشركة والمشرفين</span>
                  <div className="h-px bg-slate-200 flex-1" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>المتابعة بحساب Google</span>
                </button>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#0F2537]" />
                    <span>دليل الدخول السريع:</span>
                  </div>
                  <p>• <strong>المطور والمدير والمشرف:</strong> اضغط <strong>المتابعة بحساب Google</strong> أعلاه (كما يمكن للمشرفين الدخول برقم الهاتف).</p>
                  <p>• <strong>الطلاب والسائقون:</strong> ادخل مباشرة برقم الهاتف والاسم لمرة واحدة فقط.</p>
                </div>
              </div>
            )}

            {tab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                {/* Role selector: Student / Driver / Supervisor */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الحساب المطلوب *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'student' as const, label: 'طالب' },
                      { id: 'driver' as const, label: 'سائق' },
                      { id: 'supervisor' as const, label: 'مشرف' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRegRole(opt.id)}
                        className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                          regRole === opt.id
                            ? 'bg-[#0F2537] text-white border-[#0F2537] shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Company selector only when there is more than one active company (no company code!) */}
                {companyOptions.length > 1 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                      <Building2 className="w-4 h-4 text-[#0F2537]" />
                      <span>اختر الشركة التابع لها</span>
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full min-h-[44px] p-2 text-xs font-bold rounded-xl border border-slate-300 bg-white"
                    >
                      {companyOptions.map(c => (
                        <option key={c.id} value={c.id}>{c.nameAr}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم بالكامل *</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="الاسم الثلاثي"
                      className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف *</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      inputMode="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                    />
                  </div>
                </div>

                {regRole === 'driver' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الرخصة أو لوحة السيارة (اختياري)</label>
                    <div className="relative">
                      <IdCard className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        value={regLicense}
                        onChange={(e) => setRegLicense(e.target.value)}
                        placeholder="اختياري — مثال: رخصة قيادة مهنية"
                        className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}

                {regRole === 'supervisor' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">بريد Gmail (اختياري — لتفعيل الدخول بحساب Google)</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="example@gmail.com"
                        className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                {regRole === 'student' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">الجامعة</label>
                        <select
                          value={regUniId}
                          onChange={(e) => setRegUniId(e.target.value)}
                          className="w-full min-h-[44px] p-2 text-xs rounded-xl border border-slate-300 bg-white"
                        >
                          {catalogUniversities.length === 0 ? (
                            <option value="">سيحددها المشرف لاحقاً</option>
                          ) : (
                            catalogUniversities.map(u => (
                              <option key={u.id} value={u.id}>{u.nameAr}</option>
                            ))
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">خط السير</label>
                        <select
                          value={regLineId}
                          onChange={(e) => setRegLineId(e.target.value)}
                          className="w-full min-h-[44px] p-2 text-xs rounded-xl border border-slate-300 bg-white"
                        >
                          {filteredLinesForUni.length === 0 ? (
                            <option value="">سيحدده المشرف لاحقاً</option>
                          ) : (
                            filteredLinesForUni.map(l => (
                              <option key={l.id} value={l.id}>{l.nameAr}</option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">محطة الركوب المعتمدة</label>
                      <select
                        value={regStationId}
                        onChange={(e) => setRegStationId(e.target.value)}
                        className="w-full min-h-[44px] p-2 text-xs rounded-xl border border-slate-300 bg-white"
                      >
                        {catalogStations.length === 0 ? (
                          <option value="">سيحددها المشرف لاحقاً</option>
                        ) : (
                          catalogStations.map(s => (
                            <option key={s.id} value={s.id}>{s.nameAr}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </>
                )}

                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11px] flex items-start gap-1.5">
                  <CheckCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    تُحفظ بياناتك لتسجيل الدخول مرة واحدة فقط، ولن يُفعّل الحساب إلا بعد موافقة{' '}
                    {regRole === 'supervisor' ? 'المدير أو صاحب المنصة' : 'المشرف أو المدير'}.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  {loading ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الحساب للاعتماد'}
                </button>
              </form>
            )}

            <PWAInstallButton variant="card" />
          </div>
        </div>
      </div>
    </div>
  );
};
