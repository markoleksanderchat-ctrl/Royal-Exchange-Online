import { notFound } from "next/navigation";
import { MarketDashboard } from "../../MarketDashboard";
import { getMarketSnapshot } from "../../../lib/market";

export default async function IssuerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const snapshot = getMarketSnapshot();
  if (!snapshot.companies.some((company) => company.ticker === ticker)) notFound();
  return <MarketDashboard key={ticker} view="issuer" initialTicker={ticker} initialSnapshot={snapshot} />;
}
