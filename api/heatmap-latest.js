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
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    return res.status(response.status).send(text);
  } catch (error) {
    return res.status(502).json({ error: error.message || "VPS request failed" });
  }
}
