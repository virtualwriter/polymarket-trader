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
const YES_TOKEN = "62303532176600975928071294050852822678595973423664340193705561172322559276919";

const mode = process.argv[2] || "market";
const sizeArg = parseFloat(process.argv[3] || "18.5");

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient(HOST, CHAIN_ID, signer);
const creds = await l1.deriveApiKey() as ApiKeyCreds;
const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

if (mode === "sell") {
  const size = sizeArg;
  const price = parseFloat(process.argv[4] || "0.13");
  console.log("Cancelling all existing orders first...");
  await client.cancelAll();
  await new Promise(r => setTimeout(r, 3000));
  console.log(`Placing SELL ${size} SDST YES @ ${price}...`);
  const resp = await client.createAndPostOrder({
    tokenID: YES_TOKEN,
    price,
    size,
    side: "SELL",
  }, { tickSize: "0.01", negRisk: false });
  console.log("Response:", JSON.stringify(resp, null, 2));
} else if (mode === "book") {
  const book = await client.getOrderBook(YES_TOKEN);
  const asks = ((book as any).asks || []).sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
  const bids = ((book as any).bids || []).sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price));
  console.log("Top bids:");
  for (const b of bids.slice(0, 5)) console.log(`  ${b.price} × ${b.size}`);
  console.log("Top asks:");
  for (const a of asks.slice(0, 5)) console.log(`  ${a.price} × ${a.size}`);
} else {
  const book = await client.getOrderBook(YES_TOKEN);
  const asks = ((book as any).asks || []).sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;
  
  if (!bestAsk) { console.log("No asks on book"); process.exit(1); }
  
  const price = bestAsk;
  const size = mode === "market" ? sizeArg : parseFloat(mode);
  console.log(`Best ask: ${bestAsk}¢ — buying ${size} @ ${price}`);
  const resp = await client.createAndPostOrder({
    tokenID: YES_TOKEN,
    price,
    size,
    side: "BUY",
  }, { tickSize: "0.01", negRisk: false });
  console.log("Response:", JSON.stringify(resp, null, 2));
}
