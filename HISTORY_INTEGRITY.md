# Recorded RXC history and chart integrity

## Trading-time correction (0.1.2)

The 0.1.1 correction retained the real prices but introduced a presentation
regression: its derived `segment` changed at every five-minute timestamp gap,
including normal scheduled closures. The renderer broke the line at all those
boundaries while spacing observations by elapsed wall-clock time. Overnight
closures and weekends therefore occupied most of the chart, squeezing complete
sessions into disconnected fragments. This was segmentation/axis logic, not
missing database history: the current source and derived index both contain
1,324 matching, chronologically ordered observations with unique timestamps.

The corrected X-axis counts only scheduled open-market milliseconds. A regular
session's 15:55 closing observation and the next session's 09:30 opening are one
five-minute clearing interval apart, including weekends, holidays, early closes
and daylight saving changes. Their two actual prices are connected, preserving
the overnight change without inserting any prices or stretching it across a
night or weekend. Labels, pointer selection and crosshairs use the same transform.

Public continuity metadata is derived from original observation sequence counts
and the exchange calendar. Expected open-market clearing slots are compared with
the number of actual underlying records between selected prices. Equal counts
permit a connection even when aggregation omitted intermediate records. Unequal
counts retain a break for a genuinely absent auction, incomplete session or
entire missing trading day. A date change alone never breaks the line. The
original out-of-session establishment baseline remains a distinct recorded dot.
The old 21 storage runs become five chart runs: the baseline and four market
runs separated by the three real missing auctions. 7D has four runs; 1D has one.

No database migration or stored-record rewrite is required. The original derived
storage segments remain unchanged; only API continuity metadata and rendering
change. For aggregated extrema, sequence lookups use the existing unique
timestamp index and only the selected observations (at most 4,096). Raw ranges
already return their sequence in the same indexed read. The edge-cache version
changes so stale session-segmentation metadata cannot be reused.

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

- Each stored observation has a stable sequence number. Public coverage-run
  identifiers distinguish genuinely missing records from scheduled closures.
- Up to 4,096 observations are returned unchanged. All currently available 1D,
  7D, 30D and ALL intraday observations fit within that limit.
- Larger histories use indexed four-way summaries containing the actual first,
  low, high and last observations. Partial boundary buckets descend to finer
  summaries or raw observations, preserving exact requested range edges. Final
  reduction retains extrema and endpoints in time order. Samples are allocated
  by observation count, so closed calendar hours cannot consume the budget.
- Every returned time/value pair comes from the original ledger. Run identifiers
  survive aggregation. Both the stroke and area fill restart only at genuine coverage gaps;
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
The trading-time regression checks compare every rendered X coordinate with the
open-market transform, verify adjacent complete sessions remain connected and
retain true missing-auction gaps even after adaptive aggregation.
