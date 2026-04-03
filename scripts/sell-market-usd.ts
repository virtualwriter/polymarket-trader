/**
 * Market SELL for ~$USDC notional at current best bid.
 * Usage: npx tsx scripts/sell-market-usd.ts <tokenId> <usd> [tickSize] [--neg-risk]
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds } from "@polymarket/clob-client";
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
const tickSize = process.argv[4] || "0.001";
const negRisk = process.argv.includes("--neg-risk");

if (!tokenId || !usd || usd <= 0) {
  console.error("Usage: npx tsx scripts/sell-market-usd.ts <tokenId> <usd> [tickSize] [--neg-risk]");
  process.exit(1);
}

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient(HOST, CHAIN_ID, signer);
const creds = (await l1.deriveApiKey()) as ApiKeyCreds;
const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

const book = await client.getOrderBook(tokenId);
const bids = ((book as any).bids || []).sort(
  (a: any, b: any) => parseFloat(b.price) - parseFloat(a.price)
);
if (!bids.length) {
  console.error("No bids on book — cannot sell");
  process.exit(1);
}

const bestBid = parseFloat(bids[0].price);
if (!(bestBid > 0 && bestBid < 1)) {
  console.error("Invalid best bid:", bestBid);
  process.exit(1);
}

const rawSize = usd / bestBid;
const size = Math.floor(rawSize * 100) / 100;
if (size < 0.01) {
  console.error(`Computed size ${size} too small`);
  process.exit(1);
}

const estProceeds = size * bestBid;
console.log(`Token: ${tokenId.slice(0, 20)}…`);
console.log(`Best bid: ${(bestBid * 100).toFixed(2)}¢  →  SELL ${size} shares  (~$${estProceeds.toFixed(2)} gross at bid)`);

const resp = await client.createAndPostOrder(
  {
    tokenID: tokenId,
    price: bestBid,
    size,
    side: "SELL",
  },
  { tickSize, negRisk }
);
console.log("Response:", JSON.stringify(resp, null, 2));
