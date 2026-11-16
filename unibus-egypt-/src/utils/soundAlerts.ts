// Lightweight Web Audio API sound alert & safe Browser Notification helper (zero external assets)

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

export const playDispatchAlertChime = (type: 'dispatch' | 'success' | 'student_alert' = 'dispatch'): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes =
      type === 'dispatch'
        ? [587.33, 783.99, 987.77] // D5 -> G5 -> B5 urgent bright chime
        : type === 'student_alert'
        ? [523.25, 659.25] // C5 -> E5 gentle arrival chime
        : [659.25, 880.0]; // E5 -> A5 confirmation ding

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'dispatch' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.26);
    });
  } catch {
    // Ignore audio context autoplay restrictions safely
  }
};

export interface BrowserNotificationOptions {
  tag?: string;
  requireInteraction?: boolean;
}

export const getBrowserNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

export const triggerBrowserNotification = (
  title: string,
  body: string,
  options?: BrowserNotificationOptions
): void => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notifOptions: NotificationOptions = {
    body,
    dir: 'rtl',
    lang: 'ar',
    tag: options?.tag,
    requireInteraction: options?.requireInteraction ?? false,
  };

  try {
    // Prefer active ServiceWorker showNotification for reliable mobile/PWA Push presentation
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && typeof reg.showNotification === 'function') {
          reg.showNotification(title, notifOptions).catch(() => {
            new Notification(title, notifOptions);
          });
        } else {
          new Notification(title, notifOptions);
        }
      }).catch(() => {
        new Notification(title, notifOptions);
      });
      return;
    }
    new Notification(title, notifOptions);
  } catch {
    // Ignore notification restrictions in embedded iframes
  }
};

export const requestBrowserNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};
