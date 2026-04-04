"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

// ── Country codes ─────────────────────────────────────────────
export const COUNTRY_CODES = [
  { code: "+91",  country: "India",                flag: "🇮🇳" },
  { code: "+1",   country: "United States",         flag: "🇺🇸" },
  { code: "+1",   country: "Canada",                flag: "🇨🇦" },
  { code: "+44",  country: "United Kingdom",        flag: "🇬🇧" },
  { code: "+61",  country: "Australia",             flag: "🇦🇺" },
  { code: "+64",  country: "New Zealand",           flag: "🇳🇿" },
  { code: "+65",  country: "Singapore",             flag: "🇸🇬" },
  { code: "+971", country: "UAE",                   flag: "🇦🇪" },
  { code: "+966", country: "Saudi Arabia",          flag: "🇸🇦" },
  { code: "+974", country: "Qatar",                 flag: "🇶🇦" },
  { code: "+973", country: "Bahrain",               flag: "🇧🇭" },
  { code: "+968", country: "Oman",                  flag: "🇴🇲" },
  { code: "+965", country: "Kuwait",                flag: "🇰🇼" },
  { code: "+49",  country: "Germany",               flag: "🇩🇪" },
  { code: "+33",  country: "France",                flag: "🇫🇷" },
  { code: "+39",  country: "Italy",                 flag: "🇮🇹" },
  { code: "+34",  country: "Spain",                 flag: "🇪🇸" },
  { code: "+31",  country: "Netherlands",           flag: "🇳🇱" },
  { code: "+46",  country: "Sweden",                flag: "🇸🇪" },
  { code: "+47",  country: "Norway",                flag: "🇳🇴" },
  { code: "+45",  country: "Denmark",               flag: "🇩🇰" },
  { code: "+41",  country: "Switzerland",           flag: "🇨🇭" },
  { code: "+32",  country: "Belgium",               flag: "🇧🇪" },
  { code: "+48",  country: "Poland",                flag: "🇵🇱" },
  { code: "+7",   country: "Russia",                flag: "🇷🇺" },
  { code: "+86",  country: "China",                 flag: "🇨🇳" },
  { code: "+81",  country: "Japan",                 flag: "🇯🇵" },
  { code: "+82",  country: "South Korea",           flag: "🇰🇷" },
  { code: "+60",  country: "Malaysia",              flag: "🇲🇾" },
  { code: "+66",  country: "Thailand",              flag: "🇹🇭" },
  { code: "+63",  country: "Philippines",           flag: "🇵🇭" },
  { code: "+62",  country: "Indonesia",             flag: "🇮🇩" },
  { code: "+84",  country: "Vietnam",               flag: "🇻🇳" },
  { code: "+880", country: "Bangladesh",            flag: "🇧🇩" },
  { code: "+92",  country: "Pakistan",              flag: "🇵🇰" },
  { code: "+94",  country: "Sri Lanka",             flag: "🇱🇰" },
  { code: "+977", country: "Nepal",                 flag: "🇳🇵" },
  { code: "+27",  country: "South Africa",          flag: "🇿🇦" },
  { code: "+234", country: "Nigeria",               flag: "🇳🇬" },
  { code: "+254", country: "Kenya",                 flag: "🇰🇪" },
  { code: "+20",  country: "Egypt",                 flag: "🇪🇬" },
  { code: "+55",  country: "Brazil",                flag: "🇧🇷" },
  { code: "+52",  country: "Mexico",                flag: "🇲🇽" },
  { code: "+54",  country: "Argentina",             flag: "🇦🇷" },
  { code: "+57",  country: "Colombia",              flag: "🇨🇴" },
];

// ── Helpers ───────────────────────────────────────────────────

/** Parse a stored phone string like "+91 98765 43210" → { dialCode: "+91", number: "98765 43210" } */
export function parsePhone(stored: string): { dialCode: string; number: string } {
  if (!stored) return { dialCode: "+91", number: "" };
  const match = stored.match(/^(\+\d{1,4})\s*(.*)$/);
  if (match) return { dialCode: match[1], number: match[2].trim() };
  return { dialCode: "+91", number: stored };
}

/** Combine dial code + number into a single stored string */
export function combinePhone(dialCode: string, number: string): string {
  const n = number.trim();
  if (!n) return "";
  return `${dialCode} ${n}`;
}

// ── Component ─────────────────────────────────────────────────

interface PhoneInputProps {
  value: string;           // full stored value e.g. "+91 98765 43210"
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({ value, onChange, placeholder = "Phone number", className = "", disabled }: PhoneInputProps) {
  const parsed    = parsePhone(value);
  const [dialCode, setDialCode] = useState(parsed.dialCode);
  const [number,   setNumber]   = useState(parsed.number);
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState("");
  const dropRef                 = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    const p = parsePhone(value);
    setDialCode(p.dialCode);
    setNumber(p.number);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDialCode = (code: string) => {
    setDialCode(code);
    setOpen(false);
    setSearch("");
    onChange(combinePhone(code, number));
  };

  const handleNumber = (n: string) => {
    // Strip anything that's not a digit, space, dash, dot, or parenthesis
    const cleaned = n.replace(/[^\d\s\-().]/g, "");
    setNumber(cleaned);
    onChange(combinePhone(dialCode, cleaned));
  };

  const selected = COUNTRY_CODES.find((c) => c.code === dialCode) ?? COUNTRY_CODES[0];
  const filtered = search
    ? COUNTRY_CODES.filter((c) =>
        c.country.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search)
      )
    : COUNTRY_CODES;

  return (
    <div ref={dropRef} className={`relative flex ${className}`}>
      {/* Dial code button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-r-0 border-gray-200 dark:border-slate-700 rounded-l-lg bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 whitespace-nowrap flex-shrink-0"
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="text-gray-700 dark:text-slate-300 font-medium text-xs">{dialCode}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 dark:text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Number input */}
      <input
        type="tel"
        value={number}
        onChange={(e) => handleNumber(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
      />

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg dark:shadow-black/50 overflow-hidden dark:ring-1 dark:ring-white/[0.06]">
          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">No results</p>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={`${c.code}-${c.country}-${i}`}
                  type="button"
                  onClick={() => handleDialCode(c.code)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                    c.code === dialCode
                      ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="text-base leading-none w-5 text-center flex-shrink-0">{c.flag}</span>
                  <span className="flex-1 truncate text-xs">{c.country}</span>
                  <span className="text-xs text-gray-400 dark:text-slate-500 font-mono flex-shrink-0">{c.code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
