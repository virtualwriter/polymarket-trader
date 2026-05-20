import { readFile } from "node:fs/promises";
import { join } from "node:path";

function hasHypeOptionProbabilities(payload) {
  return Array.isArray(payload?.rows) && payload.rows.some((row) => {
    return row?.asset === "HYPE" &&
      row?.option_symbol === "PURR" &&
      row?.iv_resolution &&
      row?.option_iv &&
      row?.options_touch_adjusted_prob;
  });
}

async function readStaticLatest() {
  const text = await readFile(join(process.cwd(), "relative-value", "latest.json"), "utf8");
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const endpoint =
    process.env.VPS_HEATMAP_LATEST_URL ||
    (process.env.VPS_MANUAL_SHADOW_URL || "").replace(/\/manual-shadow\/?$/, "/heatmap/latest");
  const endpointToken = process.env.VPS_HEATMAP_LATEST_TOKEN || process.env.VPS_MANUAL_SHADOW_TOKEN;
  if (!endpoint || !endpointToken) {
    return res.status(500).json({ error: "Heatmap latest endpoint is not configured" });
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        "Authorization": `Bearer ${endpointToken}`,
        "Accept": "application/json",
      },
    });
    const text = await response.text();
    let payload;
    let staticPayload;
    try {
      payload = JSON.parse(text);
      staticPayload = await readStaticLatest();
    } catch {
      payload = null;
      staticPayload = null;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (
      response.ok &&
      staticPayload &&
      hasHypeOptionProbabilities(staticPayload) &&
      !hasHypeOptionProbabilities(payload)
    ) {
      return res.status(200).json({
        ...staticPayload,
        servedFrom: "static_fallback",
        fallbackReason: "VPS latest payload is missing HYPE/PURR option probabilities.",
      });
    }
    return res.status(response.status).send(text);
  } catch (error) {
    return res.status(502).json({ error: error.message || "VPS request failed" });
  }
}
