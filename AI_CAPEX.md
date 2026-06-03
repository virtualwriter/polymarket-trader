# AI CAPEX — Comprehensive Market Research

> Compiled from research conducted May 24, 2026.
> All stock prices and financial data as of market close May 22, 2026 (last trading day before compilation) unless otherwise noted.

---

## 1. THE BIG PICTURE: Inference Has Surpassed Training

### The Inference Flip (Early 2026)
- Inference now accounts for **~85% of enterprise AI budgets** and roughly **two-thirds of all global AI compute spend**
- Serving a frontier model to users = inference. Training is the one-time cost; inference is every user, every request, every day
- A single chatbot API call: ~$0.001. A multi-step AI agent: **$0.10 to $1.00 per task** — a 100-1,000x multiplier
- Agentic AI requires **5-30x more tokens per task** than standard chatbots
- Goldman Sachs: **Token consumption to grow 24x by 2030** (5B → 23B queries/day), with agents driving ~30%

### The T² (Train-to-Test) Revolution
- New scaling laws show overtraining smaller models on more tokens is optimal when accounting for inference costs
- Labs are deliberately training models beyond old Chinchilla-optimal ratios
- Inference costs have become the dominant engineering concern over training costs

### What Jensen Huang Says About Agents
- *"Demand is going parabolic, utterly parabolic"* — Dell Technologies World 2026
- *"We've now arrived at the era of useful AI"*
- *"Compute required for agentic AI has risen 1,000% compared to generative AI in just two years"* — ServiceNow Knowledge 2026
- *"Every company is going to have AI employees"* — Computex 2026
- *"The entire manufacturing line will be operated by robots, managed by more robots, and the entire factory is a robot"* — CNBC
- Vision: **10 billion AI agents** working alongside humans

### Agentic Workloads Are Different
| Metric | Chatbot | AI Agent |
|--------|---------|----------|
| Cost per task | ~$0.001 | $0.10 – $1.00 |
| Tokens per task | Baseline | 5–30x more |
| Compute nature | Single GPU event | Multi-step, looping, tool-calling |

- Agents need: **planning → retrieval → tool invocation → reflection → self-correction → final response**
- Each step is an inference call. At scale: tens of millions per month in inference bills for Fortune 500s

---

## 2. THE HARDWARE SHIFT: CPUs Are Back

### The Unbundling of Inference
Training and inference are diverging:
- **Training**: GPU-heavy, massive batches, HBM-dependent. NVIDIA dominates.
- **Agentic inference**: Memory-bandwidth-bound, needs CPU for orchestration. GPU is often overkill.

The GPU:CPU ratio is **narrowing from ~8:1 to 1:1** in agent-optimized clusters. AMD doubled its server CPU forecast in under six months.

### What CPUs Handle in Agent Workloads
- Workflow orchestration
- Agent management and spawning
- API calls and routing
- Security and policy checks
- Data management and integration
- Tool invocation and logic gating

### NVIDIA's Response: Build the Whole Rack
NVIDIA is no longer a GPU company. Vera Rubin is a platform with 7 chips:
| Component | Role |
|-----------|------|
| Rubin R100 GPU | 336B transistors, 5x Blackwell inference |
| Vera CPU | 88-core Arm chip (highest single-thread perf in the world per Jensen) |
| NVLink 6 Switch | 260 TB/s interconnect |
| ConnectX-9 SuperNIC | Networking |
| BlueField-4 DPU | Data processing offload |
| Spectrum-6 Ethernet | Network switching |
| Groq 3 LPU | Inference accelerator (128GB on-chip SRAM, 640 TB/s) |

Vera Rubin claims **10x lower cost per token** vs Blackwell. Ships H2 2026.

