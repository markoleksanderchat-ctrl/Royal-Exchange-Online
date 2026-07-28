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
  title: string;
  description: string;
  tone: "positive" | "negative" | "neutral";
  sector: string;
};

export type MarketSnapshot = {
  exchange: "Royal Exchange";
  mode: "autonomous-wall-clock";
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
const HISTORY_INTERVAL = 30 * MINUTE;
const HISTORY_POINTS = 49;
const DAY = 24 * 60 * MINUTE;

const COMPANIES: CompanyDefinition[] = [
  { ticker: "STPL", name: "Company of Merchant Staplers", sector: "Staple Trade", influence: "Wool, skins, lead & tin", base: 84.2, volatility: 0.052, weight: 1.2, phase: 0.3 },
  { ticker: "MRCR", name: "Fellowship of Mercers", sector: "Textiles", influence: "Fine cloth & imported silk", base: 126.4, volatility: 0.041, weight: 0.95, phase: 1.2 },
  { ticker: "PEPR", name: "Guild of Pepperers", sector: "Provisions", influence: "Spices, grain & preserved goods", base: 57.8, volatility: 0.061, weight: 1.05, phase: 2.4 },
  { ticker: "FISH", name: "Fraternity of Fishmongers", sector: "Victuals", influence: "Fish, salt & river trade", base: 112.6, volatility: 0.082, weight: 1.25, phase: 3.1 },
  { ticker: "IRON", name: "Company of Ironmongers", sector: "Metals", influence: "Iron, tools & armour", base: 43.7, volatility: 0.034, weight: 1.1, phase: 4.4 },
  { ticker: "GDSM", name: "Mistery of Goldsmiths", sector: "Bullion", influence: "Gold, silver & gems", base: 68.3, volatility: 0.044, weight: 0.9, phase: 5.2 },
  { ticker: "WAXC", name: "Fellowship of Wax Chandlers", sector: "Lighting", influence: "Beeswax & candles", base: 76.9, volatility: 0.038, weight: 1.0, phase: 2.0 },
  { ticker: "SKIN", name: "Company of Skinners", sector: "Peltry", influence: "Furs, hides & leather", base: 91.5, volatility: 0.072, weight: 1.1, phase: 0.8 },
  { ticker: "CORD", name: "Mistery of Cordwainers", sector: "Leatherwork", influence: "Fine shoes & worked leather", base: 104.8, volatility: 0.088, weight: 0.8, phase: 3.8 },
  { ticker: "MSON", name: "Masons' Company", sector: "Building", influence: "Stone, brick & lime", base: 98.1, volatility: 0.058, weight: 1.0, phase: 5.8 },
];

const EVENTS: Array<Omit<MarketEvent, "sector"> & { sectors: string[]; direction: number }> = [
  { title: "Wool receipts rise at the staple", description: "A larger consignment has cleared inspection, lifting turnover in staple wares.", tone: "positive", sectors: ["Staple Trade", "Textiles"], direction: 1 },
  { title: "Pepper convoy reaches the quay", description: "Fresh spice and grain cargoes have eased prices among the victualling trades.", tone: "negative", sectors: ["Provisions", "Victuals"], direction: -1 },
  { title: "Assay reports firmer bullion", description: "The wardens report sound weight and fineness in the latest plate and coin.", tone: "positive", sectors: ["Bullion"], direction: 1 },
  { title: "Road tolls delay building stone", description: "Carters report slower passage and higher charges on heavy wares.", tone: "negative", sectors: ["Building", "Metals"], direction: -1 },
  { title: "Guildhall issues new work orders", description: "Public works contracts are supporting demand for iron, leather and masonry.", tone: "positive", sectors: ["Metals", "Leatherwork", "Building"], direction: 1 },
  { title: "Wax supply holds steady", description: "Chandlers report sufficient stores for the present market period.", tone: "neutral", sectors: ["Lighting"], direction: 0 },
];

function hash(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function activeEvent(time: number): MarketEvent & { direction: number } {
  const block = Math.floor(time / (6 * 60 * MINUTE));
  const event = EVENTS[Math.floor(hash(block * 1.913) * EVENTS.length) % EVENTS.length];
  return { title: event.title, description: event.description, tone: event.tone, sector: event.sectors.join(" · "), direction: event.direction };
}

function companyPrice(definition: CompanyDefinition, time: number): number {
  const minute = Math.floor(time / MINUTE);
  const dayWave = Math.sin((time / DAY) * Math.PI * 2 + definition.phase) * definition.volatility * 0.48;
  const weekWave = Math.sin((time / (DAY * 7)) * Math.PI * 2 + definition.phase * 0.63) * definition.volatility * 0.34;
  const pulse = (hash(minute * 0.071 + definition.phase * 91) - 0.5) * definition.volatility * 0.22;
  const event = activeEvent(time);
  const affected = event.sector.split(" · ").includes(definition.sector);
  const eventMove = affected ? event.direction * definition.volatility * 0.22 : 0;
  return Number((definition.base * (1 + dayWave + weekWave + pulse + eventMove)).toFixed(2));
}

function history(definition: CompanyDefinition, time: number): MarketHistoryPoint[] {
  const currentPoint = Math.floor(time / HISTORY_INTERVAL) * HISTORY_INTERVAL;
  return Array.from({ length: HISTORY_POINTS }, (_, index) => {
    const pointTime = currentPoint - (HISTORY_POINTS - 1 - index) * HISTORY_INTERVAL;
    return { time: new Date(pointTime).toISOString(), value: companyPrice(definition, pointTime) };
  });
}

function companySnapshot(definition: CompanyDefinition, time: number): ListedCompany {
  const price = companyPrice(definition, time);
  const previous = companyPrice(definition, time - DAY);
  const date = new Date(time);
  const dayOpen = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const open = companyPrice(definition, dayOpen);
  const points = history(definition, time);
  const values = points.map((point) => point.value);
  const change = Number((price - previous).toFixed(2));
  const changePercent = Number(((change / previous) * 100).toFixed(2));
  const minute = Math.floor(time / MINUTE);
  const volume = Math.round((82_000 + hash(minute * 0.017 + definition.phase * 300) * 290_000) * definition.weight);
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

export function getMarketSnapshot(at = new Date()): MarketSnapshot {
  const time = at.getTime();
  const tick = Math.floor(time / MINUTE);
  const companies = COMPANIES.map((company) => companySnapshot(company, time));
  const weightedBase = COMPANIES.reduce((sum, company) => sum + company.base * company.weight, 0);
  const weightedCurrent = companies.reduce((sum, company, index) => sum + company.price * COMPANIES[index].weight, 0);
  const weightedPrevious = COMPANIES.reduce((sum, company, index) => sum + companyPrice(company, time - DAY) * COMPANIES[index].weight, 0);
  const composite = Number(((weightedCurrent / weightedBase) * 1000).toFixed(2));
  const previousComposite = (weightedPrevious / weightedBase) * 1000;
  const compositeChange = Number((composite - previousComposite).toFixed(2));
  const compositeChangePercent = Number(((compositeChange / previousComposite) * 100).toFixed(2));
  const advancing = companies.filter((company) => company.change > 0.005).length;
  const declining = companies.filter((company) => company.change < -0.005).length;
  const event = activeEvent(time);
  return {
    exchange: "Royal Exchange",
    mode: "autonomous-wall-clock",
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
    event: { title: event.title, description: event.description, tone: event.tone, sector: event.sector },
    companies,
  };
}
