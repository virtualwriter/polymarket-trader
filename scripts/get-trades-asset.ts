/**
 * P&L summary for one asset from CLOB trade history.
 * Usage: npx tsx scripts/get-trades-asset.ts <tokenId> [label]
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PK = process.env.PRIVATE_KEY!;
const HOST = "https://clob.polymarket.com";
const tokenId = process.argv[2];
const label = process.argv[3] || "asset";

if (!tokenId) {
  console.error("Usage: npx tsx scripts/get-trades-asset.ts <tokenId> [label]");
  process.exit(1);
}

const signer = new ethers.Wallet(PK);
const WALLET = signer.address.toLowerCase();
const l1 = new ClobClient(HOST, 137, signer);
const creds = (await l1.deriveApiKey()) as ApiKeyCreds;
const client = new ClobClient(HOST, 137, signer, creds);

async function fetchAll(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const params: any = { asset_id: tokenId };
    if (cursor) params.next_cursor = cursor;
    const raw: any = await client.getTrades(params);
    const trades = Array.isArray(raw) ? raw : [];
    if (trades.length === 0) break;
    all.push(...trades);
    cursor = (raw as any).next_cursor;
    if (!cursor || trades.length < 100) break;
  }
  return all;
}

const trades = await fetchAll();
console.log(`Wallet: ${WALLET}`);
console.log(`${label} — trades: ${trades.length}\n`);

let totalSpent = 0;
let totalFees = 0;
let totalReceived = 0;
let buyNotional = 0;
let sellNotional = 0;

for (const t of trades) {
  const price = parseFloat(t.price);
  const size = parseFloat(t.size);
  const notional = price * size;
  const maker = (t.maker_address || "").toLowerCase();
  const isMaker = maker === WALLET;
  const side = t.side;
  const feeBps = parseFloat(t.fee_rate_bps || "0");
  const fee = notional * (feeBps / 10000);

  let weBought: boolean;
  if (isMaker) weBought = side === "BUY";
  else weBought = side === "SELL";

  const ts = t.match_time
    ? new Date(parseInt(t.match_time, 10) * 1000).toISOString()
    : "";

  if (weBought) {
    buyNotional += notional;
    totalSpent += notional + fee;
    totalFees += fee;
    console.log(
      `  BOUGHT ${size.toFixed(4)} @ ${(price * 100).toFixed(2)}¢  notional $${notional.toFixed(2)}  fee $${fee.toFixed(2)}  ${isMaker ? "maker" : "taker"}  ${ts}`
    );
  } else {
    sellNotional += notional;
    totalReceived += notional - fee;
    totalFees += fee;
    console.log(
      `  SOLD   ${size.toFixed(4)} @ ${(price * 100).toFixed(2)}¢  notional $${notional.toFixed(2)}  fee $${fee.toFixed(2)}  ${isMaker ? "maker" : "taker"}  ${ts}`
    );
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Buy notional (pre-fee):    $${buyNotional.toFixed(2)}`);
console.log(`Sell notional (pre-fee):   $${sellNotional.toFixed(2)}`);
console.log(`Total fees paid (est.):    $${totalFees.toFixed(2)}`);
console.log(`Cash out (sells after fee): $${totalReceived.toFixed(2)}`);
console.log(`Cash in (buys + fee):      $${totalSpent.toFixed(2)}`);
console.log(`\nNet P&L (after fees):      $${(totalReceived - totalSpent).toFixed(2)}`);
console.log(`${"=".repeat(60)}`);
