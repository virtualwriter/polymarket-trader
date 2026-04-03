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
const CHAIN_ID = 137;
const NO_TOKEN = "62262236796852504728386850150158118057653956204755093026742454486885322000162";

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient(HOST, CHAIN_ID, signer);
const creds = await l1.deriveApiKey() as ApiKeyCreds;
const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

const mode = process.argv[2] || "book";

if (mode === "book") {
  const book = await client.getOrderBook(NO_TOKEN);
  const asks = ((book as any).asks || []).sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
  const bids = ((book as any).bids || []).sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price));
  console.log("Utah State YES (SDST NO) orderbook:");
  console.log("Top bids:");
  for (const b of bids.slice(0, 5)) console.log(`  ${b.price} × ${b.size}`);
  console.log("Top asks:");
  for (const a of asks.slice(0, 5)) console.log(`  ${a.price} × ${a.size}`);
} else {
  const price = parseFloat(mode);
  const size = parseFloat(process.argv[3] || "100");
  console.log(`Buying ${size} Utah State YES (SDST NO) @ ${price}...`);
  const resp = await client.createAndPostOrder({
    tokenID: NO_TOKEN,
    price,
    size,
    side: "BUY",
  }, { tickSize: "0.01", negRisk: false });
  console.log("Response:", JSON.stringify(resp, null, 2));
}
