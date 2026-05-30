/**
 * ClassDetailsPopoverSlot — myK9Show host implementation of ringside's
 * `ClassDetailsPopover` layout slot (the header info-ⓘ dialog).
 *
 * Ports myK9Q's ClassDetailsPopover look (header + close, icon rows, tinted
 * value badges) AND its positioning behaviour: a fixed-position card anchored
 * to `anchorRef` with a click-away backdrop. The 1a spike accepted `anchorRef`
 * but never consumed it, so the popover floated unanchored — this consumes it.
 *
 * Data (visibilityPreset / selfCheckinEnabled) is wired offline-safe upstream
 * in `atShowDataAdapter` (PR #450); this slot is presentation only. Colour
 * tiers come from `atShowChrome.helpers` (myK9Show's shadcn theme has no
 * `--success/--warning/--info`, so semantic states map to explicit palette
 * tiers — see memory `feedback_ringside_token_inherit`).
 *
 * Extracted from `atShowLayoutSlots.tsx` to keep that module under the
 * 500-line ceiling (CLAUDE.md).
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  ListChecks,
  User,
  Users,
  Clock,
  Eye,
  Smartphone,
  Hash,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassDetailsPopoverProps } from '@myk9/ringside';
import {
  badgeClass,
  formatRingTime,
  getCheckinLabel,
  getCheckinTier,
  getClassStatusLabel,
  getClassStatusTier,
  getVisibilityLabel,
  getVisibilityTier,
  type BadgeTier,
} from './atShowChrome.helpers';

type PopoverCoords = { top: number; left: number };

function getPopoverCoords(
  anchor: HTMLElement | null,
  position: ClassDetailsPopoverProps['position'],
): PopoverCoords | null {
  if (!anchor || typeof window === 'undefined') return null;

  const rect = anchor.getBoundingClientRect();
  const spacing = 8;
  const width = Math.min(320, window.innerWidth - 32);
  const top = position === 'top' ? rect.top - spacing : rect.bottom + spacing;
  // Clamp the left edge so the 320px card never spills off a narrow viewport
  // (myK9Q renders full-width phones where anchor.left is always safe; the
  // wider myK9Show layout needs the guard).
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

  return { top, left };
}

/** One label/value (or label/badge) row in the class-details popover. */
const DetailRow: React.FC<{
  icon: LucideIcon;
  label: string;
  subtle?: boolean;
  children: React.ReactNode;
}> = ({ icon: Icon, label, subtle, children }) => (
  <div className={cn('flex items-center gap-2', subtle && 'mt-0.5 opacity-70')}>
    <Icon size={14} className="shrink-0 text-muted-foreground" />
    <span className="min-w-[70px] text-[13px] text-muted-foreground">{label}:</span>
    {children}
  </div>
);

/** Plain (non-badge) right-aligned value cell; `mono` for IDs. */
const DetailValue: React.FC<{ mono?: boolean; children: React.ReactNode }> = ({
  mono,
  children,
}) => (
  <span
    className={cn(
      'ml-auto text-[13px] font-medium text-foreground',
      mono && 'font-mono text-[11px] tracking-wider',
    )}
  >
    {children}
  </span>
);

/** Tinted pill value cell, coloured by semantic tier. */
const DetailBadge: React.FC<{ tier: BadgeTier; children: React.ReactNode }> = ({
  tier,
  children,
}) => (
  <span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeClass(tier))}>
    {children}
  </span>
);

/** Read-only class details popover (host slot). See module header. */
export const ClassDetailsPopover: React.FC<ClassDetailsPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
  data,
  position = 'bottom',
  showJudgeB,
}) => {
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      setCoords(getPopoverCoords(anchorRef.current, position));
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen, anchorRef, position]);

  // Coords are frozen at open time and the card is position:fixed, so a scroll
  // or resize would detach it from the anchor — close instead of chasing it
  // (mirrors the click-away backdrop). Escape closes for keyboard users, since
  // the container carries role="dialog". `scroll` is captured so it also fires
  // for the inner scroll container, not just the window.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const statusLabel = getClassStatusLabel(data.status);
  const visibilityLabel = getVisibilityLabel(data.visibilityPreset);
  const maxTime = formatRingTime(data.timeLimitSeconds);
  const area2Time = formatRingTime(data.timeLimitArea2Seconds);
  const area3Time = formatRingTime(data.timeLimitArea3Seconds);

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-[90]" onClick={onClose} aria-hidden="true" />

      <div
        className="at-show-class-details fixed z-[100] w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
        style={coords ? { top: coords.top, left: coords.left } : undefined}
        role="dialog"
        aria-label="Class details"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Class Details</span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2.5 px-4 py-3">
          {statusLabel && (
            <DetailRow icon={Activity} label="Status">
              <DetailBadge tier={getClassStatusTier(data.status)}>{statusLabel}</DetailBadge>
            </DetailRow>
          )}

          {typeof data.totalEntries === 'number' && (
            <DetailRow icon={ListChecks} label="Entries">
              <DetailValue>
                {typeof data.completedEntries === 'number'
                  ? `${data.completedEntries} / ${data.totalEntries} completed`
                  : data.totalEntries}
              </DetailValue>
            </DetailRow>
          )}

          {data.judgeName && (
            <DetailRow icon={User} label="Judge">
              <DetailValue>{data.judgeName}</DetailValue>
            </DetailRow>
          )}

          {showJudgeB && data.judgeNameB && (
            <DetailRow icon={Users} label="Judge B">
              <DetailValue>{data.judgeNameB}</DetailValue>
            </DetailRow>
          )}

          {/* myK9Q always shows Max Time, with a "TBD" fallback when no
              numeric limit is set (the upstream adapter may even pass the
              string "TBD" here — formatRingTime rejects it, so we fall back). */}
          <DetailRow icon={Clock} label="Max Time">
            <DetailValue>
              {maxTime && data.areaCount && data.areaCount > 1 ? (
                <>
                  {maxTime} (1)
                  {area2Time && ` · ${area2Time} (2)`}
                  {area3Time && ` · ${area3Time} (3)`}
                </>
              ) : (
                (maxTime ?? 'TBD')
              )}
            </DetailValue>
          </DetailRow>

          {visibilityLabel && (
            <DetailRow icon={Eye} label="Results">
              <DetailBadge tier={getVisibilityTier(data.visibilityPreset)}>
                {visibilityLabel}
              </DetailBadge>
            </DetailRow>
          )}

          {typeof data.selfCheckinEnabled === 'boolean' && (
            <DetailRow icon={Smartphone} label="Check-in">
              <DetailBadge tier={getCheckinTier(data.selfCheckinEnabled)}>
                {getCheckinLabel(data.selfCheckinEnabled)}
              </DetailBadge>
            </DetailRow>
          )}

          {data.classId != null && (
            <DetailRow icon={Hash} label="Class ID" subtle>
              <DetailValue mono>{data.classId}</DetailValue>
            </DetailRow>
          )}
        </div>
      </div>
    </>
  );
};
