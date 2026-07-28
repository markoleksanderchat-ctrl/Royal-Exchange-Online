"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketHistoryPoint, MarketSnapshot } from "../lib/market";

function number(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${number(value)}${suffix}`;
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

  return <canvas ref={canvasRef} className="market-chart" aria-label="24 hour price chart" />;
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
    const countdownTimer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((new Date(snapshot.nextUpdateAt).getTime() - Date.now()) / 1000)));
    }, 1_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(countdownTimer);
    };
  }, [snapshot.nextUpdateAt]);

  const selected = snapshot.companies.find((company) => company.ticker === selectedTicker) ?? snapshot.companies[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.companies;
    return snapshot.companies.filter((company) => `${company.ticker} ${company.name} ${company.sector}`.toLowerCase().includes(needle));
  }, [query, snapshot.companies]);
  const leaders = [...snapshot.companies].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return (
    <main>
      <header className="masthead">
        <a className="brand" href="#top" aria-label="Royal Exchange home">
          <span className="brand-mark" aria-hidden="true">RE</span>
          <span><strong>Royal Exchange</strong><small>Market at Guildhall</small></span>
        </a>
        <div className="market-clock">
          <span className="live-dot" aria-hidden="true" />
          <span><strong>Market open</strong><small>Indicative prices · refresh in {seconds}s</small></span>
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
          <div className="eyebrow"><span>Royal Exchange Composite · RXC</span><span>Continuous session</span></div>
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
            <div className="chart-labels"><span>24 hours ago</span><span>Now</span></div>
            <dl className="instrument-stats">
              <div><dt>Previous close</dt><dd>{number(selected.previousClose)}</dd></div>
              <div><dt>Session open</dt><dd>{number(selected.open)}</dd></div>
              <div><dt>High / low</dt><dd>{number(selected.high)} / {number(selected.low)}</dd></div>
              <div><dt>Volume</dt><dd>{compact(selected.volume)}</dd></div>
            </dl>
          </div>
        </section>

        <aside className="market-rail" aria-label="Market briefing">
          <section className="briefing-card">
            <div className="section-label">Market notice</div>
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
              <div><dt>Price basis</dt><dd>Indicative</dd></div>
            </dl>
          </section>
          <section className="rail-card movers-card">
            <div className="section-label">Largest moves</div>
            {leaders.slice(0, 3).map((company) => <button key={company.ticker} onClick={() => setSelectedTicker(company.ticker)}><span><b>{company.ticker}</b><small>{company.name}</small></span><Move value={company.changePercent} /></button>)}
          </section>
        </aside>

        <section className="listings" aria-labelledby="listings-title">
          <div className="listings-head">
            <div><div className="section-label">Daily Official List</div><h2 id="listings-title">Guilds and Companies</h2></div>
            <label className="search"><span className="sr-only">Search issuers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issuer or trade" /></label>
          </div>
          <div className="market-table" role="table" aria-label="Listed companies">
            <div className="market-row table-header" role="row"><span>Issuer</span><span>Last</span><span>Change</span><span>Volume</span><span>Principal trade</span></div>
            {filtered.map((company) => (
              <button className={`market-row ${selected.ticker === company.ticker ? "selected" : ""}`} role="row" key={company.ticker} onClick={() => setSelectedTicker(company.ticker)}>
                <span className="company-cell"><b>{company.ticker}</b><span><strong>{company.name}</strong><small>{company.sector}</small></span></span>
                <span data-label="Price"><strong>{number(company.price)}</strong><small> Crowns</small></span>
                <span data-label="24h"><Move value={company.changePercent} /></span>
                <span data-label="Volume">{compact(company.volume)}</span>
                <span className="influence-cell" data-label="Influences">{company.influence}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer>
        <div><strong>Royal Exchange</strong><span>Fictional market · indicative values</span><a className="api-link" href="/api/market">Public data feed</a></div>
        <div className="sources"><span>Historical terminology:</span><a href="https://www.cityoflondon.gov.uk/about-us/law-historic-governance/livery-companies" target="_blank" rel="noreferrer">Livery companies</a><a href="https://www.hanse.org/en/the-medieval-hanseatic-league" target="_blank" rel="noreferrer">Hanseatic trade</a></div>
        <div><span>As of</span><time dateTime={snapshot.asOf}>{new Date(snapshot.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</time></div>
      </footer>
    </main>
  );
}
