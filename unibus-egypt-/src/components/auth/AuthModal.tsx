import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { loginWithGoogle, loginWithPhoneAndName, registerWithPhoneAndName } from '../../services/authService';
import { User as UserIcon, Phone, ShieldCheck, AlertCircle, X, CheckCircle, BookmarkCheck, Mail, IdCard } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { setCurrentUser, universities, lines, addToast } = useApp();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login form state (Phone + Name only)
  const [loginPhone, setLoginPhone] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Registration form state (Student / Driver / Supervisor via Phone + Name)
  const [regRole, setRegRole] = useState<'student' | 'driver' | 'supervisor'>('student');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regLicense, setRegLicense] = useState('');
  const [regUniId, setRegUniId] = useState(universities[0]?.id || '');
  const [regStationId, setRegStationId] = useState(lines[0]?.stations[0]?.id || '');

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      setCurrentUser(user);
      addToast(`مرحباً ${user.name}! تم تسجيل الدخول بحساب Google بنجاح.`, 'success');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل تسجيل الدخول بحساب Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const user = await loginWithPhoneAndName(loginPhone, loginName);
      setCurrentUser(user);
      addToast(`مرحباً بك ${user.name}! تم تسجيل الدخول وحفظ الجلسة.`, 'success');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل تسجيل الدخول. تأكد من رقم الهاتف والاسم.');
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
        universityId: regRole === 'student' ? regUniId : undefined,
        stationId: regRole === 'student' ? regStationId : undefined,
      });
      setCurrentUser(res.user);
      if (res.alreadyExisted) {
        addToast('تم العثور على حسابك المسجل وحفظ جلستك.', 'info');
      } else {
        addToast('تم إرسال طلب إنشاء الحساب وهو الآن بانتظار موافقة المشرف أو المدير.', 'info');
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل إرسال طلب إنشاء الحساب.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in" dir="rtl">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-[#0F2537] text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 left-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>بوابة الدخول السريع</span>
          </div>
          <h2 className="text-xl font-extrabold text-white">منظومة نقل طلاب الجامعات</h2>
          <p className="text-xs text-slate-300 mt-1">الدخول برقم الهاتف والاسم لمرة واحدة فقط</p>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-4">
          <button
            type="button"
            onClick={() => { setTab('login'); setErrorMsg(null); }}
            className={`min-h-[44px] pb-3 text-xs font-bold transition-all relative cursor-pointer ${
              tab === 'login'
                ? 'text-amber-600 border-b-2 border-amber-500 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setErrorMsg(null); }}
            className={`min-h-[44px] pb-3 text-xs font-bold transition-all relative cursor-pointer ${
              tab === 'register'
                ? 'text-amber-600 border-b-2 border-amber-500 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            إنشاء حساب جديد
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {tab === 'login' ? (
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف *</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      inputMode="tel"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      placeholder="01012345678"
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

                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-1.5">
                  <BookmarkCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>يتم حفظ تسجيل الدخول تلقائياً لمرة واحدة.</span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  {loading ? 'جارٍ التحقق من الحساب...' : 'دخول وحفظ الجلسة'}
                </button>
              </form>

              <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                <div className="h-px bg-slate-200 flex-1" />
                <span>أو للإدارة والمطور</span>
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
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الحساب *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'student' as const, label: 'طالب' },
                    { id: 'driver' as const, label: 'سائق' },
                    { id: 'supervisor' as const, label: 'مشرف' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRegRole(opt.id)}
                      className={`min-h-[44px] py-2 px-2 rounded-xl border text-xs font-extrabold cursor-pointer ${
                        regRole === opt.id
                          ? 'bg-[#0F2537] text-white border-[#0F2537]'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

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
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الرخصة أو السيارة (اختياري)</label>
                  <div className="relative">
                    <IdCard className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={regLicense}
                      onChange={(e) => setRegLicense(e.target.value)}
                      placeholder="اختياري"
                      className="w-full min-h-[44px] pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              {regRole === 'supervisor' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بريد Gmail (اختياري — للدخول بحساب Google)</label>
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الجامعة</label>
                    <select
                      value={regUniId}
                      onChange={(e) => setRegUniId(e.target.value)}
                      className="w-full min-h-[44px] p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>{u.nameAr}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">محطة الركوب</label>
                    <select
                      value={regStationId}
                      onChange={(e) => setRegStationId(e.target.value)}
                      className="w-full min-h-[44px] p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      {lines.flatMap(l => l.stations).slice(0, 10).map(s => (
                        <option key={s.id} value={s.id}>{s.nameAr}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11px] flex items-start gap-1.5">
                <CheckCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>لا يُقبل الطلب إلا بموافقة المشرف أو المدير، وتُحفظ بياناتك تلقائياً على جهازك.</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {loading ? 'جارٍ إرسال الطلب...' : 'إنشاء الحساب وإرساله للاعتماد'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
