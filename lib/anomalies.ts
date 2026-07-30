import type { ActiveMarketAnomaly, AnomalySeverity, AnomalyShape } from "./market";

const MINUTE = 60_000;

type AnomalyTemplate = {
  key: string;
  title: string;
  description: string;
  tone: "positive" | "negative";
  sector: string;
  tickers: string[];
  direction: 1 | -1;
  shapes: AnomalyShape[];
};

type AnomalyRow = {
  id: string;
  template_key: string;
  title: string;
  description: string;
  tone: "positive" | "negative";
  severity: AnomalySeverity;
  sector: string;
  affected_tickers: string;
  peak_impact_percent: number;
  shape: AnomalyShape;
  started_at: number;
  peaks_at: number;
  ends_at: number;
};

type ScheduleRow = { next_anomaly_at: number; generation: number };

const TEMPLATES: AnomalyTemplate[] = [
  { key: "nether-convoy", title: "Nether convoy overdue", description: "A chartered convoy has failed to clear the eastern gate; rare imports are being marked sharply higher.", tone: "positive", sector: "Foreign Wares · Brewing", tickers: ["ADVT", "APOT"], direction: 1, shapes: ["shock", "squeeze"] },
  { key: "redstone-cascade", title: "Redstone workshops halted", description: "A cascading mechanism failure has stopped several workshops and tightened component supply.", tone: "positive", sector: "Redstone · Mechanisms", tickers: ["WIRE", "FOND"], direction: 1, shapes: ["shock", "wave"] },
  { key: "royal-armament", title: "Royal armament order sealed", description: "The Guildhall has placed an exceptional order for armour, tools and worked iron.", tone: "positive", sector: "Armour · Tools · Metals", tickers: ["ARMR", "CUTL", "IRON"], direction: 1, shapes: ["squeeze", "wave"] },
  { key: "bumper-harvest", title: "Granaries report a bumper harvest", description: "Unusually heavy receipts are flooding the provision markets and forcing food prices lower.", tone: "negative", sector: "Food · Horticulture · Provisions", tickers: ["BAKR", "FRUT", "GARD", "PEPR"], direction: -1, shapes: ["wave", "squeeze"] },
  { key: "garden-blight", title: "Market-garden blight confirmed", description: "Wardens report a fast-moving blight among crops and orchard stock; merchants are rationing supply.", tone: "positive", sector: "Plants · Horticulture · Provisions", tickers: ["GARD", "FRUT", "PEPR"], direction: 1, shapes: ["shock", "squeeze"] },
  { key: "diamond-vein", title: "Great diamond vein assayed", description: "A newly registered strike has released exceptional gem stock onto West Chepe.", tone: "negative", sector: "Bullion", tickers: ["GDSM"], direction: -1, shapes: ["shock", "wave"] },
  { key: "end-route", title: "End passage reopened", description: "Merchant Adventurers report that the eastern passage is open and delayed rare wares are arriving at once.", tone: "negative", sector: "Foreign Wares", tickers: ["ADVT"], direction: -1, shapes: ["shock", "wave"] },
  { key: "quarry-collapse", title: "Guild quarry face collapses", description: "Stone extraction has stopped pending inspection, tightening masonry and tile inventories.", tone: "positive", sector: "Building · Ceramics", tickers: ["MSON", "BRIK"], direction: 1, shapes: ["shock", "squeeze"] },
  { key: "river-blockade", title: "Thames passage obstructed", description: "A wreck below the bridge has delayed fish, salt and ship-borne wares throughout the city.", tone: "positive", sector: "Victuals · Marine Wares · Transport", tickers: ["FISH", "SALT", "SHIP"], direction: 1, shapes: ["shock", "wave"] },
  { key: "timber-release", title: "Northern timber levy released", description: "A large bonded stock of logs and finished joinery has cleared the city gate.", tone: "negative", sector: "Timber · Joinery · Containers", tickers: ["CARP", "JOIN", "COOP"], direction: -1, shapes: ["wave", "squeeze"] },
  { key: "coal-fire", title: "Colliery fire closes the lower workings", description: "Fuel factors warn that replacement deliveries will be scarce until the workings are secured.", tone: "positive", sector: "Fuel · Metals", tickers: ["COLL", "IRON"], direction: 1, shapes: ["shock", "squeeze"] },
  { key: "wax-feast", title: "Civic feast draws down wax stores", description: "Chandlers report extraordinary demand for candles and decorated household goods.", tone: "positive", sector: "Lighting · Furnishings", tickers: ["WAXC", "UPHL"], direction: 1, shapes: ["squeeze", "wave"] },
  { key: "foreign-embargo", title: "Foreign wares embargo proclaimed", description: "The council has suspended selected imports while seals and manifests are examined.", tone: "positive", sector: "Foreign Wares · Textiles · Provisions", tickers: ["ADVT", "MRCR", "PEPR"], direction: 1, shapes: ["shock", "squeeze"] },
  { key: "leather-glut", title: "Hide fair clears above estimate", description: "An unusually large hide fair has left leatherworkers and skinners heavily supplied.", tone: "negative", sector: "Peltry · Leatherwork · Horse Gear", tickers: ["SKIN", "CORD", "LORN"], direction: -1, shapes: ["wave", "squeeze"] },
  { key: "fletcher-muster", title: "City watch orders fresh missile stock", description: "Bowyers and fletchers have received an urgent muster contract from the city watch.", tone: "positive", sector: "Arms", tickers: ["BOWY", "FLET"], direction: 1, shapes: ["shock", "squeeze"] },
  { key: "glass-breakage", title: "Glasshouse furnace fails", description: "A furnace breach has destroyed finished panes and stopped beacon-glass production.", tone: "positive", sector: "Glass · Fuel", tickers: ["GLAZ", "COLL"], direction: 1, shapes: ["shock", "wave"] },
  { key: "scriptorium-auction", title: "Royal library releases duplicates", description: "Books, maps and written records are entering the market through a supervised auction.", tone: "negative", sector: "Books and Maps", tickers: ["SCRV"], direction: -1, shapes: ["wave", "squeeze"] },
  { key: "festival-charter", title: "Guild festival charter granted", description: "A citywide festival is drawing demand toward music, colour and household decoration.", tone: "positive", sector: "Music · Colour · Furnishings", tickers: ["MUSC", "DYER", "UPHL"], direction: 1, shapes: ["wave", "squeeze"] },
];

