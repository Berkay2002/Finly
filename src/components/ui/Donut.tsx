import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { formatMoney, formatPercent } from '@/engine/format';
import { useT } from '@/i18n';
import { ACCENT, type Accent } from './accent';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  accent: Accent;
  /** Part of `value` that is set aside for a bill due in a later month; drawn striped at the end of the slice. */
  held?: number;
  /** One line per held item, shown in the tooltip. */
  notes?: string[];
}

/** The striped fill for the held part of a slice, one pattern per accent so it keeps the slice's colour. */
function StripePatterns({ id, accents }: { id: string; accents: Accent[] }) {
  if (accents.length === 0) return null;
  return (
    <defs>
      {accents.map((a) => (
        <pattern key={a} id={`${id}-${a}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={ACCENT[a].color} fillOpacity="0.3" />
          <rect width="2.5" height="6" fill={ACCENT[a].color} />
        </pattern>
      ))}
    </defs>
  );
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
  const t = useT();
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
    const held = Math.min(s.held ?? 0, s.value);
    // The held part sits at the end of the slice, so the solid part runs from `start` to `split`.
    const split = start + span * (1 - held / s.value);
    return { ...s, start, end: start + span, split, held };
  });
  const patternId = useId();
  const stripedAccents = [...new Set(sectors.filter((s) => s.held > 0).map((s) => s.accent))];

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
        <StripePatterns id={patternId} accents={stripedAccents} />
        {empty ? (
          <circle cx={c} cy={c} r={(outer + inner) / 2} fill="none" stroke="var(--color-line)" strokeWidth={thickness} />
        ) : sectors.length === 1 && sectors[0].held === 0 ? (
          <circle
            cx={c}
            cy={c}
            r={(outer + inner) / 2}
            fill="none"
            stroke={ACCENT[sectors[0].accent].color}
            strokeWidth={thickness}
            onMouseEnter={interactive ? () => enter(sectors[0].key) : undefined}
            onMouseLeave={interactive ? leaveSlice : undefined}
            style={interactive ? { cursor: 'pointer' } : undefined}
          />
        ) : (
          sectors.map((s) => {
            const dimmed = !!activeKey && activeKey !== s.key;
            const popped = hoverKey === s.key;
            const color = ACCENT[s.accent].color;
            const parts =
              s.held > 0
                ? [
                    { d: sectorPath(c, outer, inner, s.start, s.split), fill: color },
                    { d: sectorPath(c, outer, inner, s.split, s.end), fill: `url(#${patternId}-${s.accent})` },
                  ]
                : [{ d: sectorPath(c, outer, inner, s.start, s.end), fill: color }];
            return (
              <g
                key={s.key}
                fillOpacity={dimmed ? 0.3 : 1}
                onMouseEnter={interactive ? () => enter(s.key) : undefined}
                onMouseLeave={interactive ? leaveSlice : undefined}
                style={{
                  cursor: interactive ? 'pointer' : undefined,
                  transform: popped ? `scale(${POP})` : 'scale(1)',
                  transformOrigin: `${c}px ${c}px`,
                  transition: 'transform 150ms ease, fill-opacity 150ms ease',
                }}
              >
                {parts.map((p, i) => (
                  <path key={i} d={p.d} fill={p.fill} />
                ))}
              </g>
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
          <div className="tabular text-muted">{t.ui.donut.ofTotal(formatPercent(hovered.value / sum))}</div>
          {hovered.notes && hovered.notes.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-[11px] text-muted">
              {hovered.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
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
  grow = false,
  maxSize = 300,
  className,
}: {
  slices: DonutSlice[];
  currency: string;
  /** Shown in the centre when nothing is hovered. */
  center?: ReactNode;
  size?: number;
  thickness?: number;
  /**
   * Fill the height a flex-column parent has left after the legend, from `size` up to `maxSize`.
   * The ring never adds to the parent's height, so a legend that wraps to more rows shrinks it instead.
   */
  grow?: boolean;
  maxSize?: number;
  className?: string;
}) {
  const t = useT();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sum = slices.reduce((a, s) => a + s.value, 0);
  const active = activeKey ? slices.find((s) => s.key === activeKey) : undefined;
  const legend = slices.filter((s) => s.value > 0);

  const areaRef = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState(size);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!grow || !el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setFitted(Math.floor(Math.min(maxSize, width, Math.max(size, height))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [grow, size, maxSize]);
  const shown = grow ? fitted : size;

  const donut = (
    <Donut
      slices={slices}
      currency={currency}
      size={shown}
      thickness={Math.round((thickness * shown) / size)}
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
            {(active.held ?? 0) > 0 && (
              <span className="tabular mt-0.5 text-[10.5px] leading-tight text-muted">
                {t.ui.donut.ofWhichHeld(formatMoney(active.held!, currency))}
              </span>
            )}
          </>
        ) : (
          center
        )
      }
    />
  );

  return (
    <div className={clsx('flex w-full flex-col items-center gap-4', grow && 'flex-1', className)}>
      {grow ? (
        <div ref={areaRef} className="relative w-full flex-1" style={{ minHeight: size }}>
          <div className="absolute inset-0 flex items-center justify-center">{donut}</div>
        </div>
      ) : (
        donut
      )}
      {legend.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {legend.map((s) => {
            const dimmed = activeKey !== null && activeKey !== s.key;
            return (
              <li
                key={s.key}
                title={(s.held ?? 0) > 0 ? t.ui.donut.heldHint : undefined}
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
