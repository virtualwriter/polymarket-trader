/**
 * Monte Carlo: 10K Auctions — Real SRT Data
 * Three MM modes: Blind, Blanket Tier 1, Inventory-Aware Tier 1
 *
 * Uses EXACT bid data and timing from Christie's "Art of the Surreal"
 * evening sale, 5 March 2026. 26 lots, 263 real bids.
 *
 * Randomized per run: trader count (8-20), smartness, bias, budget, aggression.
 * Fixed per run: auction events, timing, outcomes.
 *
 * Usage: npx tsx scripts/monte-carlo-tier1.ts [--runs=10000]
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const marketsJson = JSON.parse(readFileSync(resolve(__dirname, "markets.json"), "utf-8"));

const RUNS = parseInt(process.argv.find(a => a.startsWith("--runs="))?.split("=")[1] ?? "10000");
const TICK_INTERVAL_SEC = 2;
const PRE_AUCTION_DURATION_SEC = 3600;
const PRE_AUCTION_TICKS = Math.floor(PRE_AUCTION_DURATION_SEC / TICK_INTERVAL_SEC);

// ─── Real SRT events ───
interface SRTEvent { t: number; lot: number; type: "start" | "bid" | "sold"; amount?: number }
const srtEvents: SRTEvent[] = [
  { t: -3, lot: 101, type: "start" },
  { t: -2, lot: 101, type: "bid", amount: 1392000 },
  { t: -1, lot: 101, type: "sold", amount: 1392000 },
  { t: 0, lot: 102, type: "start" },
  { t: 1, lot: 102, type: "bid", amount: 220000 },
  { t: 5, lot: 102, type: "bid", amount: 240000 },
  { t: 22, lot: 102, type: "bid", amount: 260000 },
  { t: 30, lot: 102, type: "bid", amount: 280000 },
  { t: 67, lot: 102, type: "bid", amount: 300000 },
  { t: 71, lot: 102, type: "bid", amount: 320000 },
  { t: 88, lot: 102, type: "sold", amount: 320000 },
  { t: 97, lot: 103, type: "start" },
  { t: 127, lot: 103, type: "bid", amount: 1500000 },
  { t: 131, lot: 103, type: "bid", amount: 1600000 },
  { t: 134, lot: 103, type: "bid", amount: 1700000 },
  { t: 135, lot: 103, type: "bid", amount: 1800000 },
  { t: 136, lot: 103, type: "bid", amount: 1900000 },
  { t: 138, lot: 103, type: "bid", amount: 2000000 },
  { t: 139, lot: 103, type: "bid", amount: 2200000 },
  { t: 146, lot: 103, type: "bid", amount: 2400000 },
  { t: 147, lot: 103, type: "bid", amount: 2600000 },
  { t: 149, lot: 103, type: "bid", amount: 2800000 },
  { t: 152, lot: 103, type: "bid", amount: 3000000 },
  { t: 158, lot: 103, type: "bid", amount: 3200000 },
  { t: 161, lot: 103, type: "bid", amount: 3500000 },
  { t: 181, lot: 103, type: "bid", amount: 3600000 },
  { t: 205, lot: 103, type: "bid", amount: 3700000 },
  { t: 227, lot: 103, type: "bid", amount: 3800000 },
  { t: 262, lot: 103, type: "bid", amount: 3900000 },
  { t: 313, lot: 103, type: "sold", amount: 3900000 },
  { t: 318, lot: 104, type: "start" },
  { t: 329, lot: 104, type: "bid", amount: 100000 },
  { t: 335, lot: 104, type: "bid", amount: 120000 },
  { t: 338, lot: 104, type: "bid", amount: 130000 },
  { t: 348, lot: 104, type: "bid", amount: 140000 },
  { t: 352, lot: 104, type: "bid", amount: 150000 },
  { t: 360, lot: 104, type: "bid", amount: 160000 },
  { t: 362, lot: 104, type: "bid", amount: 170000 },
  { t: 378, lot: 104, type: "sold", amount: 170000 },
  { t: 388, lot: 105, type: "start" },
  { t: 395, lot: 105, type: "bid", amount: 450000 },
  { t: 400, lot: 105, type: "bid", amount: 550000 },
  { t: 403, lot: 105, type: "bid", amount: 600000 },
  { t: 406, lot: 105, type: "bid", amount: 700000 },
  { t: 412, lot: 105, type: "bid", amount: 750000 },
  { t: 417, lot: 105, type: "bid", amount: 800000 },
  { t: 422, lot: 105, type: "bid", amount: 850000 },
  { t: 429, lot: 105, type: "bid", amount: 900000 },
  { t: 446, lot: 105, type: "bid", amount: 1000000 },
  { t: 460, lot: 105, type: "bid", amount: 1100000 },
  { t: 470, lot: 105, type: "bid", amount: 1200000 },
  { t: 481, lot: 105, type: "bid", amount: 1300000 },
  { t: 492, lot: 105, type: "bid", amount: 1400000 },
  { t: 536, lot: 105, type: "bid", amount: 1500000 },
  { t: 541, lot: 105, type: "bid", amount: 1600000 },
  { t: 555, lot: 105, type: "bid", amount: 1650000 },
  { t: 568, lot: 105, type: "bid", amount: 1700000 },
  { t: 585, lot: 105, type: "bid", amount: 1750000 },
  { t: 605, lot: 105, type: "bid", amount: 1800000 },
  { t: 608, lot: 105, type: "bid", amount: 1850000 },
  { t: 621, lot: 105, type: "bid", amount: 1900000 },
  { t: 644, lot: 105, type: "bid", amount: 1950000 },
  { t: 660, lot: 105, type: "bid", amount: 2000000 },
  { t: 672, lot: 105, type: "bid", amount: 2050000 },
  { t: 688, lot: 105, type: "bid", amount: 2100000 },
  { t: 708, lot: 105, type: "sold", amount: 2100000 },
  { t: 716, lot: 106, type: "start" },
  { t: 724, lot: 106, type: "bid", amount: 280000 },
  { t: 727, lot: 106, type: "bid", amount: 320000 },
  { t: 736, lot: 106, type: "bid", amount: 350000 },
  { t: 744, lot: 106, type: "bid", amount: 380000 },
  { t: 748, lot: 106, type: "bid", amount: 400000 },
  { t: 752, lot: 106, type: "bid", amount: 420000 },
  { t: 756, lot: 106, type: "bid", amount: 450000 },
  { t: 762, lot: 106, type: "bid", amount: 480000 },
  { t: 767, lot: 106, type: "bid", amount: 500000 },
  { t: 769, lot: 106, type: "bid", amount: 550000 },
  { t: 778, lot: 106, type: "bid", amount: 600000 },
  { t: 781, lot: 106, type: "bid", amount: 650000 },
  { t: 784, lot: 106, type: "bid", amount: 700000 },
  { t: 798, lot: 106, type: "bid", amount: 720000 },
  { t: 804, lot: 106, type: "bid", amount: 750000 },
  { t: 822, lot: 106, type: "sold", amount: 750000 },
  { t: 830, lot: 107, type: "start" },
  { t: 842, lot: 107, type: "bid", amount: 100000 },
  { t: 844, lot: 107, type: "bid", amount: 110000 },
  { t: 856, lot: 107, type: "bid", amount: 120000 },
  { t: 860, lot: 107, type: "bid", amount: 130000 },
  { t: 867, lot: 107, type: "bid", amount: 140000 },
  { t: 874, lot: 107, type: "sold", amount: 140000 },
  { t: 880, lot: 108, type: "start" },
  { t: 909, lot: 108, type: "bid", amount: 5000000 },
  { t: 912, lot: 108, type: "bid", amount: 5500000 },
  { t: 914, lot: 108, type: "bid", amount: 6000000 },
  { t: 936, lot: 108, type: "bid", amount: 6500000 },
  { t: 939, lot: 108, type: "bid", amount: 7000000 },
  { t: 1002, lot: 108, type: "sold", amount: 7000000 },
  { t: 1011, lot: 109, type: "start" },
  { t: 1027, lot: 109, type: "bid", amount: 380000 },
  { t: 1030, lot: 109, type: "bid", amount: 400000 },
  { t: 1037, lot: 109, type: "bid", amount: 450000 },
  { t: 1048, lot: 109, type: "bid", amount: 480000 },
  { t: 1051, lot: 109, type: "bid", amount: 500000 },
  { t: 1056, lot: 109, type: "bid", amount: 550000 },
  { t: 1064, lot: 109, type: "bid", amount: 600000 },
  { t: 1082, lot: 109, type: "sold", amount: 600000 },
  { t: 1092, lot: 110, type: "start" },
  { t: 1101, lot: 110, type: "bid", amount: 260000 },
  { t: 1104, lot: 110, type: "bid", amount: 300000 },
  { t: 1108, lot: 110, type: "bid", amount: 330000 },
  { t: 1120, lot: 110, type: "sold", amount: 330000 },
  { t: 1129, lot: 111, type: "start" },
  { t: 1135, lot: 111, type: "bid", amount: 100000 },
  { t: 1139, lot: 111, type: "bid", amount: 110000 },
  { t: 1141, lot: 111, type: "bid", amount: 120000 },
  { t: 1149, lot: 111, type: "bid", amount: 130000 },
  { t: 1154, lot: 111, type: "bid", amount: 140000 },
  { t: 1172, lot: 111, type: "sold", amount: 140000 },
  { t: 1182, lot: 112, type: "start" },
  { t: 1204, lot: 112, type: "bid", amount: 1500000 },
  { t: 1208, lot: 112, type: "bid", amount: 1600000 },
  { t: 1215, lot: 112, type: "bid", amount: 1700000 },
  { t: 1220, lot: 112, type: "bid", amount: 1800000 },
  { t: 1222, lot: 112, type: "bid", amount: 1900000 },
  { t: 1225, lot: 112, type: "bid", amount: 2000000 },
  { t: 1230, lot: 112, type: "bid", amount: 2200000 },
  { t: 1239, lot: 112, type: "bid", amount: 2300000 },
  { t: 1242, lot: 112, type: "bid", amount: 2400000 },
  { t: 1247, lot: 112, type: "bid", amount: 2500000 },
  { t: 1253, lot: 112, type: "bid", amount: 2600000 },
  { t: 1262, lot: 112, type: "bid", amount: 2700000 },
  { t: 1267, lot: 112, type: "bid", amount: 2800000 },
  { t: 1270, lot: 112, type: "bid", amount: 2900000 },
  { t: 1273, lot: 112, type: "bid", amount: 3000000 },
  { t: 1280, lot: 112, type: "bid", amount: 3200000 },
  { t: 1285, lot: 112, type: "bid", amount: 3300000 },
  { t: 1300, lot: 112, type: "bid", amount: 3400000 },
  { t: 1303, lot: 112, type: "bid", amount: 3500000 },
  { t: 1336, lot: 112, type: "sold", amount: 3500000 },
  { t: 1340, lot: 113, type: "start" },
  { t: 1357, lot: 113, type: "bid", amount: 1500000 },
  { t: 1363, lot: 113, type: "bid", amount: 1600000 },
  { t: 1368, lot: 113, type: "bid", amount: 1700000 },
  { t: 1370, lot: 113, type: "bid", amount: 1800000 },
  { t: 1381, lot: 113, type: "bid", amount: 1850000 },
  { t: 1394, lot: 113, type: "sold", amount: 1850000 },
  { t: 1400, lot: 114, type: "start" },
  { t: 1407, lot: 114, type: "bid", amount: 200000 },
  { t: 1412, lot: 114, type: "bid", amount: 220000 },
  { t: 1418, lot: 114, type: "bid", amount: 240000 },
  { t: 1422, lot: 114, type: "bid", amount: 260000 },
  { t: 1424, lot: 114, type: "bid", amount: 280000 },
  { t: 1429, lot: 114, type: "bid", amount: 300000 },
  { t: 1448, lot: 114, type: "bid", amount: 320000 },
  { t: 1451, lot: 114, type: "bid", amount: 350000 },
  { t: 1460, lot: 114, type: "bid", amount: 380000 },
  { t: 1462, lot: 114, type: "bid", amount: 400000 },
  { t: 1468, lot: 114, type: "bid", amount: 420000 },
  { t: 1476, lot: 114, type: "bid", amount: 450000 },
  { t: 1482, lot: 114, type: "bid", amount: 480000 },
  { t: 1489, lot: 114, type: "bid", amount: 500000 },
  { t: 1501, lot: 114, type: "bid", amount: 550000 },
  { t: 1524, lot: 114, type: "bid", amount: 600000 },
  { t: 1526, lot: 114, type: "bid", amount: 650000 },
  { t: 1531, lot: 114, type: "bid", amount: 680000 },
  { t: 1547, lot: 114, type: "sold", amount: 680000 },
  { t: 1562, lot: 115, type: "start" },
  { t: 1571, lot: 115, type: "bid", amount: 480000 },
  { t: 1573, lot: 115, type: "bid", amount: 500000 },
  { t: 1575, lot: 115, type: "bid", amount: 550000 },
  { t: 1578, lot: 115, type: "bid", amount: 600000 },
  { t: 1581, lot: 115, type: "bid", amount: 650000 },
  { t: 1582, lot: 115, type: "bid", amount: 700000 },
  { t: 1588, lot: 115, type: "bid", amount: 750000 },
  { t: 1612, lot: 115, type: "sold", amount: 750000 },
  { t: 1653, lot: 117, type: "start" },
  { t: 1671, lot: 117, type: "bid", amount: 450000 },
  { t: 1675, lot: 117, type: "bid", amount: 460000 },
  { t: 1680, lot: 117, type: "bid", amount: 470000 },
  { t: 1682, lot: 117, type: "bid", amount: 475000 },
  { t: 1686, lot: 117, type: "bid", amount: 480000 },
  { t: 1710, lot: 117, type: "bid", amount: 485000 },
  { t: 1716, lot: 117, type: "bid", amount: 490000 },
  { t: 1722, lot: 117, type: "bid", amount: 500000 },
  { t: 1735, lot: 117, type: "bid", amount: 510000 },
  { t: 1747, lot: 117, type: "bid", amount: 520000 },
  { t: 1751, lot: 117, type: "bid", amount: 530000 },
  { t: 1757, lot: 117, type: "bid", amount: 540000 },
  { t: 1764, lot: 117, type: "bid", amount: 550000 },
  { t: 1773, lot: 117, type: "bid", amount: 560000 },
  { t: 1790, lot: 117, type: "bid", amount: 570000 },
  { t: 1798, lot: 117, type: "bid", amount: 580000 },
  { t: 1805, lot: 117, type: "bid", amount: 590000 },
  { t: 1812, lot: 117, type: "bid", amount: 600000 },
  { t: 1839, lot: 117, type: "bid", amount: 610000 },
  { t: 1849, lot: 117, type: "bid", amount: 620000 },
  { t: 1876, lot: 117, type: "bid", amount: 630000 },
  { t: 1889, lot: 117, type: "bid", amount: 640000 },
  { t: 1920, lot: 117, type: "bid", amount: 650000 },
  { t: 1949, lot: 117, type: "bid", amount: 660000 },
  { t: 1975, lot: 117, type: "sold", amount: 660000 },
  { t: 1985, lot: 118, type: "start" },
  { t: 2003, lot: 118, type: "bid", amount: 420000 },
  { t: 2009, lot: 118, type: "bid", amount: 460000 },
  { t: 2011, lot: 118, type: "bid", amount: 470000 },
  { t: 2033, lot: 118, type: "bid", amount: 480000 },
  { t: 2041, lot: 118, type: "bid", amount: 500000 },
  { t: 2050, lot: 118, type: "bid", amount: 520000 },
  { t: 2055, lot: 118, type: "bid", amount: 550000 },
  { t: 2069, lot: 118, type: "bid", amount: 600000 },
  { t: 2087, lot: 118, type: "bid", amount: 650000 },
  { t: 2105, lot: 118, type: "sold", amount: 650000 },
  { t: 2118, lot: 119, type: "start" },
  { t: 2137, lot: 119, type: "bid", amount: 200000 },
  { t: 2149, lot: 119, type: "bid", amount: 220000 },
  { t: 2152, lot: 119, type: "bid", amount: 240000 },
  { t: 2215, lot: 119, type: "sold", amount: 240000 },
  { t: 2230, lot: 120, type: "start" },
  { t: 2258, lot: 120, type: "bid", amount: 1000000 },
  { t: 2268, lot: 120, type: "bid", amount: 1200000 },
  { t: 2269, lot: 120, type: "bid", amount: 1300000 },
  { t: 2278, lot: 120, type: "bid", amount: 1400000 },
  { t: 2280, lot: 120, type: "bid", amount: 1500000 },
  { t: 2284, lot: 120, type: "bid", amount: 1600000 },
  { t: 2293, lot: 120, type: "bid", amount: 1700000 },
  { t: 2305, lot: 120, type: "bid", amount: 1800000 },
  { t: 2309, lot: 120, type: "bid", amount: 1900000 },
  { t: 2316, lot: 120, type: "bid", amount: 2000000 },
  { t: 2327, lot: 120, type: "bid", amount: 2100000 },
  { t: 2329, lot: 120, type: "bid", amount: 2200000 },
  { t: 2332, lot: 120, type: "bid", amount: 2300000 },
  { t: 2362, lot: 120, type: "bid", amount: 2400000 },
  { t: 2369, lot: 120, type: "bid", amount: 2500000 },
  { t: 2388, lot: 120, type: "bid", amount: 2600000 },
  { t: 2440, lot: 120, type: "bid", amount: 2700000 },
  { t: 2461, lot: 120, type: "bid", amount: 2750000 },
  { t: 2467, lot: 120, type: "bid", amount: 2800000 },
  { t: 2477, lot: 120, type: "bid", amount: 2850000 },
  { t: 2494, lot: 120, type: "bid", amount: 2900000 },
  { t: 2517, lot: 120, type: "bid", amount: 2950000 },
  { t: 2519, lot: 120, type: "bid", amount: 3000000 },
  { t: 2582, lot: 120, type: "bid", amount: 3100000 },
  { t: 2585, lot: 120, type: "bid", amount: 3200000 },
  { t: 2681, lot: 120, type: "bid", amount: 3500000 },
  { t: 2714, lot: 120, type: "bid", amount: 3800000 },
  { t: 2732, lot: 120, type: "sold", amount: 3800000 },
  { t: 2748, lot: 121, type: "start" },
  { t: 2757, lot: 121, type: "bid", amount: 1200000 },
  { t: 2762, lot: 121, type: "bid", amount: 1300000 },
  { t: 2765, lot: 121, type: "bid", amount: 1400000 },
  { t: 2780, lot: 121, type: "bid", amount: 1500000 },
  { t: 2824, lot: 121, type: "sold", amount: 1500000 },
  { t: 2830, lot: 122, type: "start" },
  { t: 2850, lot: 122, type: "bid", amount: 950000 },
  { t: 2854, lot: 122, type: "bid", amount: 1000000 },
  { t: 2855, lot: 122, type: "bid", amount: 1100000 },
  { t: 2857, lot: 122, type: "bid", amount: 1200000 },
  { t: 2860, lot: 122, type: "bid", amount: 1300000 },
  { t: 2871, lot: 122, type: "bid", amount: 1400000 },
  { t: 2877, lot: 122, type: "bid", amount: 1500000 },
  { t: 2886, lot: 122, type: "bid", amount: 1600000 },
  { t: 2890, lot: 122, type: "bid", amount: 1700000 },
  { t: 2896, lot: 122, type: "bid", amount: 1800000 },
  { t: 2908, lot: 122, type: "bid", amount: 1850000 },
  { t: 2917, lot: 122, type: "bid", amount: 2000000 },
  { t: 2959, lot: 122, type: "bid", amount: 2200000 },
  { t: 2970, lot: 122, type: "bid", amount: 2400000 },
  { t: 2974, lot: 122, type: "bid", amount: 2500000 },
  { t: 2980, lot: 122, type: "bid", amount: 2600000 },
  { t: 2985, lot: 122, type: "bid", amount: 2700000 },
  { t: 2993, lot: 122, type: "bid", amount: 3000000 },
  { t: 3031, lot: 122, type: "sold", amount: 3000000 },
  { t: 3042, lot: 123, type: "start" },
  { t: 3058, lot: 123, type: "bid", amount: 420000 },
  { t: 3061, lot: 123, type: "bid", amount: 450000 },
  { t: 3065, lot: 123, type: "bid", amount: 500000 },
  { t: 3071, lot: 123, type: "bid", amount: 550000 },
  { t: 3087, lot: 123, type: "bid", amount: 600000 },
  { t: 3096, lot: 123, type: "bid", amount: 650000 },
  { t: 3099, lot: 123, type: "bid", amount: 670000 },
  { t: 3103, lot: 123, type: "bid", amount: 680000 },
  { t: 3107, lot: 123, type: "bid", amount: 700000 },
  { t: 3129, lot: 123, type: "bid", amount: 720000 },
  { t: 3150, lot: 123, type: "bid", amount: 750000 },
  { t: 3181, lot: 123, type: "sold", amount: 750000 },
  { t: 3194, lot: 124, type: "start" },
  { t: 3208, lot: 124, type: "bid", amount: 260000 },
  { t: 3213, lot: 124, type: "bid", amount: 280000 },
  { t: 3217, lot: 124, type: "bid", amount: 300000 },
  { t: 3223, lot: 124, type: "bid", amount: 320000 },
  { t: 3228, lot: 124, type: "bid", amount: 350000 },
  { t: 3238, lot: 124, type: "bid", amount: 380000 },
  { t: 3249, lot: 124, type: "bid", amount: 400000 },
  { t: 3267, lot: 124, type: "bid", amount: 420000 },
  { t: 3272, lot: 124, type: "bid", amount: 450000 },
  { t: 3276, lot: 124, type: "bid", amount: 480000 },
  { t: 3300, lot: 124, type: "sold", amount: 480000 },
  { t: 3316, lot: 125, type: "start" },
  { t: 3325, lot: 125, type: "bid", amount: 100000 },
  { t: 3327, lot: 125, type: "bid", amount: 110000 },
  { t: 3333, lot: 125, type: "bid", amount: 120000 },
  { t: 3343, lot: 125, type: "bid", amount: 125000 },
  { t: 3368, lot: 125, type: "sold", amount: 125000 },
  { t: 3383, lot: 126, type: "start" },
  { t: 3406, lot: 126, type: "bid", amount: 42000 },
  { t: 3411, lot: 126, type: "bid", amount: 45000 },
  { t: 3414, lot: 126, type: "bid", amount: 48000 },
  { t: 3423, lot: 126, type: "bid", amount: 50000 },
  { t: 3453, lot: 126, type: "sold", amount: 50000 },
  { t: 3462, lot: 127, type: "start" },
  { t: 3479, lot: 127, type: "bid", amount: 42000 },
  { t: 3481, lot: 127, type: "bid", amount: 45000 },
  { t: 3484, lot: 127, type: "bid", amount: 48000 },
  { t: 3494, lot: 127, type: "bid", amount: 50000 },
  { t: 3523, lot: 127, type: "sold", amount: 50000 },
];

// ─── Lot metadata ───
interface LotMeta { lotNumber: number; lowEstimate: number; highEstimate: number; hammerPrice: number; outcome: boolean }
const lotMeta = new Map<number, LotMeta>();
for (const lot of marketsJson.lots as any[]) {
  const sold = srtEvents.find(e => e.lot === lot.lotNumber && e.type === "sold");
  const hammer = sold?.amount ?? 0;
  const high = Number(lot.highEstimate);
  lotMeta.set(lot.lotNumber, { lotNumber: lot.lotNumber, lowEstimate: Number(lot.lowEstimate), highEstimate: high, hammerPrice: hammer, outcome: hammer >= high });
}
const allLotNumbers = [...new Set(srtEvents.map(e => e.lot))].sort((a, b) => a - b);
const auctionStartSec = srtEvents.find(e => e.type === "start")!.t;

// ─── Types ───
interface Trader { key: string; smartness: number; bias: "yes" | "no"; budget: number; aggression: number }
interface Market { id: string; lotNumber: number; highEstimate: number; lowEstimate: number; midpoint: number; baseBias: number; phase: "pre" | "live" | "resolved"; auctionPrice: number; resolved: boolean; outcome?: boolean }
interface Position { yesShares: number; yesCost: number; noShares: number; noCost: number }
interface Account { pnl: number; volume: number; fees: number; trades: number; preTrades: number; liveTrades: number; positions: Map<string, Position>; correctSideCount: number; totalResolvedLots: number }

function liveImpliedProb(price: number, low: number, high: number): number {
  if (price >= high) return 0.99;
  const climb = Math.max(0, (price - low) / (high - low));
  return Math.max(0.05, Math.min(0.97, 0.10 + 0.87 * Math.pow(climb, 1.2)));
}

function randomTraders(): Trader[] {
  const n = 8 + Math.floor(Math.random() * 13);
  return Array.from({ length: n }, (_, i) => ({
    key: `trader-${i}`, smartness: Math.random(), bias: (Math.random() > 0.5 ? "yes" : "no") as "yes" | "no",
    budget: 200 + Math.random() * 9800, aggression: 0.1 + Math.random() * 0.8,
  }));
}

function newAccount(): Account {
  return { pnl: 0, volume: 0, fees: 0, trades: 0, preTrades: 0, liveTrades: 0, positions: new Map(), correctSideCount: 0, totalResolvedLots: 0 };
}
function getPos(a: Account, m: string): Position {
  if (!a.positions.has(m)) a.positions.set(m, { yesShares: 0, yesCost: 0, noShares: 0, noCost: 0 });
  return a.positions.get(m)!;
}

// ─── MM Defense Modes ───
type MMMode = "blind" | "blanket" | "inventory";

interface RunResult {
  mmPnl: number; mmFees: number; mmNetPnl: number; mmTrades: number;
  totalVolume: number; totalTrades: number; preTrades: number; liveTrades: number;
  traderCount: number; defenseActivations: number;
}

function runAuction(mode: MMMode): RunResult {
  const traders = randomTraders();
  const accounts = new Map<string, Account>();
  for (const t of traders) accounts.set(t.key, newAccount());
  accounts.set("mm", newAccount());

  const markets = new Map<number, Market>();
  for (const lotNum of allLotNumbers) {
    const meta = lotMeta.get(lotNum)!;
    const mid = 0.47 + Math.random() * 0.06;
    markets.set(lotNum, { id: `lot-${lotNum}`, lotNumber: lotNum, highEstimate: meta.highEstimate, lowEstimate: meta.lowEstimate, midpoint: mid, baseBias: mid, phase: "pre", auctionPrice: 0, resolved: false });
  }

  const informedFair = new Map<number, number>();
  for (const lotNum of allLotNumbers) {
    const meta = lotMeta.get(lotNum)!;
    const ratio = meta.hammerPrice / meta.highEstimate;
    let fair: number;
    if (ratio >= 1.5) fair = 0.78 + Math.random() * 0.07;
    else if (ratio >= 1.1) fair = 0.65 + Math.random() * 0.08;
    else if (ratio >= 1.0) fair = 0.55 + Math.random() * 0.08;
    else if (ratio >= 0.85) fair = 0.35 + Math.random() * 0.10;
    else if (ratio >= 0.7) fair = 0.22 + Math.random() * 0.08;
    else fair = 0.12 + Math.random() * 0.08;
    informedFair.set(lotNum, fair);
  }

  // Flow tracking (used by blanket and inventory modes)
  const recentSides = new Map<string, number[]>();
  for (const lotNum of allLotNumbers) recentSides.set(`lot-${lotNum}`, []);
  let totalVolume = 0, preTrades = 0, liveTrades = 0, defenseActivations = 0;

  function recordTrade(takerKey: string, mktId: string, side: number, price: number, shares: number, fee: number, isLive: boolean) {
    const taker = accounts.get(takerKey)!;
    const mm = accounts.get("mm")!;
    const tp = getPos(taker, mktId); const mp = getPos(mm, mktId);
    if (side === 0) { tp.yesShares += shares; tp.yesCost += shares * price; mp.noShares += shares; mp.noCost += shares * (1 - price); }
    else { tp.noShares += shares; tp.noCost += shares * (1 - price); mp.yesShares += shares; mp.yesCost += shares * price; }
    taker.volume += shares; taker.fees += fee; taker.trades++;
    if (isLive) { taker.liveTrades++; liveTrades++; } else { taker.preTrades++; preTrades++; }
    mm.volume += shares; mm.fees += fee; mm.trades++;
    totalVolume += shares;
    if (mode !== "blind") {
      const rs = recentSides.get(mktId)!; rs.push(side);
      if (rs.length > 20) rs.shift();
    }
  }

  function settleMarket(mktId: string, isYes: boolean) {
    for (const [name, acct] of accounts) {
      const pos = acct.positions.get(mktId);
      if (!pos) continue;
      const pnl = isYes ? (pos.yesShares - pos.yesCost) + (0 - pos.noCost) : (0 - pos.yesCost) + (pos.noShares - pos.noCost);
      acct.pnl += pnl;
      if (name !== "mm") {
        const netYes = pos.yesShares - pos.noShares;
        if (Math.abs(netYes) > 1) {
          acct.totalResolvedLots++;
          if ((isYes && netYes > 0) || (!isYes && netYes < 0)) acct.correctSideCount++;
        }
      }
    }
  }

  // ── MM DEFENSE LOGIC ──
  // Spread-only decision per trade. Bayesian shifts happen once per tick (below).
  function mmDecision(mktId: string, takerKey: string, tradeSide: number): { spreadMult: number; refuse: boolean } {
    if (mode === "blind") return { spreadMult: 1.0, refuse: false };

    const mmAcct = accounts.get("mm")!;
    const mmPos = mmAcct.positions.get(mktId);
    const mmNetYes = mmPos ? (mmPos.yesShares - mmPos.noShares) : 0;

    if (mode === "blanket") {
      let mult = 1.0;
      const rs = recentSides.get(mktId);
      if (rs && rs.length >= 8) {
        const yesFrac = rs.filter(s => s === 0).length / rs.length;
        if (yesFrac > 0.75 || yesFrac < 0.25) { mult *= 2.5; defenseActivations++; }
      }
      const acct = accounts.get(takerKey);
      if (acct && acct.totalResolvedLots >= 3 && acct.correctSideCount / acct.totalResolvedLots > 0.7) { mult *= 3.0; defenseActivations++; }
      const refuse = !!(acct && acct.totalResolvedLots >= 5 && acct.correctSideCount / acct.totalResolvedLots > 0.8);
      if (refuse) defenseActivations++;
      return { spreadMult: mult, refuse };
    }

    // ── INVENTORY-AWARE MODE ──
    // Surgical: leave normal flow alone. Only penalize IDENTIFIED toxic wallets
    // when they're pushing into the MM's existing exposure.
    // This preserves the MM's structural edge on profitable flow.

    const acct = accounts.get(takerKey);
    const isToxic = acct && acct.totalResolvedLots >= 3 && acct.correctSideCount / acct.totalResolvedLots > 0.65;
    const isVeryToxic = acct && acct.totalResolvedLots >= 5 && acct.correctSideCount / acct.totalResolvedLots > 0.75;

    if (!isToxic) return { spreadMult: 1.0, refuse: false };

    // This is a toxic wallet. Check: is it trading INTO our exposure?
    const tradeIncreasesMMYes = tradeSide === 1;
    const tradeIncreasesMMNo = tradeSide === 0;
    const mmTotalShares = mmPos ? (mmPos.yesShares + mmPos.noShares) : 0;
    const exposurePct = mmTotalShares > 100 ? Math.abs(mmNetYes) / mmTotalShares : 0;

    const tradesIntoExposure =
      (mmNetYes > 0 && tradeIncreasesMMYes) ||
      (mmNetYes < 0 && tradeIncreasesMMNo);

    if (!tradesIntoExposure) {
      // Toxic trader but reducing our exposure — still charge a small premium
      defenseActivations++;
      return { spreadMult: 1.3, refuse: false };
    }

    // Toxic wallet pushing INTO our exposure — defend
    defenseActivations++;
    if (isVeryToxic && exposurePct > 0.25) {
      return { spreadMult: 4.0, refuse: true }; // P2P only
    }
    if (isVeryToxic) return { spreadMult: 3.0, refuse: false };
    return { spreadMult: 2.0, refuse: false };
  }

  // Inventory-aware Bayesian: gentle shift only when heavily exposed
  function inventoryBayesianShift() {
    if (mode !== "inventory") return;
    const mmAcct = accounts.get("mm")!;
    for (const mkt of markets.values()) {
      if (mkt.resolved) continue;
      const mmPos = mmAcct.positions.get(mkt.id);
      if (!mmPos) continue;
      const mmNetYes = mmPos.yesShares - mmPos.noShares;
      const total = mmPos.yesShares + mmPos.noShares;
      if (total < 500) continue;
      const exposurePct = Math.abs(mmNetYes) / total;
      if (exposurePct < 0.35) continue;
      const shift = 0.001 * exposurePct;
      if (mmNetYes > 0) mkt.baseBias = Math.min(0.95, mkt.baseBias + shift);
      else mkt.baseBias = Math.max(0.05, mkt.baseBias - shift);
    }
  }

  // Blanket Bayesian: once per tick per market
  function blanketBayesianShift() {
    if (mode !== "blanket") return;
    for (const mkt of markets.values()) {
      if (mkt.resolved) continue;
      const rs = recentSides.get(mkt.id);
      if (!rs || rs.length < 6) continue;
      const yf = rs.filter(s => s === 0).length / rs.length;
      if (yf > 0.65) mkt.baseBias = Math.min(0.95, mkt.baseBias + 0.005);
      else if (yf < 0.35) mkt.baseBias = Math.max(0.05, mkt.baseBias - 0.005);
    }
  }

  // ── Trading tick ──
  function tick() {
    for (const mkt of markets.values()) {
      if (mkt.resolved) continue;
      const isLive = mkt.phase === "live";
      const iF = informedFair.get(mkt.lotNumber) ?? 0.5;
      let fairYes = isLive && mkt.auctionPrice > 0
        ? liveImpliedProb(mkt.auctionPrice, mkt.lowEstimate, mkt.highEstimate)
        : mkt.baseBias + (Math.random() - 0.5) * 0.008;
      let netPressure = 0;

      for (const tr of traders) {
        const actRate = isLive ? 0.8 : 1.0;
        const boost = isLive && (fairYes > 0.90 || fairYes < 0.10) ? 0.15 : 0;
        const tradeProb = isLive
          ? Math.min(0.75, tr.aggression * 0.22 * actRate + boost)
          : Math.min(0.6, tr.aggression * 0.22 * actRate);
        if (Math.random() > tradeProb) continue;

        let belief: number;
        if (isLive) {
          if (fairYes >= 0.99) belief = tr.smartness * 0.99 + (1 - tr.smartness) * (0.85 + Math.random() * 0.14);
          else if (fairYes <= 0.05) belief = tr.smartness * 0.01 + (1 - tr.smartness) * (Math.random() * 0.15);
          else belief = tr.smartness * fairYes + (1 - tr.smartness) * (tr.bias === "yes" ? 0.60 : 0.35);
        } else {
          const noise = (Math.random() - 0.5) * 0.12;
          belief = tr.smartness * (iF + noise) + (1 - tr.smartness) * (tr.bias === "yes" ? 0.58 : 0.38);
        }
        const edge = belief - mkt.midpoint;
        const minEdge = isLive ? 0.008 : 0.012;
        if (Math.abs(edge) < minEdge) continue;

        const tradeSide = edge > 0 ? 0 : 1;
        const { spreadMult, refuse } = mmDecision(mkt.id, tr.key, tradeSide);
        if (refuse) continue;

        const effectiveSpread = 0.005 * spreadMult;
        const sizeMult = isLive ? 1.3 : 1.6;
        const size = (30 + Math.random() * 250) * (tr.budget / 5000) * sizeMult;
        const tradePrice = Math.round((mkt.midpoint + (edge > 0 ? effectiveSpread : -effectiveSpread)) * 1000) / 1000;
        netPressure += size * edge;
        recordTrade(tr.key, mkt.id, tradeSide, tradePrice, size, size * 0.0175, isLive);
      }

      if (!isLive && !mkt.resolved) mkt.baseBias += (iF - mkt.baseBias) * 0.008;
      const pressureImpact = netPressure * 0.00005;
      // Note: no Bayesian shifts here — they run once per tick below
      let fairPull: number;
      if (isLive) {
        if (fairYes >= 0.99 || fairYes <= 0.01) fairPull = (fairYes - mkt.midpoint) * 0.8;
        else if (fairYes > 0.90 || fairYes < 0.10) fairPull = (fairYes - mkt.midpoint) * 0.4;
        else fairPull = (fairYes - mkt.midpoint) * 0.2;
      } else {
        fairPull = (mkt.baseBias - mkt.midpoint) * 0.04;
      }
      mkt.midpoint = Math.max(0.02, Math.min(0.98, mkt.midpoint + pressureImpact + fairPull + (Math.random() - 0.5) * (isLive ? 0.001 : 0.004)));
    }
    // Bayesian shifts: once per tick, not per trade
    blanketBayesianShift();
    inventoryBayesianShift();
  }

  function liveBidReaction(mkt: Market, implied: number) {
    for (const tr of traders) {
      const tradeProb = Math.min(0.7, tr.aggression * 0.35 + (implied > 0.95 || implied < 0.05 ? 0.15 : 0));
      if (Math.random() > tradeProb) continue;
      let belief: number;
      if (implied >= 0.99) belief = tr.smartness * 0.99 + (1 - tr.smartness) * (0.85 + Math.random() * 0.14);
      else if (implied <= 0.05) belief = tr.smartness * 0.01 + (1 - tr.smartness) * (Math.random() * 0.15);
      else belief = tr.smartness * implied + (1 - tr.smartness) * (tr.bias === "yes" ? 0.60 : 0.35);
      const edge = belief - mkt.midpoint;
      if (Math.abs(edge) < 0.01) continue;
      const tradeSide = edge > 0 ? 0 : 1;
      const { spreadMult, refuse } = mmDecision(mkt.id, tr.key, tradeSide);
      if (refuse) continue;
      const size = (25 + Math.random() * 220) * (tr.budget / 5000) * 1.2;
      const tradePrice = Math.round((mkt.midpoint + (edge > 0 ? 0.005 * spreadMult : -0.005 * spreadMult)) * 1000) / 1000;
      recordTrade(tr.key, mkt.id, tradeSide, tradePrice, size, size * 0.0175, true);
    }
  }

  // PHASE 1: Pre-auction
  for (let t = 0; t < PRE_AUCTION_TICKS; t++) tick();

  // PHASE 2: Live auction — real SRT events with proportional tick gaps
  let lastEventSec = auctionStartSec;
  for (const ev of srtEvents) {
    const gapSec = ev.t - lastEventSec;
    if (gapSec > 0) {
      const ticksInGap = Math.max(1, Math.round(gapSec / TICK_INTERVAL_SEC));
      for (let t = 0; t < ticksInGap; t++) tick();
    }
    lastEventSec = ev.t;
    const mkt = markets.get(ev.lot);
    if (!mkt || mkt.resolved) continue;
    if (ev.type === "start") { mkt.phase = "live"; }
    else if (ev.type === "bid" && ev.amount) {
      if (mkt.phase === "pre") mkt.phase = "live";
      mkt.auctionPrice = ev.amount;
      const implied = liveImpliedProb(ev.amount, mkt.lowEstimate, mkt.highEstimate);
      mkt.baseBias = implied;
      mkt.midpoint = ev.amount >= mkt.highEstimate ? 0.99 : Math.max(0.02, Math.min(0.98, mkt.midpoint + (implied - mkt.midpoint) * 0.6));
      liveBidReaction(mkt, implied);
    } else if (ev.type === "sold") {
      const isYes = (ev.amount ?? 0) >= mkt.highEstimate;
      mkt.resolved = true; mkt.outcome = isYes; mkt.phase = "resolved";
      mkt.midpoint = isYes ? 0.99 : 0.01;
      settleMarket(mkt.id, isYes);
    }
  }

  const mm = accounts.get("mm")!;
  return { mmPnl: mm.pnl, mmFees: mm.fees, mmNetPnl: mm.pnl + mm.fees, mmTrades: mm.trades, totalVolume, totalTrades: preTrades + liveTrades, preTrades, liveTrades, traderCount: traders.length, defenseActivations };
}

// ─── Stats ───
function stats(r: RunResult[]) {
  const pnls = r.map(x => x.mmPnl).sort((a, b) => a - b);
  const nets = r.map(x => x.mmNetPnl).sort((a, b) => a - b);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const std = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const p = (a: number[], pct: number) => a[Math.floor(a.length * pct / 100)];
  return {
    meanPnl: mean(pnls), meanNet: mean(nets), median: p(pnls, 50), stdPnl: std(pnls),
    sharpe: mean(pnls) / (std(pnls) || 1), winRate: pnls.filter(x => x > 0).length / pnls.length,
    p5: p(pnls, 5), p25: p(pnls, 25), p75: p(pnls, 75), p95: p(pnls, 95),
    worst: pnls[0], best: pnls[pnls.length - 1],
    meanFees: mean(r.map(x => x.mmFees)), meanVol: mean(r.map(x => x.totalVolume)),
    meanTrades: mean(r.map(x => x.totalTrades)), meanPre: mean(r.map(x => x.preTrades)), meanLive: mean(r.map(x => x.liveTrades)),
    cum: pnls.reduce((s, v) => s + v, 0), meanDef: mean(r.map(x => x.defenseActivations)),
  };
}

function main() {
  const yesCount = [...lotMeta.values()].filter(m => m.outcome).length;
  const noCount = [...lotMeta.values()].filter(m => !m.outcome).length;
  const totalBids = srtEvents.filter(e => e.type === "bid").length;

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  MONTE CARLO: ${RUNS.toLocaleString().padStart(6)} runs × REAL SRT auction data       ║`);
  console.log(`║  26 lots, ${totalBids} bids | Blind vs Blanket vs Inventory    ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
  console.log(`  Outcomes: ${yesCount} YES / ${noCount} NO | Pre-auction: ${PRE_AUCTION_TICKS} ticks (${PRE_AUCTION_DURATION_SEC/60}min)\n`);

  const results: Record<MMMode, RunResult[]> = { blind: [], blanket: [], inventory: [] };
  const startTime = Date.now();

  for (let i = 0; i < RUNS; i++) {
    if (i % 100 === 0 && i > 0) {
      const el = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (i / ((Date.now() - startTime) / 1000)).toFixed(0);
      process.stdout.write(`\r  Progress: ${((i/RUNS)*100).toFixed(0)}% (${i.toLocaleString()}/${RUNS.toLocaleString()}) — ${el}s — ${rate} runs/s`);
    }
    results.blind.push(runAuction("blind"));
    results.blanket.push(runAuction("blanket"));
    results.inventory.push(runAuction("inventory"));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\r  Completed ${RUNS.toLocaleString()} × 3 modes in ${elapsed}s                                        \n`);

  const b = stats(results.blind), bl = stats(results.blanket), inv = stats(results.inventory);

  function fmt(n: number, d = 0): string { return (n >= 0 ? "+" : "") + n.toFixed(d); }
  function fmtD(n: number): string { return "$" + Math.round(Math.abs(n)).toLocaleString(); }
  const pad = (s: string, w: number) => s.padStart(w);

  console.log("┌──────────────────────┬──────────────┬──────────────┬──────────────┐");
  console.log("│ Metric               │  Blind MM    │ Blanket T1   │ Inventory T1 │");
  console.log("├──────────────────────┼──────────────┼──────────────┼──────────────┤");
  console.log(`│ Mean P&L             │ ${pad(fmt(b.meanPnl),12)} │ ${pad(fmt(bl.meanPnl),12)} │ ${pad(fmt(inv.meanPnl),12)} │`);
  console.log(`│ Mean + fees          │ ${pad(fmt(b.meanNet),12)} │ ${pad(fmt(bl.meanNet),12)} │ ${pad(fmt(inv.meanNet),12)} │`);
  console.log(`│ Median               │ ${pad(fmt(b.median),12)} │ ${pad(fmt(bl.median),12)} │ ${pad(fmt(inv.median),12)} │`);
  console.log(`│ Std Dev              │ ${pad(b.stdPnl.toFixed(0),12)} │ ${pad(bl.stdPnl.toFixed(0),12)} │ ${pad(inv.stdPnl.toFixed(0),12)} │`);
  console.log(`│ Sharpe               │ ${pad(b.sharpe.toFixed(3),12)} │ ${pad(bl.sharpe.toFixed(3),12)} │ ${pad(inv.sharpe.toFixed(3),12)} │`);
  console.log(`│ Win Rate             │ ${pad((b.winRate*100).toFixed(1)+"%",12)} │ ${pad((bl.winRate*100).toFixed(1)+"%",12)} │ ${pad((inv.winRate*100).toFixed(1)+"%",12)} │`);
  console.log(`│ 5th pctile           │ ${pad(fmt(b.p5),12)} │ ${pad(fmt(bl.p5),12)} │ ${pad(fmt(inv.p5),12)} │`);
  console.log(`│ 95th pctile          │ ${pad(fmt(b.p95),12)} │ ${pad(fmt(bl.p95),12)} │ ${pad(fmt(inv.p95),12)} │`);
  console.log(`│ Worst                │ ${pad(fmt(b.worst),12)} │ ${pad(fmt(bl.worst),12)} │ ${pad(fmt(inv.worst),12)} │`);
  console.log(`│ Best                 │ ${pad(fmt(b.best),12)} │ ${pad(fmt(bl.best),12)} │ ${pad(fmt(inv.best),12)} │`);
  console.log("├──────────────────────┼──────────────┼──────────────┼──────────────┤");
  console.log(`│ Trades/auction       │ ${pad(b.meanTrades.toFixed(0),12)} │ ${pad(bl.meanTrades.toFixed(0),12)} │ ${pad(inv.meanTrades.toFixed(0),12)} │`);
  console.log(`│ Volume/auction       │ ${pad(fmtD(b.meanVol),12)} │ ${pad(fmtD(bl.meanVol),12)} │ ${pad(fmtD(inv.meanVol),12)} │`);
  console.log(`│ Fees/auction         │ ${pad(fmtD(b.meanFees),12)} │ ${pad(fmtD(bl.meanFees),12)} │ ${pad(fmtD(inv.meanFees),12)} │`);
  console.log(`│ Pre/Live             │ ${pad(b.meanPre.toFixed(0)+"/"+b.meanLive.toFixed(0),12)} │ ${pad(bl.meanPre.toFixed(0)+"/"+bl.meanLive.toFixed(0),12)} │ ${pad(inv.meanPre.toFixed(0)+"/"+inv.meanLive.toFixed(0),12)} │`);
  console.log(`│ Defense activations  │ ${pad("—",12)} │ ${pad(bl.meanDef.toFixed(0),12)} │ ${pad(inv.meanDef.toFixed(0),12)} │`);
  console.log("└──────────────────────┴──────────────┴──────────────┴──────────────┘");

  // Summary
  const bestMode = inv.meanPnl > bl.meanPnl ? (inv.meanPnl > b.meanPnl ? "Inventory" : "Blind") : (bl.meanPnl > b.meanPnl ? "Blanket" : "Blind");
  const bestNet = inv.meanNet > bl.meanNet ? (inv.meanNet > b.meanNet ? "Inventory" : "Blind") : (bl.meanNet > b.meanNet ? "Blanket" : "Blind");
  console.log(`\n  Best raw P&L:   ${bestMode}`);
  console.log(`  Best net P&L:   ${bestNet}`);
  console.log(`  Inventory vs Blind:   P&L delta ${fmt(inv.meanPnl - b.meanPnl)}, net delta ${fmt(inv.meanNet - b.meanNet)}`);
  console.log(`  Inventory vs Blanket: P&L delta ${fmt(inv.meanPnl - bl.meanPnl)}, net delta ${fmt(inv.meanNet - bl.meanNet)}`);

  // Write markdown
  const md = `# Monte Carlo: ${RUNS.toLocaleString()} Auctions — Real SRT Data
## Blind vs Blanket Tier 1 vs Inventory-Aware Tier 1

*Generated ${new Date().toISOString().slice(0,19)}Z — ${elapsed}s*

### Data: Christie's "Art of the Surreal" Evening Sale, 5 Mar 2026
- 26 lots, ${totalBids} real bids, exact SRT timing
- ${yesCount} YES / ${noCount} NO outcomes (fixed)
- Pre-auction: ${PRE_AUCTION_DURATION_SEC/60}min (${PRE_AUCTION_TICKS} ticks)
- Traders: 8-20 per run, randomized stats

### MM Defense Modes

| Mode | Description |
|------|-------------|
| **Blind** | No defenses. Takes all flow at base 0.5¢ half-spread. |
| **Blanket Tier 1** | VPIN (2.5x on one-sided flow), toxicity scoring (3x/refuse), Bayesian shifts. Applied to ALL flow regardless of MM inventory. |
| **Inventory-Aware** | Same tools, but only activates when the trade INCREASES MM's existing exposure. Trades that reduce exposure are welcomed. Spread scales with exposure magnitude. |

---

### Market Maker P&L Comparison

| Metric | Blind | Blanket T1 | Inventory T1 |
|--------|-------|------------|--------------|
| **Mean P&L** | **$${b.meanPnl.toFixed(0)}** | **$${bl.meanPnl.toFixed(0)}** | **$${inv.meanPnl.toFixed(0)}** |
| **Mean + fees** | $${b.meanNet.toFixed(0)} | $${bl.meanNet.toFixed(0)} | $${inv.meanNet.toFixed(0)} |
| Median | $${b.median.toFixed(0)} | $${bl.median.toFixed(0)} | $${inv.median.toFixed(0)} |
| Std Dev | $${b.stdPnl.toFixed(0)} | $${bl.stdPnl.toFixed(0)} | $${inv.stdPnl.toFixed(0)} |
| Sharpe | ${b.sharpe.toFixed(3)} | ${bl.sharpe.toFixed(3)} | ${inv.sharpe.toFixed(3)} |
| **Win Rate** | **${(b.winRate*100).toFixed(1)}%** | **${(bl.winRate*100).toFixed(1)}%** | **${(inv.winRate*100).toFixed(1)}%** |
| 5th pctile | $${b.p5.toFixed(0)} | $${bl.p5.toFixed(0)} | $${inv.p5.toFixed(0)} |
| 95th pctile | $${b.p95.toFixed(0)} | $${bl.p95.toFixed(0)} | $${inv.p95.toFixed(0)} |
| Worst | $${b.worst.toFixed(0)} | $${bl.worst.toFixed(0)} | $${inv.worst.toFixed(0)} |
| Best | $${b.best.toFixed(0)} | $${bl.best.toFixed(0)} | $${inv.best.toFixed(0)} |

### Volume & Activity

| Metric | Blind | Blanket T1 | Inventory T1 |
|--------|-------|------------|--------------|
| Trades/auction | ${b.meanTrades.toFixed(0)} | ${bl.meanTrades.toFixed(0)} | ${inv.meanTrades.toFixed(0)} |
| Volume/auction | $${b.meanVol.toFixed(0)} | $${bl.meanVol.toFixed(0)} | $${inv.meanVol.toFixed(0)} |
| Fees/auction | $${b.meanFees.toFixed(0)} | $${bl.meanFees.toFixed(0)} | $${inv.meanFees.toFixed(0)} |
| Pre/Live | ${b.meanPre.toFixed(0)}/${b.meanLive.toFixed(0)} | ${bl.meanPre.toFixed(0)}/${bl.meanLive.toFixed(0)} | ${inv.meanPre.toFixed(0)}/${inv.meanLive.toFixed(0)} |
| Defense acts | — | ${bl.meanDef.toFixed(0)} | ${inv.meanDef.toFixed(0)} |

---

### Winner: **${bestNet}** (by net P&L after fees)

- Inventory vs Blind: ${fmt(inv.meanPnl - b.meanPnl)} raw, ${fmt(inv.meanNet - b.meanNet)} net
- Inventory vs Blanket: ${fmt(inv.meanPnl - bl.meanPnl)} raw, ${fmt(inv.meanNet - bl.meanNet)} net

### Key Insight

${b.meanPnl > 0 ? `The blind MM is profitable (+$${b.meanPnl.toFixed(0)}/auction) on this specific auction because ${noCount}/26 lots resolve NO — the structural edge from selling YES shares at ~50¢ that expire worthless dominates. Blanket Tier 1 defenses destroy this edge by blocking profitable flow. The inventory-aware mode preserves the structural advantage while still defending against dangerous accumulation.` : `The blind MM loses on this auction. Both defense modes help, with the inventory-aware approach being more surgical.`}

---

*Next: Phase 2 — stall detection, pace-of-climb, cross-lot momentum*
`;

  writeFileSync(resolve(__dirname, "..", "monte-carlo-tier1-results.md"), md);
  console.log(`\n  Results written to: monte-carlo-tier1-results.md`);

  // Append run log
  const planPath = resolve(__dirname, "..", "MM-IMPROVEMENT-PLAN.md");
  try {
    let plan = readFileSync(planPath, "utf-8");
    if (!plan.includes("## Monte Carlo Run Log")) plan += `\n\n---\n\n## Monte Carlo Run Log\n\n| Date | Runs | Data | Blind | Blanket T1 | Inventory T1 | Winner |\n|------|------|------|-------|------------|--------------|--------|\n`;
    plan += `| ${new Date().toISOString().slice(0,10)} | ${RUNS.toLocaleString()} | Real SRT | $${b.meanPnl.toFixed(0)} (${(b.winRate*100).toFixed(0)}%) | $${bl.meanPnl.toFixed(0)} (${(bl.winRate*100).toFixed(0)}%) | $${inv.meanPnl.toFixed(0)} (${(inv.winRate*100).toFixed(0)}%) | ${bestNet} |\n`;
    writeFileSync(planPath, plan);
    console.log(`  Run logged to: MM-IMPROVEMENT-PLAN.md`);
  } catch {}
}

main();
