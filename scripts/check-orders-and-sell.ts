import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds, Side } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PK = process.env.PRIVATE_KEY!;
const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;
const YES_TOKEN = "62303532176600975928071294050852822678595973423664340193705561172322559276919";

const signer = new ethers.Wallet(PK);
console.log(`Wallet: ${signer.address}`);

const l1 = new ClobClient(HOST, CHAIN_ID, signer);
console.log("Deriving API key...");
const creds = await l1.deriveApiKey() as ApiKeyCreds;
console.log(`Key: ${creds.key.slice(0, 8)}...`);
const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

// 1. Check open orders
console.log("\n=== Open Orders ===");
const orders = await client.getOpenOrders();
const arr = orders as any[];
console.log(`Total open orders: ${arr.length}`);
for (const o of arr) {
  const tid = (o.asset_id ?? o.token_id ?? "").toString();
  const isSDST = tid === YES_TOKEN;
  console.log(`  ${o.side} ${o.original_size ?? o.size} @ ${o.price} ${isSDST ? "[SDST YES]" : ""} status=${o.status} id=${(o.id ?? o.order_id ?? "").toString().slice(0, 16)}...`);
}

// 2. Cancel ALL
console.log("\n=== Cancelling ALL orders ===");
await client.cancelAll();
console.log("Cancelled.");
await new Promise(r => setTimeout(r, 3000));

// 3. Verify
const orders2 = await client.getOpenOrders();
console.log(`Open orders after cancel: ${(orders2 as any[]).length}`);

// 4. Check on-chain balance
console.log("\n=== On-chain Balance ===");
const RPC = process.env.RPC_URL ?? "https://polygon-rpc.com";
const provider = new ethers.providers.JsonRpcProvider(RPC);
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const ctf = new ethers.Contract(CTF, ["function balanceOf(address,uint256) view returns (uint256)"], provider);
const rawBal = await ctf.balanceOf(signer.address, YES_TOKEN);
const bal = parseFloat(ethers.utils.formatUnits(rawBal, 6));
console.log(`YES token on-chain: ${bal}`);

// 5. Try progressively larger SELLs
console.log("\n=== Testing SELLs ===");
const tickSize = await client.getTickSize(YES_TOKEN);

// Clean slate: cancel and wait
await client.cancelAll();
await new Promise(r => setTimeout(r, 5000));
console.log("Waited 5s after cancelAll");

// Try full amount with floor
const sellAmt = Math.floor(bal);
console.log(`Trying SELL ${sellAmt} @ 0.40...`);
try {
  const resp = await client.createAndPostOrder({
    tokenID: YES_TOKEN,
    price: 0.40,
    size: sellAmt,
    side: Side.SELL,
  }, {
    tickSize,
    negRisk: false,
  });
  const oid = (resp as any)?.orderID ?? (resp as any)?.id ?? null;
  if (oid) {
    console.log(`SELL ${sellAmt} @ 0.40 → OK! ${oid}`);
    await client.cancelOrder({ orderID: oid });
    console.log("Cancelled.");
  } else {
    console.log(`SELL ${sellAmt} FAILED:`, JSON.stringify(resp).slice(0, 200));
    // Try smaller
    for (const sz of [15, 10]) {
      console.log(`\nTrying smaller: SELL ${sz} @ 0.40...`);
      await client.cancelAll();
      await new Promise(r => setTimeout(r, 3000));
      const r2 = await client.createAndPostOrder({
        tokenID: YES_TOKEN,
        price: 0.40,
        size: sz,
        side: Side.SELL,
      }, { tickSize, negRisk: false });
      const id2 = (r2 as any)?.orderID ?? (r2 as any)?.id ?? null;
      if (id2) {
        console.log(`SELL ${sz} → OK! ${id2}`);
        await client.cancelOrder({ orderID: id2 });
        break;
      } else {
        console.log(`SELL ${sz} FAILED:`, JSON.stringify(r2).slice(0, 200));
      }
    }
  }
} catch (err: any) {
  console.log(`SELL ERROR: ${err.message?.slice(0, 120)}`);
}
