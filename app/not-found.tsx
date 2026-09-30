import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-card" aria-labelledby="not-found-title">
        <span className="market-code">404</span>
        <h1 id="not-found-title">That market page does not exist.</h1>
        <p>The address may be incorrect or the record may have moved. Return to the Royal Exchange overview.</p>
        <Link className="action-button" href="/">Return to Royal Exchange</Link>
      </section>
    </main>
  );
}
