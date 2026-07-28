import { MarketDashboard } from "./MarketDashboard";
import { getMarketSnapshot } from "../lib/market";

export default function Home() {
  return <MarketDashboard initialSnapshot={getMarketSnapshot()} />;
}
