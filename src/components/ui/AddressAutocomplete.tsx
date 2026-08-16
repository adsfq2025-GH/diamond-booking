"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GeoSuggestion } from "@/app/api/geocode/route";

/**
 * Address field with a type-ahead dropdown of real addresses (via /api/geocode).
 * `onChange` fires on every keystroke; `onSelect` fires with the structured
 * parts when a suggestion is picked, so multi-field forms can auto-fill.
 * Styling is passed in so it works in both the widget and the dashboard.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  inputClassName,
  inputStyle,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (parts: GeoSuggestion) => void;
  placeholder?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  id?: string;
  ariaLabel?: string;
}) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const skipNext = useRef(false); // don't re-search right after a pick
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    const t = setTimeout(async () => {
      if (q.length < 4) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { suggestions: GeoSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(s: GeoSuggestion) {
    skipNext.current = true;
    onChange(s.formatted);
    onSelect?.(s);
    setOpen(false);
    setSuggestions([]);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        aria-label={ariaLabel}
        className={inputClassName}
        style={inputStyle}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKey}
      />
      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-30 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-line bg-card py-1 shadow-float"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li key={s.formatted + i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-[0.84rem]",
                  active === i ? "bg-surface-alt text-ink" : "text-ink-muted hover:bg-surface-alt/60",
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 h-4 w-4 flex-none text-ink-faint" aria-hidden>
                  <path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 1 0-14 0c0 3.4 2.5 6.8 7 11z" />
                  <circle cx="12" cy="10" r="2.4" />
                </svg>
                <span>{s.formatted}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
