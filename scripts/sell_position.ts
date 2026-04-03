/**
 * One-shot: cancel all orders, then sell UCLA tokens at market.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PolymarketClient } from "../engine-src/live/PolymarketClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../config.env") });

const UCLA_TOKEN = "17213038992170993032794345669488673598879660498564883269009258628822353971632";
const SELL_QTY = 17.27;

async function main() {
  const polyClient = new PolymarketClient({
    privateKey: process.env.PRIVATE_KEY!,
    rpcUrl: process.env.RPC_URL || "https://polygon-rpc.com",
    clobUrl: process.env.CLOB_URL || "https://clob.polymarket.com",
    dryRun: false,
  });

  await polyClient.init();

  // Cancel all resting orders first to free up the token balance
  console.log("Cancelling all resting orders...");
  await polyClient.cancelAll();
  console.log("Orders cancelled. Waiting 2s...");
  await new Promise(r => setTimeout(r, 2000));

  // Fetch midpoint
  const resp = await fetch(
    `https://clob.polymarket.com/midpoint?token_id=${UCLA_TOKEN}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const midData = await resp.json() as any;
  const mid = parseFloat(midData.mid);
  console.log(`UCLA midpoint: ${(mid * 100).toFixed(1)}¢`);

  // Sell 1¢ below mid for quick fill
  const sellPrice = Math.round(Math.max(mid - 0.01, 0.01) * 100) / 100;
  console.log(`Selling ${SELL_QTY} UCLA tokens @ ${sellPrice} (${(sellPrice * 100).toFixed(0)}¢)`);
  console.log(`Expected proceeds: ~$${(SELL_QTY * sellPrice).toFixed(2)}`);
  console.log(`Est cost basis: ~$${(SELL_QTY * 0.19).toFixed(2)} (19¢/token)`);
  console.log(`Est profit: ~$${(SELL_QTY * (sellPrice - 0.19)).toFixed(2)}`);

  const orderId = await polyClient.placeOrder({
    tokenId: UCLA_TOKEN,
    price: sellPrice,
    size: SELL_QTY,
    side: "SELL",
  });

  if (orderId) {
    console.log(`\nOrder placed: ${orderId}`);
  } else {
    console.log("\nOrder failed.");
  }
}

main().catch(console.error);
