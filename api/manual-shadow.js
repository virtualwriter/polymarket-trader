const allowedSides = new Set(["yes", "no"]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function cleanPayload(payload) {
  const event = String(payload.event || "");
  const marketId = String(payload.marketId || "");
  const side = String(payload.side || "").toLowerCase();
  const signalType = String(payload.signalType || "");
  const reason = String(payload.reason || "");

  if (!/^[a-z0-9-]+$/.test(event)) throw new Error("Invalid event slug");
  if (!/^[0-9]+$/.test(marketId)) throw new Error("Invalid market ID");
  if (!allowedSides.has(side)) throw new Error("Invalid side");
  if (!/^USER_PM_IV_TOUCH_(RICH_NO|CHEAP_YES)$/.test(signalType)) throw new Error("Invalid signal type");
  if (reason.length > 500) throw new Error("Reason too long");
  if (payload.heatmapRowSnapshot && typeof payload.heatmapRowSnapshot !== "object") {
    throw new Error("Invalid heatmap row snapshot");
  }

  return { event, marketId, side, signalType, reason, heatmapRowSnapshot: payload.heatmapRowSnapshot };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const uiToken = process.env.MANUAL_SHADOW_UI_TOKEN || "";
  if (uiToken && req.headers["x-manual-shadow-token"] !== uiToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const endpoint = process.env.VPS_MANUAL_SHADOW_URL;
  const endpointToken = process.env.VPS_MANUAL_SHADOW_TOKEN;
  if (!endpoint || !endpointToken) {
    return res.status(500).json({ error: "Manual shadow endpoint is not configured" });
  }

  try {
    const payload = cleanPayload(await readBody(req));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${endpointToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { output: text };
    }
    if (!response.ok) {
      return res.status(response.status).json({ error: result.error || "VPS request failed", result });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Bad request" });
  }
}
