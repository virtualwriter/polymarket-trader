/**
 * Redeem resolved Polymarket conditional tokens for USDC.
 *
 * Usage:
 *   npx tsx scripts/redeem-positions.ts                           # dry run — show balances only
 *   npx tsx scripts/redeem-positions.ts --execute                 # actually redeem
 *   npx tsx scripts/redeem-positions.ts --execute --condition 0x... # specific condition
 */

import { config } from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";

const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const ZERO_PARENT = "0x" + "00".repeat(32);

// Known resolved markets in this wallet
const KNOWN_CONDITIONS = [
  {
    name: "Trump meets Putin by Oct 31",
    conditionId: "0x480bddaf1d050a3adb9a9f1e0e42f770f133906ee428850a127944c31f2c7022",
  },
  {
    name: "US x Venezuela military engagement by Dec 31",
    conditionId: "0x62b0cd598091a179147acbd4616400f804acfdff6f76f029944b481b37cbd45f",
  },
  {
    name: "Will Zohran Mamdani win the 2025 NYC mayoral election?",
    conditionId: "0xebddfcf7b4401dade8b4031770a1ab942b01854f3bed453d5df9425cd9f211a9",
  },
];

const CTF_ABI = [
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
  "function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external pure returns (bytes32)",
  "function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256)",
  "function payoutDenominator(bytes32 conditionId) external view returns (uint256)",
  "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) external view returns (bytes32)",
  "function getPositionId(address collateralToken, bytes32 collectionId) external pure returns (uint256)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const conditionArg = args.find(a => a.startsWith("--condition"));
  const specificCondition = conditionArg
    ? args[args.indexOf(conditionArg) + 1]
    : undefined;

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const ctf = new ethers.Contract(CTF, CTF_ABI, wallet);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);

  console.log(`\n=== Polymarket Position Redeemer ===`);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Mode: ${execute ? "EXECUTE — will send real transaction" : "DRY RUN — showing balances only"}\n`);

  const usdcBefore = await usdc.balanceOf(wallet.address);
  console.log(`USDC balance: ${ethers.utils.formatUnits(usdcBefore, 6)} USDC\n`);

  const conditions = specificCondition
    ? [{ name: "Custom", conditionId: specificCondition }]
    : KNOWN_CONDITIONS;

  for (const market of conditions) {
    console.log(`--- ${market.name} ---`);
    console.log(`Condition: ${market.conditionId}`);

    // Check if condition is resolved (payoutDenominator > 0)
    const denom = await ctf.payoutDenominator(market.conditionId);
    if (denom.eq(0)) {
      console.log(`  Status: NOT RESOLVED (payoutDenominator = 0). Skipping.\n`);
      continue;
    }

    // Check payouts for each outcome
    const payout0 = await ctf.payoutNumerators(market.conditionId, 0);
    const payout1 = await ctf.payoutNumerators(market.conditionId, 1);
    console.log(`  Payout[YES]: ${payout0.toString()}/${denom.toString()}`);
    console.log(`  Payout[NO]:  ${payout1.toString()}/${denom.toString()}`);

    // indexSet=1 → outcome 0 (YES), indexSet=2 → outcome 1 (NO)
    for (const [label, indexSet] of [["YES", 1], ["NO", 2]] as const) {
      const collectionId = await ctf.getCollectionId(ZERO_PARENT, market.conditionId, indexSet);
      const positionId = await ctf.getPositionId(USDC, collectionId);
      const balance = await ctf.balanceOf(wallet.address, positionId);
      const balanceFormatted = ethers.utils.formatUnits(balance, 6);
      console.log(`  ${label} tokens: ${balanceFormatted} (positionId: ${positionId.toString().slice(0, 12)}...)`);
    }

    if (execute) {
      console.log(`\n  Redeeming...`);
      try {
        const feeData = await provider.getFeeData();
        const tx = await ctf.redeemPositions(
          USDC,
          ZERO_PARENT,
          market.conditionId,
          [1, 2],
          {
            gasLimit: 300_000,
            maxFeePerGas: feeData.maxFeePerGas?.mul(2) ?? ethers.utils.parseUnits("50", "gwei"),
            maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"),
          }
        );
        console.log(`  TX: ${tx.hash}`);
        console.log(`  Waiting for confirmation...`);
        const receipt = await tx.wait();
        console.log(`  ✓ Confirmed in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`);

        const usdcAfter = await usdc.balanceOf(wallet.address);
        const gained = usdcAfter.sub(usdcBefore);
        console.log(`  USDC gained: +${ethers.utils.formatUnits(gained, 6)} USDC`);
        console.log(`  New USDC balance: ${ethers.utils.formatUnits(usdcAfter, 6)} USDC`);
      } catch (err: any) {
        console.error(`  ✗ Redeem failed: ${err.message}`);
        if (err.data) console.error(`    Data: ${err.data}`);
      }
    } else {
      console.log(`\n  [DRY RUN] Would call redeemPositions. Pass --execute to redeem.`);
    }

    console.log();
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
