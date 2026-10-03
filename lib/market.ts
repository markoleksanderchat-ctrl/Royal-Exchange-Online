export const MARKET_MODEL_VERSION = "royal-exchange-clearing-v4" as const;

export type MarketHistoryPoint = {
  time: string;
  value: number;
};

export type ListedCompany = {
  ticker: string;
  name: string;
  sector: string;
  influence: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  fairValue: number;
  trades: number;
  open: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  history: MarketHistoryPoint[];
};

export type MarketEvent = {
  id: string;
  title: string;
  description: string;
  tone: "positive" | "negative" | "neutral";
  severity: "routine" | AnomalySeverity;
  phase: "quiet" | "onset" | "peak" | "recovery";
  sector: string;
  affectedTickers: string[];
  impactPercent: number;
  startedAt: string | null;
  endsAt: string | null;
};

export type AnomalySeverity = "notice" | "material" | "severe" | "crisis";
export type AnomalyShape = "shock" | "squeeze" | "wave";

export type ActiveMarketAnomaly = {
  id: string;
  templateKey: string;
  title: string;
  description: string;
  tone: "positive" | "negative";
  severity: AnomalySeverity;
  sector: string;
  affectedTickers: string[];
  peakImpactPercent: number;
  shape: AnomalyShape;
  startedAtEpochMillis: number;
  peaksAtEpochMillis: number;
  endsAtEpochMillis: number;
};

export type MarketSnapshot = {
  exchange: "Royal Exchange";
  mode: "autonomous-wall-clock";
  simulation: true;
  modelVersion: typeof MARKET_MODEL_VERSION;
  modelStartedAt: string | null;
  historyMode: "recorded-ledger" | "unavailable";
  recordedFrom: string | null;
  recordedObservations: number;
  currency: "Crown";
  status: "OPEN";
  asOf: string;
  tick: number;
  nextUpdateAt: string;
  composite: number;
  compositeChange: number;
  compositeChangePercent: number;
  totalVolume: number;
  advancing: number;
  declining: number;
  unchanged: number;
  event: MarketEvent;
  events: MarketEvent[];
  companies: ListedCompany[];
};

export type CompanyDefinition = {
  ticker: string;
  name: string;
  sector: string;
  influence: string;
  base: number;
  volatility: number;
  weight: number;
  phase: number;
};

export type MarketParticipant = "market-maker" | "guild-fund" | "merchant-house" | "factor" | "speculator";

export type IssuerMarketState = {
  ticker: string;
  lastTick: number;
  lastPrice: number;
  fairValue: number;
  earningsIndex: number;
  bookValueIndex: number;
  debtRatio: number;
  dividendYield: number;
  demandIndex: number;
  supplyIndex: number;
  momentum: number;
  volatility: number;
  marketMakerInventory: number;
  sessionDay: string;
  sessionOpen: number;
  sessionHigh: number;
  sessionLow: number;
  sessionVolume: number;
  previousClose: number;
  totalTrades: number;
};

export type ClearingTrade = {
  ticker: string;
  tick: number;
  observedAt: string;
  price: number;
  bid: number;
  ask: number;
  quantity: number;
  notional: number;
  tradeCount: number;
  buyerMix: Partial<Record<MarketParticipant, number>>;
  sellerMix: Partial<Record<MarketParticipant, number>>;
  fairValue: number;
  earningsIndex: number;
  demandIndex: number;
  supplyIndex: number;
};

export type ClearingResult = {
  state: IssuerMarketState;
  trade: ClearingTrade;
  company: ListedCompany;
};

type Order = {
  participant: MarketParticipant;
  side: "buy" | "sell";
  limit: number;
  quantity: number;
};

