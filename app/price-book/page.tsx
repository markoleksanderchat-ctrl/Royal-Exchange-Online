import { MarketDashboard } from "../MarketDashboard";
import { getMarketSnapshot } from "../../lib/market";

export const metadata = { title: "Merchant’s Price Book" };

export default function Page() {
  return <MarketDashboard key="price-book" view="price-book" initialSnapshot={getMarketSnapshot()} />;
}
