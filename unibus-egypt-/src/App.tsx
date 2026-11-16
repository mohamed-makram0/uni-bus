import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/common/Header';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { CheckCircle2, AlertCircle, Info, X, Clock, Phone, RefreshCw, LogOut, Bus, ShieldAlert } from 'lucide-react';

const StudentView = lazy(() => import('./components/student/StudentView').then(m => ({ default: m.StudentView })));
const DriverView = lazy(() => import('./components/driver/DriverView').then(m => ({ default: m.DriverView })));
const SupervisorView = lazy(() => import('./components/supervisor/SupervisorView').then(m => ({ default: m.SupervisorView })));
const AdminView = lazy(() => import('./components/admin/AdminView').then(m => ({ default: m.AdminView })));
const SuperAdminView = lazy(() => import('./components/superadmin/SuperAdminView').then(m => ({ default: m.SuperAdminView })));
const LoginScreen = lazy(() => import('./components/auth/LoginScreen').then(m => ({ default: m.LoginScreen })));

const ViewLoader: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-slate-500" dir="rtl">
    <div className="w-9 h-9 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-bold">جارٍ تحميل الواجهة...</span>
  </div>
);

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-3.5 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs font-bold transition-all animate-in slide-in-from-bottom-2 ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-rose-900/10'
              : toast.type === 'info'
              ? 'bg-sky-50 border-sky-300 text-sky-900 shadow-sky-900/10'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-emerald-900/10'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-sky-600 shrink-0" />}
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            <span>{toast.text}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

const MainContent: React.FC = () => {
  const {
    currentUser,
    authenticatedUser,
    settings,
    refreshCurrentUserProfile,
    logout,
    isCompanySuspended,
    activeCompany,
    impersonatedUser,
    isPreviewMode
  } = useApp();

  // Server-side & UI lock when the company subscription is suspended by Platform Owner
  if (isCompanySuspended && authenticatedUser?.role !== 'super_admin') {
    return (
      <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 shadow-sm p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-extrabold text-slate-900">اشتراك الشركة موقوف مؤقتاً</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              تم تعليق التشغيل مؤقتاً لشركة <strong className="text-slate-900">{activeCompany?.nameAr || 'الشركة'}</strong> بواسطة مالك المنصة. جميع بياناتكم وسجلاتكم محفوظة بالكامل ولن يتم حذف أي سجل.
            </p>
            {activeCompany?.suspendedReason && (
              <p className="text-xs bg-rose-50 text-rose-800 border border-rose-200 rounded-xl p-2.5 font-bold">
                السبب: {activeCompany.suspendedReason}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <a
              href={`tel:${settings.contactSupportPhone}`}
              className="flex-1 min-h-[44px] py-2.5 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>التواصل مع إدارة المنصة</span>
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Individual user suspension lock screen
  if (authenticatedUser?.status === 'suspended' && authenticatedUser?.role !== 'super_admin') {
    return (
      <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 shadow-sm p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-extrabold text-slate-900">تم إيقاف حسابك مؤقتاً</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              عذراً يا <strong className="text-slate-900">{authenticatedUser.name}</strong>، تم تعطيل وصول حسابك مؤقتاً بواسطة إدارة الشركة أو مالك المنصة. يرجى التواصل مع الإدارة لإعادة التفعيل.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <a
              href={`tel:${settings.contactSupportPhone}`}
              className="flex-1 min-h-[44px] py-2.5 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>التواصل مع الإدارة</span>
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Enforce Supervisor or Company Admin approval for any newly registered account before allowing app access
  const isPendingAccount =
    authenticatedUser?.status === 'pending_approval' &&
    authenticatedUser?.role !== 'super_admin' &&
    !impersonatedUser &&
    !isPreviewMode;

  if (isPendingAccount) {
    return (
      <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-extrabold text-slate-900">حسابك قيد المراجعة — في انتظار موافقة المشرف أو المدير</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              تم حفظ بياناتك بنجاح ولا تحتاج لتسجيل الدخول مرة أخرى. لن يتم تفعيل الحساب إلا بعد موافقة المشرف التشغيلي أو مدير الشركة.
            </p>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-1">
              <div>
                <span className="text-slate-500">الاسم: </span>
                <strong className="font-extrabold">{authenticatedUser.name}</strong>
              </div>
              <div className="font-mono">
                <span className="text-slate-500 font-sans">رقم الهاتف: </span>
                <strong className="font-bold">{authenticatedUser.phone}</strong>
              </div>
              <p className="text-[11px] text-emerald-700 font-bold pt-1">
                ✓ ستفتح لك الواجهة تلقائياً وفوراً بمجرد اعتماد المشرف أو المدير لطلبك.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => void refreshCurrentUserProfile()}
              className="flex-1 min-h-[44px] py-2.5 px-4 bg-[#0F2537] hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>تحديث حالة الحساب</span>
            </button>
            <a
              href={`tel:${settings.contactSupportPhone}`}
              className="min-h-[44px] py-2.5 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>اتصال بالإدارة</span>
            </a>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full min-h-[44px] text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </main>
    );
  }

  if (authenticatedUser?.role === 'super_admin' && !impersonatedUser && !isPreviewMode) {
    return (
      <main className="min-h-[calc(100vh-4rem)] pb-12">
        <Suspense fallback={<ViewLoader />}>
          <SuperAdminView />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] pb-12">
      <Suspense fallback={<ViewLoader />}>
        {currentUser.role === 'student' && <StudentView />}
        {currentUser.role === 'driver' && <DriverView />}
        {currentUser.role === 'supervisor' && <SupervisorView />}
        {currentUser.role === 'admin' && <AdminView />}
      </Suspense>
    </main>
  );
};

const AppShell: React.FC = () => {
  const { isAuthReady, isAuthenticated } = useApp();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0F2537] text-white flex flex-col items-center justify-center p-6 gap-4" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
          <Bus className="w-8 h-8 animate-bounce" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-base font-extrabold">UniBus Egypt</p>
          <p className="text-xs text-slate-300">جارٍ تجهيز المنظومة...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <OfflineIndicator />
        <Suspense fallback={<ViewLoader />}>
          <LoginScreen />
        </Suspense>
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header />
      <OfflineIndicator />
      <MainContent />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

