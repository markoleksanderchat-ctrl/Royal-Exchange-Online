"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ListedCompany, MarketHistoryPoint, MarketSnapshot } from "../lib/market";
import { MINECRAFT_ITEM_COUNT, MINECRAFT_ITEMS, MINECRAFT_VERSION } from "./minecraft-items";
import { charterRecord, PRICE_BOOK_SUGGESTIONS, standingFor } from "./market-records";

const LEDGER_KEY = "royal-exchange-merchant-ledger-v1";
const THEME_KEY = "royal-exchange-theme-v1";
const EASTERN_TIME_ZONE = "America/New_York";
const FEATURED_ITEM_IDS = ["diamond", "redstone", "white_wool", "music_disc_13", "filled_map", "potion", "iron_ingot", "oak_log"];
type ThemeMode = "light" | "dark";
type HistoryRange = "24h" | "7d" | "30d" | "all";

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

function Chart({ points, positive, theme }: { points: MarketHistoryPoint[]; positive: boolean; theme: ThemeMode }) {
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
      const low = Math.min(...values);
      const high = Math.max(...values);
      const range = Math.max(0.01, high - low);
      const left = 2;
      const right = bounds.width - 2;
      const top = 14;
      const bottom = bounds.height - 18;

      const styles = window.getComputedStyle(canvas);
      context.strokeStyle = styles.getPropertyValue("--chart-grid").trim() || "rgba(92, 62, 31, .18)";
      context.lineWidth = 1;
      for (let line = 0; line < 4; line += 1) {
        const y = top + ((bottom - top) * line) / 3;
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(right, y);
        context.stroke();
      }

      const coordinates = points.map((point, index) => ({
        x: left + ((right - left) * index) / (points.length - 1),
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

      context.beginPath();
      coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.stroke();
      const latest = coordinates.at(-1)!;
      context.beginPath();
      context.arc(latest.x, latest.y, 3.5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points, positive, theme]);

  if (points.length < 2) {
    return <div className="market-chart chart-recording" role="img" aria-label="Price history recording has started">Recording first observations</div>;
  }
  const selectNearestPoint = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width)));
    setHoverIndex(Math.round(progress * (points.length - 1)));
  };
  const moveSelection = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setHoverIndex(0);
    else if (event.key === "End") setHoverIndex(points.length - 1);
    else setHoverIndex((current) => Math.max(0, Math.min(points.length - 1,
      (current ?? points.length - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  const hovered = hoverIndex === null ? null : points[hoverIndex];
  const pointPosition = hoverIndex === null ? 0 : (hoverIndex / (points.length - 1)) * 100;
  const tooltipPosition = Math.max(8, Math.min(92, pointPosition));

  return (
    <div className="market-chart-wrap" onPointerLeave={() => setHoverIndex(null)}>
      <canvas
        ref={canvasRef}
        className="market-chart"
        aria-label={hovered ? `Recorded price ${number(hovered.value)} Crowns at ${easternDate(hovered.time)} ${easternTime(hovered.time)} ${easternZone(hovered.time)}` : "Recorded price history chart. Use the pointer or arrow keys to inspect prices."}
        tabIndex={0}
        onPointerMove={(event) => selectNearestPoint(event.clientX)}
        onPointerDown={(event) => selectNearestPoint(event.clientX)}
        onKeyDown={moveSelection}
        onBlur={() => setHoverIndex(null)}
      />
      {hovered && <>
        <span className="chart-crosshair" style={{ left: `${pointPosition}%` }} aria-hidden="true" />
        <output className="chart-tooltip" style={{ left: `${tooltipPosition}%` }}>
          <span>{easternDate(hovered.time)} · {easternTime(hovered.time)} {easternZone(hovered.time)}</span>
          <strong>{number(hovered.value)} Crowns</strong>
        </output>
      </>}
    </div>
  );
}

function Move({ value }: { value: number }) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return <span className={`move ${direction}`}>{signed(value, "%")}</span>;
}

export function MarketDashboard({ initialSnapshot }: { initialSnapshot: MarketSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedTicker, setSelectedTicker] = useState("STPL");
  const [seconds, setSeconds] = useState(300);
  const [query, setQuery] = useState("");
  const [wareQuery, setWareQuery] = useState("");
  const [ledgerTickers, setLedgerTickers] = useState<string[]>([]);
  const [ledgerReady, setLedgerReady] = useState(false);
  const [charterTicker, setCharterTicker] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("7d");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyView, setHistoryView] = useState<{
    ticker: string;
    range: HistoryRange;
    points: MarketHistoryPoint[];
    changeCrowns: number | null;
  } | null>(null);
  const charterSheetRef = useRef<HTMLElement>(null);
  const charterCloseRef = useRef<HTMLButtonElement>(null);
  const charterTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(THEME_KEY);
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
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme, themeReady]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/market", { cache: "no-store" });
        if (response.ok) setSnapshot(await response.json() as MarketSnapshot);
      } catch {
        // The last valid snapshot remains visible through transient network loss.
      }
    };
    const refreshTimer = window.setInterval(refresh, 30_000);
    void refresh();
    const countdownTimer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((new Date(snapshot.nextUpdateAt).getTime() - Date.now()) / 1000)));
    }, 1_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(countdownTimer);
    };
  }, [snapshot.nextUpdateAt]);

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
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledgerTickers));
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
    const controller = new AbortController();
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const response = await fetch(`/api/v1/issuers/${encodeURIComponent(selected.ticker)}?period=${historyRange}&historyPoints=120`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as {
          issuer: {
            history: MarketHistoryPoint[];
            performance: { changeCrowns: number | null };
          };
        };
        setHistoryView({
          ticker: selected.ticker,
          range: historyRange,
          points: payload.issuer.history,
          changeCrowns: payload.issuer.performance.changeCrowns,
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
  }, [historyRange, selected.ticker]);
  const activeHistory = historyView?.ticker === selected.ticker && historyView.range === historyRange ? historyView : null;
  const chartHistory = activeHistory?.points ?? selected.history;
  const chartPositive = (activeHistory?.changeCrowns ?? selected.change) >= 0;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.companies;
    return snapshot.companies
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
      .filter((entry) => entry.matches)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((entry) => entry.company);
  }, [query, snapshot.companies]);
  const leaders = [...snapshot.companies].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const priceBookResults = useMemo(() => {
    const variants = searchVariants(wareQuery);
    const matches = (variants.length > 0 ? MINECRAFT_ITEMS
      .map((item, index) => {
        const company = snapshot.companies.find((entry) => entry.ticker === item.ticker);
        const itemId = normalizedSearch(item.id);
        const itemName = normalizedSearch(item.name);
        const companyIdentity = normalizedSearch(`${company?.ticker ?? ""} ${company?.name ?? ""} ${company?.sector ?? ""}`);
        const companyTrade = normalizedSearch(company?.influence ?? "");
        const matchesAny = (text: string) => variants.some((needle) => text.includes(needle));
        const equalsAny = (text: string) => variants.some((needle) => text === needle);
        const startsWithAny = (text: string) => variants.some((needle) => text.startsWith(needle));
        const score = equalsAny(itemId) || equalsAny(itemName) ? 0
          : startsWithAny(itemId) || startsWithAny(itemName) ? 1
          : matchesAny(`${itemId} ${itemName}`) ? 2
          : matchesAny(companyIdentity) ? 3
          : matchesAny(companyTrade) ? 4
          : Number.POSITIVE_INFINITY;
        return { item, index, score };
      })
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((entry) => entry.item)
      : FEATURED_ITEM_IDS.map((id) => MINECRAFT_ITEMS.find((item) => item.id === id)).filter((item): item is (typeof MINECRAFT_ITEMS)[number] => Boolean(item)));
    return {
      total: matches.length,
      entries: matches.slice(0, 12).map((item) => ({ item, company: snapshot.companies.find((company) => company.ticker === item.ticker) })).filter((entry): entry is { item: (typeof MINECRAFT_ITEMS)[number]; company: ListedCompany } => Boolean(entry.company)),
    };
  }, [snapshot.companies, wareQuery]);
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

  return (
    <main>
      <header className="site-header">
        <div className="utility-bar">
          <span>Official website of the simulated Royal Exchange</span>
          <div className="utility-actions">
            <span className="utility-message">Market data · Public access · Minecraft 1.21.1</span>
            <button className="theme-toggle" type="button" aria-pressed={theme === "dark"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light mode" : "Dark mode"}</button>
          </div>
        </div>
        <div className="masthead">
          <a className="brand" href="#top" aria-label="Royal Exchange home">
            <strong>Royal Exchange</strong>
            <small>The Crown Market at Guildhall</small>
          </a>
          <div className="market-clock">
            <span className="live-dot" aria-hidden="true" />
            <span><strong>Five-minute clearing</strong><small>{snapshot.historyMode === "recorded-ledger" ? "Recorded matched trades" : "Ledger unavailable"} · {seconds > 0 ? `next auction ${seconds}s` : "clearing…"}</small></span>
          </div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a href="#overview">Market overview</a>
          <a href="#official-list">Official list</a>
          <a href="#price-book">Price book</a>
          <a href="#my-ledger">My ledger</a>
          <a href="/api/market">Market data API</a>
        </nav>
      </header>

      <section className="ticker-tape" aria-label="Live market ticker">
        <div className="ticker-track">
          {[...snapshot.companies, ...snapshot.companies].map((company, index) => (
            <span className="ticker-item" key={`${company.ticker}-${index}`}>
              <b>{company.ticker}</b><span>{number(company.price)}</span><Move value={company.changePercent} />
            </span>
          ))}
        </div>
      </section>

      <div className="shell" id="top">
        <section className="market-strip" aria-label="Market status">
          <div><span>Market</span><strong className="status-open">Open</strong></div>
          <div><span>Data status</span><strong>Simulated · order-matched</strong></div>
          <div><span>As of</span><strong>{easternTime(snapshot.asOf)} {easternZone(snapshot.asOf)}</strong></div>
          <div><span>Listed issuers</span><strong>{snapshot.companies.length}</strong></div>
          <div><span>Vanilla instruments</span><strong>{number(MINECRAFT_ITEM_COUNT, 0)}</strong></div>
        </section>

        <section className="overview" id="overview" aria-labelledby="market-heading">
          <div className="overview-heading">
            <div><span className="market-code">RXC</span><h1 id="market-heading">Royal Exchange Composite</h1></div>
            <p>Reference index for the Crown market’s thirty-eight listed guilds and companies.</p>
          </div>
          <div className="index-line">
            <div>
              <strong className="index-value">{number(snapshot.composite)}</strong>
              <p className={snapshot.compositeChange >= 0 ? "positive" : "negative"}>
                {signed(snapshot.compositeChange)} ({signed(snapshot.compositeChangePercent, "%")}) session
              </p>
            </div>
            <div className="breadth" aria-label="Market breadth">
              <span><b>{snapshot.advancing}</b> advancing</span>
              <span><b>{snapshot.declining}</b> declining</span>
              <span><b>{snapshot.unchanged}</b> unchanged</span>
            </div>
          </div>

          <div className="focus-card">
            <div className="focus-heading">
              <div><span className="ticker-badge">{selected.ticker}</span><h2>{selected.name}</h2><p>{selected.sector} · {selected.influence}</p></div>
              <div className="focus-price"><strong>{number(selected.price)}</strong><small>Crowns</small><Move value={selected.changePercent} /></div>
            </div>
            <div className="history-controls">
              <div className="history-range" role="group" aria-label="Recorded history range">
                {HISTORY_RANGES.map((range) => (
                  <button
                    type="button"
                    key={range.value}
                    className={historyRange === range.value ? "selected" : ""}
                    aria-pressed={historyRange === range.value}
                    onClick={() => setHistoryRange(range.value)}
                  >{range.label}</button>
                ))}
              </div>
              <div className="history-ledger-note" aria-live="polite">
                <strong>{historyLoading ? "Loading recorded history…" : `${chartHistory.length} recorded points`}</strong>
                <span>Ledger began {snapshot.recordedFrom ? `${easternDate(snapshot.recordedFrom)} ${easternZone(snapshot.recordedFrom)}` : "when the first observation was stored"}</span>
              </div>
            </div>
            <Chart points={chartHistory} positive={chartPositive} theme={theme} />
            <div className="chart-labels"><span>{chartHistory.length > 0 ? easternDate(chartHistory[0].time) : "Recording started"}</span><span>Latest recorded</span></div>
            <div className="focus-actions">
              <button className="action-button" onClick={() => openCharter(selected.ticker)}>Read company charter</button>
              <button className="action-button secondary" onClick={() => toggleLedger(selected.ticker)}>{ledgerTickers.includes(selected.ticker) ? "Remove from my ledger" : "Add to my ledger"}</button>
            </div>
            <dl className="instrument-stats">
              <div><dt>Previous close</dt><dd>{number(selected.previousClose)}</dd></div>
              <div><dt>Session open</dt><dd>{number(selected.open)}</dd></div>
              <div><dt>High / low</dt><dd>{number(selected.high)} / {number(selected.low)}</dd></div>
              <div><dt>Bid / ask</dt><dd>{number(selected.bid)} / {number(selected.ask)}</dd></div>
              <div><dt>Matched trades</dt><dd>{number(selected.trades, 0)}</dd></div>
              <div><dt>Session volume</dt><dd>{compact(selected.volume)}</dd></div>
            </dl>
          </div>
        </section>

        <aside className="market-rail" aria-label="Market briefing">
          <section className="briefing-card">
            <div className="section-label">Simulated market notice</div>
            <span className={`event-tone ${snapshot.event.tone}`}>{snapshot.event.severity === "routine" ? "Routine conditions" : `${snapshot.event.severity} · ${snapshot.event.phase}`}</span>
            <h2>{snapshot.event.title}</h2>
            <p>{snapshot.event.description}</p>
            <small>Affected: {snapshot.event.sector}{snapshot.event.impactPercent !== 0 ? ` · ${snapshot.event.impactPercent > 0 ? "+" : ""}${snapshot.event.impactPercent.toFixed(2)}% supply-demand pressure` : ""}</small>
          </section>
          <section className="rail-card">
            <div className="section-label">Market summary</div>
            <dl className="rail-stats">
              <div><dt>Total volume</dt><dd>{compact(snapshot.totalVolume)}</dd></div>
              <div><dt>Listed issuers</dt><dd>{snapshot.companies.length}</dd></div>
              <div><dt>Item coverage</dt><dd>Broad vanilla families</dd></div>
              <div><dt>Price basis</dt><dd>Matched buy / sell orders</dd></div>
              <div><dt>Ledger</dt><dd>{snapshot.recordedFrom ? `Since ${easternDate(snapshot.recordedFrom)} ${easternZone(snapshot.recordedFrom)}` : "Unavailable"}</dd></div>
              <div><dt>Clearing engine</dt><dd>{snapshot.modelStartedAt ? `Since ${easternDate(snapshot.modelStartedAt)} ${easternZone(snapshot.modelStartedAt)}` : "Local preview"}</dd></div>
              <div><dt>Recorded ticks</dt><dd>{snapshot.recordedObservations}</dd></div>
            </dl>
          </section>
          <section className="rail-card movers-card">
            <div className="section-label">Largest moves</div>
            {leaders.slice(0, 3).map((company) => <button key={company.ticker} onClick={() => setSelectedTicker(company.ticker)}><span><b>{company.ticker}</b><small>{company.name}</small></span><Move value={company.changePercent} /></button>)}
          </section>
        </aside>

        <section className="exchange-tools" aria-label="Merchant tools">
          <article className="tool-card price-book" id="price-book">
            <div className="section-label">Merchant’s Price Book</div>
            <h2>Individual Minecraft wares</h2>
            <p className="tool-intro">Search {number(MINECRAFT_ITEM_COUNT, 0)} individual vanilla {MINECRAFT_VERSION} items. Each entry shows its responsible issuer and linked simulated market quote.</p>
            <label className="tool-search"><span className="sr-only">Search the Merchant’s Price Book</span><input value={wareQuery} onChange={(event) => setWareQuery(event.target.value)} placeholder="Try redstone, maps, wool…" /></label>
            <div className="suggestion-row" aria-label="Suggested wares">{PRICE_BOOK_SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => setWareQuery(suggestion)}>{suggestion}</button>)}</div>
            <div className="price-book-count" aria-live="polite">{wareQuery.trim() ? `${priceBookResults.total} matching individual items${priceBookResults.total > priceBookResults.entries.length ? ` · showing first ${priceBookResults.entries.length}` : ""}` : "Featured individual items"}</div>
            <div className="price-book-results" aria-live="polite">
              {priceBookResults.entries.map(({ item, company }) => (
                <button className="price-book-entry" key={item.id} onClick={() => openCharter(company.ticker)}>
                  <span><strong>{item.name}</strong><code>minecraft:{item.id}</code></span>
                  <span className="price-book-quote"><small>Linked quote · {company.ticker}</small><b>{number(company.price)} Crowns</b><Move value={company.changePercent} /></span>
                  <small>{company.name} · {company.sector}</small>
                </button>
              ))}
              {priceBookResults.entries.length === 0 && <p className="empty-note">No individual Minecraft item matches that search.</p>}
            </div>
          </article>

          <article className="tool-card personal-ledger" id="my-ledger">
            <div className="section-label">Personal Merchant’s Ledger</div>
            <h2>Your watched companies</h2>
            <p className="tool-intro">Pinned only on this device. Nothing here is sent to Minecraft or the public exchange.</p>
            <button className="action-button ledger-add" onClick={() => toggleLedger(selected.ticker)}>{ledgerTickers.includes(selected.ticker) ? `Remove ${selected.ticker}` : `Add ${selected.ticker}`}</button>
            <div className="ledger-list" aria-live="polite">
              {ledgerCompanies.map((company) => (
                <div className="ledger-entry" key={company.ticker}>
                  <button onClick={() => openCharter(company.ticker)}><span><b>{company.ticker}</b><strong>{company.name}</strong></span><span><b>{number(company.price)}</b><Move value={company.changePercent} /></span></button>
                  <button className="ledger-remove" onClick={() => toggleLedger(company.ticker)} aria-label={`Remove ${company.name} from my ledger`}>Remove</button>
                </div>
              ))}
              {ledgerCompanies.length === 0 && <p className="empty-note">Your ledger is empty. Add the selected company or open a charter to pin one.</p>}
            </div>
          </article>
        </section>

        <section className="listings" id="official-list" aria-labelledby="listings-title">
          <div className="listings-head">
            <div><div className="section-label">Daily Official List</div><h2 id="listings-title">Guilds and Companies</h2></div>
            <label className="search"><span className="sr-only">Search guilds, trades and wares</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guild, trade or ware" /></label>
          </div>
          <div className="market-table" role="table" aria-label="Listed companies">
            <div className="market-row table-header" role="row"><span>Issuer</span><span>Last</span><span>Change</span><span>Volume</span><span>Principal trade</span></div>
            {filtered.map((company) => (
              <button className={`market-row ${selected.ticker === company.ticker ? "selected" : ""}`} role="row" key={company.ticker} onClick={() => setSelectedTicker(company.ticker)}>
                <span className="company-cell"><b>{company.ticker}</b><span><strong>{company.name}</strong><small>{company.sector}</small></span></span>
                <span data-label="Price"><strong>{number(company.price)}</strong><small> Crowns</small></span>
                <span data-label="Session"><Move value={company.changePercent} /></span>
                <span data-label="Volume">{compact(company.volume)}</span>
                <span className="influence-cell" data-label="Influences">{company.influence}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="empty-note listings-empty" role="status">No listed company matches “{query.trim()}”. Try a ticker, guild, sector, or trade.</p>}
          </div>
        </section>
      </div>

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
                <div><dt>Recorded history</dt><dd>{snapshot.recordedFrom ? `From ${easternDate(snapshot.recordedFrom)} ${easternZone(snapshot.recordedFrom)}` : "Awaiting ledger"}</dd></div>
                <div><dt>Recorded observations</dt><dd>{snapshot.recordedObservations}</dd></div>
              </dl>
              <blockquote>{record.note}</blockquote>
              <div className="charter-actions"><button className="action-button" onClick={() => toggleLedger(charterCompany.ticker)}>{isPinned ? "Remove from my ledger" : "Add to my ledger"}</button><button className="action-button secondary" onClick={() => setCharterTicker(null)}>Return to the market</button></div>
            </section>
          </div>
        );
      })()}

      <footer>
        <div><strong>Royal Exchange</strong><span>Fictional Crown market · continuously simulated · observations recorded as published</span><a className="api-link" href="/api/market">Public market data API</a><a className="api-link" href="/openapi.json">ChatGPT OpenAPI schema</a></div>
        <div className="sources"><span>Historical names:</span><a href="https://www.cityoflondon.gov.uk/about-us/law-historic-governance/livery-companies" target="_blank" rel="noreferrer">City guilds</a><a href="https://www.londononline.co.uk/cityoflondon/streets/" target="_blank" rel="noreferrer">Trade streets</a><a href="https://merchantstaplers.co.uk/history-of-the-company/" target="_blank" rel="noreferrer">The Staple</a></div>
        <div><span>As of</span><time dateTime={snapshot.asOf}>{easternTime(snapshot.asOf)} {easternZone(snapshot.asOf)}</time></div>
      </footer>
    </main>
  );
}
