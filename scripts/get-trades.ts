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
const signer = new ethers.Wallet(PK);
const WALLET = signer.address.toLowerCase();
const l1 = new ClobClient(HOST, 137, signer);
const creds = await l1.deriveApiKey() as ApiKeyCreds;
const client = new ClobClient(HOST, 137, signer, creds);

const YES = "104070808957599632212353434696238352742301464905231948158857624296031781435482";
const NO = "31351512591506292366822441756687915750268320195094814486168615178597816669774";

// Paginate through ALL trades
async function fetchAll(tokenId: string): Promise<any[]> {
  let all: any[] = [];
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

const yesTrades = await fetchAll(YES);
const noTrades = await fetchAll(NO);

console.log(`Wallet: ${WALLET}`);
console.log(`YES trades: ${yesTrades.length}, NO trades: ${noTrades.length}\n`);

// Print first trade raw to understand structure
if (yesTrades.length > 0) {
  const t = yesTrades[0];
  console.log("Sample trade raw:");
  for (const k of Object.keys(t)) {
    const v = typeof t[k] === "object" ? JSON.stringify(t[k]) : t[k];
    console.log(`  ${k}: ${v}`);
  }
  console.log();
}

let totalSpent = 0, totalReceived = 0;

function analyze(trades: any[], label: string) {
  console.log(`\n--- ${label} (${trades.length} trades) ---`);
  
  for (const t of trades) {
    const price = parseFloat(t.price);
    const size = parseFloat(t.size);
    const notional = price * size;
    const maker = (t.maker_address || "").toLowerCase();
    const isMaker = maker === WALLET;
    const side = t.side; // maker's side
    const traderSide = t.trader_side || "";
    const feeBps = t.fee_rate_bps || 0;

    // The `side` field = maker's side.
    // If we are maker: side=BUY → we bought, side=SELL → we sold
    // If we are taker: side=BUY → maker bought (we sold), side=SELL → maker sold (we bought)
    let weBought: boolean;
    if (isMaker) {
      weBought = side === "BUY";
    } else {
      weBought = side === "SELL"; // maker sold to us
    }

    const action = weBought ? "BOUGHT" : "SOLD  ";
    const fee = notional * feeBps / 10000;

    if (weBought) {
      totalSpent += notional + fee;
    } else {
      totalReceived += notional - fee;
    }

    const ts = t.match_time ? new Date(parseInt(t.match_time) * 1000).toISOString().slice(11, 19) : "";

    console.log(
      `  ${action} ${size.toFixed(2).padStart(8)} @ ${(price * 100).toFixed(1).padStart(5)}¢` +
      ` = $${notional.toFixed(2).padStart(7)}` +
      ` (fee $${fee.toFixed(2)})` +
      ` | ${isMaker ? "maker" : "taker"} trader_side=${traderSide} | ${ts}`
    );
  }
}

analyze(yesTrades, "YES (Toledo)");
analyze(noTrades, "NO (Akron)");

console.log(`\n${"=".repeat(60)}`);
console.log(`Total spent (buys + fees):  $${totalSpent.toFixed(2)}`);
console.log(`Total received (sells-fees): $${totalReceived.toFixed(2)}`);
console.log(`Trading P&L:                 $${(totalReceived - totalSpent).toFixed(2)}`);
console.log(`On-chain remaining: 7.02 YES ($0) + 0.002 NO ($0.002)`);
console.log(`\nActual USDC loss: $168 → $142.11 = -$${(168 - 142.11).toFixed(2)}`);
