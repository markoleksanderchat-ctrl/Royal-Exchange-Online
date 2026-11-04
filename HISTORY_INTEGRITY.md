# Recorded RXC history and chart integrity

## Cause confirmed against production on November 4, 2026

The ledger contained 1,324 original observations. The old 7D endpoint returned
126 of 387 available observations, and 30D/ALL returned 121 of 1,324. Its 576
sampling targets were spread over calendar minutes. Overnight and weekend
targets repeatedly selected the next opening; SQL deduplication then collapsed
those targets. The remaining samples skipped intraday peaks and reversals.

The canvas joined all returned observations with `lineTo`, including overnight,
weekend and missing-auction gaps. Its area fill also spanned those intervals.
The resulting diagonals were visual connections across unobserved time, amplified
by the discarded detail. No stored spline or fabricated intermediate prices were
found. Source timestamps were unique. Equal consecutive recorded prices remain
valid observations and are retained.

Three scheduled observations were absent: October 30 at 14:55Z and 17:25Z, and
November 2 at 20:15Z. Their prices cannot be recovered from the ledger. The
correction leaves those holes intact. The original zero-volume era-establishment
baseline remains an isolated historical point; it is not an invented auction.

## Retrieval and rendering

- Each observation gets a stable sequence number and a contiguous-run identifier.
  A missing five-minute observation or closed session starts another run.
- Up to 4,096 observations are returned unchanged. All currently available 1D,
  7D, 30D and ALL intraday observations fit within that limit.
- Larger histories use indexed four-way summaries containing the actual first,
  low, high and last observations. Partial boundary buckets descend to finer
  summaries or raw observations, preserving exact requested range edges. Final
  reduction retains extrema and endpoints in time order. Samples are allocated
  by observation count, so closed calendar hours cannot consume the budget.
- Every returned time/value pair comes from the original ledger. Run identifiers
  survive aggregation. Both the stroke and area fill restart at run boundaries;
  isolated observations are dots. Pointer inspection does not assign a price to
  an empty interval. Colors, typography, axes, controls and layout are preserved.
- Identical transport duplicates are collapsed. Conflicting simultaneous prices
  fail closed. Missing/incomplete summaries produce unavailable-history responses;
  recent quotes and indicative values are not substituted for a historical range.

## Persistence and Cloudflare D1 usage

`0005_rxc_recorded_history.sql` adds `rxc_history_points` and
`rxc_history_rollups`, derived only from existing `market_ticks`. It never updates
or deletes original prices, issuer observations, sessions, volumes or era data.
The one-time index build scans retained data; normal history requests do not.

Each new recorded auction appends its RXC index point and updates ten small
summary levels in the same D1 transaction as the original market/issuer records.
Concurrent collectors cannot double-count a tick. Indexed recovery copies only
observations already present in the ledger; it does not rerun past simulation.
Routine chart requests use bounded primary-key/index ranges, not full-history
window functions, counts or group scans. Responses are cached by recorded tick
and range. A warm edge-cache request reads one indexed latest-tick row, and a
new recorded tick invalidates the cache key immediately. Browser cache policy
remains unchanged.

The five-minute cron remains independent of visitors. Delayed jobs use their
actual execution window, with one bounded retry for transient failures. No job
recreates missed prices or volume, including after downtime or market closure.
Failed collection logs its scheduled and actual attempt times for diagnosis.

## Validation

Regression coverage includes all four ranges, DST/holidays/early closes, sparse
and single-point data, missing observations, genuine flat prices, duplicate
transport records, incomplete indexes, large histories, range edges, brief
crashes/recoveries, transaction races, delayed cron jobs and retry behavior.
The production backup was restored and the additive migration preserved every
original table byte-for-byte at the row-data level. Rendered desktop/mobile
checks inspect actual canvas stroke and fill paths as well as chart images.
