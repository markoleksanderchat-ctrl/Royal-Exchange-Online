import { MarketDashboard } from "../MarketDashboard";
import { getMarketSnapshot } from "../../lib/market";

export const metadata = { title: "Markets" };

export default function Page() {
  return <MarketDashboard key="markets" view="markets" initialSnapshot={getMarketSnapshot()} />;
}
