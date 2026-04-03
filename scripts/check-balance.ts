import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const RPC = "https://polygon-rpc.com";
const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const abi = ["function balanceOf(address account, uint256 id) view returns (uint256)"];
const ctf = new ethers.Contract(CTF, abi, provider);
const wallet = "0xAf8dd60D4911709A9c77a8cFC8C86E1A7D0Aea07";

const YES = process.argv[2] || "104070808957599632212353434696238352742301464905231948158857624296031781435482";
const NO = process.argv[3] || "31351512591506292366822441756687915750268320195094814486168615178597816669774";

const [yBal, nBal] = await Promise.all([ctf.balanceOf(wallet, YES), ctf.balanceOf(wallet, NO)]);
console.log("YES balance:", Number(yBal) / 1e6);
console.log("NO balance:", Number(nBal) / 1e6);
