"use client";

import Link from "next/link";
import { ITEM_IMAGES } from "./item-images";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ListedCompany, MarketHistoryPoint, MarketSnapshot } from "../lib/market";
import { priceAxis, timeAxis } from "../lib/chart-scale";
import { MINECRAFT_ITEM_COUNT, MINECRAFT_ITEMS, MINECRAFT_VERSION } from "./minecraft-items";
import { charterRecord, PRICE_BOOK_SUGGESTIONS, standingFor } from "./market-records";

const LEDGER_KEY = "royal-exchange-merchant-ledger-v1";
const THEME_KEY = "royal-exchange-theme-v1";
const EASTERN_TIME_ZONE = "America/New_York";
const FEATURED_ITEM_IDS = ["diamond", "redstone", "white_wool", "music_disc_13", "filled_map", "potion", "iron_ingot", "oak_log"];
export type ExchangeView = "overview" | "markets" | "price-book" | "ledger" | "data" | "issuer";
type ThemeMode = "light" | "dark";
type HistoryRange = "24h" | "7d" | "30d" | "all";
type ListingSort = "name" | "last" | "change" | "volume";
type MoversMode = "gainers" | "decliners" | "active";

const HISTORY_RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "24h", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "ALL" },
];

function number(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${number(value)}${suffix}`;
}

function secondsUntil(value: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1_000));
}

function snapshotIntervalSeconds(snapshot: MarketSnapshot) {
  return secondsUntil(snapshot.nextUpdateAt, Date.parse(snapshot.session?.serverTime ?? snapshot.asOf));
}

function normalizedSearch(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function searchVariants(value: string) {
  const normalized = normalizedSearch(value);
  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  return [...new Set([normalized, singular].filter(Boolean))];
}

function easternDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: EASTERN_TIME_ZONE }).format(new Date(value));
}

function easternTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: EASTERN_TIME_ZONE }).format(new Date(value));
}

function easternZone(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, timeZoneName: "short" })
    .formatToParts(new Date(value))
    .find((part) => part.type === "timeZoneName")?.value ?? "ET";
}

function Chart({ points, positive, theme, unit = "Crowns", reference }: { points: MarketHistoryPoint[]; positive: boolean; theme: ThemeMode; unit?: string; reference?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);

      const values = points.map((point) => point.value);
      const { minimum: low, maximum: high, ticks } = priceAxis(values, reference);
      const range = high - low;
      const left = 2;
      const right = bounds.width - 72;
      const top = 14;
      const bottom = bounds.height - 32;
      const priceY = (value: number) => bottom - ((value - low) / range) * (bottom - top);

      const styles = window.getComputedStyle(canvas);
      context.strokeStyle = styles.getPropertyValue("--chart-grid").trim() || "rgba(92, 62, 31, .18)";
      context.lineWidth = 1;
      context.font = "12px " + styles.fontFamily;
      context.fillStyle = styles.getPropertyValue("--chart-label").trim();
      for (const value of ticks) {
        const y = priceY(value);
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(right, y);
        context.stroke();
        context.fillText(number(value), right + 9, y + 4);
      }

      const startTime = Date.parse(points[0].time);
      const timeSpan = Math.max(1, Date.parse(points.at(-1)!.time) - startTime);
      context.save();
      context.globalAlpha = 0.65;
      for (const tick of timeAxis(points, right - left)) {
        const x = left + (right - left) * (tick.time - startTime) / timeSpan;
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, bottom);
        context.stroke();
      }
      context.restore();
      for (const tick of timeAxis(points, right - left)) {
        const x = left + (right - left) * (tick.time - startTime) / timeSpan;
        const labelWidth = context.measureText(tick.label).width;
        context.fillText(tick.label, Math.max(left, Math.min(right - labelWidth, x - labelWidth / 2)), bottom + 22);
      }
      const coordinates = points.map((point, index) => ({
        x: left + (right - left) * (timeSpan === 1 ? index / (points.length - 1) : (Date.parse(point.time) - startTime) / timeSpan),
        y: bottom - ((point.value - low) / range) * (bottom - top),
      }));
      const color = styles.getPropertyValue(positive ? "--chart-up" : "--chart-down").trim() || (positive ? "#3c7755" : "#9e493d");
      const gradientTop = styles.getPropertyValue(positive ? "--chart-up-fill" : "--chart-down-fill").trim() || (positive ? "rgba(60, 119, 85, .28)" : "rgba(158, 73, 61, .26)");
      const fade = styles.getPropertyValue(positive ? "--chart-up-fade" : "--chart-down-fade").trim() || (positive ? "rgba(60, 119, 85, .03)" : "rgba(158, 73, 61, .03)");
      const gradient = context.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, gradientTop);
      gradient.addColorStop(1, fade);
      context.beginPath();
      coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
      context.lineTo(right, bottom);
      context.lineTo(left, bottom);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      if (reference !== undefined && Number.isFinite(reference)) {
        const y = priceY(reference);
        context.save();
        context.strokeStyle = styles.getPropertyValue("--chart-label").trim();
        context.globalAlpha = 0.65;
        context.setLineDash([3, 4]);
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(right, y);
        context.stroke();
        context.restore();
        context.fillStyle = styles.getPropertyValue("--chart-label").trim();
        const label = "Prev. close " + number(reference);
        context.fillText(label, Math.max(left, right - context.measureText(label).width - 4), y < top + 16 ? y + 14 : y - 6);
      }
      context.beginPath();
      coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
      context.strokeStyle = color;
      context.lineWidth = 1.25;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
      const latest = coordinates.at(-1)!;
      context.beginPath();
      context.arc(latest.x, latest.y, 2.5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points, positive, theme, reference]);

  if (points.length < 2) {
    return <div className="market-chart chart-recording" role="status">
      <strong>{points.length ? "First observation recorded" : "History not available"}</strong>
      <span>{points.length ? "More history will appear after the next clearing." : "No recorded prices are available for this range."}</span>
    </div>;
  }
  const selectNearestPoint = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - bounds.left - 2) / Math.max(1, bounds.width - 74)));
    const targetTime = Date.parse(points[0].time) + progress * (Date.parse(points.at(-1)!.time) - Date.parse(points[0].time));
    const nearest = points.reduce((best, point, index) => Math.abs(Date.parse(point.time) - targetTime) < Math.abs(Date.parse(points[best].time) - targetTime) ? index : best, 0);
    setHoverIndex(nearest);
  };
  const moveSelection = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setHoverIndex(0);
    else if (event.key === "End") setHoverIndex(points.length - 1);
    else setHoverIndex((current) => Math.max(0, Math.min(points.length - 1,
      (current ?? points.length - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  const hovered = hoverIndex === null ? null : points[Math.min(hoverIndex, points.length - 1)];
  const pointPosition = !hovered ? 0 : ((Date.parse(hovered.time) - Date.parse(points[0].time)) / Math.max(1, Date.parse(points.at(-1)!.time) - Date.parse(points[0].time))) * 100;

  return (
    <div className="market-chart-wrap" onPointerLeave={() => setHoverIndex(null)}>
      <canvas
        ref={canvasRef}
        className="market-chart"
        aria-label={hovered ? `Recorded value ${number(hovered.value)} ${unit} at ${easternDate(hovered.time)} ${easternTime(hovered.time)} ${easternZone(hovered.time)}` : "Recorded history chart in " + unit + ". " + (reference === undefined ? "" : "Previous close " + number(reference) + ". ") + "Use the pointer or arrow keys to inspect observations."}
        tabIndex={0}
        onPointerMove={(event) => selectNearestPoint(event.clientX)}
        onPointerDown={(event) => selectNearestPoint(event.clientX)}
        onKeyDown={moveSelection}
        onBlur={() => setHoverIndex(null)}
      />
      {hovered && <>
        <span className="chart-crosshair" style={{ left: `calc(2px + (100% - 74px) * ${pointPosition / 100})` }} aria-hidden="true" />
        <output className="chart-tooltip" style={{ left: `clamp(120px, calc(2px + (100% - 74px) * ${pointPosition / 100}), calc(100% - 120px))` }}>
          <span>{easternDate(hovered.time)} · {easternTime(hovered.time)} {easternZone(hovered.time)}</span>
          <strong>{number(hovered.value)} {unit}</strong>
        </output>
      </>}
    </div>
  );
}

function Move({ value }: { value: number }) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return <span className={`move ${direction}`}>{signed(value, "%")}</span>;
}

export function MarketDashboard({ initialSnapshot, view = "overview", initialTicker = "STPL" }: { initialSnapshot: MarketSnapshot; view?: ExchangeView; initialTicker?: string }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedTicker, setSelectedTicker] = useState(initialTicker);
  const [seconds, setSeconds] = useState(() => snapshotIntervalSeconds(initialSnapshot));
  const [clockMillis, setClockMillis] = useState(() => Date.parse(initialSnapshot.session?.serverTime ?? initialSnapshot.asOf));
  const [bellNotice, setBellNotice] = useState("");
  const previousBell = useRef(initialSnapshot.session?.ready ? initialSnapshot.status : null);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [listingSort, setListingSort] = useState<ListingSort>("name");
  const [sortDescending, setSortDescending] = useState(false);
  const [moversMode, setMoversMode] = useState<MoversMode>("gainers");
  const [wareQuery, setWareQuery] = useState("");
  const [wareSector, setWareSector] = useState("all");
  const [warePage, setWarePage] = useState(0);
  const [compositeRange, setCompositeRange] = useState<HistoryRange>("24h");
  const [compositeHistory, setCompositeHistory] = useState<{ range: HistoryRange; points: MarketHistoryPoint[] } | null>(null);
  const [compositeLoading, setCompositeLoading] = useState(false);
  const [dataDelayed, setDataDelayed] = useState(false);
  const [ledgerTickers, setLedgerTickers] = useState<string[]>([]);
  const [ledgerReady, setLedgerReady] = useState(false);
  const [charterTicker, setCharterTicker] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("24h");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyView, setHistoryView] = useState<{
    ticker: string;
    range: HistoryRange;
    points: MarketHistoryPoint[];
    changeCrowns: number | null;
    changePercent: number | null;
  } | null>(null);
  const charterSheetRef = useRef<HTMLElement>(null);
  const charterCloseRef = useRef<HTMLButtonElement>(null);
  const charterTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(THEME_KEY); } catch { /* Private browsing can disable preferences. */ }
      const initialTheme: ThemeMode = saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      setTheme(initialTheme);
      document.documentElement.dataset.theme = initialTheme;
      setThemeReady(true);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* The theme still works for this visit. */ }
  }, [theme, themeReady]);

  useEffect(() => {
    let nextUpdateAt = initialSnapshot.nextUpdateAt;
    let clockOffset = Date.parse(initialSnapshot.session?.serverTime ?? initialSnapshot.asOf) - Date.now();
    let refreshTimer: number | undefined;
    let pending = false;
    let stopped = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (stopped || pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch("/api/market", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const latest = await response.json() as MarketSnapshot;
          nextUpdateAt = latest.nextUpdateAt;
          clockOffset = Date.parse(latest.session?.serverTime ?? latest.asOf) - Date.now();
          if (!stopped) setSnapshot(latest);
        }
      } catch {
        // The last valid snapshot remains visible through transient network loss.
      } finally {
        pending = false;
        if (!stopped) {
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(refresh, Math.max(1_000, Math.min(300_000, Date.parse(nextUpdateAt) - Date.now() - clockOffset + 1_000)));
        }
      }
    };
    void refresh();
    const countdownTimer = window.setInterval(() => {
      const now = Date.now() + clockOffset;
      setClockMillis(now);
      setSeconds(secondsUntil(nextUpdateAt, now));
      setDataDelayed(now > Date.parse(nextUpdateAt) + 60_000);
    }, 1_000);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(refreshTimer);
      window.clearInterval(countdownTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initialSnapshot.nextUpdateAt, initialSnapshot.asOf, initialSnapshot.session?.serverTime]);

  const bellReady = snapshot.session?.ready;
  const bellEra = snapshot.session?.era;
  const bellDay = snapshot.session?.session.day;
  useEffect(() => {
    const previous = previousBell.current;
    previousBell.current = bellReady ? snapshot.status : null;
    if (!previous || !bellReady || previous === snapshot.status) return;
    const event = `${bellEra}-${bellDay}-${snapshot.status}`;
    try {
      if (localStorage.getItem("royal-exchange-last-bell-v1") === event) return;
      localStorage.setItem("royal-exchange-last-bell-v1", event);
    } catch { /* Session notifications still work with unavailable storage. */ }
    const timer = window.setTimeout(() => setBellNotice(snapshot.status === "OPEN" ? "Opening bell · Trading has resumed" : "Closing bell · Prices are fixed until the next session"),0);
    const clear = window.setTimeout(() => setBellNotice(""),5000);
    if (navigator.userActivation?.hasBeenActive && window.AudioContext) {
      const context = new AudioContext();
      if (context.state === "running") {
        const tone = context.createOscillator(), gain = context.createGain();
        tone.frequency.value = snapshot.status === "OPEN" ? 880 : 660;
        gain.gain.setValueAtTime(0.025,context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime + 0.35);
        tone.connect(gain).connect(context.destination); tone.start(); tone.stop(context.currentTime + 0.35);
        tone.onended = () => { void context.close(); };
      } else { void context.close(); }
    }
    return () => { window.clearTimeout(timer); window.clearTimeout(clear); };
  }, [snapshot.status, bellReady, bellEra, bellDay]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(LEDGER_KEY) ?? "[]");
        if (Array.isArray(saved)) setLedgerTickers(saved.filter((value): value is string => typeof value === "string"));
      } catch {
        // A damaged local preference should never prevent the public market loading.
      }
      setLedgerReady(true);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!ledgerReady) return;
    try { window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledgerTickers)); } catch { /* Keep the watchlist usable for this visit. */ }
  }, [ledgerReady, ledgerTickers]);

  useEffect(() => {
    if (!charterTicker) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => charterCloseRef.current?.focus(), 0);
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCharterTicker(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(charterSheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleDialogKey);
      document.body.style.overflow = previousOverflow;
      const trigger = charterTriggerRef.current;
      window.setTimeout(() => trigger?.focus(), 0);
    };
  }, [charterTicker]);

  const selected = snapshot.companies.find((company) => company.ticker === selectedTicker) ?? snapshot.companies[0];
  useEffect(() => {
    if (view !== "issuer") return;
    const controller = new AbortController();
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const response = await fetch(`/api/v1/issuers/${encodeURIComponent(selected.ticker)}?period=${historyRange}&historyPoints=576`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as {
          issuer: {
            history: MarketHistoryPoint[];
            performance: { changeCrowns: number | null; changePercent: number | null };
          };
        };
        setHistoryView({
          ticker: selected.ticker,
          range: historyRange,
          points: payload.issuer.history,
          changeCrowns: payload.issuer.performance.changeCrowns,
          changePercent: payload.issuer.performance.changePercent,
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last valid chart visible through transient network loss.
        }
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => controller.abort();
  }, [historyRange, selected.ticker, snapshot.tick, view]);
  const activeHistory = historyView?.ticker === selected.ticker && historyView.range === historyRange ? historyView : null;
  const chartHistory = activeHistory?.points ?? (historyRange === "24h" ? selected.history : []);
  const chartFirst = chartHistory.at(0)?.value ?? null;
  const chartLast = chartHistory.at(-1)?.value ?? null;
  const derivedChartChange = chartHistory.length < 2 || chartFirst === null || chartLast === null ? null : Number((chartLast - chartFirst).toFixed(2));
  const derivedChartChangePercent = chartHistory.length < 2 || !chartFirst ? null : Number((((chartLast ?? chartFirst) - chartFirst) / chartFirst * 100).toFixed(2));
  const chartChangeCrowns = chartHistory.length < 2 ? null : activeHistory?.changeCrowns ?? derivedChartChange;
  const chartChangePercent = chartHistory.length < 2 ? null : activeHistory?.changePercent ?? derivedChartChangePercent;
  const chartPositive = (chartChangeCrowns ?? 0) >= 0;
  const historyLabel = HISTORY_RANGES.find((range) => range.value === historyRange)?.label ?? historyRange;
  const sectors = useMemo(() => [...new Set(snapshot.companies.map((company) => company.sector))].sort(), [snapshot.companies]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = snapshot.companies.filter((company) => sector === "all" || company.sector === sector);
    const ranked = !needle ? matches.map((company, index) => ({ company, index, score: 0 })) : matches
      .map((company, index) => {
        const ticker = company.ticker.toLowerCase();
        const name = company.name.toLowerCase();
        const sector = company.sector.toLowerCase();
        const searchable = `${ticker} ${name} ${sector} ${company.influence.toLowerCase()}`;
        const score = ticker === needle ? 0
          : name === needle ? 1
          : ticker.startsWith(needle) ? 2
          : name.startsWith(needle) ? 3
          : sector.startsWith(needle) ? 4
          : 5;
        return { company, index, score, matches: searchable.includes(needle) };
      })
      .filter((entry) => entry.matches);
    return ranked.sort((a, b) => {
      const relevance = a.score - b.score;
      if (needle && listingSort === "name" && relevance) return relevance;
      const comparison = listingSort === "name" ? a.company.name.localeCompare(b.company.name)
        : listingSort === "last" ? a.company.price - b.company.price
        : listingSort === "change" ? a.company.changePercent - b.company.changePercent
        : a.company.volume - b.company.volume;
      return (sortDescending ? -comparison : comparison) || a.index - b.index;
    }).map((entry) => entry.company);
  }, [query, sector, listingSort, sortDescending, snapshot.companies]);
  const movers = useMemo(() => snapshot.companies.filter((company) => moversMode === "gainers" ? company.changePercent > 0 : moversMode === "decliners" ? company.changePercent < 0 : company.volume > 0).sort((a, b) => moversMode === "gainers"
    ? b.changePercent - a.changePercent
    : moversMode === "decliners" ? a.changePercent - b.changePercent
    : b.volume - a.volume).slice(0, 5), [snapshot.companies, moversMode]);
  const chooseListingSort = (key: ListingSort) => {
    if (listingSort === key) setSortDescending((current) => !current);
    else {
      setListingSort(key);
      setSortDescending(key !== "name");
    }
  };
  const priceBookResults = useMemo(() => {
    const variants = searchVariants(wareQuery);
    const companies = new Map(snapshot.companies.map((company) => [company.ticker, company]));
    const matches = MINECRAFT_ITEMS.map((item, index) => {
      const company = companies.get(item.ticker);
      if (!company || (wareSector !== "all" && company.sector !== wareSector)) return null;
      const itemId = normalizedSearch(item.id);
      const itemName = normalizedSearch(item.name);
      const identity = normalizedSearch(company.ticker + " " + company.name + " " + company.sector);
      const trade = normalizedSearch(company.influence);
      const matchesAny = (text: string) => variants.some((needle) => text.includes(needle));
      const score = variants.length === 0 ? 0
        : variants.some((needle) => itemId === needle || itemName === needle || "minecraft:" + itemId === needle) ? 0
        : variants.some((needle) => itemId.startsWith(needle) || itemName.startsWith(needle)) ? 1
        : matchesAny(itemId + " " + itemName + " minecraft:" + itemId) ? 2
        : matchesAny(identity) ? 3 : matchesAny(trade) ? 4 : Infinity;
      return Number.isFinite(score) ? { item, company, index, score } : null;
    }).filter((entry) => entry !== null).sort((a, b) => a.score - b.score || a.index - b.index);
    return { total: matches.length, entries: matches.slice(warePage * 40, (warePage + 1) * 40) };
  }, [snapshot.companies, wareQuery, wareSector, warePage]);
  const featuredItems = FEATURED_ITEM_IDS.slice(0, 4).map((id) => {
    const item = MINECRAFT_ITEMS.find((item) => item.id === id)!;
    return { item, company: snapshot.companies.find((company) => company.ticker === item.ticker)! };
  });
  const ledgerCompanies = ledgerTickers.map((ticker) => snapshot.companies.find((company) => company.ticker === ticker)).filter((company): company is ListedCompany => Boolean(company));
  const charterCompany = charterTicker ? snapshot.companies.find((company) => company.ticker === charterTicker) ?? null : null;

  const toggleLedger = (ticker: string) => {
    setLedgerTickers((current) => current.includes(ticker) ? current.filter((value) => value !== ticker) : [...current, ticker]);
  };

  const openCharter = (ticker: string) => {
    charterTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedTicker(ticker);
    setCharterTicker(ticker);
  };

  useEffect(() => {
    if (view !== "overview") return;
    const controller = new AbortController();
    const load = async () => {
      setCompositeLoading(true);
      try {
        const response = await fetch("/api/composite-history?period=" + compositeRange, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as { points: MarketHistoryPoint[] };
        if (!controller.signal.aborted) setCompositeHistory({ range: compositeRange, points: payload.points });
      } catch { /* Never substitute reconstructed prices for the recorded index. */ }
      finally { if (!controller.signal.aborted) setCompositeLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [view, compositeRange, snapshot.tick]);

  const compositePoints = compositeHistory?.range === compositeRange ? compositeHistory.points : [];
  const countdown = seconds >= 86400 ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`
    : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`
    : seconds > 0 ? Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0") : "Updating";
  const asOf = easternTime(snapshot.asOf) + " " + easternZone(snapshot.asOf);
  const clock = new Date(clockMillis).toISOString();
  const nextOpening = snapshot.session ? new Date(snapshot.session.nextOpeningAt).toISOString() : snapshot.nextUpdateAt;
  const openingLabel = new Intl.DateTimeFormat("en-US",{timeZone:EASTERN_TIME_ZONE,weekday:"short",hour:"numeric",minute:"2-digit"}).format(new Date(nextOpening));
  const progress = snapshot.status === "OPEN" && snapshot.session ? Math.max(0,Math.min(1,
    (clockMillis-snapshot.session.session.opensAt)/(snapshot.session.session.closesAt-snapshot.session.session.opensAt))) : 0;
  const periodLabel = HISTORY_RANGES.find((range) => range.value === compositeRange)?.label ?? "1D";
  const periodChange = compositePoints.length > 1 ? compositePoints.at(-1)!.value - compositePoints[0].value : null;
  const activeNotices = snapshot.events.length ? snapshot.events : [snapshot.event];
  const issuerHref = (ticker: string) => "/markets/" + ticker;
  const navItems = [
    { label: "Overview", href: "/", value: "overview" },
    { label: "Markets", href: "/markets", value: "markets" },
    { label: "Price Book", href: "/price-book", value: "price-book" },
    { label: "My Ledger", href: "/my-ledger", value: "ledger" },
    { label: "Data", href: "/data", value: "data" },
  ];
  const itemImage = (id: string) => ITEM_IMAGES[id];
  const renderPriceRows = (entries: typeof featuredItems, showQuoteLabel = true) => <div className="price-book-results">
    {entries.map(({ item, company }) => <Link className="ware-row" key={item.id} href={issuerHref(company.ticker)}>
      <span className="ware-identity">
        {/* Small bundled vanilla textures need no image service. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="item-sprite" src={itemImage(item.id)} width="32" height="32" loading="lazy" alt="" />
        <span><strong>{item.name}</strong><code>{"minecraft:" + item.id}</code></span>
      </span>
      <span className="ware-issuer"><b>{company.ticker}</b><small>{company.name}</small></span>
      <span className="numeric ware-price"><b>{number(company.price)}</b><small>{showQuoteLabel ? "Crowns · issuer quote" : "Crowns"}</small></span>
      <Move value={company.changePercent} />
    </Link>)}
  </div>;
  const renderTable = (companies: ListedCompany[], preview = false, removable = false) => <div className="table-scroll" tabIndex={0} role="region" aria-label={removable ? "Watched companies" : "Listed companies"}>
    <table className="market-table">
      <caption className="sr-only">{removable ? "Your watched issuers and current quotes" : "Daily Official List. Quotes in Crowns; changes and volume for the current session."}</caption>
      <thead><tr>
        <th scope="col" className="ticker-column">Ticker</th>
        <th scope="col" aria-sort={!preview && !removable && listingSort === "name" ? (sortDescending ? "descending" : "ascending") : undefined}>{preview || removable ? "Issuer" : <button onClick={() => chooseListingSort("name")}>Issuer <span aria-hidden="true">{listingSort === "name" ? sortDescending ? "↓" : "↑" : "↕"}</span></button>}</th>
        {!preview && <th scope="col" className="sector-cell">Sector</th>}
        {([ ["last", "Last"], ["change", "Change"], ["volume", "Volume"] ] as const).map(([key, label]) => <th scope="col" className={"numeric " + (key === "volume" ? "volume-cell" : "")} key={key} aria-sort={!preview && !removable && listingSort === key ? (sortDescending ? "descending" : "ascending") : undefined}>{preview || removable ? label : <button onClick={() => chooseListingSort(key)}>{label} <span aria-hidden="true">{listingSort === key ? sortDescending ? "↓" : "↑" : "↕"}</span></button>}</th>)}
        {!preview && !removable && <th scope="col" className="principal-trade">Principal trade</th>}
        {removable && <th scope="col"><span className="sr-only">Ledger actions</span></th>}
      </tr></thead>
      <tbody>{companies.map((company) => <tr key={company.ticker}>
        <td className="ticker-cell"><Link href={issuerHref(company.ticker)}>{company.ticker}</Link></td>
        <th scope="row"><Link href={issuerHref(company.ticker)}>{company.name}</Link><small className="mobile-ticker">{company.ticker}</small></th>
        {!preview && <td className="sector-cell">{company.sector}</td>}
        <td className="numeric">{number(company.price)}</td>
        <td className="numeric"><Move value={company.changePercent} /></td>
        <td className="numeric volume-cell" title={number(company.volume, 0)}>{compact(company.volume)}</td>
        {!preview && !removable && <td className="principal-trade">{company.influence}</td>}
        {removable && <td><button className="text-button" onClick={() => toggleLedger(company.ticker)} aria-label={"Remove " + company.name + " from my ledger"}>Remove</button></td>}
      </tr>)}</tbody>
    </table>
  </div>;

  return (
    <div className="exchange-app">
      <a className="skip-link" href="#main-content">Skip to market content</a>
      <header className="site-header">
        <div className="utility-bar"><div className="utility-inner">
          <span className="utility-status">Market {snapshot.status.toLowerCase()}</span>
          <span>09:30–16:00 ET · NYSE calendar</span>
          <span className="utility-countdown" title={snapshot.status === "OPEN" && snapshot.session ? "Closes " + easternTime(new Date(snapshot.session.session.closesAt).toISOString()) + " ET" : "Next opening " + openingLabel + " ET"}>{snapshot.status === "OPEN" ? "Next clearing" : "Opens " + openingLabel} <b>{countdown}</b></span>
          <span className="utility-data" role="status">{dataDelayed ? "Simulated · quotes delayed" : snapshot.historyMode === "recorded-ledger" ? "Simulated market" : "Simulated · indicative quotes"}</span>
          <time dateTime={clock} title={"Last recorded price: " + easternDate(snapshot.asOf) + " · " + asOf}>{easternTime(clock) + " " + easternZone(clock)}</time>
        </div></div>
        <div className="masthead">
          <Link className="brand" href="/" aria-label="Royal Exchange home"><span className="brand-mark" aria-hidden="true">RX</span><span className="brand-wordmark"><strong>Royal Exchange</strong><small>The Crown Market at Guildhall</small></span></Link>
          <nav className="primary-nav" aria-label="Primary navigation">{navItems.map((item) => <Link key={item.href} href={item.href} aria-current={view === item.value || view === "issuer" && item.value === "markets" ? "page" : undefined}>{item.label}</Link>)}</nav>
          <button className="theme-toggle" type="button" aria-pressed={theme === "dark"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light mode" : "Dark mode"}</button>
        </div>
      </header>

      <div className="session-strip">
        <span>{snapshot.session?.era ? `Trading era ${snapshot.session.era} · Established ${easternDate(snapshot.session.startedAt!)}` : snapshot.historyMode === "recorded-ledger" ? "Preparing the new trading era" : "Recorded market temporarily unavailable"}</span>
        <span>{snapshot.status === "OPEN" && snapshot.session ? "Closes " + easternTime(new Date(snapshot.session.session.closesAt).toISOString()) + " ET" : "Prices remain fixed until the opening bell"}</span>
        {snapshot.status === "OPEN" && <progress max={1} value={progress} aria-label="Trading session progress" />}
        <span role="status" aria-live="polite">{bellNotice}</span>
      </div>

      {view === "overview" && <section className="ticker-tape" aria-label="Selected issuer quotes"><div className="ticker-track" role="group" aria-label="Scroll issuer quotes" tabIndex={0}><span className="ticker-label">Last clearing</span>{snapshot.companies.slice(0, 6).map((company) => <Link className="ticker-item" key={company.ticker} href={issuerHref(company.ticker)}><b>{company.ticker}</b><span>{number(company.price)}</span><Move value={company.changePercent} /></Link>)}</div></section>}

      <main className={"shell view-" + view} id="main-content" tabIndex={-1}>
        {view === "overview" && <>
          <div className="page-heading"><span className="eyebrow">Crown market overview</span><p>{easternDate(snapshot.asOf)} <span>· Quotes in Crowns</span></p></div>
          <section className="composite-section" aria-labelledby="market-heading">
            <div className="composite-main">
              <div className="overview-heading"><span className="market-code">RXC</span><h1 id="market-heading">Royal Exchange Composite</h1></div>
              <div className="index-line"><strong className="index-value">{number(snapshot.composite)}</strong><div className="index-movement"><span className={snapshot.compositeChange >= 0 ? "positive" : "negative"}>{signed(snapshot.compositeChange)} <Move value={snapshot.compositeChangePercent} /></span><small>Session movement</small></div></div>
              <div className="history-controls"><div className="history-range" role="group" aria-label="Composite recorded history range">{HISTORY_RANGES.map((range) => <button type="button" key={range.value} className={compositeRange === range.value ? "selected" : ""} aria-pressed={compositeRange === range.value} onClick={() => setCompositeRange(range.value)}>{range.label}</button>)}</div><span className="history-status" aria-live="polite">{compositeLoading ? "Loading history…" : periodChange === null ? "" : periodLabel + " " + signed(periodChange) + " points"}</span></div>
              <Chart unit="index points" points={compositePoints} positive={(periodChange ?? snapshot.compositeChange) >= 0} theme={theme} reference={compositeRange === "24h" ? Number((snapshot.composite - snapshot.compositeChange).toFixed(2)) : undefined} />
              <div className="chart-labels"><span>{compositePoints.length ? easternDate(compositePoints[0].time) : ""}</span><span>{compositePoints.length ? "Last clearing " + easternTime(compositePoints.at(-1)!.time) + " " + easternZone(compositePoints.at(-1)!.time) : "As of " + asOf}</span></div>
            </div>
            <aside className="market-summary" aria-label="Market statistics">
              <h2 className="eyebrow">At the clearing</h2>
              <dl className="summary-stats"><div><dt>Total session volume</dt><dd title={number(snapshot.totalVolume, 0)}>{compact(snapshot.totalVolume)}</dd></div><div><dt>Listed issuers</dt><dd>{snapshot.companies.length}</dd></div><div><dt>Vanilla instruments</dt><dd>{number(MINECRAFT_ITEM_COUNT, 0)}</dd></div></dl>
              <div className="market-breadth"><h2 className="eyebrow">Market breadth</h2><div className="breadth-meter" role="img" aria-label={snapshot.advancing + " advancing, " + snapshot.declining + " declining, " + snapshot.unchanged + " unchanged"}><span className="breadth-up" style={{ flexGrow: snapshot.advancing }} /><span className="breadth-down" style={{ flexGrow: snapshot.declining }} /><span className="breadth-flat" style={{ flexGrow: snapshot.unchanged }} /></div><dl className="breadth"><div><dt>Advancing</dt><dd>{snapshot.advancing}</dd></div><div><dt>Declining</dt><dd>{snapshot.declining}</dd></div><div><dt>Unchanged</dt><dd>{snapshot.unchanged}</dd></div></dl></div>
              <Link className="quiet-link" href="/data">How the market works</Link>
            </aside>
          </section>
          <section className="highlights" aria-labelledby="highlights-heading"><div className="section-heading"><h2 id="highlights-heading">Market Highlights</h2><div className="movers-tabs" role="group" aria-label="Market mover ranking">{(["gainers", "decliners", "active"] as const).map((mode) => <button type="button" key={mode} className={moversMode === mode ? "selected" : ""} aria-pressed={moversMode === mode} onClick={() => setMoversMode(mode)}>{mode === "active" ? "Most Active" : mode === "gainers" ? "Gainers" : "Decliners"}</button>)}</div></div>
            <div className="highlight-list">{movers.map((company) => <Link className="highlight-entry" key={company.ticker} href={issuerHref(company.ticker)}><span className="highlight-identity"><b>{company.ticker}</b><span>{company.name}</span></span><span className="numeric">{number(company.price)}</span><span className="numeric">{moversMode === "active" ? <b title={number(company.volume, 0)}>{compact(company.volume)}<small>volume</small></b> : <Move value={company.changePercent} />}</span></Link>)}</div>{movers.length === 0 && <p className="empty-note" role="status">No issuers in this ranking at the current clearing.</p>}
          </section>
          <section className="notice-section" aria-label="Market notices">{activeNotices.map((notice) => <article className={"market-notice severity-" + notice.severity} key={notice.id}><div><span className="eyebrow">Market Wardens · {notice.severity === "routine" ? "Bulletin" : notice.severity === "material" ? "Market notice" : notice.severity === "severe" ? "Urgent notice" : "Critical notice"}</span><h2>{notice.title}</h2></div><p>{notice.description}</p>{notice.severity !== "routine" && <small>{notice.sector + " · " + notice.phase.charAt(0).toUpperCase() + notice.phase.slice(1)}</small>}</article>)}</section>
          <section className="catalogue-preview" aria-labelledby="book-preview-heading"><div className="section-heading"><div><span className="eyebrow">Vanilla Minecraft {MINECRAFT_VERSION}</span><h2 id="book-preview-heading">Merchant’s Price Book</h2></div><Link className="quiet-link" href="/price-book">Search all {number(MINECRAFT_ITEM_COUNT, 0)} instruments</Link></div>{renderPriceRows(featuredItems)}</section>
          <section className="official-preview" aria-labelledby="official-preview-heading"><div className="section-heading"><div><span className="eyebrow">Daily Official List</span><h2 id="official-preview-heading">Guilds &amp; Companies</h2></div><Link className="quiet-link" href="/markets">View all {snapshot.companies.length} issuers</Link></div>{renderTable(snapshot.companies.slice(0, 4), true)}</section>
        </>}

        {view === "markets" && <>
          <div className="page-title"><span className="eyebrow">Markets · Daily Official List</span><h1>Guilds &amp; Companies</h1><p>The Crown market’s {snapshot.companies.length} listed issuers. Quotes in Crowns.</p></div>
          <div className="catalogue-controls"><label className="search"><span>Find an issuer</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker, guild, sector or principal trade" /></label><label className="sector-filter"><span>Trade sector</span><select value={sector} onChange={(event) => setSector(event.target.value)}><option value="all">All sectors</option>{sectors.map((value) => <option key={value}>{value}</option>)}</select></label></div>
          <div className="results-caption"><span role="status">{filtered.length} of {snapshot.companies.length} listed issuers</span><span>{"As of " + asOf} · session change</span></div>
          {renderTable(filtered)}{filtered.length === 0 && <p className="empty-note" role="status">No listed company matches your filters. Try another ticker, guild or trade.</p>}
        </>}

        {view === "price-book" && <>
          <div className="page-title"><span className="eyebrow">Commodity register · Minecraft {MINECRAFT_VERSION}</span><h1>Merchant’s Price Book</h1><p>{number(MINECRAFT_ITEM_COUNT, 0)} individual vanilla items, mapped to their responsible guilds. Prices are linked issuer quotes, rather than individual item valuations.</p></div>
          <div className="catalogue-controls price-book-controls"><label className="search"><span>Find a commodity</span><input type="search" value={wareQuery} onChange={(event) => { setWareQuery(event.target.value); setWarePage(0); }} placeholder="Item name, registry ID, guild or trade" /></label><label className="sector-filter"><span>Commodity trade</span><select value={wareSector} onChange={(event) => { setWareSector(event.target.value); setWarePage(0); }}><option value="all">All trades</option>{sectors.map((value) => <option key={value}>{value}</option>)}</select></label></div>
          <div className="suggestion-row"><span>Quick searches</span>{PRICE_BOOK_SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => { setWareQuery(suggestion); setWarePage(0); }}>{suggestion}</button>)}</div>
          <div className="results-caption"><span role="status">{number(priceBookResults.total, 0)} {wareQuery || wareSector !== "all" ? "matching" : "listed"} instruments{priceBookResults.total > 0 ? " · " + (warePage * 40 + 1) + "–" + Math.min((warePage + 1) * 40, priceBookResults.total) : ""}</span><span>{"As of " + asOf}</span></div>
          <div className="ware-table-heading" aria-hidden="true"><span>Commodity / registry</span><span>Responsible issuer</span><span className="numeric">Linked quote</span><span className="numeric">Change</span></div>
          {renderPriceRows(priceBookResults.entries, false)}{priceBookResults.total === 0 && <p className="empty-note" role="status">No Minecraft item matches these filters. Try an item name or choose another trade.</p>}
          {priceBookResults.total > 40 && <nav className="pagination" aria-label="Price Book pages"><button className="action-button secondary" disabled={warePage === 0} onClick={() => setWarePage((page) => page - 1)}>Previous</button><span>{"Page " + (warePage + 1) + " of " + Math.ceil(priceBookResults.total / 40)}</span><button className="action-button secondary" disabled={(warePage + 1) * 40 >= priceBookResults.total} onClick={() => setWarePage((page) => page + 1)}>Next</button></nav>}
        </>}

        {view === "ledger" && <>
          <div className="page-title"><span className="eyebrow">Personal Merchant’s Ledger</span><h1>My Ledger</h1><p>Your watchlist stays in this browser and is never shared.</p></div>
          {!ledgerReady ? <p className="empty-note" role="status">Opening your ledger…</p> : ledgerCompanies.length ? <><div className="results-caption"><span>{ledgerCompanies.length} watched {ledgerCompanies.length === 1 ? "issuer" : "issuers"}</span><Link className="quiet-link" href="/markets">Find more issuers</Link></div>{renderTable(ledgerCompanies, false, true)}</> : <div className="ledger-empty"><h2>No issuers in your ledger</h2><p>Add an issuer from its quote page to follow it here.</p><Link className="action-button" href="/markets">Browse the Official List</Link></div>}
        </>}

        {view === "issuer" && <>
          <Link className="quiet-link breadcrumb" href="/markets">Markets / Daily Official List</Link>
          <section className="issuer-detail" aria-labelledby="issuer-heading">
            <div className="focus-heading"><div><span className="eyebrow">{selected.ticker + " · " + selected.sector}</span><h1 id="issuer-heading">{selected.name}</h1><p>{selected.influence}</p></div><div className="focus-price"><strong>{number(selected.price)}</strong><small>Crowns</small><div className="focus-change"><span className={selected.change >= 0 ? "positive" : "negative"}>{signed(selected.change)}</span><Move value={selected.changePercent} /><small>session</small></div></div></div>
            <div className="issuer-actions"><button className="action-button" onClick={() => openCharter(selected.ticker)}>Company Charter</button><button className="action-button secondary" aria-pressed={ledgerTickers.includes(selected.ticker)} onClick={() => toggleLedger(selected.ticker)}>{ledgerTickers.includes(selected.ticker) ? "Remove from Ledger" : "Add to Ledger"}</button><span>{"As of " + asOf}</span></div>
            <div className="issuer-grid"><div className="issuer-chart"><div className="history-controls"><div className="history-range" role="group" aria-label="Recorded history range">{HISTORY_RANGES.map((range) => <button type="button" key={range.value} className={historyRange === range.value ? "selected" : ""} aria-pressed={historyRange === range.value} onClick={() => setHistoryRange(range.value)}>{range.label}</button>)}</div><div className="history-status" aria-live="polite">{historyLoading ? "Loading " + historyLabel + " history…" : chartChangeCrowns === null || chartChangePercent === null ? historyLabel + " performance unavailable" : historyLabel + " " + signed(chartChangeCrowns) + " (" + signed(chartChangePercent, "%") + ")"}</div></div><Chart points={chartHistory} positive={chartPositive} theme={theme} reference={historyRange === "24h" ? selected.previousClose : undefined} /><div className="chart-labels"><span>{chartHistory.length ? easternDate(chartHistory[0].time) : "Awaiting observation"}</span><span>{"As of " + asOf}</span></div><p className="history-disclosure">Recorded auctions only.{snapshot.recordedFrom ? " History begins " + easternDate(snapshot.recordedFrom) + "." : ""}</p></div>
              <dl className="instrument-stats"><div><dt>Previous close</dt><dd>{number(selected.previousClose)}</dd></div><div><dt>Open</dt><dd>{number(selected.open)}</dd></div><div><dt>Opening gap</dt><dd><Move value={selected.previousClose ? (selected.open / selected.previousClose - 1) * 100 : 0} /></dd></div><div><dt>High / low</dt><dd>{number(selected.high) + " / " + number(selected.low)}</dd></div><div><dt>Bid / ask</dt><dd>{number(selected.bid) + " / " + number(selected.ask)}</dd></div><div><dt>Session volume</dt><dd>{number(selected.volume, 0)}</dd></div><div><dt>Last clearing trades</dt><dd>{number(selected.trades, 0)}</dd></div></dl>
            </div>
          </section>
          <section className="issuer-wares"><div className="section-heading"><div><span className="eyebrow">Principal wares</span><h2>In the Price Book</h2></div><Link className="quiet-link" href="/price-book">Open the commodity register</Link></div>{renderPriceRows(MINECRAFT_ITEMS.filter((item) => item.ticker === selected.ticker).slice(0, 6).map((item) => ({ item, company: selected })))}</section>
        </>}

        {view === "data" && <>
          <div className="page-title"><span className="eyebrow">Public record · Methodology</span><h1>Market Data &amp; Methodology</h1><p>The Royal Exchange is a fictional Minecraft financial institution. Trading follows the NYSE calendar; all prices and activity are simulated.</p></div>
          <div className="data-layout"><div className="methodology"><section><h2>The trading calendar</h2><p>Monday–Friday, 9:30 AM–4:00 PM America/New_York, with NYSE holidays, scheduled 1:00 PM early closes and automatic daylight saving adjustments. Prices freeze outside the session. The next opening appears above every page.</p><p>The opening auction preserves the previous close and may include a bounded gap reflecting issuer volatility, shared market news and the length of the closure. A gap is applied once per session. Completed sessions are archived; downtime creates no invented auctions.</p></section><section><h2>The five-minute clearing</h2><p>Rule-based merchant houses, guild funds, factors, speculators and market makers submit buy and sell limit orders. During trading hours, a shared auction every five minutes matches those orders to set issuer prices and traded volume.</p><p>Issuer fundamentals, supply and demand, liquidity, persistent order flow and market notices influence the participants. Most price changes are small, with quiet and turbulent periods and occasional larger moves. These are simulated orders, rather than player trades.</p></section><section><h2>Royal Exchange Composite</h2><p>RXC tracks all {snapshot.companies.length} listed issuers using the exchange’s established issuer weights and base prices. Session movement compares the latest clearing with the previous close.</p></section><section><h2>The recorded ledger</h2><p>Charts use observations saved by the exchange. No historical prices are invented or backfilled. A range with fewer than two observations has no meaningful performance change.</p><p>Longer ranges sample actual recorded observations. Gaps remain gaps in the record; the plotted line connects observations and does not claim trades between them.</p></section><section><h2>Commodity quotes</h2><p>The Price Book maps {number(MINECRAFT_ITEM_COUNT, 0)} vanilla Minecraft {MINECRAFT_VERSION} instruments to their responsible issuers. A linked quote is the issuer’s price in Crowns; it is not a separate valuation for an individual item.</p></section><section><h2>Your ledger &amp; Minecraft</h2><p>Your Merchant’s Ledger is a watchlist stored locally in this browser. The public API is read-only. Minecraft may read the exchange feed; gameplay never writes back to the public market.</p></section></div>
          <aside className="data-register"><section><h2 className="eyebrow">Publication status</h2><dl className="data-facts"><div><dt>Data</dt><dd>{snapshot.historyMode === "recorded-ledger" ? "Recorded clearing prices" : "Indicative quotes"}</dd></div><div><dt>As of</dt><dd>{easternDate(snapshot.asOf) + " · " + asOf}</dd></div><div><dt>{snapshot.status === "OPEN" ? "Next clearing" : "Next opening"}</dt><dd>{countdown}</dd></div><div><dt>Recorded since</dt><dd>{snapshot.recordedFrom ? easternDate(snapshot.recordedFrom) : "Not yet available"}</dd></div><div><dt>Recorded clearings</dt><dd>{number(snapshot.recordedObservations, 0)}</dd></div><div><dt>Model</dt><dd>{snapshot.modelVersion}</dd></div></dl></section>
          <section><h2>Public API</h2><p>The same market record, available as JSON.</p><ul className="api-links"><li><a href="/api/market">Full market snapshot <code>/api/market</code></a></li><li><a href="/api/v1/overview">Market overview <code>/api/v1/overview</code></a></li><li><a href="/api/composite-history?period=24h">Recorded RXC history <code>/api/composite-history</code></a></li><li><a href="/openapi.json">API / OpenAPI schema <code>/openapi.json</code></a></li></ul><p className="technical-note">Composite history accepts period=24h, 7d, 30d or all. Up to 576 recorded points are returned; the daily chart retains every five-minute clearing. The read-only MCP endpoint is <code>/mcp</code>.</p></section>
          <section><h2>Institutional references</h2><p>Guild names and trade streets draw on London’s mercantile history.</p><ul className="reference-links"><li><a href="https://www.cityoflondon.gov.uk/about-us/law-historic-governance/livery-companies" target="_blank" rel="noreferrer">City of London livery companies</a></li><li><a href="https://merchantstaplers.co.uk/history-of-the-company/" target="_blank" rel="noreferrer">The Company of Merchant Staplers</a></li></ul></section></aside></div>
        </>}
      </main>
      {charterCompany && (() => {
        const record = charterRecord(charterCompany);
        const isPinned = ledgerTickers.includes(charterCompany.ticker);
        return (
          <div className="charter-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCharterTicker(null); }}>
            <section ref={charterSheetRef} className="charter-sheet" role="dialog" aria-modal="true" aria-labelledby="charter-title">
              <button ref={charterCloseRef} className="charter-close" onClick={() => setCharterTicker(null)} aria-label="Close company charter">Close</button>
              <div className="charter-kicker">Fictional market charter · {record.register}</div>
              <div className="charter-heading"><span className="charter-seal" aria-hidden="true">{charterCompany.ticker.slice(0, 2)}</span><div><span>{charterCompany.ticker} · {charterCompany.sector}</span><h2 id="charter-title">{charterCompany.name}</h2><p>{record.seat}</p></div></div>
              <p className="charter-preamble">Entered in the simulated Royal Exchange register as the recognized market account for {charterCompany.influence.toLowerCase()}.</p>
              <dl className="charter-facts">
                <div><dt>Principal wares</dt><dd>{charterCompany.influence}</dd></div>
                <div><dt>Present standing</dt><dd>{standingFor(charterCompany)}</dd></div>
                <div><dt>Reference price</dt><dd>{number(charterCompany.price)} Crowns</dd></div>
                <div><dt>Session movement</dt><dd><Move value={charterCompany.changePercent} /></dd></div>


              </dl>
              <blockquote>{record.note}</blockquote>
              <div className="charter-actions"><button className="action-button" onClick={() => toggleLedger(charterCompany.ticker)}>{isPinned ? "Remove from my ledger" : "Add to my ledger"}</button><button className="action-button secondary" onClick={() => setCharterTicker(null)}>Return to the market</button></div>
            </section>
          </div>
        );
      })()}

      <footer className="institutional-footer"><div><strong>Royal Exchange</strong><span>The Crown Market at Guildhall</span></div><p>Fictional exchange · Simulated market data</p><Link href="/data">Public data &amp; methodology</Link></footer>
    </div>
  );
}
