/**
 * Cancel a single CLOB order by ID.
 * Usage: npx tsx scripts/cancel-order.ts <orderID>
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ClobClient, ApiKeyCreds } from "@polymarket/clob-client";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("Missing PRIVATE_KEY");
  process.exit(1);
}

const orderID = process.argv[2];
if (!orderID) {
  console.error("Usage: npx tsx scripts/cancel-order.ts <orderID>");
  process.exit(1);
}

const signer = new ethers.Wallet(PK);
const l1 = new ClobClient("https://clob.polymarket.com", 137, signer);
const creds = (await l1.deriveApiKey()) as ApiKeyCreds;
const client = new ClobClient("https://clob.polymarket.com", 137, signer, creds);

console.log("Cancelling order:", orderID);
const resp = await client.cancelOrder({ orderID });
console.log("Response:", JSON.stringify(resp, null, 2));
