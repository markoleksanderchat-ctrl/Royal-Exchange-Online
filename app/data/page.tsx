import { MarketDashboard } from "../MarketDashboard";
import { getMarketSnapshot } from "../../lib/market";

export const metadata = { title: "Market Data & Methodology" };

export default function Page() {
  return <MarketDashboard key="data" view="data" initialSnapshot={getMarketSnapshot()} />;
}
