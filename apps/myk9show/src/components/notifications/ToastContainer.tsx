import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Dog, Megaphone } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import type { ToastEntry } from '@/store/toastStore';
import type { NotificationType } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from './notification-styles';

const AUTO_DISMISS_MS = 8000;

function ToastIcon({ type }: { type: NotificationType }) {
  if (type === 'announcement') {
    return <Megaphone className="h-4 w-4 text-purple-400" aria-label="Announcement" />;
  }
  return <Dog className="h-4 w-4 text-orange-400" aria-label="Dog alert" />;
}

function Toast({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: string) => void }) {
  const { payload } = entry;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startTimeRef = useRef(0);
  const [hovered, setHovered] = useState(false);

  const dismiss = useCallback(() => {
    onDismiss(payload.id);
  }, [onDismiss, payload.id]);

  // Auto-dismiss for non-urgent
  useEffect(() => {
    if (payload.priority === 'urgent') return;

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remainingRef.current);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload.priority, dismiss]);

  const handleMouseEnter = () => {
    if (payload.priority === 'urgent') return;
    pausedRef.current = true;
    setHovered(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current -= Date.now() - startTimeRef.current;
  };

  const handleMouseLeave = () => {
    if (payload.priority === 'urgent' || !pausedRef.current) return;
    pausedRef.current = false;
    setHovered(false);
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, Math.max(remainingRef.current, 500));
  };

  return (
    <div
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-lg border border-border/50 border-l-[3px] bg-popover shadow-lg animate-in slide-in-from-right-full ${PRIORITY_BORDER[payload.priority]}`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 flex-shrink-0">
          <ToastIcon type={payload.type} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{payload.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{payload.body}</p>
          <div className="mt-2 flex items-center gap-2">
            {payload.actionUrl && (
              <a
                href={payload.actionUrl}
                onClick={dismiss}
                className="text-xs font-medium text-orange-500 hover:text-orange-400"
              >
                View &rarr;
              </a>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(new Date(payload.timestamp))}
            </span>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss notification"
          className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {payload.priority === 'urgent' && (
        <p className="pb-1.5 text-center text-[9px] font-medium text-red-400">
          URGENT — will not auto-dismiss
        </p>
      )}

      {payload.priority !== 'urgent' && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
          <div
            className={`h-full ${payload.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{
              animation: `toast-progress ${AUTO_DISMISS_MS}ms linear forwards`,
              animationPlayState: hovered ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const dismissToast = useToastStore(s => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div aria-live="polite" className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2 sm:w-96">
        {toasts.map(entry => (
          <Toast key={entry.payload.id} entry={entry} onDismiss={dismissToast} />
        ))}
      </div>
    </>
  );
}