const SEVERITIES: Array<{ value: AnomalySeverity; weight: number; impact: [number, number]; duration: [number, number] }> = [
  { value: "notice", weight: 52, impact: [2.5, 5.5], duration: [50, 100] },
  { value: "material", weight: 30, impact: [6, 11], duration: [90, 190] },
  { value: "severe", weight: 15, impact: [12, 20], duration: [150, 300] },
  { value: "crisis", weight: 3, impact: [21, 30], duration: [240, 420] },
];

export const anomalySchemaStatements = [
  `CREATE TABLE IF NOT EXISTS market_anomaly_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_anomaly_at INTEGER NOT NULL,
    generation INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS market_anomalies (
    id TEXT PRIMARY KEY,
    template_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tone TEXT NOT NULL,
    severity TEXT NOT NULL,
    sector TEXT NOT NULL,
    affected_tickers TEXT NOT NULL,
    peak_impact_percent REAL NOT NULL,
    shape TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    peaks_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS market_anomalies_window_idx ON market_anomalies (started_at, ends_at)",
] as const;

function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4_294_967_296;
}

function between(random: () => number, [minimum, maximum]: [number, number]) {
  return minimum + (maximum - minimum) * random();
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function pickSeverity(random: () => number) {
  let roll = random() * 100;
  for (const severity of SEVERITIES) {
    roll -= severity.weight;
    if (roll < 0) return severity;
  }
  return SEVERITIES[0];
}

function nextDelay(random: () => number, severity?: AnomalySeverity) {
  const minimum = severity === "crisis" ? 150 : 45;
  const maximum = severity === "crisis" ? 390 : 270;
  const curved = Math.pow(random(), 1.45);
  return Math.round((minimum + (maximum - minimum) * curved) * MINUTE);
}

export function createRandomAnomaly(at: number, generation: number, random: () => number = secureRandom): ActiveMarketAnomaly {
  const template = pick(random, TEMPLATES);
  const severity = pickSeverity(random);
  const duration = Math.round(between(random, severity.duration) * MINUTE);
  const peakRatio = 0.18 + random() * 0.24;
  const impact = Number((between(random, severity.impact) * template.direction).toFixed(2));
  return {
    id: `rxa-${at.toString(36)}-${generation.toString(36)}`,
    templateKey: template.key,
    title: template.title,
    description: template.description,
    tone: template.tone,
    severity: severity.value,
    sector: template.sector,
    affectedTickers: template.tickers,
    peakImpactPercent: impact,
    shape: pick(random, template.shapes),
    startedAtEpochMillis: at,
    peaksAtEpochMillis: at + Math.round(duration * peakRatio),
    endsAtEpochMillis: at + duration,
  };
}

function fromRow(row: AnomalyRow): ActiveMarketAnomaly {
  return {
    id: row.id,
    templateKey: row.template_key,
    title: row.title,
    description: row.description,
    tone: row.tone,
    severity: row.severity,
    sector: row.sector,
    affectedTickers: JSON.parse(row.affected_tickers) as string[],
    peakImpactPercent: row.peak_impact_percent,
    shape: row.shape,
    startedAtEpochMillis: row.started_at,
    peaksAtEpochMillis: row.peaks_at,
    endsAtEpochMillis: row.ends_at,
  };
}

export async function resolveMarketAnomalies(db: D1Database, at = Date.now()): Promise<ActiveMarketAnomaly[]> {
  await db.batch(anomalySchemaStatements.map((statement) => db.prepare(statement)));
  await db.prepare("INSERT OR IGNORE INTO market_anomaly_state (id, next_anomaly_at, generation) VALUES (1, ?, 0)")
    .bind(at + nextDelay(secureRandom)).run();
  const schedule = await db.prepare("SELECT next_anomaly_at, generation FROM market_anomaly_state WHERE id = 1")
    .first<ScheduleRow>();

  if (schedule && at >= schedule.next_anomaly_at) {
    const anomaly = createRandomAnomaly(at, schedule.generation + 1);
    const nextAt = at + nextDelay(secureRandom, anomaly.severity);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO market_anomalies
        (id, template_key, title, description, tone, severity, sector, affected_tickers,
         peak_impact_percent, shape, started_at, peaks_at, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(anomaly.id, anomaly.templateKey, anomaly.title, anomaly.description, anomaly.tone,
          anomaly.severity, anomaly.sector, JSON.stringify(anomaly.affectedTickers), anomaly.peakImpactPercent,
          anomaly.shape, anomaly.startedAtEpochMillis, anomaly.peaksAtEpochMillis, anomaly.endsAtEpochMillis),
      db.prepare(`UPDATE market_anomaly_state SET next_anomaly_at = ?, generation = ?
        WHERE id = 1 AND next_anomaly_at = ? AND generation = ?`)
        .bind(nextAt, schedule.generation + 1, schedule.next_anomaly_at, schedule.generation),
    ]);
  }

  const active = await db.prepare(`SELECT id, template_key, title, description, tone, severity, sector, affected_tickers,
      peak_impact_percent, shape, started_at, peaks_at, ends_at
    FROM market_anomalies WHERE started_at <= ? AND ends_at > ? ORDER BY started_at DESC LIMIT 3`)
    .bind(at, at).all<AnomalyRow>();
  return active.results.map(fromRow);
}
