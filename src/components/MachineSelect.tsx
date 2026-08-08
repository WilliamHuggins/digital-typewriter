import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MachineSelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Optional second line, e.g. a machine's era */
  detail?: string;
}

interface MachineSelectProps<T extends string | number> {
  label: string;
  value: T;
  options: MachineSelectOption<T>[];
  onChange: (value: T) => void;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * A dropdown that looks like part of the machine.
 *
 * The toolbar previously used five native `<select>` elements, which render
 * with the operating system's own chrome — the most generic pixels on a screen
 * otherwise full of typewriter. This is a listbox: same keyboard contract
 * (arrows, Home/End, Enter, Escape, type-ahead by first letter), styled to
 * match everything around it.
 */
export function MachineSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  icon,
  className,
}: MachineSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;

    setActiveIndex(selectedIndex);

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // selectedIndex is read once on open; tracking it would fight arrow keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default: {
        if (event.key.length !== 1) break;
        const needle = event.key.toLowerCase();
        const found = options.findIndex((o) => o.label.toLowerCase().startsWith(needle));
        if (found >= 0) setActiveIndex(found);
      }
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        className="machine-control"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
      >
        {icon && <span className="machine-control-icon">{icon}</span>}
        <span className="machine-control-label">{label}</span>
        <span className="machine-control-value">{selected?.label ?? ''}</span>
        <ChevronDown size={13} className={cn('machine-control-chevron', open && 'machine-control-chevron-open')} aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${activeIndex}`}
          tabIndex={-1}
          className="machine-menu"
          onKeyDown={handleKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={String(option.value)}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-active={index === activeIndex}
              className={cn(
                'machine-menu-item',
                index === activeIndex && 'machine-menu-item-active',
                option.value === value && 'machine-menu-item-selected',
              )}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="machine-menu-label">{option.label}</span>
              {option.detail && <span className="machine-menu-detail">{option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
