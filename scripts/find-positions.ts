/**
 * Find all CTF token positions held by the wallet, check if resolved,
 * and look up the market name from Gamma API.
 */

import { config } from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const WALLET = "0xAf8dd60D4911709A9c77a8cFC8C86E1A7D0Aea07";

const CTF_ABI = [
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
  "function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)",
];

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10_000 }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(d); } });
    }).on("error", reject);
  });
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const ctf = new ethers.Contract(CTF, CTF_ABI, provider);

// Scan TransferSingle events to this wallet to find all token IDs
const currentBlock = await provider.getBlockNumber();
console.log(`Scanning from block ${currentBlock - 2000000} to ${currentBlock}...`);

const filter = ctf.filters.TransferSingle(null, null, WALLET);
const events = await ctf.queryFilter(filter, currentBlock - 2000000, currentBlock);

const tokenIds = new Set<string>();
for (const e of events) {
  tokenIds.add(e.args!.id.toString());
}
console.log(`Found ${tokenIds.size} unique token IDs\n`);

// Check balance for each
for (const tokenId of tokenIds) {
  const balance = await ctf.balanceOf(WALLET, tokenId);
  if (balance.gt(0)) {
    const balFormatted = ethers.utils.formatUnits(balance, 6);
    console.log(`Token: ${tokenId.slice(0, 20)}...`);
    console.log(`  Balance: ${balFormatted}`);

    // Try to look up on Gamma API
    try {
      const data = await fetchJson(
        `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}&_limit=1`
      );
      if (data && data.length > 0) {
        console.log(`  Market: ${data[0].question}`);
        console.log(`  ConditionId: ${data[0].conditionId}`);
      }
    } catch {}
    console.log();
  }
}
