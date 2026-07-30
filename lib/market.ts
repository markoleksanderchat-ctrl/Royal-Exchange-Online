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
  modelVersion: "royal-exchange-simulation-v1";
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

type CompanyDefinition = {
  ticker: string;
  name: string;
  sector: string;
  influence: string;
  base: number;
  volatility: number;
  weight: number;
  phase: number;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const COMPANIES: CompanyDefinition[] = [
  { ticker: "STPL", name: "Browne of Calais Staple", sector: "Staple Trade", influence: "Wool, skins, lead & tin", base: 84.2, volatility: 0.052, weight: 1.2, phase: 0.3 },
  { ticker: "MRCR", name: "Whittington Mercery", sector: "Textiles", influence: "Fine cloth & imported silk", base: 126.4, volatility: 0.041, weight: 0.95, phase: 1.2 },
  { ticker: "PEPR", name: "Soper Lane Pepper House", sector: "Provisions", influence: "Spices, grain & preserved goods", base: 57.8, volatility: 0.061, weight: 1.05, phase: 2.4 },
  { ticker: "FISH", name: "Walworth & Lovekyn Fish House", sector: "Victuals", influence: "Fish, salt & river trade", base: 112.6, volatility: 0.082, weight: 1.25, phase: 3.1 },
  { ticker: "IRON", name: "Ironmonger Lane Company", sector: "Metals", influence: "Iron, copper, tools & armour", base: 43.7, volatility: 0.034, weight: 1.1, phase: 4.4 },
  { ticker: "GDSM", name: "West Chepe Goldsmiths", sector: "Bullion", influence: "Gold, emerald, diamond, lapis, amethyst & gems", base: 68.3, volatility: 0.044, weight: 0.9, phase: 5.2 },
  { ticker: "WAXC", name: "Candlewick Street Chandlery", sector: "Lighting", influence: "Beeswax & candles", base: 76.9, volatility: 0.038, weight: 1.0, phase: 2.0 },
  { ticker: "SKIN", name: "St Mary Axe Skinners", sector: "Peltry", influence: "Furs, hides & leather", base: 91.5, volatility: 0.072, weight: 1.1, phase: 0.8 },
  { ticker: "CORD", name: "Cordwainer Street Leatherhouse", sector: "Leatherwork", influence: "Fine shoes & worked leather", base: 104.8, volatility: 0.088, weight: 0.8, phase: 3.8 },
  { ticker: "MSON", name: "Eastcheap Masonry Yard", sector: "Building", influence: "Stone, brick & lime", base: 98.1, volatility: 0.058, weight: 1.0, phase: 5.8 },
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

function hash(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function smoothstep(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
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

function companyPrice(definition: CompanyDefinition, time: number, anomalies: ActiveMarketAnomaly[]): number {
  const minute = Math.floor(time / MINUTE);
  const dayWave = Math.sin((time / DAY) * Math.PI * 2 + definition.phase) * definition.volatility * 0.48;
  const weekWave = Math.sin((time / (DAY * 7)) * Math.PI * 2 + definition.phase * 0.63) * definition.volatility * 0.34;
  const pulse = (hash(minute * 0.071 + definition.phase * 91) - 0.5) * definition.volatility * 0.22;
  const anomalyMove = anomalies
    .filter((anomaly) => anomaly.affectedTickers.includes(definition.ticker))
    .reduce((sum, anomaly) => sum + anomalyImpactAt(anomaly, time) / 100, 0);
  return Number((definition.base * Math.max(0.35, 1 + dayWave + weekWave + pulse + anomalyMove)).toFixed(2));
}

function companySnapshot(definition: CompanyDefinition, time: number, anomalies: ActiveMarketAnomaly[]): ListedCompany {
  const price = companyPrice(definition, time, anomalies);
  const previous = companyPrice(definition, time - DAY, anomalies);
  const date = new Date(time);
  const dayOpen = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const open = companyPrice(definition, dayOpen, anomalies);
  const points = [{ time: new Date(time).toISOString(), value: price }];
  const values = points.map((point) => point.value);
  const change = Number((price - previous).toFixed(2));
  const changePercent = Number(((change / previous) * 100).toFixed(2));
  const minute = Math.floor(time / MINUTE);
  const eventVolume = anomalies.filter((anomaly) => anomaly.affectedTickers.includes(definition.ticker))
    .reduce((sum, anomaly) => sum + Math.abs(anomalyImpactAt(anomaly, time)) * 0.025, 1);
  const volume = Math.round((82_000 + hash(minute * 0.017 + definition.phase * 300) * 290_000)
    * definition.weight * Math.min(1.85, eventVolume));
  return {
    ticker: definition.ticker,
    name: definition.name,
    sector: definition.sector,
    influence: definition.influence,
    price,
    open,
    previousClose: previous,
    change,
    changePercent,
    volume,
    high: Math.max(...values),
    low: Math.min(...values),
    history: points,
  };
}

export function getMarketSnapshot(at = new Date(), anomalies: ActiveMarketAnomaly[] = []): MarketSnapshot {
  const time = at.getTime();
  const tick = Math.floor(time / MINUTE);
  const companies = COMPANIES.map((company) => companySnapshot(company, time, anomalies));
  const weightedBase = COMPANIES.reduce((sum, company) => sum + company.base * company.weight, 0);
  const weightedCurrent = companies.reduce((sum, company, index) => sum + company.price * COMPANIES[index].weight, 0);
  const weightedPrevious = COMPANIES.reduce((sum, company, index) => sum + companyPrice(company, time - DAY, anomalies) * COMPANIES[index].weight, 0);
  const composite = Number(((weightedCurrent / weightedBase) * 1000).toFixed(2));
  const previousComposite = (weightedPrevious / weightedBase) * 1000;
  const compositeChange = Number((composite - previousComposite).toFixed(2));
  const compositeChangePercent = Number(((compositeChange / previousComposite) * 100).toFixed(2));
  const advancing = companies.filter((company) => company.change > 0.005).length;
  const declining = companies.filter((company) => company.change < -0.005).length;
  const events = anomalies.map((anomaly) => marketEvent(anomaly, time))
    .filter((event) => Math.abs(event.impactPercent) >= 0.01)
    .sort((left, right) => Math.abs(right.impactPercent) - Math.abs(left.impactPercent));
  return {
    exchange: "Royal Exchange",
    mode: "autonomous-wall-clock",
    simulation: true,
    modelVersion: "royal-exchange-simulation-v2-anomalies",
    historyMode: "unavailable",
    recordedFrom: null,
    recordedObservations: 0,
    currency: "Crown",
    status: "OPEN",
    asOf: at.toISOString(),
    tick,
    nextUpdateAt: new Date((tick + 1) * MINUTE).toISOString(),
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
