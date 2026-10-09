import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Icon } from './icons';
import { log } from '../debug';

// ---------- Segmented control ----------

type SegProps<T extends string | number> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  compact?: boolean;
  label: string;
};

export function Segmented<T extends string | number>({ value, options, onChange, compact, label }: SegProps<T>) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div class={'seg' + (compact ? ' compact' : '')} role="radiogroup" aria-label={label}>
      <div
        class="seg-thumb"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Switch ----------

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      class="switch"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
    />
  );
}

// ---------- Grouped list ----------

export function Group({ label, foot, children }: { label?: string; foot?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section>
      {label && <h3 class="group-label">{label}</h3>}
      <div class="group">{children}</div>
      {foot && <p class="group-foot">{foot}</p>}
    </section>
  );
}

type RowProps = {
  title: ComponentChildren;
  sub?: ComponentChildren;
  lead?: ComponentChildren;
  value?: ComponentChildren;
  trail?: ComponentChildren;
  chevron?: boolean;
  onClick?: () => void;
  variant?: 'accent' | 'destructive';
  stack?: boolean;
};

export function Row({ title, sub, lead, value, trail, chevron, onClick, variant, stack }: RowProps) {
  const cls = ['row', lead ? 'has-lead' : '', variant ?? '', stack ? 'stack' : ''].filter(Boolean).join(' ');
  const inner = (
    <>
      {lead}
      <div class="row-main">
        <div class="row-title">{title}</div>
        {sub && <div class="row-sub">{sub}</div>}
      </div>
      {value != null && <div class="row-value">{value}</div>}
      {trail}
      {chevron && <Icon name="caret-right" size={16} class="row-chev" />}
    </>
  );
  return onClick ? (
    <button class={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div class={cls}>{inner}</div>
  );
}

// ---------- Page with collapsing large title ----------

export function Page({
  title,
  brand,
  navRight,
  children,
  active,
}: {
  title: string;
  brand?: boolean;
  navRight?: ComponentChildren;
  children: ComponentChildren;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setScrolled(el.scrollTop > 36);
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  return (
    <div class="tab-view" ref={ref} hidden={!active}>
      <header class={'navbar' + (scrolled ? ' scrolled' : '')}>
        <span class={'navbar-title' + (brand ? ' display' : '')}>{title}</span>
        {navRight && <div class="navbar-side">{navRight}</div>}
      </header>
      <div class="page">
        <h1 class={'large-title' + (brand ? ' brand' : '')}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

// ---------- Bottom sheet with drag-to-dismiss ----------

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  left?: ComponentChildren;
  right?: ComponentChildren;
  tall?: boolean;
  children: ComponentChildren;
  /** Disable swipe/scrim dismiss (e.g. unsaved edits handled elsewhere). */
  modal?: boolean;
};

export function Sheet({ open, onClose, title, left, right, tall, children, modal }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number; id: number } | null>(null);

  useLayoutEffect(() => {
    if (open || mounted) log(`sheet ${title ?? 'untitled'} ${open ? 'open' : 'close'}`);
    if (open) {
      setMounted(true);
      // Two frames later so the transition runs from off-screen. Both frames
      // are cancellable: a sheet closed straight away must not pop back open.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 420);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  const setY = (y: number | null) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = y == null ? '' : `translate(-50%, ${y}px)`;
  };

  const onDown = (e: PointerEvent) => {
    if (modal) return;
    if ((e.target as HTMLElement).closest('button')) return;
    try {
      // Throws if iOS has already cancelled this pointer; then just don't drag.
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
    sheetRef.current?.classList.add('dragging');
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = e.clientY - d.y0;
    // Rubber-band when dragging up past the top.
    d.dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
    setY(d.dy);
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    sheetRef.current?.classList.remove('dragging');
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    const h = sheetRef.current?.offsetHeight ?? 400;
    setY(null);
    if (d.dy > h * 0.3 || (d.dy > 40 && v > 0.6)) onClose();
  };

  const dragProps = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  return createPortal(
    <div class={'sheet-root' + (shown ? ' open' : '')}>
      <div class="sheet-scrim" onClick={modal ? undefined : onClose} />
      <div
        class={'sheet' + (tall ? ' tall' : '')}
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div class="sheet-grab" {...dragProps} />
        {(title || left || right) && (
          <div class="sheet-head" {...dragProps}>
            <div class="side">{left}</div>
            <h2>{title}</h2>
            <div class="side right">{right}</div>
          </div>
        )}
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function CloseButton({ onClick, label = 'Close', style }: { onClick: () => void; label?: string; style?: JSX.CSSProperties }) {
  return (
    <button class="icon-btn close-btn press" onClick={onClick} aria-label={label} style={style}>
      <Icon name="x" size={22} />
    </button>
  );
}
