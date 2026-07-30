"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ListedCompany, MarketHistoryPoint, MarketSnapshot } from "../lib/market";
import { charterRecord, PRICE_BOOK_SUGGESTIONS, standingFor } from "./market-records";

const LEDGER_KEY = "royal-exchange-merchant-ledger-v1";

function number(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${number(value)}${suffix}`;
}

function utcDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function utcTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value));
}

function Chart({ points, positive }: { points: MarketHistoryPoint[]; positive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

      context.strokeStyle = "rgba(92, 62, 31, .18)";
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
      const color = positive ? "#3c7755" : "#9e493d";
      const fade = positive ? "rgba(60, 119, 85, .03)" : "rgba(158, 73, 61, .03)";
      const gradient = context.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, positive ? "rgba(60, 119, 85, .28)" : "rgba(158, 73, 61, .26)");
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
  }, [points, positive]);

  if (points.length < 2) {
    return <div className="market-chart chart-recording" role="img" aria-label="Price history recording has started">Recording first observations</div>;
  }
  return <canvas ref={canvasRef} className="market-chart" aria-label="Recorded price history chart" />;
}

function Move({ value }: { value: number }) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return <span className={`move ${direction}`}>{signed(value, "%")}</span>;
}

export function MarketDashboard({ initialSnapshot }: { initialSnapshot: MarketSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedTicker, setSelectedTicker] = useState("STPL");
  const [seconds, setSeconds] = useState(60);
  const [query, setQuery] = useState("");
  const [wareQuery, setWareQuery] = useState("");
  const [ledgerTickers, setLedgerTickers] = useState<string[]>([]);
  const [ledgerReady, setLedgerReady] = useState(false);
  const [charterTicker, setCharterTicker] = useState<string | null>(null);

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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCharterTicker(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [charterTicker]);

  const selected = snapshot.companies.find((company) => company.ticker === selectedTicker) ?? snapshot.companies[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.companies;
    return snapshot.companies.filter((company) => `${company.ticker} ${company.name} ${company.sector} ${company.influence}`.toLowerCase().includes(needle));
  }, [query, snapshot.companies]);
  const leaders = [...snapshot.companies].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const priceBookResults = useMemo(() => {
    const needle = wareQuery.trim().toLowerCase();
    if (!needle) return snapshot.companies.slice(0, 6);
    return snapshot.companies.filter((company) => `${company.ticker} ${company.name} ${company.sector} ${company.influence}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [snapshot.companies, wareQuery]);
  const ledgerCompanies = ledgerTickers.map((ticker) => snapshot.companies.find((company) => company.ticker === ticker)).filter((company): company is ListedCompany => Boolean(company));
  const charterCompany = charterTicker ? snapshot.companies.find((company) => company.ticker === charterTicker) ?? null : null;

  const toggleLedger = (ticker: string) => {
    setLedgerTickers((current) => current.includes(ticker) ? current.filter((value) => value !== ticker) : [...current, ticker]);
  };

  const openCharter = (ticker: string) => {
    setSelectedTicker(ticker);
    setCharterTicker(ticker);
  };

  return (
    <main>
      <header className="masthead">
        <a className="brand" href="#top" aria-label="Royal Exchange home">
          <span className="brand-mark" aria-hidden="true">RE</span>
          <span><strong>Royal Exchange</strong><small>Market at Guildhall</small></span>
        </a>
        <div className="market-clock">
          <span className="live-dot" aria-hidden="true" />
          <span><strong>Simulation live</strong><small>{snapshot.historyMode === "recorded-ledger" ? "Recorded ledger" : "Ledger unavailable"} · {seconds > 0 ? `refresh in ${seconds}s` : "updating…"}</small></span>
        </div>
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
        <section className="overview" aria-labelledby="market-heading">
          <div className="eyebrow"><span>Royal Exchange Simulation · RXC</span><span>Continuous session</span></div>
          <div className="index-line">
            <div>
              <h1 id="market-heading">{number(snapshot.composite)}</h1>
              <p className={snapshot.compositeChange >= 0 ? "positive" : "negative"}>
                {signed(snapshot.compositeChange)} · {signed(snapshot.compositeChangePercent, "%")} today
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
            <Chart points={selected.history} positive={selected.change >= 0} />
            <div className="chart-labels"><span>{selected.history.length > 1 ? "First recorded" : "Recording started"}</span><span>Now</span></div>
            <div className="focus-actions">
              <button className="action-button" onClick={() => openCharter(selected.ticker)}>Read company charter</button>
              <button className="action-button secondary" onClick={() => toggleLedger(selected.ticker)}>{ledgerTickers.includes(selected.ticker) ? "Remove from my ledger" : "Add to my ledger"}</button>
            </div>
            <dl className="instrument-stats">
              <div><dt>Recorded baseline</dt><dd>{number(selected.previousClose)}</dd></div>
              <div><dt>Session open</dt><dd>{number(selected.open)}</dd></div>
              <div><dt>High / low</dt><dd>{number(selected.high)} / {number(selected.low)}</dd></div>
              <div><dt>Volume</dt><dd>{compact(selected.volume)}</dd></div>
            </dl>
          </div>
        </section>

        <aside className="market-rail" aria-label="Market briefing">
          <section className="briefing-card">
            <div className="section-label">Simulated market notice</div>
            <span className={`event-tone ${snapshot.event.tone}`}>{snapshot.event.tone === "positive" ? "Supportive" : snapshot.event.tone === "negative" ? "Adverse" : "Neutral"}</span>
            <h2>{snapshot.event.title}</h2>
            <p>{snapshot.event.description}</p>
            <small>Affected: {snapshot.event.sector}</small>
          </section>
          <section className="rail-card">
            <div className="section-label">Market summary</div>
            <dl className="rail-stats">
              <div><dt>Total volume</dt><dd>{compact(snapshot.totalVolume)}</dd></div>
              <div><dt>Listed issuers</dt><dd>{snapshot.companies.length}</dd></div>
              <div><dt>Item coverage</dt><dd>Broad vanilla families</dd></div>
              <div><dt>Price basis</dt><dd>Simulated · recorded</dd></div>
              <div><dt>Ledger</dt><dd>{snapshot.recordedFrom ? `Since ${utcDate(snapshot.recordedFrom)} UTC` : "Unavailable"}</dd></div>
              <div><dt>Recorded ticks</dt><dd>{snapshot.recordedObservations}</dd></div>
            </dl>
          </section>
          <section className="rail-card movers-card">
            <div className="section-label">Largest moves</div>
            {leaders.slice(0, 3).map((company) => <button key={company.ticker} onClick={() => setSelectedTicker(company.ticker)}><span><b>{company.ticker}</b><small>{company.name}</small></span><Move value={company.changePercent} /></button>)}
          </section>
        </aside>

        <section className="exchange-tools" aria-label="Merchant tools">
          <article className="tool-card price-book">
            <div className="section-label">Merchant’s Price Book</div>
            <h2>Find the market behind a ware</h2>
            <p className="tool-intro">Look up a trade good to find its chartered issuer and current simulated Crown reference.</p>
            <label className="tool-search"><span className="sr-only">Search the Merchant’s Price Book</span><input value={wareQuery} onChange={(event) => setWareQuery(event.target.value)} placeholder="Try redstone, maps, wool…" /></label>
            <div className="suggestion-row" aria-label="Suggested wares">{PRICE_BOOK_SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => setWareQuery(suggestion)}>{suggestion}</button>)}</div>
            <div className="price-book-results" aria-live="polite">
              {priceBookResults.map((company) => (
                <button className="price-book-entry" key={company.ticker} onClick={() => openCharter(company.ticker)}>
                  <span><b>{company.ticker}</b><strong>{company.name}</strong></span>
                  <span className="price-book-quote"><small>Reference</small><b>{number(company.price)} Crowns</b><Move value={company.changePercent} /></span>
                  <small>{company.influence}</small>
                </button>
              ))}
              {priceBookResults.length === 0 && <p className="empty-note">No chartered issuer matches that ware. Try a broader trade name.</p>}
            </div>
          </article>

          <article className="tool-card personal-ledger">
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

        <section className="listings" aria-labelledby="listings-title">
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
          </div>
        </section>
      </div>

      {charterCompany && (() => {
        const record = charterRecord(charterCompany);
        const isPinned = ledgerTickers.includes(charterCompany.ticker);
        return (
          <div className="charter-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCharterTicker(null); }}>
            <section className="charter-sheet" role="dialog" aria-modal="true" aria-labelledby="charter-title">
              <button className="charter-close" onClick={() => setCharterTicker(null)} aria-label="Close company charter">Close</button>
              <div className="charter-kicker">Fictional market charter · {record.register}</div>
              <div className="charter-heading"><span className="charter-seal" aria-hidden="true">{charterCompany.ticker.slice(0, 2)}</span><div><span>{charterCompany.ticker} · {charterCompany.sector}</span><h2 id="charter-title">{charterCompany.name}</h2><p>{record.seat}</p></div></div>
              <p className="charter-preamble">Entered in the simulated Royal Exchange register as the recognized market account for {charterCompany.influence.toLowerCase()}.</p>
              <dl className="charter-facts">
                <div><dt>Principal wares</dt><dd>{charterCompany.influence}</dd></div>
                <div><dt>Present standing</dt><dd>{standingFor(charterCompany)}</dd></div>
                <div><dt>Reference price</dt><dd>{number(charterCompany.price)} Crowns</dd></div>
                <div><dt>Session movement</dt><dd><Move value={charterCompany.changePercent} /></dd></div>
                <div><dt>Recorded history</dt><dd>{snapshot.recordedFrom ? `From ${utcDate(snapshot.recordedFrom)} UTC` : "Awaiting ledger"}</dd></div>
                <div><dt>Recorded observations</dt><dd>{snapshot.recordedObservations}</dd></div>
              </dl>
              <blockquote>{record.note}</blockquote>
              <div className="charter-actions"><button className="action-button" onClick={() => toggleLedger(charterCompany.ticker)}>{isPinned ? "Remove from my ledger" : "Add to my ledger"}</button><button className="action-button secondary" onClick={() => setCharterTicker(null)}>Return to the market</button></div>
            </section>
          </div>
        );
      })()}

      <footer>
        <div><strong>Royal Exchange</strong><span>Simulated market · recorded observations</span><a className="api-link" href="/api/market">Public data feed</a></div>
        <div className="sources"><span>Historical names:</span><a href="https://www.cityoflondon.gov.uk/about-us/law-historic-governance/livery-companies" target="_blank" rel="noreferrer">City guilds</a><a href="https://www.londononline.co.uk/cityoflondon/streets/" target="_blank" rel="noreferrer">Trade streets</a><a href="https://merchantstaplers.co.uk/history-of-the-company/" target="_blank" rel="noreferrer">The Staple</a></div>
        <div><span>As of</span><time dateTime={snapshot.asOf}>{utcTime(snapshot.asOf)} UTC</time></div>
      </footer>
    </main>
  );
}
