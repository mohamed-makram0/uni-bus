import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-16 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      dir="rtl"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-lg border border-amber-400">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>لا يوجد اتصال بالإنترنت — يتم استخدام البيانات المخزنة مؤقتاً</span>
      </div>
    </div>
  );
};