export const MINUTE = 60_000;
export const MARKET_SESSION_MINUTES = 5;
export const MAX_HISTORY_POINTS = 576;
const MARKET_TIME_ZONE = "America/New_York";
const MARKET_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MARKET_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function dateParts(formatter: Intl.DateTimeFormat, value: Date) {
  return Object.fromEntries(formatter.formatToParts(value)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

export function marketSessionDayAt(value: Date | number) {
  const parts = dateParts(MARKET_DAY_FORMATTER, value instanceof Date ? value : new Date(value));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function easternOffsetAt(epochMillis: number) {
  const parts = dateParts(MARKET_OFFSET_FORMATTER, new Date(epochMillis));
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return representedAsUtc - Math.floor(epochMillis / 1_000) * 1_000;
}

export function marketSessionStartTick(value: Date) {
  const [year, month, day] = marketSessionDayAt(value).split("-").map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const firstEstimate = localMidnightAsUtc - easternOffsetAt(localMidnightAsUtc);
  const corrected = localMidnightAsUtc - easternOffsetAt(firstEstimate);
  return Math.floor(corrected / MINUTE);
}

export const COMPANIES: CompanyDefinition[] = [
  { ticker: "STPL", name: "Browne of Calais Staple", sector: "Staple Trade", influence: "Wool, skins, lead & tin", base: 84.2, volatility: 0.052, weight: 1.2, phase: 0.3 },
  { ticker: "MRCR", name: "Whittington Mercery", sector: "Textiles", influence: "Fine cloth & imported silk", base: 126.4, volatility: 0.041, weight: 0.95, phase: 1.2 },
  { ticker: "PEPR", name: "Soper Lane Pepper House", sector: "Provisions", influence: "Spices, grain & preserved goods", base: 57.8, volatility: 0.061, weight: 1.05, phase: 2.4 },
  { ticker: "FISH", name: "Walworth & Lovekyn Fish House", sector: "Victuals", influence: "Fish, salt & river trade", base: 112.6, volatility: 0.082, weight: 1.25, phase: 3.1 },
  { ticker: "IRON", name: "Ironmonger Lane Company", sector: "Metals", influence: "Iron, copper, tools & armour", base: 43.7, volatility: 0.034, weight: 1.1, phase: 4.4 },
  { ticker: "GDSM", name: "West Chepe Goldsmiths", sector: "Bullion", influence: "Gold, emerald, diamond, lapis, amethyst & gems", base: 68.3, volatility: 0.044, weight: 0.9, phase: 5.2 },
  { ticker: "WAXC", name: "Candlewick Street Chandlery", sector: "Lighting", influence: "Beeswax & candles", base: 76.9, volatility: 0.038, weight: 1, phase: 2 },
  { ticker: "SKIN", name: "St Mary Axe Skinners", sector: "Peltry", influence: "Furs, hides & leather", base: 91.5, volatility: 0.072, weight: 1.1, phase: 0.8 },
  { ticker: "CORD", name: "Cordwainer Street Leatherhouse", sector: "Leatherwork", influence: "Fine shoes & worked leather", base: 104.8, volatility: 0.088, weight: 0.8, phase: 3.8 },
  { ticker: "MSON", name: "Eastcheap Masonry Yard", sector: "Building", influence: "Stone, brick & lime", base: 98.1, volatility: 0.058, weight: 1, phase: 5.8 },
  { ticker: "CARP", name: "London Wall Carpenters", sector: "Timber", influence: "Logs, planks, saplings, leaves & bamboo", base: 72.4, volatility: 0.046, weight: 1.08, phase: 0.55 },
  { ticker: "JOIN", name: "Aldersgate Joinery", sector: "Joinery", influence: "Doors, trapdoors, stairs, slabs, fences, gates & signs", base: 64.8, volatility: 0.043, weight: 0.92, phase: 1.45 },
  { ticker: "COOP", name: "Thames Street Cooperage", sector: "Containers", influence: "Barrels, chests, bowls, buckets & storage", base: 58.7, volatility: 0.039, weight: 0.88, phase: 2.75 },
  { ticker: "GLAZ", name: "Southwark Glass House", sector: "Glass", influence: "Glass, panes, bottles, tinted glass & beacons", base: 88.3, volatility: 0.054, weight: 0.82, phase: 4.7 },
  { ticker: "BRIK", name: "Aldgate Tile Yard", sector: "Ceramics", influence: "Bricks, terracotta, concrete, mud & pottery", base: 69.1, volatility: 0.047, weight: 1.02, phase: 5.45 },
  { ticker: "DYER", name: "Walbrook Dye House", sector: "Colour", influence: "Dyes, coloured wool, banners, carpets & glazed terracotta", base: 74.6, volatility: 0.063, weight: 0.79, phase: 0.95 },
  { ticker: "HABD", name: "West Chepe Haberdashery", sector: "Smallwares", influence: "String, cloth, patterns, leads & name tags", base: 55.9, volatility: 0.042, weight: 0.74, phase: 1.85 },
  { ticker: "BOWY", name: "Wood Street Bowyers", sector: "Arms", influence: "Bows, crossbows & bow materials", base: 81.2, volatility: 0.059, weight: 0.84, phase: 2.25 },
  { ticker: "FLET", name: "St Mary Axe Fletchers", sector: "Arms", influence: "Arrows, tipped arrows, flint, feathers & rockets", base: 61.3, volatility: 0.067, weight: 0.81, phase: 3.45 },
  { ticker: "CUTL", name: "Pope's Head Cutlery", sector: "Tools", influence: "Swords, axes, pickaxes, shovels, hoes & shears", base: 93.8, volatility: 0.056, weight: 1.07, phase: 4.15 },
  { ticker: "ARMR", name: "Coleman Street Armoury", sector: "Armour", influence: "Armour, shields, helmets & smithing templates", base: 109.4, volatility: 0.064, weight: 1.12, phase: 5.05 },
  { ticker: "APOT", name: "Bucklersbury Apothecary", sector: "Brewing", influence: "Potions, brewing stands, reagents & creature drops", base: 118.7, volatility: 0.091, weight: 0.91, phase: 0.15 },
  { ticker: "BAKR", name: "Bread Street Bakehouse", sector: "Food", influence: "Bread, cakes, cookies, pies & baked food", base: 41.8, volatility: 0.031, weight: 0.98, phase: 1.65 },
  { ticker: "BUTR", name: "Monkwell Street Butchers", sector: "Food", influence: "Raw and cooked meat, stew & animal produce", base: 49.6, volatility: 0.038, weight: 1.01, phase: 2.95 },
  { ticker: "POUL", name: "Poultry Market Victuallers", sector: "Food", influence: "Eggs, chicken, rabbit, feathers & nests", base: 37.9, volatility: 0.044, weight: 0.77, phase: 3.75 },
  { ticker: "FRUT", name: "Gracechurch Fruit Market", sector: "Horticulture", influence: "Apples, berries, melons, pumpkins, cocoa & sugar cane", base: 45.2, volatility: 0.049, weight: 0.96, phase: 4.95 },
  { ticker: "SALT", name: "Queenhithe Salt House", sector: "Marine Wares", influence: "Prismarine, coral, sponge, kelp, sea pickles & shells", base: 77.5, volatility: 0.073, weight: 0.86, phase: 5.65 },
  { ticker: "SHIP", name: "Ratcliff Shipwrights", sector: "Transport", influence: "Boats, chest boats, bamboo rafts & water transport", base: 86.1, volatility: 0.051, weight: 0.83, phase: 0.72 },
  { ticker: "SCRV", name: "Chancery Lane Scriveners", sector: "Books and Maps", influence: "Paper, books, maps, enchanted books & written records", base: 68.9, volatility: 0.045, weight: 0.89, phase: 1.98 },
  { ticker: "HORN", name: "London Bridge Horners", sector: "Animal Wares", influence: "Horn, bone, scutes, shells, teeth & trophies", base: 73.7, volatility: 0.062, weight: 0.71, phase: 2.62 },
  { ticker: "LORN", name: "Basinghall Loriners", sector: "Horse Gear", influence: "Saddles, horse armour, leads, fishing rods & tack", base: 82.6, volatility: 0.058, weight: 0.78, phase: 3.88 },
  { ticker: "FOND", name: "Lothbury Foundry", sector: "Mechanisms", influence: "Bells, cauldrons, hoppers, rails, minecarts, chains & anvils", base: 102.3, volatility: 0.069, weight: 1.14, phase: 4.52 },
  { ticker: "ADVT", name: "Merchant Adventurers of York", sector: "Foreign Wares", influence: "Nether, End, quartz, glowstone, obsidian, chorus, shulker, elytra, trial keys, mace & rare wares", base: 137.8, volatility: 0.108, weight: 0.93, phase: 5.92 },
  { ticker: "WIRE", name: "Blanch Appleton Wiredrawers", sector: "Redstone", influence: "Redstone, pistons, observers, dispensers, lamps, sensors & sculk", base: 114.2, volatility: 0.086, weight: 1.19, phase: 0.38 },
  { ticker: "MUSC", name: "Bishopsgate Minstrels", sector: "Music", influence: "Music discs, jukeboxes, note blocks & goat horns", base: 66.4, volatility: 0.057, weight: 0.69, phase: 2.38 },
  { ticker: "GARD", name: "Coleman Street Gardeners", sector: "Plants", influence: "Seeds, crops, flowers, vines, moss, fungi & decorative plants", base: 52.8, volatility: 0.041, weight: 1.04, phase: 4.32 },
  { ticker: "COLL", name: "Newcastle Colliers", sector: "Fuel", influence: "Coal, charcoal, torches, furnaces, campfires & smelting fuel", base: 79.4, volatility: 0.052, weight: 1.09, phase: 1.18 },
  { ticker: "UPHL", name: "Cornhill Upholders", sector: "Furnishings", influence: "Beds, paintings, item frames, armour stands & household decoration", base: 63.6, volatility: 0.046, weight: 0.76, phase: 3.18 },
];

const PARTICIPANTS: MarketParticipant[] = ["market-maker", "guild-fund", "merchant-house", "factor", "speculator"];

function hash(value: number): number {
  return mixedUnit(Math.round(value * 1_000_003));
}

function mixedUnit(seed: number) {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

function tickerSeed(ticker: string) {
  return [...ticker].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

function unit(tick: number, ticker: string, salt: number) {
  return mixedUnit(Math.imul(tick, 0x9e3779b1) ^ tickerSeed(ticker) ^ Math.imul(salt, 0x85ebca6b));
}

function signedUnit(tick: number, ticker: string, salt: number) {
  return unit(tick, ticker, salt) * 2 - 1;
}

// Box-Muller innovations: deterministic draws, not a periodic price wave.
function normalUnit(tick: number, ticker: string, salt: number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, unit(tick, ticker, salt))))
    * Math.cos(2 * Math.PI * unit(tick, ticker, salt + 1));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundPrice(value: number) {
  return Number(Math.max(0.01, value).toFixed(2));
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function smoothstep(value: number) {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
}

function approach(current: number, target: number, rate: number, elapsed: number) {
  return current + (target - current) * (1 - Math.pow(1 - rate, elapsed));
}

export function marketTickAt(at: Date) {
  const minute = Math.floor(at.getTime() / MINUTE);
  return Math.floor(minute / MARKET_SESSION_MINUTES) * MARKET_SESSION_MINUTES;
}

export function anomalyImpactAt(anomaly: ActiveMarketAnomaly, time: number): number {
  if (time < anomaly.startedAtEpochMillis || time >= anomaly.endsAtEpochMillis) return 0;
  const peak = Math.max(anomaly.startedAtEpochMillis + 1, anomaly.peaksAtEpochMillis);
  const onset = (time - anomaly.startedAtEpochMillis) / (peak - anomaly.startedAtEpochMillis);
  const recovery = (anomaly.endsAtEpochMillis - time) / Math.max(1, anomaly.endsAtEpochMillis - peak);
  let intensity: number;
  if (anomaly.shape === "shock") intensity = time <= peak ? Math.max(0.72, smoothstep(onset)) : smoothstep(recovery);
  else if (anomaly.shape === "squeeze") intensity = time <= peak ? smoothstep(onset) : Math.sqrt(Math.max(0, recovery));
  else intensity = time <= peak ? Math.sin(Math.min(1, onset) * Math.PI / 2) : Math.sin(Math.max(0, recovery) * Math.PI / 2);
  return anomaly.peakImpactPercent * intensity;
}

function marketEvent(anomaly: ActiveMarketAnomaly, time: number): MarketEvent {
  const impactPercent = Number(anomalyImpactAt(anomaly, time).toFixed(2));
  const phase = time < anomaly.peaksAtEpochMillis ? "onset"
    : time < anomaly.endsAtEpochMillis - (anomaly.endsAtEpochMillis - anomaly.peaksAtEpochMillis) * 0.68 ? "peak" : "recovery";
  return {
    id: anomaly.id,
    title: anomaly.title,
    description: anomaly.description,
    tone: anomaly.tone,
    severity: anomaly.severity,
    phase,
    sector: anomaly.sector,
    affectedTickers: anomaly.affectedTickers,
    impactPercent,
    startedAt: new Date(anomaly.startedAtEpochMillis).toISOString(),
    endsAt: new Date(anomaly.endsAtEpochMillis).toISOString(),
  };
}

export const QUIET_EVENT: MarketEvent = {
  id: "none",
  title: "No exceptional market notices",
  description: "Trading continues under ordinary conditions; the wardens report no active anomaly.",
  tone: "neutral",
  severity: "routine",
  phase: "quiet",
  sector: "All listed trades",
  affectedTickers: [],
  impactPercent: 0,
  startedAt: null,
  endsAt: null,
};

export function initialIssuerState(definition: CompanyDefinition, lastPrice = definition.base, lastTick = 0): IssuerMarketState {
  const day = lastTick > 0 ? marketSessionDayAt(lastTick * MINUTE) : "";
  return {
    ticker: definition.ticker,
    lastTick,
    lastPrice: roundPrice(lastPrice),
    fairValue: roundPrice(lastPrice),
    earningsIndex: Number((0.92 + hash(definition.phase * 13) * 0.16).toFixed(6)),
    bookValueIndex: Number((0.94 + hash(definition.phase * 29) * 0.12).toFixed(6)),
    debtRatio: Number((0.12 + hash(definition.phase * 47) * 0.34).toFixed(6)),
    dividendYield: Number((0.008 + hash(definition.phase * 71) * 0.038).toFixed(6)),
    demandIndex: 1,
    supplyIndex: 1,
    momentum: 0,
    volatility: definition.volatility,
    marketMakerInventory: 0,
    sessionDay: day,
    sessionOpen: roundPrice(lastPrice),
    sessionHigh: roundPrice(lastPrice),
    sessionLow: roundPrice(lastPrice),
    sessionVolume: 0,
    previousClose: roundPrice(lastPrice),
    totalTrades: 0,
  };
}

function createOrders(
  definition: CompanyDefinition,
  state: IssuerMarketState,
  tick: number,
  fairValue: number,
  demandIndex: number,
  supplyIndex: number,
  momentum: number,
  sessionSigma: number,
  elapsed: number,
) {
  const buys: Order[] = [];
  const sells: Order[] = [];
  const valueGap = (fairValue - state.lastPrice) / Math.max(0.01, state.lastPrice);
  const imbalance = demandIndex - supplyIndex;
  // Fundamentals exert a slow, bounded influence. Order flow can carry prices
  // away from fair value without a forced return on the next auction.
  const valuePressure = clamp(valueGap * 0.0015, -0.00015, 0.00015);
  const signal = clamp(momentum + valuePressure + imbalance * 0.0015, -0.02, 0.02);
  const inventorySkew = clamp(state.marketMakerInventory / 18_000, -1, 1) * sessionSigma * 0.08;
  const spreadRate = clamp(0.0002 + sessionSigma * 0.35 + Math.abs(imbalance) * 0.0003, 0.0003, 0.004);
  const center = state.lastPrice * (1 + signal);

  for (let index = 0; index < 12; index += 1) {
    const participant = PARTICIPANTS[index % PARTICIPANTS.length];
    const participantBias = participant === "guild-fund" ? valuePressure * 0.4
      : participant === "speculator" ? momentum * 0.08
        : participant === "merchant-house" ? imbalance * 0.0005
          : 0;
    const buyNoise = normalUnit(tick, definition.ticker, 100 + index * 2) * sessionSigma * 0.2;
    const sellNoise = normalUnit(tick, definition.ticker, 200 + index * 2) * sessionSigma * 0.2;
    const buyAggression = unit(tick, definition.ticker, 300 + index) * sessionSigma * 0.85;
    const sellAggression = unit(tick, definition.ticker, 400 + index) * sessionSigma * 0.85;
    const sizeBase = (18 + unit(tick, definition.ticker, 500 + index) * 105) * definition.weight * Math.sqrt(elapsed);
    const quantity = Math.max(1, Math.round(sizeBase * (1 + Math.abs(signal) * 12)));
    const makerAdjustment = participant === "market-maker" ? -inventorySkew : 0;
    buys.push({
      participant,
      side: "buy",
      limit: roundPrice(center * (1 + participantBias + buyNoise + buyAggression - spreadRate / 2 + makerAdjustment)),
      quantity,
    });
    sells.push({
      participant,
      side: "sell",
      limit: roundPrice(center * (1 + participantBias + sellNoise - sellAggression + spreadRate / 2 + makerAdjustment)),
      quantity: Math.max(1, Math.round(quantity * (0.72 + unit(tick, definition.ticker, 600 + index) * 0.56))),
    });
  }
  buys.sort((left, right) => right.limit - left.limit);
  sells.sort((left, right) => left.limit - right.limit);
  return { buys, sells, spreadRate };
}

export function runClearingSession(
  definition: CompanyDefinition,
  previous: IssuerMarketState,
  tick: number,
  anomalies: ActiveMarketAnomaly[] = [],
): ClearingResult {
  const observedAt = new Date(tick * MINUTE).toISOString();
  const elapsed = clamp(Math.round((tick - previous.lastTick) / MARKET_SESSION_MINUTES) || 1, 1, 288);
  const time = tick * MINUTE;
  const anomalySignal = anomalies
    .filter((anomaly) => anomaly.affectedTickers.includes(definition.ticker))
    .reduce((sum, anomaly) => sum + anomalyImpactAt(anomaly, time) / 100, 0);
  const macro = signedUnit(Math.floor(tick / 60), "RXC", 11);
  const sector = signedUnit(Math.floor(tick / 30), definition.sector, 17);
  const issuerNoise = signedUnit(tick, definition.ticker, 23);
  const demandTarget = clamp(1 + macro * 0.022 + sector * 0.03 + issuerNoise * 0.018 + anomalySignal * 0.34, 0.68, 1.42);
  const supplyTarget = clamp(1 - macro * 0.012 - sector * 0.018 - issuerNoise * 0.014 - anomalySignal * 0.2, 0.7, 1.38);
  const demandIndex = approach(previous.demandIndex, demandTarget, 0.14, elapsed);
  const supplyIndex = approach(previous.supplyIndex, supplyTarget, 0.12, elapsed);
  const earningsTarget = clamp(0.58 + demandIndex * 0.64 - supplyIndex * 0.24 - previous.debtRatio * 0.06, 0.55, 1.5);
  const earningsIndex = approach(previous.earningsIndex, earningsTarget, 0.012, elapsed);
  const bookValueIndex = clamp(previous.bookValueIndex + (earningsIndex - 0.94 - previous.debtRatio * 0.04) * 0.0007 * elapsed, 0.62, 1.65);
  const fundamentalMultiple = 0.48 * bookValueIndex
    + 0.32 * earningsIndex
    + 0.16 * (demandIndex / supplyIndex)
    + 0.04 * (1 + previous.dividendYield * 5)
    - previous.debtRatio * 0.045;
  const fairValue = roundPrice(definition.base * clamp(fundamentalMultiple, 0.38, 2.5));
  const regimeDraw = unit(Math.floor(tick / 60), "RXC", 67);
  const regime = regimeDraw < 0.75 ? 0.65 : regimeDraw < 0.95 ? 1.6 : 3;
  const priorVolatility = clamp(previous.volatility, definition.volatility * 0.45, definition.volatility * 3.5);
  const sessionSigma = clamp(priorVolatility * 0.0095 * Math.sqrt(Math.min(elapsed, 6)), 0.00015, 0.0045);
  const shock = (unit(tick, "RXC", 73) < 0.003
    ? signedUnit(tick, "RXC", 74) > 0 ? 4 : -4 : 0)
    + (unit(tick, definition.ticker, 75) < 0.002
      ? signedUnit(tick, definition.ticker, 76) > 0 ? 5 : -5 : 0);
  // Persisted order-flow memory survives restarts. Shared innovations correlate
  // constituents; issuer innovations and rare shocks supply local variation.
  const innovation = normalUnit(tick, "RXC", 31) * 0.4
    + normalUnit(tick, definition.sector, 41) * 0.12
    + normalUnit(tick, definition.ticker, 51) * 0.45 + shock;
  const momentumBefore = clamp(previous.momentum * Math.pow(0.45, elapsed)
    + sessionSigma * innovation, -0.02, 0.02);
  const { buys, sells, spreadRate } = createOrders(
    definition, previous, tick, fairValue, demandIndex, supplyIndex, momentumBefore, sessionSigma, elapsed,
  );
  const buyerMix: Partial<Record<MarketParticipant, number>> = {};
  const sellerMix: Partial<Record<MarketParticipant, number>> = {};
  let buyIndex = 0;
  let sellIndex = 0;
  let quantity = 0;
  let notional = 0;
  let tradeCount = 0;
  let marketMakerInventory = previous.marketMakerInventory;
  let lastExecution = previous.lastPrice;
  let executionHigh = Number.NEGATIVE_INFINITY;
  let executionLow = Number.POSITIVE_INFINITY;

  while (buyIndex < buys.length && sellIndex < sells.length && buys[buyIndex].limit >= sells[sellIndex].limit) {
    const buy = buys[buyIndex];
    const sell = sells[sellIndex];
    const matched = Math.min(buy.quantity, sell.quantity);
    const execution = roundPrice(clamp((buy.limit + sell.limit) / 2, previous.lastPrice * 0.94, previous.lastPrice * 1.06));
    quantity += matched;
    notional += matched * execution;
    tradeCount += 1;
    lastExecution = execution;
    executionHigh = Math.max(executionHigh, execution);
    executionLow = Math.min(executionLow, execution);
    buyerMix[buy.participant] = (buyerMix[buy.participant] ?? 0) + matched;
    sellerMix[sell.participant] = (sellerMix[sell.participant] ?? 0) + matched;
    if (buy.participant === "market-maker") marketMakerInventory += matched;
    if (sell.participant === "market-maker") marketMakerInventory -= matched;
    buy.quantity -= matched;
    sell.quantity -= matched;
    if (buy.quantity === 0) buyIndex += 1;
    if (sell.quantity === 0) sellIndex += 1;
  }

  const price = tradeCount > 0 ? lastExecution : previous.lastPrice;
  if (tradeCount === 0) {
    executionHigh = price;
    executionLow = price;
  }
  const remainingBid = buys.slice(buyIndex).find((order) => order.quantity > 0)?.limit;
  const remainingAsk = sells.slice(sellIndex).find((order) => order.quantity > 0)?.limit;
  let bid = roundPrice(Math.min(remainingBid ?? price * (1 - spreadRate / 2), price - 0.01));
  let ask = roundPrice(Math.max(remainingAsk ?? price * (1 + spreadRate / 2), price + 0.01));
  if (bid >= ask) {
    bid = roundPrice(price * (1 - spreadRate / 2));
    ask = roundPrice(Math.max(price + 0.01, price * (1 + spreadRate / 2)));
  }
  const day = marketSessionDayAt(tick * MINUTE);
  const newSession = previous.sessionDay !== day;
  const previousClose = newSession ? previous.lastPrice : previous.previousClose;
  const sessionOpen = newSession ? price : previous.sessionOpen;
  const sessionHigh = newSession ? executionHigh : Math.max(previous.sessionHigh, executionHigh);
  const sessionLow = newSession ? executionLow : Math.min(previous.sessionLow, executionLow);
  const sessionVolume = (newSession ? 0 : previous.sessionVolume) + quantity;
  const returnRate = previous.lastPrice === 0 ? 0 : (price - previous.lastPrice) / previous.lastPrice;
  const momentum = clamp(momentumBefore * 0.9 + returnRate * 0.1, -0.02, 0.02);
  // Conditional variance retains recent turbulence, then decays gradually.
  // No oscillator or central-price reset determines the resulting trade price.
  const volatility = clamp(Math.sqrt(
    Math.pow(0.92, elapsed) * priorVolatility ** 2
    + (1 - Math.pow(0.92, elapsed)) * (0.625 * (definition.volatility * regime) ** 2
      + 0.375 * (Math.abs(returnRate) / 0.0095) ** 2),
  ), definition.volatility * 0.45, definition.volatility * 3.5);
  const state: IssuerMarketState = {
    ticker: definition.ticker,
    lastTick: tick,
    lastPrice: price,
    fairValue,
    earningsIndex: Number(earningsIndex.toFixed(6)),
    bookValueIndex: Number(bookValueIndex.toFixed(6)),
    debtRatio: previous.debtRatio,
    dividendYield: previous.dividendYield,
    demandIndex: Number(demandIndex.toFixed(6)),
    supplyIndex: Number(supplyIndex.toFixed(6)),
    momentum: Number(momentum.toFixed(8)),
    volatility: Number(volatility.toFixed(8)),
    marketMakerInventory: Math.round(marketMakerInventory),
    sessionDay: day,
    sessionOpen,
    sessionHigh,
    sessionLow,
    sessionVolume,
    previousClose,
    totalTrades: previous.totalTrades + tradeCount,
  };
  const change = round2(price - previousClose);
  const changePercent = previousClose === 0 ? 0 : Number(((change / previousClose) * 100).toFixed(2));
  return {
    state,
    trade: {
      ticker: definition.ticker,
      tick,
      observedAt,
      price,
      bid,
      ask,
      quantity,
      notional: Number(notional.toFixed(2)),
      tradeCount,
      buyerMix,
      sellerMix,
      fairValue,
      earningsIndex: state.earningsIndex,
      demandIndex: state.demandIndex,
      supplyIndex: state.supplyIndex,
    },
    company: {
      ticker: definition.ticker,
      name: definition.name,
      sector: definition.sector,
      influence: definition.influence,
      price,
      bid,
      ask,
      spread: roundPrice(ask - bid),
      fairValue,
      trades: tradeCount,
      open: sessionOpen,
      previousClose,
      change,
      changePercent,
      volume: sessionVolume,
      high: sessionHigh,
      low: sessionLow,
      history: [{ time: observedAt, value: price }],
    },
  };
}

export function buildMarketSnapshot(
  at: Date,
  companies: ListedCompany[],
  anomalies: ActiveMarketAnomaly[] = [],
  historyMode: MarketSnapshot["historyMode"] = "unavailable",
  recordedFrom: string | null = null,
  recordedObservations = 0,
  modelStartedAt: string | null = null,
): MarketSnapshot {
  const tick = marketTickAt(at);
  const definitionByTicker = new Map(COMPANIES.map((company) => [company.ticker, company]));
  const weightedBase = COMPANIES.reduce((sum, company) => sum + company.base * company.weight, 0);
  const weightedCurrent = companies.reduce((sum, company) => sum + company.price * (definitionByTicker.get(company.ticker)?.weight ?? 1), 0);
  const weightedPrevious = companies.reduce((sum, company) => sum + company.previousClose * (definitionByTicker.get(company.ticker)?.weight ?? 1), 0);
  const composite = Number(((weightedCurrent / weightedBase) * 1000).toFixed(2));
  const previousComposite = (weightedPrevious / weightedBase) * 1000;
  const compositeChange = Number((composite - previousComposite).toFixed(2));
  const compositeChangePercent = previousComposite === 0 ? 0 : Number(((compositeChange / previousComposite) * 100).toFixed(2));
  const advancing = companies.filter((company) => company.change > 0.005).length;
  const declining = companies.filter((company) => company.change < -0.005).length;
  const events = anomalies.map((anomaly) => marketEvent(anomaly, tick * MINUTE))
    .filter((event) => Math.abs(event.impactPercent) >= 0.01)
    .sort((left, right) => Math.abs(right.impactPercent) - Math.abs(left.impactPercent));
  return {
    exchange: "Royal Exchange",
    mode: "autonomous-wall-clock",
    simulation: true,
    modelVersion: MARKET_MODEL_VERSION,
    modelStartedAt,
    historyMode,
    recordedFrom,
    recordedObservations,
    currency: "Crown",
    status: "OPEN",
    asOf: new Date(tick * MINUTE).toISOString(),
    tick,
    nextUpdateAt: new Date((tick + MARKET_SESSION_MINUTES) * MINUTE).toISOString(),
    composite,
    compositeChange,
    compositeChangePercent,
    totalVolume: companies.reduce((sum, company) => sum + company.volume, 0),
    advancing,
    declining,
    unchanged: companies.length - advancing - declining,
    event: events[0] ?? QUIET_EVENT,
    events,
    companies,
  };
}

export function getMarketSnapshot(at = new Date(), anomalies: ActiveMarketAnomaly[] = []): MarketSnapshot {
  const tick = marketTickAt(at);
  const companies = COMPANIES.map((definition) => {
    const state = initialIssuerState(definition, definition.base, tick - MARKET_SESSION_MINUTES);
    return runClearingSession(definition, state, tick, anomalies).company;
  });
  return buildMarketSnapshot(at, companies, anomalies);
}
