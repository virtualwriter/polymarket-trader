/**
 * Quick check: token balances, open orders, and NO book liquidity.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const signer = new ethers.Wallet(process.env.PRIVATE_KEY!);
const HOST = "https://clob.polymarket.com";
const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";

const YES = "32047635195810652453298632403643026552817495082935407657270367357359661637711";
const NO = "43786153355425126154363628916682948090381198815611724109017515048033131369026";
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

async function main() {
  // 1. On-chain balances
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const ctf = new ethers.Contract(CTF, ["function balanceOf(address,uint256) view returns (uint256)"], provider);
  const yesBal = await ctf.balanceOf(signer.address, YES);
  const noBal = await ctf.balanceOf(signer.address, NO);
  console.log("=== TOKEN BALANCES ===");
  console.log(`YES: ${ethers.utils.formatUnits(yesBal, 6)}`);
  console.log(`NO:  ${ethers.utils.formatUnits(noBal, 6)}`);

  // 2. Open orders
  const l1 = new ClobClient(HOST, 137, signer);
  const creds = await l1.deriveApiKey() as ApiKeyCreds;
  const client = new ClobClient(HOST, 137, signer, creds);

  const orders = await client.getOpenOrders();
  console.log("\n=== ALL OPEN ORDERS ===");
  for (const o of (orders as any[])) {
    const tokenShort = (o.asset_id ?? o.token_id ?? "?").slice(0, 12);
    console.log(`  ${o.side} ${o.original_size ?? o.size} @ ${o.price} token=${tokenShort}... status=${o.status ?? "?"} id=${(o.id ?? "").slice(0, 16)}`);
  }

  // 3. NO book
  const noBook = await client.getOrderBook(NO);
  const noBids = (noBook as any)?.bids ?? [];
  const noAsks = (noBook as any)?.asks ?? [];
  console.log("\n=== NO TOKEN ORDERBOOK ===");
  console.log("Bids (top 5):");
  for (const b of noBids.slice(0, 5)) console.log(`  ${b.price} × ${b.size}`);
  console.log("Asks (top 5):");
  for (const a of noAsks.slice(0, 5)) console.log(`  ${a.price} × ${a.size}`);

  // 4. YES book
  const yesBook = await client.getOrderBook(YES);
  const yesBids = (yesBook as any)?.bids ?? [];
  const yesAsks = (yesBook as any)?.asks ?? [];
  console.log("\n=== YES TOKEN ORDERBOOK ===");
  console.log("Bids (top 5):");
  for (const b of yesBids.slice(0, 5)) console.log(`  ${b.price} × ${b.size}`);
  console.log("Asks (top 5):");
  for (const a of yesAsks.slice(0, 5)) console.log(`  ${a.price} × ${a.size}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
