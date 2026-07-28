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
  { ticker: "CRWN", name: "Crown Ironworks", sector: "Metals", influence: "Iron, anvils & tools", base: 84.2, volatility: 0.052, weight: 1.2, phase: 0.3 },
  { ticker: "AURM", name: "Auric Mint", sector: "Precious Metals", influence: "Gold & gilded goods", base: 126.4, volatility: 0.041, weight: 0.95, phase: 1.2 },
  { ticker: "CPFR", name: "Copperline Foundry", sector: "Industry", influence: "Copper & fittings", base: 57.8, volatility: 0.061, weight: 1.05, phase: 2.4 },
  { ticker: "RDS", name: "Redstone Dynamics", sector: "Engineering", influence: "Redstone components", base: 112.6, volatility: 0.082, weight: 1.25, phase: 3.1 },
  { ticker: "VGRN", name: "Verdant Granaries", sector: "Agriculture", influence: "Food, crops & livestock", base: 43.7, volatility: 0.034, weight: 1.1, phase: 4.4 },
  { ticker: "NWT", name: "Northwood Timber", sector: "Materials", influence: "Logs, planks & paper", base: 68.3, volatility: 0.044, weight: 0.9, phase: 5.2 },
  { ticker: "MSON", name: "Masonry Guild", sector: "Construction", influence: "Stone, brick & glass", base: 76.9, volatility: 0.038, weight: 1.0, phase: 2.0 },
  { ticker: "EMBR", name: "Ember Fuel Cooperative", sector: "Energy", influence: "Coal, fuel & smelting", base: 91.5, volatility: 0.072, weight: 1.1, phase: 0.8 },
  { ticker: "AZUR", name: "Azure Holdings", sector: "Arcane Materials", influence: "Lapis, crystal & enchantment", base: 104.8, volatility: 0.088, weight: 0.8, phase: 3.8 },
  { ticker: "RARM", name: "Royal Armory", sector: "Defense", influence: "Weapons, armor & arrows", base: 98.1, volatility: 0.058, weight: 1.0, phase: 5.8 },
];

const EVENTS: Array<Omit<MarketEvent, "sector"> & { sectors: string[]; direction: number }> = [
  { title: "Foundry orders strengthen", description: "A new round of civic works is lifting industrial demand.", tone: "positive", sectors: ["Metals", "Industry", "Construction"], direction: 1 },
  { title: "Granaries report full stores", description: "Strong reserves are easing pressure across agricultural contracts.", tone: "negative", sectors: ["Agriculture"], direction: -1 },
  { title: "Arcane survey returns promising", description: "Fresh deposits have renewed interest in enchanted materials.", tone: "positive", sectors: ["Arcane Materials", "Engineering"], direction: 1 },
  { title: "Caravan routes disrupted", description: "Longer delivery times are weighing on timber and building supply.", tone: "negative", sectors: ["Materials", "Construction"], direction: -1 },
  { title: "Border procurement expands", description: "Quartermasters have increased orders for defensive equipment.", tone: "positive", sectors: ["Defense", "Metals"], direction: 1 },
  { title: "Energy inventories normalize", description: "Fuel reserves have returned to their seasonal range.", tone: "neutral", sectors: ["Energy"], direction: 0 },
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
