/**
 * Emergency sell: dump all NO tokens for the McNeese/SFA game.
 * Places a market sell at the current best bid price.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds, Side } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

const NO_TOKEN_ID = "62262236796852504728386850150158118057653956204755093026742454486885322000162";
const NO_BALANCE = 26; // remaining

async function main() {
  const signer = new ethers.Wallet(PRIVATE_KEY);
  console.log(`Wallet: ${signer.address}`);

  // Init L1 client and derive API key
  const l1Client = new ClobClient(HOST, CHAIN_ID, signer);
  console.log("Deriving API credentials...");
  const creds = await l1Client.deriveApiKey() as ApiKeyCreds;
  console.log(`API key: ${creds.key.slice(0, 8)}...`);

  const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

  // First, cancel ALL open orders to free up any locked capital
  console.log("\n1. Cancelling all open orders...");
  await client.cancelAll();
  console.log("   All orders cancelled.");

  // Get the tick size
  const tickSize = await client.getTickSize(NO_TOKEN_ID);
  console.log(`\n2. Tick size: ${tickSize}`);

  // Check current orderbook for NO token to find best bid
  console.log("\n3. Checking orderbook for NO token...");
  try {
    const book = await client.getOrderBook(NO_TOKEN_ID);
    const bids = (book as any)?.bids ?? [];
    if (bids.length > 0) {
      console.log("   Best bids:");
      for (const b of bids.slice(0, 5)) {
        console.log(`     ${b.price} × ${b.size}`);
      }
    } else {
      console.log("   No bids found — might need to check the other token");
    }
  } catch (e: any) {
    console.log(`   Orderbook fetch failed: ${e.message}`);
  }

  // Sell in chunks to avoid slippage — sell at best bid prices
  // For a market sell, we place a SELL order at a very low price to guarantee fill
  const SELL_PRICE = 0.01; // minimum price — this is a market sell
  const CHUNK_SIZE = 500;  // sell in chunks

  let remaining = NO_BALANCE;
  let totalSold = 0;
  let chunk = 0;

  console.log(`\n4. Selling ${NO_BALANCE} NO tokens...`);

  while (remaining > 0) {
    chunk++;
    const size = Math.min(remaining, CHUNK_SIZE);

    console.log(`\n   Chunk ${chunk}: SELL ${size.toFixed(2)} NO tokens @ market (limit ${SELL_PRICE})...`);

    try {
      const resp = await client.createAndPostOrder({
        tokenID: NO_TOKEN_ID,
        price: SELL_PRICE,
        size,
        side: Side.SELL,
      }, {
        tickSize,
        negRisk: false,
      });

      const orderId = (resp as any)?.orderID ?? (resp as any)?.id ?? null;
      if (orderId) {
        console.log(`   Order placed: ${orderId}`);
        totalSold += size;
      } else {
        console.log(`   Order response:`, resp);
        // If it's an error about not enough tokens, try with less
        if (JSON.stringify(resp).includes("not enough")) {
          console.log("   Reducing size and retrying...");
          remaining = remaining / 2;
          continue;
        }
      }
    } catch (err: any) {
      console.error(`   Error: ${err.message}`);
      if (err.message.includes("not enough")) {
        remaining = remaining / 2;
        continue;
      }
      break;
    }

    remaining -= size;
    if (remaining > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n5. Done. Total sold: ${totalSold.toFixed(2)} NO tokens`);

  // Check remaining balance
  await new Promise(r => setTimeout(r, 2000));
  console.log("\n6. Checking open orders...");
  const openOrders = await client.getOpenOrders();
  console.log(`   Open orders: ${Array.isArray(openOrders) ? openOrders.length : 'unknown'}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
