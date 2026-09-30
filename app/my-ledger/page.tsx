import { MarketDashboard } from "../MarketDashboard";
import { getMarketSnapshot } from "../../lib/market";

export const metadata = { title: "My Ledger" };

export default function Page() {
  return <MarketDashboard key="ledger" view="ledger" initialSnapshot={getMarketSnapshot()} />;
}