### The CUDA Question
- CUDA does NOT run on CPUs. Agent orchestration (tool-calling, API routing, database queries) runs on CPUs where CUDA has zero presence.
- NVIDIA's counter: sell the full stack (Vera CPU + Rubin GPU + networking) so the customer stays locked into NVIDIA even for the non-GPU parts.
- The CUDA moat is real but narrows in inference. Switching costs remain high, but the *incremental* spend on agents increasingly goes to CPUs and custom silicon where CUDA doesn't apply.

---

## 3. THE MEMORY BOTTLENECK

### The Tightest Constraint in the Entire AI Supply Chain: HBM

### Hierarchy
| Memory Type | Supplier | Speed (BW) | Capacity | Used For |
|-------------|----------|-----------|----------|----------|
| SRAM (on-chip) | Cerebras WSE | 21 PB/s | 44 GB | Ultra-fast inference |
| HBM | SK Hynix (#1), Samsung, Micron | 7-8 TB/s | 192 GB | GPU memory (training + inference) |
| DRAM | Samsung, SK Hynix, Micron | ~50 GB/s | N/A | System RAM |
| NAND (SSD) | SanDisk, Samsung, Micron | ~10 GB/s | TBs | Persistent storage |

### HBM Market Reality (2026)
- **SK Hynix controls ~62% of global HBM** — sold out all of 2026 by mid-2025, ~70% of NVIDIA's HBM4 orders for Vera Rubin
- **Samsung** failed HBM3E qualification with NVIDIA for ~18 months (thermal issues). Only cleared Sep 2025. Lost the window.
- **Micron** is ramping but only ~1/3 of SK Hynix's share. Entire 2026 supply also fully booked.
- **HBM consumes 3x the wafer capacity** of standard DDR5 per GB. Every HBM wafer removes equivalent volume from consumer DRAM.
- **Duration**: SK Group Chairman says shortage until 2030. New fabs not before late 2027. Price relief: late 2027-2028.

### CoWoS Advanced Packaging — Parallel Bottleneck
- TSMC's CoWoS capacity completely allocated with **12-18 month lead times**
- Without CoWoS, you can't stack HBM onto GPUs. Even with the chips, you can't assemble them.

### The Specialized Inference Silicon Story
These chips bypass the GPU memory wall by keeping models on-chip in SRAM:
| Company | Architecture | Differentiator | Status |
|---------|-------------|----------------|--------|
| **Cerebras** | Wafer-Scale Engine (WSE-3) | 21 PB/s SRAM bandwidth on-chip. 2,522 tokens/sec on Llama 4. | IPO May 14, 2026 at ~$155, now ~$282 |
| **Groq** | LPU (acquired by NVIDIA Dec 2025, $20B) | Deterministic, ultra-low latency. Groq 3 LPU: 150 TB/s. | Now NVIDIA's inference accelerator |
| **SambaNova** | RDU | Runs full unquantized 16-bit models. Strong on DeepSeek-R1 671B. | Private, raised $350M |

### The Historical Analogy
CPU (general) → GPU (graphics-specific, repurposed for AI) → Custom ASICs (inference-specific)

Pattern: new workload → runs on nearest general-purpose chip → as it matures, someone builds a specialized chip → specialized wins for that task.

---

## 4. THE $725B HYPERSCALER CAPEX CYCLE (2026)

### Who's Spending What
| Company | 2026 Capex | What It Buys |
|---------|-----------|-------------|
| Amazon | ~$200B | Data centers, Trainium/NVIDIA GPUs, logistics AI |
| Microsoft | ~$190B | Azure AI data centers, NVIDIA + custom Maia chips |
| Alphabet/Google | ~$180-190B | TPU 8t/8i deployment, data centers |
| Meta | ~$125-145B | 1GW Ohio data center, Louisiana (up to 5GW), NVIDIA + MTIA chips |
| Oracle | ~$50B | OCI AI cloud, Stargate program |
| **Total** | **~$725B** | ~75% ($545B) AI-specific: GPUs, custom silicon, networking, power, cooling |

Up ~64% from ~$443B in 2025 and ~$256B in 2024.

### What They're Buying
- **NVIDIA**: Bulk of GPU spend. Meta alone ordered millions of Blackwell + Vera Rubin.
- **AMD**: MI400 as cheaper alternative for inference fleets.
- **Broadcom + Marvell**: ~95% of custom AI ASIC co-design market. Google TPU, Amazon Trainium, Microsoft Maia, Meta MTIA.
- **TSMC**: Fabricates everything. The single most critical bottleneck.
- **CoreWeave / Neoclouds**: Hyperscalers rent from them when they can't build fast enough.
- **Power utilities**: Land, power, buildings.

### Supply Chain Concentration Risk
- **92% of advanced chips** from TSMC in Taiwan
- **100% of EUV machines** from ASML in Netherlands
- **HBM memory** from SK Hynix + Samsung in South Korea
- **CoWoS packaging** mostly in Taiwan

Three geographic chokepoints for a globally critical technology.

### Taiwan Contingency — TSMC Arizona
- **Fab 1**: Mass producing 4nm since Q4 2024. $514M profit in first year. Apple + NVIDIA customers.
- **Fab 2**: 3nm, target H2 2027
- **Fab 3**: N2/A16, target end of decade
- **Total**: $165B investment, 6 fabs, 2 packaging plants, 1 R&D center
- **But**: CoWoS packaging not in Arizona until 2029. No domestic HBM. Water/labor/visa shortages.
- **Verdict**: Diversification hedge, not a Taiwan replacement. Full independence: 2030+ at best.

---

## 5. CUSTOM SILICON — Google TPU, Amazon Trainium

### Why Hyperscalers Build Their Own Chips
- **40-65% TCO advantage** over merchant GPUs for inference
- **Supply chain independence**: Don't wait for NVIDIA allocation
- **Workload-specific optimization**: Design for their exact models
- **Customer lock-in**: Once Anthropic optimizes for Trainium, switching costs are high
- **Pricing leverage**: "We'll buy your B200s, but if you raise prices too much, we have our own"

### Google TPU
- Most mature custom AI silicon effort (since 2016)
- **TPU 7 (Ironwood)**: GA now. 4,614 FP8 TFLOPS, 192GB HBM3E
- **TPU 8 (2026)**: Split into **8t (training)** and **8i (inference)** — first time dual-tracked
- Ditching x86 for their own Arm-based **Axion CPU** as TPU host
- **Anthropic signed**: Up to 1M Ironwood chips + 3.5 GW TPU capacity from 2027
- **Google's endgame**: Apple model (COT — Customer Owned Tooling). Design fully in-house, bypass Broadcom/MediaTek, work directly with TSMC

### Amazon Trainium / Inferentia / Graviton
- **Trainium3**: GA, 3nm, 2.5 PFLOPS FP8. Trn3 UltraServer: 144 chips (362 PFLOPS)
- **Trainium4**: Late 2026/early 2027. 3x FP8, 6x FP4, 288GB memory. Supports **NVLink Fusion** — can mix with NVIDIA GPUs
- **Custom silicon business: $20B annualized run rate** (more than AMD's data center GPU revenue was a few years ago)
- Trainium2 sold out, Trainium3 nearly fully subscribed, Trainium4 partially reserved
- **Anthropic committed $100B+ over a decade** on AWS including Trainium
- **Graviton5**: 192-core Arm CPU, TSMC 3nm

### The Middlemen Who Get Cut (COT)
If Google goes full COT:
- **Cut**: Broadcom (silicon implementation), MediaTek (SerDes), HBM procurement middlemen
- **Survives**: TSMC (the fab — irreplaceable), ARM (Axion architecture)
- **Timeline**: 2028+ at earliest. Meanwhile Broadcom gets $21B (2026) → $42B (2027) from Google+Anthropic

---

## 6. THE ON-PREM INFERENCE SHIFT

### Why Enterprises Are Moving Inference Off Cloud
- Hosted API prices stopped falling — output token costs up 2-7x in current flagship generation
- **Dell**: On-prem can reduce spend by **87% over 2 years** vs public cloud APIs with breakeven in ~3 months
- **Lenovo TCO study**: Up to **18x cost advantage per million tokens** owning infrastructure vs API consumption
- Data sovereignty, latency, predictable costs

### Cloud Providers' Response
- **AWS Outposts, Azure Arc, Google Distributed Cloud**: Extend cloud control planes onto customer premises
- Prefer you run their software on your hardware than lose you entirely
- **Verdict**: Headwind, not existential. Cloud keeps elastic/bursty business. Becomes *hybrid*, not cloud vs on-prem.

### Who Benefits
- Enterprose infrastructure plays like **Nutanix** (on-prem AI platform), **Dell**, **Lenovo**
- **NVIDIA** still sells the GPUs either way
- Companies that make self-hosting easier

---

## 7. THE POWER BOTTLENECK

### The Mega-Merger
**NextEra Energy acquiring Dominion Energy** — announced **May 18, 2026**
- ~$67B all-stock deal, creating $249B market cap super-utility
- Dominion brings **51 GW contracted data center capacity** serving Amazon, Microsoft, Google, Meta, Equinix, CoreWeave, CyrusOne
- Combined: 130 GW data center pipeline, 260 GW generation by 2032
- $59B annual capex from 2027-2032
- **Stock reaction**: Dominion +11%, NextEra -4.6% (typical acquirer dilution)
- Expected close: 12-18 months

### Nuclear Power Purchase Agreements
| Utility | Hyperscaler | Deal | Capacity |
|---------|-------------|------|----------|
| **Vistra** | Meta | 20-year nuclear PPAs | ~2,609 MW (Davis-Besse, Perry, Beaver Valley) |
| **Constellation** | Microsoft | 20-year PPA | 835 MW (Three Mile Island restart, ~2028) |
| **NextEra** | Google | 25-year PPA | 615 MW (Duane Arnold restart, ~2029) |
| **Talen** | Amazon | Nuclear offtake | 1,920 MW through 2042 |

### Market Shift
The market is moving from "nuclear scarcity = AI play" toward "dispatchable, grid-connected capacity = AI play." Vistra and NRG, with diversified generation (nuclear + gas), may be better positioned than pure nuclear plays like Constellation.

---

## 8. ASML AND TSMC — THE TWO MONOPOLIES

### ASML — The Machine
- **100% market share** in EUV lithography — the only machines that can print sub-7nm features
- No competitor after 30+ years and €40B+ in R&D. Nikon and Canon tried and failed.
- High-NA EUV machine costs **~$400M each**. Fewer than a dozen units worldwide.
- €38B order book. Can choose who gets machines.
- **Key tension**: ASML needs TSMC as much as TSMC needs ASML. TSMC is the only customer that can absorb bleeding-edge supply at the volume needed to fund ASML's R&D.
- **Headwind**: TSMC delayed High-NA EUV adoption to 2029+. China sales dropping (33% → 19% of revenue). MATCH Act could tighten further.

### TSMC — The Fab
- **92% of all sub-10nm chips** — the only foundry that can do it at scale
- 66.2% gross margins, 50.5% net margins
- Arizona Fab 1: profitable in year one ($514M)
- Co-develops process technology with ASML
- Customer list: 535 firms including NVIDIA, Apple, AMD, Broadcom
- Switching costs measured in years of re-engineering

### Why No One Can Replace TSMC
1. **ASML's machines** — they make the tools, but TSMC co-designs them
2. **Process mastery** — 20+ years of yield optimization. >90% good chips vs competitors at 60-70%
3. **Ecosystem lock-in** — NVIDIA designs chips specifically for TSMC's processes
4. **Capital intensity** — $165B Arizona buildout alone. China's SMIC stuck at 14nm despite $150B in subsidies

---

## 9. COMPLETE STOCK TABLES (as of May 22, 2026)

### Semiconductors — Chip Design

| Ticker | Company | Price | Market Cap | Trailing P/E | Fwd P/E | Rev Growth | Gross Margin | Notes |
|--------|---------|-------|------------|-------------|---------|------------|-------------|-------|
| NVDA | NVIDIA | ~$215 | ~$5.3T | ~46x | **25x** | ~65% | ~75% | Cheapest fwd P/E in years. Vera Rubin H2 2026. |
| AMD | AMD | ~$424 | ~$680B | 139x | ~35x | ~25% | ~52% | MI400 unproven. CUDA moat deep. Expensive. |
| AVGO | Broadcom | ~$425 | ~$1T | 83x | **28x** | ~30% | ~65% | $73B AI backlog. 106% AI rev growth. |

### Semiconductors — Manufacturing

| Ticker | Company | Price | Market Cap | Trailing P/E | Fwd P/E | Rev Growth | Gross Margin | Notes |
|--------|---------|-------|------------|-------------|---------|------------|-------------|-------|
| TSM | TSMC | ~$180 | ~$1.51T | ~32x | **23x** | ~35% | **66.2%** | Best value in semis. 50.5% net margin. |
| ASML | ASML | ~$900 | ~$549B | ~46x | **36x** | ~19% | 51-53% | 100% EUV monopoly. Growth decelerating. |
| INTC | Intel | ~$120 | ~$510B | ~30x | **25x** | ~8% | ~40% | Up 240% YTD. Turnaround priced in. |

### Memory

| Ticker | Company | Price | Market Cap | Trailing P/E | Fwd P/E | Rev Growth | Gross Margin | Notes |
|--------|---------|-------|------------|-------------|---------|------------|-------------|-------|
| MU | Micron | ~$725 | ~$160B | 34x | **~8x** | ~40% | ~56% | Cheapest fwd P/E on list. HBM sold out. |
| SNDK | SanDisk | ~$1,479 | ~$219B | ~51x | N/A | ~30% | ~56% | Up 550% YTD. Pure NAND. Debt-free. |

### AI Infrastructure / Neoclouds

| Ticker | Company | Price | Market Cap | P/S | Rev Growth | Profitable? | Notes |
|--------|---------|-------|------------|-----|------------|-------------|-------|
| CRWV | CoreWeave | ~$105 | ~$58B | ~5x | 112% | No (EBIT ~1%) | $100B backlog. $14B debt at 9%. |
| NBIS | Nebius | ~$215 | ~$53B | ~16x | 684% | No | $50B backlog. Inference-first. Less debt. |
| CBRS | Cerebras | ~$282 | ~$30B | N/A | N/A | No | IPO'd May 14 at ~$155. Doubled in 10 days. |

### Hyperscalers

| Ticker | Company | Price | Market Cap | Trailing P/E | Fwd P/E | Rev Growth | 2026 Capex | Notes |
|--------|---------|-------|------------|-------------|---------|------------|------------|-------|
| AMZN | Amazon | $266 | ~$2.7T | ~35x | ~32x | ~11% | **$200B** | AWS $142B run rate. FCF negative 2026. |
| MSFT | Microsoft | $419 | ~$3.1T | ~25x | ~22x | ~16% | **~$190B** | $80B Azure order backlog unfilled. |
| GOOGL | Alphabet | $379 | ~$4.6T | ~29x | ~26x | ~22% | **$180-190B** | Google Cloud +63% to $20B. $460B backlog. |
| META | Meta | $610 | ~$1.55T | **~22x** | **~17x** | ~33% | $125-145B | Cheapest hyperscaler. Stock down 11% in a month. |

### Power / Utilities

| Ticker | Company | Price | Market Cap | Fwd P/E | Rev Growth | AI Catalyst |
|--------|---------|-------|------------|---------|------------|-------------|
| NEE | NextEra Energy | ~$89 | ~$185B | ~22x | ~10% | Acquiring Dominion. 130 GW DC pipeline. |
| D | Dominion Energy | ~$69 | ~$55B | ~18x | ~5% | Target in $67B merger. 51 GW DC capacity. |
| VST | Vistra | ~$157 | ~$53B | **~18.6x** | ~15% | Meta 2.6 GW nuclear PPA. 65.6% earnings growth. |
| CEG | Constellation | $262 | ~$95B | ~23x | ~10% | Microsoft TMI restart. Pure nuclear. |
| BE | Bloom Energy | ~$140 | ~$47-81B | N/A | ~15% | Fuel cells for data centers. Up 300%+. Speculative. |
| CLSK | CleanSpark | ~$12 | ~$3B | N/A | ~20% | 1.8 GW power. Pivoting from BTC mining. No AI tenant signed. |
| CORZ | Core Scientific | ~$20 | ~$5.3B | N/A | N/A | $77.5M AI colo revenue. Most delivered AI capacity. |
| WULF | TeraWulf | ~$12 | ~$3B | N/A | N/A | $21M HPC lease rev. 62% of rev now AI. |
| HUT | Hut 8 | ~$30 | ~$5.7B | N/A | N/A | $16.8B contracted AI leases. Revenue starts Q2 2027. |
| CIFR | Cipher Digital | ~$12 | ~$6.3B | N/A | N/A | AWS + Google/Fluidstack tenants. 400 MW in 2026. |

### Enterprise Infrastructure Software

| Ticker | Company | Price | Market Cap | Trailing P/E | Fwd P/E | Rev Growth | Gross Margin | Notes |
|--------|---------|-------|------------|-------------|---------|------------|-------------|-------|
| NTNX | Nutanix | $44 | ~$12B | ~50x | ~22x | ~10% | 86.8% | On-prem AI enablement. Earnings May 27. |

---

## 10. BEST BUYS RIGHT NOW

### Tier 1: Strongest risk/reward

**1. NVIDIA (NVDA) — ~$215, 25x fwd P/E**
- Cheapest since before AI boom. $81B quarterly revenue. Vera Rubin H2 2026.
- If you believe AI demand is real, this is the most attractive large-cap entry point in years.

**2. Broadcom (AVGO) — ~$425, 28x fwd P/E**
- $73B AI backlog → $100B+. Only company with ASIC deals across Google, OpenAI, Meta, Apple.
- 106% AI rev growth. Networking + silicon = both sides of the bet.

**3. TSMC (TSM) — ~$180, 23x fwd P/E**
- 66.2% gross margins, 50.5% net margins, 35% rev growth. 92% advanced node share.
- Best combination of quality and price in semis.

### Tier 2: Compelling values

**4. Meta (META) — ~$610, 17x fwd P/E**
- Cheapest hyperscaler by far. Punished for raising capex — the right thing to do.
- 33% revenue growth, 40.6% operating margins, 17x forward.

**5. Micron (MU) — ~$725, ~8x fwd P/E**
- HBM sold out through 2026. $100B HBM TAM by 2028.
- 8x forward is pricing in a recession that hasn't arrived.

**6. Vistra (VST) — ~$157, ~18.6x fwd P/E**
- Meta 2.6 GW nuclear PPA. 65.6% earnings growth expected. Cheaper than CEG.

### Tier 3: Interesting but wait

**7. Nebius (NBIS) — ~$215, 16x sales**
- 684% rev growth. $50B backlog. Inference-first Token Factory model.
- 16x sales for unprofitable company = perfection priced in.

**8. TeraWulf (WULF) — ~$3B market cap**
- Already generating $21M AI revenue. 62% of rev from HPC leases.
- Tiny cap, real revenue, cheap vs peers.

**9. Hut 8 (HUT) — ~$5.7B, $16.8B contracted**
- Massive backlog relative to market cap. $1.1B annual NOI projected.
- Revenue doesn't start until Q2 2027 — 2027 catalyst at 2026 price.

### Tier 4: Avoid or low conviction

- **ASML** — 36x fwd, 19% growth decelerating to 9%. TSMC delayed High-NA to 2029.
- **Intel** — Up 240% YTD. Foundry $7B losses. Turnaround priced in.
- **Nutanix** — 22x fwd, 10% growth. Interesting thesis, slow growth for the multiple.
- **Bloom Energy** — $47-81B market cap on $2B revenue. Up 300%+. Speculative.

### The Hedge Fund Barbell (Situational Awareness LP 13F)
- **Long** the physical scarcity layer: SanDisk (storage), CoreWeave (GPU hosting), Bloom Energy (power), IREN/Applied Digital (data centers)
- **Hedged** on crowded chip names: Puts on NVIDIA, Broadcom, AMD, TSMC, ASML

Thesis: Infrastructure layer (power, memory, facilities) has more upside than chip layer (already priced to perfection).

---

## 11. CRYPTO MINERS → AI LANDLORDS — Detailed Breakdown

### Who Has Operating AI Data Centers

**Tier 1: AI revenue today**

**Core Scientific (CORZ) — ~$5.3B market cap**
- $77.5M AI colocation revenue in Q1 2026 (9x YoY from $8.6M)
- Dominant revenue stream is now colocation, not mining
- CoreWeave deal: tenant funded most capex
- Jefferies: "Most delivered AI capacity in peer group"

**TeraWulf (WULF) — ~$3B market cap**
- $21M HPC lease revenue in Q1 — 62% of total revenue is now AI/HPC
- Lake Mariner campus near NYC (good for inference latency)
- Tenants: Fluidstack, Core42
- Jefferies: "Most underrated name in the sector"

**Tier 2: Fully contracted, building**

**Hut 8 (HUT) — ~$5.7B market cap**
- $16.8B in contracted triple-net, take-or-pay AI leases
- Two campuses: River Bend (330 MW) + Beacon Point (352 MW)
- $1.1B annual NOI expected. Revenue starts Q2 2027.
- Jefferies: "Best financing quality. High-quality long-term platform."

**Cipher (CIFR) — ~$6.3B market cap**
- AWS + Google/Fluidstack + 3rd hyperscaler tenants signed
- ~400 MW coming online 2026
- 3.4 GW pipeline
- Jefferies: "Cleanest institutional-quality story"

**Tier 3: No AI tenant signed yet**

**CleanSpark (CLSK) — ~$3B market cap**
- 1.8 GW contracted power, 5+ GW pipeline
- 640 BTC mined in April — primarily still a miner
- "Progress toward first hyperscale customer" — no disclosure of signed tenant
- Bitcoin mining funds buildout, AI monetizes later — still in funding phase

---

## Key Takeaways

1. **Inference dominates now** — 85% of AI spend. Agents multiply demand 100-1,000x per task.
2. **Memory is the bottleneck** — HBM from SK Hynix. Sold out through 2026. Shortage may last to 2030.
3. **Custom ASICs are eating GPU share** — 44.6% YoY growth vs 16.1% for merchant GPUs. 27.8% of market, projected to surpass GPUs by 2028.
4. **CPU renaissance for agents** — Agent orchestration needs CPUs. GPU:CPU ratio narrowing to 1:1.
5. **NVIDIA is not in trouble** but pricing power erodes at the margin. Vera Rubin is the counter.
6. **Power is the new bottleneck** — Microsoft has $80B unfilled Azure orders due to power constraints.
7. **The two safest monopolies**: TSMC (fab) and ASML (EUV machines), but both face geopolitical concentration risk.
8. **Hyperscalers are building their own chips** — Apple model. Google wants COT. This threatens Broadcom/MediaTek eventually.
9. **Best risk/reward**: NVDA at 25x fwd, AVGO at 28x fwd, TSM at 23x fwd, META at 17x fwd.
10. **Best AI infrastructure small caps**: WULF (already generating AI rev), HUT ($16.8B contracted), CIFR (AWS/Google tenants).
