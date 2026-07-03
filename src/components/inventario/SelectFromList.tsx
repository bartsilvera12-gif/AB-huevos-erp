"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

/**
 * Selector con búsqueda incremental (combobox).
 * - Al hacer click abre un panel con input de búsqueda.
 * - Filtra por label y sublabel (case-insensitive, sin acentos).
 * - Teclado: ↑/↓ para navegar, Enter para seleccionar, Esc para cerrar.
 * - "Sin asignar" siempre disponible al tope del panel.
 */

interface Option { id: string; label: string; sublabel?: string }

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
  /** Texto corto dentro del selector cuando options.length === 0. */
  emptyShort?: string;
  /** Compat: si se pasa, se usa como emptyShort. */
  emptyText?: string;
  className?: string;
}

function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function SelectFromList({
  value,
  onChange,
  options,
  placeholder = "Sin asignar",
  emptyShort,
  emptyText,
  className = "",
}: Props) {
  const isEmpty = options.length === 0;
  const empty = emptyShort ?? emptyText ?? "Sin opciones";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = foldText(query.trim());
    if (!q) return options;
    return options.filter((o) => {
      const t = foldText(o.label) + " " + foldText(o.sublabel ?? "");
      return q.split(/\s+/).every((tok) => t.includes(tok));
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setHover(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHover((h) => Math.min(h + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHover((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hover === 0) commit(null);
      else {
        const o = filtered[hover - 1];
        if (o) commit(o.id);
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => !isEmpty && setOpen((v) => !v)}
        disabled={isEmpty}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {isEmpty
            ? empty
            : selected
              ? selected.label + (selected.sublabel ? ` — ${selected.sublabel}` : "")
              : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && !isEmpty && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto text-sm">
            <button
              type="button"
              onMouseEnter={() => setHover(0)}
              onClick={() => commit(null)}
              className={`flex w-full items-center px-3 py-1.5 text-left text-slate-500 ${hover === 0 ? "bg-slate-50" : "hover:bg-slate-50"}`}
            >
              {placeholder}
            </button>
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-slate-400">
                Sin coincidencias
              </div>
            )}
            {filtered.map((o, i) => {
              const idx = i + 1;
              const isSel = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseEnter={() => setHover(idx)}
                  onClick={() => commit(o.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${hover === idx ? "bg-sky-50" : ""} ${isSel ? "font-medium text-sky-700" : "text-slate-700"}`}
                >
                  <span className="truncate">
                    {o.label}
                    {o.sublabel && <span className="ml-2 text-xs text-slate-400">{o.sublabel}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
