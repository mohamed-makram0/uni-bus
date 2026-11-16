import React, { useState } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'card'
            ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs px-4 py-2.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap'
            : 'min-h-[40px] flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-3 py-1.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0'
        }
        title="تثبيت التطبيق على الهاتف ليعمل مثل تطبيق أصلي"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'card'
              ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs px-4 py-2.5 transition-colors cursor-pointer whitespace-nowrap'
              : 'min-h-[40px] flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold text-xs px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0'
          }
          title="طريقة التثبيت على الآيفون"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>تثبيت للآيفون</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4" dir="rtl">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">تثبيت UniBus على الآيفون</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="space-y-2.5 text-xs text-slate-700 leading-relaxed font-medium list-decimal pr-4">
                <li>
                  اضغط على زر <strong className="inline-flex items-center gap-1 text-slate-900">المشاركة <Share className="w-3.5 h-3.5 text-sky-600" /></strong> في شريط متصفح Safari بالأسفل.
                </li>
                <li>
                  مرر للأسفل واختر <strong className="text-slate-900">إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                </li>
                <li>
                  اضغط <strong className="text-slate-900">إضافة</strong> ليظهر كتطبيق مستقل وتعمل التنبيهات بشكل أفضل.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-[#0F2537] text-white font-bold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
              >
                فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
