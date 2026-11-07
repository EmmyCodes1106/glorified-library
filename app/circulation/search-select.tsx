"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchOption = {
  id: number;
  label: string;
  hint?: string;
};

type Props = {
  name: string;
  label: string;
  placeholder: string;
  options: SearchOption[];
  disabled?: boolean;
  emptyMessage?: string;
  onSelect?: (option: SearchOption | null) => void;
};

export default function SearchSelect({
  name,
  label,
  placeholder,
  options,
  disabled = false,
  emptyMessage = "No matches.",
  onSelect,
}: Props) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchOption | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle)
    );
  }, [options, query]);

  const activeIndex = Math.min(highlight, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function choose(option: SearchOption) {
    setSelected(option);
    setQuery(option.label);
    setOpen(false);
    onSelect?.(option);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setOpen(true);
    onSelect?.(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) =>
        Math.min(current + 1, Math.max(filtered.length - 1, 0))
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        choose(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className="grid gap-1 text-sm">
        <span className="text-gray-500">{label}</span>
        <div className="relative">
          <input
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setHighlight(0);
              onSelect?.(null);
              setOpen(true);
            }}
            onFocus={() => {
              setHighlight(0);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            className="w-full min-w-0 rounded border bg-transparent p-2 pr-8 text-sm disabled:opacity-50"
          />
          {selected && (
            <button
              type="button"
              onClick={clear}
              aria-label={`Clear ${label}`}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 text-gray-500 hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border bg-[var(--background)] p-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="p-2 text-sm text-gray-500">{emptyMessage}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={selected?.id === option.id}
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setHighlight(index)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    index === activeIndex ? "bg-gray-100 dark:bg-gray-800" : ""
                  }`}
                >
                  <span className="block truncate font-medium">
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="block truncate text-xs text-gray-500">
                      {option.hint}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
