/**
 * Sell YES tokens for the Delaware State / Morgan State game.
 * Queries on-chain balance, checks the orderbook, and sells at best bid.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";
const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

const YES_TOKEN_ID = "32047635195810652453298632403643026552817495082935407657270367357359661637711";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const CTF_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

async function main() {
  const signer = new ethers.Wallet(PRIVATE_KEY);
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);

  console.log(`Wallet: ${signer.address}`);

  // 1. Check on-chain YES token balance
  console.log("\n1. Checking YES token balance...");
  const balance = await ctf.balanceOf(signer.address, YES_TOKEN_ID);
  const balanceFormatted = ethers.utils.formatUnits(balance, 6);
  console.log(`   YES tokens held: ${balanceFormatted}`);

  if (balance.eq(0)) {
    console.log("   No YES tokens to sell. Done.");
    return;
  }

  // 2. Init CLOB client
  const l1Client = new ClobClient(HOST, CHAIN_ID, signer);
  console.log("\n2. Deriving API credentials...");
  const creds = await l1Client.deriveApiKey() as ApiKeyCreds;
  console.log(`   API key: ${creds.key.slice(0, 8)}...`);
  const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

  // 3. Check orderbook for best bid
  console.log("\n3. Checking YES token orderbook...");
  try {
    const book = await client.getOrderBook(YES_TOKEN_ID);
    const bids = (book as any)?.bids ?? [];
    if (bids.length > 0) {
      console.log("   Best bids:");
      for (const b of bids.slice(0, 5)) {
        console.log(`     ${b.price} × ${b.size}`);
      }
    } else {
      console.log("   No bids on YES book");
    }
  } catch (e: any) {
    console.log(`   Orderbook fetch failed: ${e.message}`);
  }

  // 4. Get midpoint for reference
  try {
    const midRes = await fetch(`${HOST}/midpoint?token_id=${YES_TOKEN_ID}`);
    const midData = await midRes.json() as any;
    console.log(`\n   Current midpoint: ${midData.mid}`);
  } catch {}

  // 5. Get tick size
  const tickSize = await client.getTickSize(YES_TOKEN_ID);
  console.log(`   Tick size: ${tickSize}`);

  // 6. Sell at a limit price slightly below midpoint to ensure fill
  //    We use the best bid approach — place a SELL at midpoint - 1¢ for quick fill
  const sellSize = parseFloat(balanceFormatted);
  const sellPrice = 0.76; // Slightly below current ~78¢ for fast fill

  console.log(`\n4. SELLING ${sellSize.toFixed(2)} YES tokens @ ${sellPrice}...`);

  try {
    const resp = await client.createAndPostOrder({
      tokenID: YES_TOKEN_ID,
      price: sellPrice,
      size: sellSize,
      side: "SELL",
    }, {
      tickSize: tickSize as string,
      negRisk: false,
    });

    const orderId = (resp as any)?.orderID ?? (resp as any)?.id ?? null;
    if (orderId) {
      console.log(`   SELL order placed: ${orderId}`);
      console.log(`   Expected proceeds: ~$${(sellSize * sellPrice).toFixed(2)}`);
    } else {
      console.log(`   Order response:`, JSON.stringify(resp, null, 2));
    }
  } catch (err: any) {
    console.error(`   SELL failed: ${err.message}`);
    if (err.message?.includes("not enough")) {
      console.log("   Token balance may be locked in orders. Cancel orders first.");
    }
  }

  // 7. Wait and check
  await new Promise(r => setTimeout(r, 3000));
  console.log("\n5. Checking open orders...");
  const openOrders = await client.getOpenOrders();
  const myOrders = (openOrders as any[]).filter((o: any) =>
    o.asset_id === YES_TOKEN_ID || o.token_id === YES_TOKEN_ID
  );
  console.log(`   Open orders: ${(openOrders as any[]).length} total, ${myOrders.length} for this token`);
  for (const o of myOrders) {
    console.log(`     ${o.side} ${o.original_size ?? o.size} @ ${o.price} — status: ${o.status ?? "unknown"}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
