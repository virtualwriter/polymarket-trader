/**
 * Sell entire on-chain CTF balance of a token at current best bid.
 * Usage: npx tsx scripts/sell-all-token-at-bid.ts <tokenId> [tickSize]
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

const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const tokenId = process.argv[2];
const tickSize = (process.argv[3] || "0.001") as TickSize;

if (!tokenId) {
  console.error("Usage: npx tsx scripts/sell-all-token-at-bid.ts <tokenId> [tickSize]");
  process.exit(1);
}

const provider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL || "https://polygon-bor-rpc.publicnode.com"
);
const wallet = new ethers.Wallet(PK, provider);
const ctf = new ethers.Contract(
  CTF,
  ["function balanceOf(address account, uint256 id) view returns (uint256)"],
  provider
);

const raw = await ctf.balanceOf(wallet.address, tokenId);
const exact = Number(raw) / 1e6;
// Match typical CLOB 2-decimal share sizes; avoid rounding up past balance
const size = Math.floor(exact * 100) / 100;

if (size < 5) {
  console.error(`Balance ${exact} → sell size ${size} (min order often 5 shares)`);
  process.exit(1);
}

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient("https://clob.polymarket.com", 137, signer);
const creds = (await l1.deriveApiKey()) as ApiKeyCreds;
const client = new ClobClient("https://clob.polymarket.com", 137, signer, creds);

const book = await client.getOrderBook(tokenId);
const bids = ((book as any).bids || []).sort(
  (a: any, b: any) => parseFloat(b.price) - parseFloat(a.price)
);
if (!bids.length) {
  console.error("No bids — cannot sell");
  process.exit(1);
}

const bestBid = parseFloat(bids[0].price);
console.log(`Wallet: ${wallet.address}`);
console.log(`On-chain balance: ${exact} shares → selling ${size} @ best bid ${(bestBid * 100).toFixed(2)}¢`);
console.log(`~Gross USDC: $${(size * bestBid).toFixed(2)} (before fees)`);

const resp = await client.createAndPostOrder(
  { tokenID: tokenId, price: bestBid, size, side: Side.SELL },
  { tickSize, negRisk: false }
);
console.log("Response:", JSON.stringify(resp, null, 2));
