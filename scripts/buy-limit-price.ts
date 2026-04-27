/**
 * Limit BUY at a fixed price (GTC-style — rests if no counterparty).
 * Usage: npx tsx scripts/buy-limit-price.ts <tokenId> <price> <usdNotional> [tickSize]
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

const tokenId = process.argv[2];
const price = parseFloat(process.argv[3] || "0");
const usd = parseFloat(process.argv[4] || "0");
const tickSize = (process.argv[5] || "0.001") as TickSize;

if (!tokenId || !(price > 0 && price < 1) || !usd) {
  console.error(
    "Usage: npx tsx scripts/buy-limit-price.ts <tokenId> <price e.g. 0.999> <usd> [tickSize]"
  );
  process.exit(1);
}

const rawSize = usd / price;
const size = Math.floor(rawSize * 100) / 100;
if (size < 5) {
  console.error(`Size ${size} < min 5 shares — increase USD`);
  process.exit(1);
}

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient("https://clob.polymarket.com", 137, signer);
const creds = (await l1.deriveApiKey()) as ApiKeyCreds;
const client = new ClobClient("https://clob.polymarket.com", 137, signer, creds);

console.log(
  `Limit BUY ${size} @ ${(price * 100).toFixed(2)}¢ (~$${(size * price).toFixed(2)} notional)`
);

const resp = await client.createAndPostOrder(
  { tokenID: tokenId, price, size, side: Side.BUY },
  { tickSize, negRisk: false }
);
console.log("Response:", JSON.stringify(resp, null, 2));
