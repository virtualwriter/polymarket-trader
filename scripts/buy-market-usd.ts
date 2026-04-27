/**
 * Market BUY for ~$USDC notional at current best ask.
 * Usage: npx tsx scripts/buy-market-usd.ts <tokenId> <usd> [tickSize] [--neg-risk]
 * Example: npx tsx scripts/buy-market-usd.ts <DUKE_YES_TOKEN> 100 0.001
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds, Side, type TickSize } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("Missing PRIVATE_KEY");
  process.exit(1);
}

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

const tokenId = process.argv[2];
const usd = parseFloat(process.argv[3] || "0");
const tickSize = (process.argv[4] || "0.001") as TickSize;
const negRisk = process.argv.includes("--neg-risk");

if (!tokenId || !usd || usd <= 0) {
  console.error("Usage: npx tsx scripts/buy-market-usd.ts <tokenId> <usd> [tickSize] [--neg-risk]");
  process.exit(1);
}

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient(HOST, CHAIN_ID, signer);
const creds = (await l1.deriveApiKey()) as ApiKeyCreds;
const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

const book = await client.getOrderBook(tokenId);
const asks = ((book as any).asks || []).sort(
  (a: any, b: any) => parseFloat(a.price) - parseFloat(b.price)
);
if (!asks.length) {
  console.error("No asks on book — cannot buy");
  process.exit(1);
}

const bestAsk = parseFloat(asks[0].price);
if (!(bestAsk > 0 && bestAsk < 1)) {
  console.error("Invalid best ask:", bestAsk);
  process.exit(1);
}

// Shares ≈ USDC / price; round down to 2 decimals to stay under notional cap
const rawSize = usd / bestAsk;
const size = Math.floor(rawSize * 100) / 100;
if (size < 5) {
  console.error(`Computed size ${size} < minimum 5 shares. Need higher USD or lower price.`);
  process.exit(1);
}

const estCost = size * bestAsk;
console.log(`Token: ${tokenId.slice(0, 20)}…`);
console.log(`Best ask: ${(bestAsk * 100).toFixed(2)}¢  →  BUY ${size} shares  (~$${estCost.toFixed(2)} at ask)`);

const resp = await client.createAndPostOrder(
  {
    tokenID: tokenId,
    price: bestAsk,
    size,
    side: Side.BUY,
  },
  { tickSize, negRisk }
);
console.log("Response:", JSON.stringify(resp, null, 2));
