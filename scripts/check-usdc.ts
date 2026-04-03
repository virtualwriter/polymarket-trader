import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDCe = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const wallet = "0xAf8dd60D4911709A9c77a8cFC8C86E1A7D0Aea07";

const erc20abi = ["function balanceOf(address) view returns (uint256)"];
const ctfAbi = ["function balanceOf(address, uint256) view returns (uint256)"];

const usdc1 = new ethers.Contract(USDC, erc20abi, provider);
const usdc2 = new ethers.Contract(USDCe, erc20abi, provider);
const ctf = new ethers.Contract(CTF, ctfAbi, provider);

const YES = "104070808957599632212353434696238352742301464905231948158857624296031781435482";
const NO = "31351512591506292366822441756687915750268320195094814486168615178597816669774";

const [bal1, bal2, yBal, nBal] = await Promise.all([
  usdc1.balanceOf(wallet),
  usdc2.balanceOf(wallet),
  ctf.balanceOf(wallet, YES),
  ctf.balanceOf(wallet, NO),
]);

console.log("USDC (bridged):", Number(bal1) / 1e6);
console.log("USDC (native):", Number(bal2) / 1e6);
console.log("Total USDC:", (Number(bal1) + Number(bal2)) / 1e6);
console.log("YES tokens (Toledo):", Number(yBal) / 1e6, "→ worth $0 (Toledo lost)");
console.log("NO tokens (Akron):", Number(nBal) / 1e6, "→ worth $" + (Number(nBal) / 1e6).toFixed(3) + " (Akron won)");
