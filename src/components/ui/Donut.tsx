import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { formatMoney, formatPercent } from '@/engine/format';
import { ACCENT, type Accent } from './accent';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  accent: Accent;
}

/** Gap between slices, in degrees. */
const GAP = 1.5;
/** How far a hovered slice grows, as a scale factor about the centre. */
const POP = 1.04;

function polar(c: number, radius: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [c + radius * Math.sin(rad), c - radius * Math.cos(rad)];
}

/** An annular sector from `start` to `end` degrees, measured clockwise from the top. */
function sectorPath(c: number, outer: number, inner: number, start: number, end: number): string {
  const [ox0, oy0] = polar(c, outer, start);
  const [ox1, oy1] = polar(c, outer, end);
  const [ix0, iy0] = polar(c, inner, start);
  const [ix1, iy1] = polar(c, inner, end);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${ox0} ${oy0}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0}`,
    'Z',
  ].join(' ');
}

export function Donut({
  slices,
  center,
  currency,
  size = 168,
  thickness = 26,
  activeKey,
  onActiveKey,
  className,
}: {
  slices: DonutSlice[];
  center?: ReactNode;
  /** When given, hovering a slice shows a tooltip with its amount and share. */
  currency?: string;
  size?: number;
  thickness?: number;
  activeKey?: string | null;
  onActiveKey?: (key: string | null) => void;
  className?: string;
}) {
  const data = slices.filter((s) => s.value > 0);
  const empty = data.length === 0;
  const sum = data.reduce((a, s) => a + s.value, 0);
  const interactive = !empty && currency !== undefined;

  const c = size / 2;
  // Leave room inside the box for the hovered slice to grow without clipping.
  const outer = c / POP - 1;
  const inner = outer - thickness;

  // Geometry: the top of the ring is 0°, slices run clockwise in the order given.
  const gap = data.length > 1 ? GAP : 0;
  const available = 360 - gap * data.length;
  let cursor = gap / 2;
  const sectors = data.map((s) => {
    const span = (s.value / sum) * available;
    const start = cursor;
    cursor += span + gap;
    return { ...s, start, end: start + span };
  });

  // Hover state is tracked by hand so the tooltip follows the pointer with no position
  // animation, survives the pointer crossing a gap between slices, and always clears.
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const cancelLeave = () => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };
  useEffect(() => cancelLeave, []);

  const enter = (key: string) => {
    cancelLeave();
    setHoverKey(key);
    onActiveKey?.(key);
  };
  const clear = () => {
    cancelLeave();
    setHoverKey(null);
    onActiveKey?.(null);
  };
  const leaveSlice = () => {
    cancelLeave();
    leaveTimer.current = window.setTimeout(clear, 100);
  };
  const track = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const leaveChart = () => {
    setPointer(null);
    clear();
  };

  // Tooltip placement: above the pointer in the top half, below it in the bottom half, and
  // kept inside the chart box horizontally so it never spills out of the card.
  const hovered = hoverKey ? data.find((s) => s.key === hoverKey) : undefined;
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipWidth, setTipWidth] = useState(0);
  useLayoutEffect(() => {
    if (tipRef.current) setTipWidth(tipRef.current.offsetWidth);
  }, [hovered]);
  const showTip = interactive && hovered !== undefined && pointer !== null;
  const tipLeft = pointer ? Math.min(Math.max(pointer.x - tipWidth / 2, 0), Math.max(size - tipWidth, 0)) : 0;
  const tipAbove = pointer ? pointer.y < c : false;

  return (
    <div
      className={clsx('relative shrink-0', className)}
      style={{ width: size, height: size }}
      onMouseMove={interactive ? track : undefined}
      onMouseLeave={interactive ? leaveChart : undefined}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        {empty ? (
          <circle cx={c} cy={c} r={(outer + inner) / 2} fill="none" stroke="#e6eaf0" strokeWidth={thickness} />
        ) : sectors.length === 1 ? (
          <circle
            cx={c}
            cy={c}
            r={(outer + inner) / 2}
            fill="none"
            stroke={ACCENT[sectors[0].accent].hex}
            strokeWidth={thickness}
            onMouseEnter={interactive ? () => enter(sectors[0].key) : undefined}
            onMouseLeave={interactive ? leaveSlice : undefined}
            style={interactive ? { cursor: 'pointer' } : undefined}
          />
        ) : (
          sectors.map((s) => {
            const dimmed = !!activeKey && activeKey !== s.key;
            const popped = hoverKey === s.key;
            return (
              <path
                key={s.key}
                d={sectorPath(c, outer, inner, s.start, s.end)}
                fill={ACCENT[s.accent].hex}
                fillOpacity={dimmed ? 0.3 : 1}
                onMouseEnter={interactive ? () => enter(s.key) : undefined}
                onMouseLeave={interactive ? leaveSlice : undefined}
                style={{
                  cursor: interactive ? 'pointer' : undefined,
                  transform: popped ? `scale(${POP})` : 'scale(1)',
                  transformOrigin: `${c}px ${c}px`,
                  transition: 'transform 150ms ease, fill-opacity 150ms ease',
                }}
              />
            );
          })
        )}
      </svg>
      {showTip && (
        <div
          ref={tipRef}
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow"
          style={{
            left: tipLeft,
            top: pointer.y,
            transform: tipAbove ? 'translateY(calc(-100% - 12px))' : 'translateY(16px)',
            animation: 'donut-tip-in 120ms ease-out',
          }}
        >
          <div className="flex items-center gap-1.5 text-muted">
            <span className={clsx('h-2 w-2 rounded-full', ACCENT[hovered.accent].dot)} />
            {hovered.label}
          </div>
          <div className="tabular font-semibold text-ink">{formatMoney(hovered.value, currency)}</div>
          <div className="tabular text-muted">{formatPercent(hovered.value / sum)} of total</div>
        </div>
      )}
      {center && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {center}
        </div>
      )}
    </div>
  );
}

/**
 * A donut with a compact, name-only legend. Hovering either a slice or a legend entry
 * highlights that slice and swaps the centre to show its amount and share of the total.
 */
export function DonutBreakdown({
  slices,
  currency,
  center,
  size = 200,
  thickness = 30,
  className,
}: {
  slices: DonutSlice[];
  currency: string;
  /** Shown in the centre when nothing is hovered. */
  center?: ReactNode;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sum = slices.reduce((a, s) => a + s.value, 0);
  const active = activeKey ? slices.find((s) => s.key === activeKey) : undefined;
  const legend = slices.filter((s) => s.value > 0);

  return (
    <div className={clsx('flex w-full flex-col items-center gap-4', className)}>
      <Donut
        slices={slices}
        currency={currency}
        size={size}
        thickness={thickness}
        activeKey={activeKey}
        onActiveKey={setActiveKey}
        center={
          active ? (
            <>
              <span className="text-[11px] leading-tight text-muted">{active.label}</span>
              <span className="tabular mt-0.5 text-[16px] font-bold leading-tight text-ink">{formatMoney(active.value, '')}</span>
              <span className="tabular text-[11px] text-muted">
                {currency} · {sum > 0 ? formatPercent(active.value / sum) : '–'}
              </span>
            </>
          ) : (
            center
          )
        }
      />
      {legend.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {legend.map((s) => {
            const dimmed = activeKey !== null && activeKey !== s.key;
            return (
              <li
                key={s.key}
                onMouseEnter={() => setActiveKey(s.key)}
                onMouseLeave={() => setActiveKey(null)}
                className={clsx(
                  'flex cursor-default items-center gap-1.5 text-[13px] leading-tight text-ink-soft transition-opacity',
                  dimmed && 'opacity-40',
                )}
              >
                <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', ACCENT[s.accent].dot)} />
                {s.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
