// Replay preload: deterministic clock + offline network neutralization.
//
// Loaded into the trading-engine child process via `node --import`. It performs
// two jobs and is a strict no-op unless REPLAY_NOW_MS is set, so it can never
// affect a normal production run:
//
//   1. Clock injection. The engine has dozens of `new Date()` / `Date.now()`
//      call sites (incl. the America/New_York weekend-window gate
//      isStockPerpFundingWindowOpen). We freeze the global Date to the replay
//      hour T. `new Date()` and `Date.now()` return T; `new Date(arg)` and all
//      static helpers (Date.parse, Date.UTC) behave normally. This gives full
//      determinism with ZERO edits to engine source.
//
//   2. Network neutralization. The only network paths the engine can reach are
//      Polymarket Gamma/CLOB book fetches (out of scope for snapshot-driven
//      signals) and the Anthropic LLM (already killed by --no-llm). We replace
//      globalThis.fetch with a stub that resolves an empty JSON array. Every
//      caller (fetchMarketTokenIds -> fetchMarketYesNoBooks) degrades to `null`
//      gracefully (no throw, no crash, no egress, no token spend).

const fixedMs = Number(process.env.REPLAY_NOW_MS);

if (Number.isFinite(fixedMs) && fixedMs > 0) {
  const RealDate = Date;

  class ReplayDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedMs);
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedMs;
    }
  }
  // Static helpers (parse, UTC) are inherited from RealDate automatically.
  globalThis.Date = ReplayDate;

  // Offline stub. Resolves an empty JSON array for any request so JSON parsing
  // succeeds and market lookups return null instead of throwing.
  const emptyJsonResponse = () =>
    new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async () => emptyJsonResponse();

  const stamp = new RealDate(fixedMs).toISOString();
  process.stderr.write(`[replay-preload] clock frozen to ${stamp} (REPLAY_NOW_MS=${fixedMs}); fetch neutralized (offline)\n`);
}
