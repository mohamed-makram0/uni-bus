import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { Bus, Shield, Users, Settings, LogOut, KeyRound } from 'lucide-react';
import { AuthModal } from '../auth/AuthModal';
import { PWAInstallButton } from './PWAInstallButton';

export const Header: React.FC = () => {
  const {
    currentUser,
    authenticatedUser,
    switchRole,
    logout,
    addToast,
    activeCompany,
    canSwitchRoles,
    impersonatedUser,
    exitUserAccount
  } = useApp();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const roleConfigs: Record<UserRole, { label: string; icon: React.ReactNode }> = {
    super_admin: { label: 'مالك المنصة', icon: <Shield className="w-4 h-4" /> },
    admin: { label: 'مدير الشركة', icon: <Settings className="w-4 h-4" /> },
    supervisor: { label: 'المشرف التشغيلي', icon: <Shield className="w-4 h-4" /> },
    driver: { label: 'السائق', icon: <Bus className="w-4 h-4" /> },
    student: { label: 'الطالب', icon: <Users className="w-4 h-4" /> },
  };

  const handleLogout = async () => {
    try {
      await logout();
      addToast('تم تسجيل الخروج بنجاح.', 'info');
    } catch {
      addToast('تمت إعادة ضبط الجلسة.', 'info');
    }
  };

  const isTrueAdmin = authenticatedUser?.role === 'admin';
  const isGeneralSupervisor = authenticatedUser?.role === 'supervisor' && Boolean(authenticatedUser?.isGeneralSupervisor);
  const isPlatformOwner = authenticatedUser?.role === 'super_admin';

  const switchableRoles: UserRole[] = isTrueAdmin
    ? ['student', 'driver', 'supervisor', 'admin']
    : isGeneralSupervisor
    ? ['driver', 'supervisor', 'admin']
    : [];

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#0F2537] text-white shadow-md border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">

            {/* Zone 1: Brand Wordmark */}
            <div className="flex items-center gap-2.5 min-w-0 shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-sm shrink-0">
                <Bus className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-base sm:text-lg font-extrabold tracking-tight text-white block leading-none whitespace-nowrap">
                  UniBus Egypt
                </span>
                <span className="hidden sm:block text-[11px] text-slate-300 font-medium mt-1 whitespace-nowrap">
                  {activeCompany ? activeCompany.nameAr : 'منظومة إدارة نقل طلاب الجامعات'}
                </span>
              </div>
            </div>

            {/* Zone 2: Platform Owner Badge OR Admin / General Supervisor Role Switcher */}
            {isPlatformOwner && !impersonatedUser && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-extrabold">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <span>مركز تحكم مالك المنصة</span>
                {activeCompany && (
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold">
                    {activeCompany.nameAr}
                  </span>
                )}
              </div>
            )}

            {canSwitchRoles && !impersonatedUser && switchableRoles.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 hidden xl:inline-block whitespace-nowrap">
                  {isGeneralSupervisor ? 'تبديل واجهتي:' : 'معاينة دور:'}
                </span>
                {/* Mobile compact select */}
                <select
                  aria-label="تبديل الواجهة"
                  value={currentUser.role}
                  onChange={(e) => switchRole(e.target.value as UserRole)}
                  className="md:hidden min-h-[38px] px-2 py-1 text-xs font-bold rounded-lg bg-slate-800 text-amber-300 border border-slate-700 outline-hidden"
                >
                  {switchableRoles.map(r => (
                    <option key={r} value={r}>
                      {r === 'admin' ? 'مدير' : r === 'supervisor' ? 'مشرف' : r === 'driver' ? 'سائق' : 'طالب'}
                    </option>
                  ))}
                </select>

                {/* Desktop segmented role switcher */}
                <div className="hidden md:inline-flex rounded-lg bg-slate-800 p-1 border border-slate-700">
                  {switchableRoles.map((r) => {
                    const isActive = currentUser.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => switchRole(r)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        {r === 'student' && 'طالب'}
                        {r === 'driver' && 'سائق'}
                        {r === 'supervisor' && 'مشرف'}
                        {r === 'admin' && 'مدير'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Zone 3: Install App + Account Badge + Logout */}
            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton variant="header" />

              {!authenticatedUser && (
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="min-h-[40px] flex items-center gap-1.5 text-xs text-amber-300 hover:text-slate-950 hover:bg-amber-400 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 font-bold transition-all whitespace-nowrap cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>دخول</span>
                </button>
              )}

              {authenticatedUser && (
                <div className="flex items-center gap-2 sm:border-r sm:border-slate-700 sm:pr-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                    {authenticatedUser.name.charAt(0)}
                  </div>
                  <div className="hidden sm:block text-right max-w-[140px]">
                    <div className="text-xs font-bold text-white leading-tight truncate">{authenticatedUser.name}</div>
                    <div className="text-[10px] text-amber-400 whitespace-nowrap">
                      {isGeneralSupervisor ? 'مشرف عام (متعدد الصلاحيات)' : roleConfigs[authenticatedUser.role].label}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 text-slate-300 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                    title="تسجيل الخروج"
                    aria-label="تسجيل الخروج"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Active Super Admin User Account Access Banner */}
        {isPlatformOwner && impersonatedUser && (
          <div className="bg-amber-500 text-slate-950 border-t border-amber-600 px-3 sm:px-6 py-2">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
              <div className="flex items-center gap-2 flex-wrap">
                <Shield className="w-4 h-4 text-slate-950 shrink-0" />
                <span>
                  أنت تتصفح وتُعدّل الآن من داخل حساب: <strong>{impersonatedUser.name}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-950 text-amber-300 text-[11px]">
                  {roleConfigs[impersonatedUser.role].label}
                </span>
                {activeCompany && (
                  <span className="px-2 py-0.5 rounded-md bg-white/70 text-slate-900 text-[11px]">
                    {activeCompany.nameAr}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={exitUserAccount}
                className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors cursor-pointer shrink-0"
              >
                الخروج والعودة لمالك المنصة
              </button>
            </div>
          </div>
        )}
      </header>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};

