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

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ListChecks,
  User,
  Users,
  Clock,
  Eye,
  Smartphone,
  Search,
  Zap,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/status';
import type { ClassDetailsPopoverProps } from '@myk9/ringside';
import {
  badgeClass,
  formatRingTime,
  getCheckinLabel,
  getCheckinTier,
  getVisibilityLabel,
  getVisibilityTier,
  type BadgeTier,
} from './atShowChrome.helpers';

type PopoverCoords = { top?: number; bottom?: number; left: number; maxHeight: number };

/** About what the full card needs; below this the card flips above the anchor or scrolls. */
const COMFORTABLE_HEIGHT = 340;

function getPopoverCoords(
  anchor: HTMLElement | null,
  position: ClassDetailsPopoverProps['position']
): PopoverCoords | null {
  if (!anchor || typeof window === 'undefined') return null;

  const rect = anchor.getBoundingClientRect();
  const spacing = 8;
  const width = Math.min(320, window.innerWidth - 32);
  // Clamp the left edge so the 320px card never spills off a narrow viewport
  // (myK9Q renders full-width phones where anchor.left is always safe; the
  // wider myK9Show layout needs the guard).
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - rect.bottom - spacing * 2;
  const spaceAbove = rect.top - spacing * 2;
  // A card near the bottom of the screen opens upward instead of running off it; either
  // way it is capped to the room it has and scrolls inside.
  const opensUp =
    position === 'top' || (spaceBelow < COMFORTABLE_HEIGHT && spaceAbove > spaceBelow);

  return opensUp
    ? {
        bottom: window.innerHeight - rect.top + spacing,
        left,
        maxHeight: Math.max(160, spaceAbove),
      }
    : { top: rect.bottom + spacing, left, maxHeight: Math.max(160, spaceBelow) };
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
      mono && 'font-mono text-[11px] tracking-wider'
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
  <span
    className={cn('ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeClass(tier))}
  >
    {children}
  </span>
);

/**
 * Read-only class details popover (host slot). See module header. `sheet` (the
 * class picker on a touch device) docks it to the bottom of the screen instead of
 * anchoring it; the facts and rows are the same component either way.
 */
export const ClassDetailsPopover: React.FC<ClassDetailsPopoverProps & { sheet?: boolean }> = ({
  isOpen,
  onClose,
  anchorRef,
  data,
  position = 'bottom',
  showJudgeB,
  sheet = false,
}) => {
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || sheet) return;

    const frame = window.requestAnimationFrame(() => {
      setCoords(getPopoverCoords(anchorRef.current, position));
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen, anchorRef, position, sheet]);

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
    // A docked sheet is not detached by scrolling the page behind it.
    // Scrolling inside the card (it caps its height and scrolls) must not close it.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      onClose();
    };
    if (!sheet) window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, sheet]);

  if (!isOpen) return null;

  const visibilityLabel = getVisibilityLabel(data.visibilityPreset);
  const maxTime = formatRingTime(data.timeLimitSeconds);
  const area2Time = formatRingTime(data.timeLimitArea2Seconds);
  const area3Time = formatRingTime(data.timeLimitArea3Seconds);

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-[90]" onClick={onClose} aria-hidden="true" />

      <div
        ref={popoverRef}
        id="class-details-popover"
        className={cn(
          'at-show-class-details fixed z-[100] overflow-x-hidden border border-border bg-card shadow-xl animate-in duration-150',
          sheet
            ? 'inset-x-0 bottom-0 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] slide-in-from-bottom'
            : 'w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-xl fade-in-0 zoom-in-95'
        )}
        style={!sheet && coords ? coords : undefined}
        role="dialog"
        aria-label="Class details"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Class Details</span>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2.5 px-4 py-3">
          {data.status && (
            <DetailRow icon={Activity} label="Status">
              {data.statusLabel ? (
                <DetailBadge tier="neutral">{data.statusLabel}</DetailBadge>
              ) : (
                <StatusBadge family="class" status={data.status} className="ml-auto" />
              )}
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

          {/* Class-aggregate scoring rules (one value per class, not per
              search area) — see design.md R4. */}
          {typeof data.hidesKnown === 'boolean' && (
            <DetailRow icon={Search} label="Hides">
              <DetailValue>{data.hidesKnown ? 'Known' : 'Unknown'}</DetailValue>
            </DetailRow>
          )}

          {typeof data.distractionCount === 'number' && (
            <DetailRow icon={Zap} label="Distractions">
              <DetailValue>{data.distractionCount}</DetailValue>
            </DetailRow>
          )}

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
        </div>
      </div>
    </>
  );
};
