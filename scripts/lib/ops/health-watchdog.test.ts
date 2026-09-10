import { describe, expect, it } from "vitest";
import {
  computeWatchdogAlerts,
  filterUnsentAlerts,
  DISK_USED_PCT_ALERT,
  HYPOTHESES_MAX_BYTES,
  NIGHTLY_STALE_HOURS,
  TRADINGVIEW_STALE_ROWS,
  type WatchdogInputs,
} from "./health-watchdog.js";

const NOW = new Date("2026-09-10T12:00:00Z");

function healthyInputs(): WatchdogInputs {
  return {
    now: NOW,
    nightlyArtifactAgesHours: {
      "nightly-llm-advice.json": 11,
      "nightly-explorer-advice.json": 11,
      "research-yield-scoreboard.json": 11,
    },
    recentValuationRows: [
      { date: "2026-09-08", btc_opt_iv_30d: 42, gold_opt_iv_30d: 15 },
      { date: "2026-09-09", btc_opt_iv_30d: 43, gold_opt_iv_30d: 15 },
      { date: "2026-09-10", btc_opt_iv_30d: 44, gold_opt_iv_30d: 16 },
    ],
    diskUsedPct: 55,
    hypothesesFileBytes: 2_000_000,
  };
}

describe("computeWatchdogAlerts", () => {
  it("stays quiet when everything is healthy", () => {
    expect(computeWatchdogAlerts(healthyInputs())).toEqual([]);
  });

  it("flags a single stale LLM artifact as a step failure, not job death", () => {
    const inputs = healthyInputs();
    inputs.nightlyArtifactAgesHours["nightly-llm-advice.json"] = NIGHTLY_STALE_HOURS + 5;
    const alerts = computeWatchdogAlerts(inputs);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe("nightly_stale_nightly-llm-advice.json");
    expect(alerts[0].message).toContain("credits");
  });

  it("collapses to one job-dead alert when every artifact is stale or missing", () => {
    const inputs = healthyInputs();
    inputs.nightlyArtifactAgesHours = {
      "nightly-llm-advice.json": 80,
      "nightly-explorer-advice.json": null,
      "research-yield-scoreboard.json": 80,
    };
    const alerts = computeWatchdogAlerts(inputs);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe("nightly_job_dead");
    expect(alerts[0].message).toContain("missing");
  });

  it("does not alert on a fresh artifact from last night", () => {
    const inputs = healthyInputs();
    inputs.nightlyArtifactAgesHours["nightly-llm-advice.json"] = 36; // one missed night
    expect(computeWatchdogAlerts(inputs)).toEqual([]);
  });

  it("blames the TradingView cookie when IV columns go empty for enough snapshots", () => {
    const inputs = healthyInputs();
    inputs.recentValuationRows = Array.from({ length: TRADINGVIEW_STALE_ROWS }, (_, i) => ({
      date: `2026-09-10T${String(10 + i).padStart(2, "0")}`,
      btc_opt_iv_30d: "",
      gold_opt_iv_30d: "",
    }));
    const alerts = computeWatchdogAlerts(inputs);
    expect(alerts.map((a) => a.key)).toContain("tradingview_cookie");
  });

  it("does not blame the cookie when even one recent snapshot has IV", () => {
    const inputs = healthyInputs();
    inputs.recentValuationRows = Array.from({ length: TRADINGVIEW_STALE_ROWS }, (_, i) => ({
      date: `2026-09-10T${String(10 + i).padStart(2, "0")}`,
      btc_opt_iv_30d: i === 2 ? 41 : "",
    }));
    expect(computeWatchdogAlerts(inputs)).toEqual([]);
  });

  it("flags stale valuations as a scanner problem", () => {
    const inputs = healthyInputs();
    inputs.recentValuationRows = [
      { date: "2026-09-05", btc_opt_iv_30d: 42 },
      { date: "2026-09-06", btc_opt_iv_30d: 42 },
      { date: "2026-09-07", btc_opt_iv_30d: 42 },
    ];
    const alerts = computeWatchdogAlerts(inputs);
    expect(alerts.map((a) => a.key)).toContain("valuations_stale");
  });

  it("flags disk pressure and hypotheses.json growth", () => {
    const inputs = healthyInputs();
    inputs.diskUsedPct = DISK_USED_PCT_ALERT + 2;
    inputs.hypothesesFileBytes = HYPOTHESES_MAX_BYTES + 1;
    const keys = computeWatchdogAlerts(inputs).map((a) => a.key);
    expect(keys).toContain("disk_full");
    expect(keys).toContain("hypotheses_growth");
  });

  it("skips disk and size checks when inputs are unavailable", () => {
    const inputs = healthyInputs();
    inputs.diskUsedPct = null;
    inputs.hypothesesFileBytes = null;
    expect(computeWatchdogAlerts(inputs)).toEqual([]);
  });
});

describe("filterUnsentAlerts", () => {
  const alert = { key: "nightly_job_dead", message: "x" };

  it("passes alerts never sent before", () => {
    expect(filterUnsentAlerts([alert], { lastSent: {} }, NOW)).toEqual([alert]);
  });

  it("dedupes alerts sent within 24h and re-sends after", () => {
    const recent = { lastSent: { nightly_job_dead: "2026-09-10T00:00:00Z" } };
    expect(filterUnsentAlerts([alert], recent, NOW)).toEqual([]);
    const old = { lastSent: { nightly_job_dead: "2026-09-08T00:00:00Z" } };
    expect(filterUnsentAlerts([alert], old, NOW)).toEqual([alert]);
  });
});
