/**
 * One-time on-chain setup: approve USDC and CTF tokens for Polymarket exchange.
 *
 * Run once before live trading:
 *   npx tsx scripts/setup-approvals.ts
 *
 * Requires:
 *   - PRIVATE_KEY or HYPERLIQUID_MNEMONIC in .env or config.env
 *   - Small amount of POL (MATIC) for gas on Polygon
 *   - USDC balance in the wallet
 *
 * Optional safety controls:
 *   - POLYMARKET_USDC_APPROVAL_USD=5 approves only $5 instead of unlimited
 *   - POLYMARKET_SKIP_CTF_APPROVAL=1 skips CTF setApprovalForAll
 */

import { config } from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";

function signerFromEnv(): ethers.Wallet {
  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (privateKey) return new ethers.Wallet(privateKey);

  const mnemonic = process.env.HYPERLIQUID_MNEMONIC?.trim();
  if (mnemonic) return ethers.Wallet.fromMnemonic(mnemonic);

  console.error("Missing PRIVATE_KEY or HYPERLIQUID_MNEMONIC");
  process.exit(1);
}

// Polymarket contract addresses on Polygon mainnet
const EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const CTF_ABI = [
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
];

const APPROVAL_USD = process.env.POLYMARKET_USDC_APPROVAL_USD?.trim() || "10000";
const APPROVE_MAX_USDC = APPROVAL_USD.toLowerCase() === "max";
const SKIP_CTF_APPROVAL = process.env.POLYMARKET_SKIP_CTF_APPROVAL === "1";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = signerFromEnv().connect(provider);
  const address = wallet.address;

  console.log(`\n=== Polymarket On-Chain Setup ===`);
  console.log(`Wallet: ${address}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Exchange: ${EXCHANGE}\n`);

  // Check balances
  const polBalance = await provider.getBalance(address);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const usdcBalance = await usdc.balanceOf(address);
  const usdcDecimals = await usdc.decimals();

  console.log(`POL balance: ${ethers.utils.formatEther(polBalance)} POL`);
  console.log(`USDC balance: ${ethers.utils.formatUnits(usdcBalance, usdcDecimals)} USDC`);

  if (polBalance.lt(ethers.utils.parseEther("0.01"))) {
    console.error("\n⚠ Need at least 0.01 POL for gas. Fund your wallet first.");
    process.exit(1);
  }

  const targetUsdcAllowance = APPROVE_MAX_USDC
    ? ethers.constants.MaxUint256
    : ethers.utils.parseUnits(APPROVAL_USD, usdcDecimals);

  // Check and set USDC approval
  const usdcAllowance = await usdc.allowance(address, EXCHANGE);
  console.log(`USDC allowance: ${ethers.utils.formatUnits(usdcAllowance, usdcDecimals)} USDC`);
  console.log(`Target USDC allowance: ${APPROVE_MAX_USDC ? "MAX_UINT" : `${APPROVAL_USD} USDC`}`);
  if (usdcAllowance.lt(targetUsdcAllowance)) {
    console.log(`\nApproving USDC for exchange (${APPROVE_MAX_USDC ? "MAX_UINT" : `${APPROVAL_USD} USDC`})...`);
    const tx = await usdc.approve(EXCHANGE, targetUsdcAllowance);
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    console.log(`  USDC approved.`);
  } else {
    console.log(`USDC already approved.`);
  }

  // Check and set CTF approval
  const ctf = new ethers.Contract(CTF, CTF_ABI, wallet);
  const ctfApproved = await ctf.isApprovedForAll(address, EXCHANGE);
  console.log(`CTF approved for exchange: ${ctfApproved}`);
  if (SKIP_CTF_APPROVAL) {
    console.log(`Skipping CTF approval (POLYMARKET_SKIP_CTF_APPROVAL=1).`);
  } else if (!ctfApproved) {
    console.log(`\nApproving CTF tokens for exchange...`);
    const tx = await ctf.setApprovalForAll(EXCHANGE, true);
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    console.log(`  CTF approved.`);
  } else {
    console.log(`CTF already approved.`);
  }

  console.log(`\n✓ Setup complete. You can now run the live trading server.`);
  console.log(`  Dry run:  npx tsx scripts/live-trading-server.ts`);
  console.log(`  Live:     npx tsx scripts/live-trading-server.ts --live`);
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
