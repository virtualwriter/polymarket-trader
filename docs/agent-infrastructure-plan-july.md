# Agent Infrastructure Plan — July 2026 (original)

Source: Google Doc "Polymarket trader update" (saved verbatim 2026-07-14).
https://docs.google.com/document/d/1E1frktQEKh5x6eVv35lkFRxOLIQYOvzNaDOu2HfiBYs/

---

Here is my set up and here are my problems. I have two bots that scan markets, polymarket, hyper liquid, etc, and make trades. They run on two different VPS. There is an llm embedded in each bot that learns from trade win/loss and data over time. they log a ton of data from the trades for learning. These logs add up over time and assist with back testing and llm learning but bloat the memory on the VPS. They run hourly, and log llm prompting and trading every few hours. The problems with the set up are that, I don’t think I’m tracking enough context for fast llm learning. The LLMs aren’t learning fast enough and aren’t getting smarter. The LLMs don’t solve problems on their own in the codebase or strategically with the trading. The memory bloat keeps shutting the LLMs down. The entire system is using way too many tokens. What are my options here? 
What you're describing is a very common failure mode of "LLM agent" systems. The intuition ("give the model all the logs and it'll get smarter") unfortunately doesn't match how LLMs actually improve. 
The biggest issue I see is this: 
Your LLM is not actually learning. It's remembering. 
Unless you're periodically fine-tuning a model (or using reinforcement learning, which is much more involved), the weights never change. Every hour it wakes up as the exact same model. The only thing changing is the context you feed it. 
That distinction changes how I'd architect everything. 
________________ 
Problem 1: You're storing the wrong information 
I'm guessing your logs look something like 
Prompt 
Market snapshot 
Model reasoning 
API calls 
Trade 
PnL 
90% of that is useless after the trade finishes. 
Instead think of every trade as producing a compressed lesson. 
Instead of storing 
12,000 tokens 
store 
Market regime: 
High volatility 
Election market 
Liquidity thin 
Signal: 
Momentum + sentiment 
Reason trade failed: 
Entered after liquidity sweep 
Confidence: 
0.81 
Lesson: 
When liquidity < X and spread > Y, momentum entries lose 62%. 
Now one trade costs maybe 
150 tokens instead of 10,000. 
________________ 
Problem 2: Long-term memory should not be logs 
Humans don't remember every conversation. 
They remember abstractions. 
Your system should too. 
Imagine three layers. 
Layer 1 
Raw logs 
Every API call 
Every LLM prompt 
Every fill 
Delete after 
7–30 days. 
These are only for debugging. 
________________ 
Layer 2 
Trade database 
Store 
features 
prediction 
position 
exit 
PnL 
volatility 
liquidity 
time 
reason 
Never involve an LLM. 
SQL handles this. 
Millions of rows are fine. 
________________ 
Layer 3 
Knowledge base 
Generated automatically every night. 
Example 
Momentum strategies 
Observed 482 trades. 
Improved after filtering 
Low volume 
Asian session 
Large bid/ask spreads 
Expected improvement: 
+14% 
Confidence: 
High 
Now the LLM only reads 
500 summaries 
instead of 
2 million logs. 
________________ 
Problem 3: You're asking the LLM to learn online 
Instead, 
run a nightly "research scientist." 
Every night 
Read today's trades. 
Cluster failures. 
Look for recurring mistakes. 
Generate hypotheses. 
Evaluate statistically. 
Update strategy knowledge. 
That process actually creates intelligence. 
Not hourly prompting. 
________________ 
Problem 4: Too many tokens 
This is the biggest cost. 
A lot of people do 
Current market 
+ 
Entire memory 
+ 
Previous prompts 
+ 
Trading history 
That's exploding context. 
Instead: 
Current market 
↓ 
Retrieve ONLY relevant memories 
↓ 
Trade 
Exactly like RAG. 
If today resembles 
Fed announcement 
retrieve only 
Fed announcement lessons. 
Not crypto. 
Not sports markets. 
Not everything. 
________________ 
Problem 5: The LLM shouldn't decide everything 
Split responsibilities. 
Traditional code 
* Indicators 
* Statistics 
* Risk 
* Position sizing 
* Data collection 
* Feature engineering 
LLM 
* Pattern recognition 
* Hypothesis generation 
* Explaining failures 
* Choosing among strategies 
* Generating new filters 
The more deterministic logic you remove from the LLM, the cheaper it gets. 
________________ 
Problem 6: Self-improving code 
This is harder. 
An LLM almost never improves itself safely while live trading. 
Instead use a pipeline. 
Production bot 
↓ 
Collect failures 
↓ 
Research agent 
↓ 
Suggest code changes 
↓ 
Backtest 
↓ 
Evaluate 
↓ 
Deploy only if statistically significant 
Never allow 
LLM edits code 
↓ 
Immediately deploys 
That eventually destroys itself. 
________________ 
Problem 7: VPS storage 
I would move almost everything off the VPS. 
Keep only 
Recent cache 
Recent trades 
Current state 
Store everything else in 
* PostgreSQL 
* ClickHouse (excellent for time-series and event analytics) 
* DuckDB files periodically uploaded to object storage 
* S3-compatible object storage (Cloudflare R2, Backblaze B2, MinIO, AWS S3) 
The VPS should be disposable. 
If it dies tomorrow 
you recreate it from Git and reconnect. 
Problem 8: The LLM isn't actually improving 
What actually makes trading agents improve is not 
more memory 
It's 
better feedback. 
For every trade generate structured feedback like 
Prediction 
Reality 
Reason wrong 
Market regime 
Confidence calibration 
Alternative strategies 
Feature importance 
New hypothesis 
Then every night aggregate hundreds of these. 
This becomes your "research notebook." 
That's where improvement comes from. 
________________ 
If I were building this today 
I'd split it into six services: 
Market Scanner 
 │ 
 ▼ 
Feature Generator 
 │ 
 ▼ 
Strategy Engine 
 │ 
 ▼ 
Execution Engine 
 │ 
 ▼ 
Trade Database 
 │ 
 ▼ 
Research Agent 
The Research Agent would: 
* Analyze thousands of completed trades offline. 
* Generate compact "lessons learned" with supporting statistics. 
* Score hypotheses by out-of-sample performance before promoting them. 
* Maintain a versioned knowledge base that the live bots query with retrieval rather than loading raw history. 
* Produce code or parameter change proposals that must pass automated tests and backtests before deployment. 
The live trading bot would remain lean: it sees the current market, retrieves only the handful of relevant lessons for the present regime, and makes a decision. The heavy reasoning, learning, and experimentation happen asynchronously. 
That architecture scales much better than trying to make a continuously running LLM "remember everything." You end up with lower token usage, far less storage pressure, and—most importantly—a system whose behavior actually evolves because it's distilling evidence into reusable knowledge rather than repeatedly rereading an ever-growing pile of logs. 
Layer 4: Research Agent 
This is the biggest thing missing from most agent systems. 
Your trading bot shouldn't be "learning." 
Your researcher should be learning. 
Imagine another process that runs every night. 
Research Agent 
 
 
↓ 
 
 
Read every trade 
 
 
↓ 
 
 
Find mistakes 
 
 
↓ 
 
 
Generate hypotheses 
 
 
↓ 
 
 
Backtest hypotheses 
 
 
↓ 
 
 
Keep winners 
 
 
↓ 
 
 
Reject losers 
 
 
↓ 
 
 
Update memory 
Now your live trader wakes up smarter every morning. 
________________ 
 
 
Layer 5: Strategy Evolution 
Here's where Hermes or LangGraph actually become valuable. 
Instead of asking 
"Should I buy?" 
you ask 
"Why has Strategy B lost money for twelve days?" 
Very different problem. 
The agent can then 
* inspect logs 
* inspect indicators 
* inspect code 
* compare against previous months 
* run backtests 
* suggest parameter changes 
That is a fantastic use for an LLM. 
________________ 
 
 
Layer 6: Code Evolution 
I would never let this happen. 
LLM 
 
 
↓ 
 
 
Edit strategy.py 
 
 
↓ 
 
 
Deploy 
Instead 
Research Agent 
 
 
↓ 
 
 
Generate Patch 
 
 
↓ 
 
 
Run Tests 
 
 
↓ 
 
 
Run Historical Backtest 
 
 
↓ 
 
 
Run Paper Trading 
 
 
↓ 
 
 
Human Approval 
 
 
↓ 
 
 
Deploy 
Exactly how software engineering teams operate. 
________________ 
 
 
The biggest misconception 
This is the thing I'd change immediately. 
Your bots currently seem to think 
More context 
 
 
↓ 
 
 
Smarter decisions 
Reality is closer to 
More context 
 
 
↓ 
 
 
More confusion 
 
 
↓ 
 
 
Higher cost 
 
 
↓ 
 
 
Slower inference 
The real equation is 
Better retrieval 
 
 
↓ 
 
 
Better reasoning 
________________ 
 
 
I would add one more agent 
The other answer mentions Critic. 
I'd go further. 
I'd build six specialized agents. 
Scanner 
 
 
Find opportunities 
↓ 
Trader 
 
 
Execute positions 
↓ 
Analyst 
 
 
Explain every win/loss 
↓ 
Researcher 
 
 
Find recurring patterns 
↓ 
Statistician 
 
 
Verify significance 
 
 
(No LLM) 
 
 
↓ 
Engineer 
 
 
Suggest code improvements 
Notice something interesting. 
Only three actually need an LLM. 
The Statistician should be pure Python. 
Hypothesis tests. 
Regression. 
Walk-forward analysis. 
Bootstrap confidence intervals. 
Monte Carlo. 
The LLM should never be trusted to determine whether a strategy is statistically valid. 
________________ 
 
 
One thing I disagree with in the other answer 
This is subtle but important. 
They recommend Reflexion after every trade. 
I think that's too frequent. 
Suppose you lose three trades. 
The LLM says 
Momentum doesn't work anymore. 
Then the next day momentum wins twenty times. 
It overfit. 
Instead I'd do something like 
Every trade 
 
 
↓ 
 
 
Store reflection 
but 
Every 100 trades 
 
 
↓ 
 
 
Update beliefs 
or 
Every week 
 
 
↓ 
 
 
Update strategy knowledge 
Trading is incredibly noisy. Learning from individual outcomes is dangerous because variance dominates signal. You want the system to update beliefs only after it has enough evidence. 
________________ 
 
 
If this were a hedge fund project 
Here's the architecture I'd actually build: 
 Trading VPS #1 
 │ 
 Trading VPS #2 
 │ 
 ──────────────┼────────────── 
 │ 
 PostgreSQL + pgvector 
 (trade database + RAG) 
 │ 
 Feature Store (Python) 
 │ 
 Nightly Research Agent 
 │ 
 ┌─────────────┼─────────────┐ 
 │ │ │ 
 Pattern Mining Backtesting Code Review 
 │ │ │ 
 └─────────────┼─────────────┘ 
 │ 
 Versioned Knowledge Base 
 │ 
 Live Bots Retrieve Only 
 Relevant Lessons 
Notice what isn't in that diagram: 
* enormous prompt histories 
* giant log files 
* permanent chat memory 
* "the LLM learns continuously" 
Instead, the system learns the same way a quantitative research team does: collect data → generate hypotheses → test them → promote only statistically validated knowledge. 
I think that's the architectural shift that would give you the biggest improvement. Right now you're trying to make the live LLM be the researcher. I would make the live bot a disciplined executor and move the intelligence into a dedicated research pipeline that continuously produces better, evidence-backed knowledge for the trading bots to retrieve. That's much closer to how successful systematic trading organizations operate. 
 
 
 
 
One point of clarification, they are two separate bots with two separate strategies with two separate VPS 
That actually makes the architecture cleaner, not more complicated. 
The key principle I'd follow is: 
Keep execution separate. Share research only where it makes sense. 
I'd think of them as two independent trading desks inside the same firm. 
Bot A (Strategy A) 
 │ 
 ▼ 
Trades only Strategy A 
 
 
Bot B (Strategy B) 
 │ 
 ▼ 
Trades only Strategy B 
Neither bot should know anything about how to execute the other's strategy. That isolation reduces the risk of cross-contamination. 
The only place I'd consider sharing information is in the research layer. 
For example: 
Bot A VPS 
 │ 
 ├── SQLite/Postgres 
 ├── Recent state 
 └── Executes trades 
 
 
Bot B VPS 
 │ 
 ├── SQLite/Postgres 
 ├── Recent state 
 └── Executes trades 
 
 
 │ 
 ▼ 
 
 
 Research Server 
The Research Server periodically pulls summarized trade data from each VPS. It then maintains three knowledge bases: 
1. Strategy A knowledge 
 * "Momentum works best when..." 
 * Only Bot A retrieves this. 
2. Strategy B knowledge 
 * "Mean reversion degrades when..." 
 * Only Bot B retrieves this. 
3. Global market knowledge (optional) 
 * "Hyperliquid spreads widen around major macro events." 
 * "Polymarket prediction markets become less efficient after major news." 
 * This can be useful to both bots if it's genuinely strategy-agnostic. 
This is an important distinction because you don't want a lesson that's valid for Strategy A to accidentally influence Strategy B if their philosophies are fundamentally different. 
What I would not do 
I would avoid having the bots directly communicate with each other during live trading. 
For example: 
Bot A 
 │ 
 ▼ 
"Bot B lost money today, 
I should change my behavior." 
That's usually a bad idea because they may be exploiting entirely different market inefficiencies. 
What I would do 
Let the Research Agent compare them offline. 
It can answer questions like: 
* "Why did Strategy A outperform Strategy B this week?" 
* "Did both strategies fail during the same volatility regime?" 
* "Should capital allocation shift from A to B?" 
Those are portfolio-level decisions, not execution decisions. 
One opportunity you're uniquely positioned to exploit 
Since you already have two independent strategies, you can build a meta-learning layer. 
Instead of asking: 
"Should I buy?" 
it asks: 
"Given the current market regime, which strategy historically performs better?" 
That meta-agent doesn't place trades. It allocates confidence or capital between Strategy A and Strategy B based on their historical strengths in similar conditions. 
So each VPS stays focused on executing its own edge, while the central research layer becomes progressively better at understanding when each strategy has the advantage. That's a much more robust use of multiple independent bots than trying to merge their memories into one giant system. 
Yes—and I actually recommend doing this. Instead of dumping the raw conversation into another agent (which is expensive and noisy), give it a technical design brief. That preserves the important architectural decisions while keeping the context compact. 
Here's the summary I'd hand to another AI engineer or coding agent: 
Trading AI System Architecture Summary 
Current System 
The system consists of two completely independent trading bots, each running on its own VPS. 
Each bot: 
* Uses a different trading strategy. 
* Scans markets (e.g. Polymarket, Hyperliquid) on an hourly schedule. 
* Uses an embedded LLM for reasoning. 
* Logs trades and LLM prompts. 
* Produces a daily Telegram report. 
Current problems: 
* Excessive token usage. 
* Memory/log bloat causing VPS storage issues. 
* LLM context becoming too large. 
* LLMs are not meaningfully "learning" over time. 
* LLMs are not autonomously improving strategy or code. 
* Raw logs are being stored instead of distilled knowledge. 
________________ 
 
 
Key Architectural Insight 
The live trading LLM should not be responsible for learning. 
Instead, separate the system into: 
1. Execution 
2. Data collection 
3. Research 
4. Knowledge generation 
The live bot should retrieve relevant knowledge rather than continuously ingesting its entire history. 
________________ 
 
 
Architecture Per Bot 
Each strategy should have its own completely independent learning pipeline. 
Trading VPS 
↓ 
Market Scanner 
↓ 
Feature Generator 
↓ 
Strategy Engine 
↓ 
Trade Execution 
↓ 
PostgreSQL + pgvector 
(Trades + Features + Vector Memory) 
↓ 
Feature Store 
↓ 
Nightly Research Agent 
↓ 
Pattern Mining 
Backtesting 
Code Review 
↓ 
Versioned Knowledge Base 
↓ 
Live Bot retrieves only relevant lessons via RAG 
Each bot maintains: 
* Separate database 
* Separate vector index 
* Separate research agent 
* Separate knowledge base 
No shared execution logic. 
________________ 
 
 
Memory Design 
Replace raw logs with structured memory. 
Do NOT store every prompt forever. 
Instead store: 
Trade 
* Features 
* Market regime 
* Entry 
* Exit 
* PnL 
* Confidence 
* Risk metrics 
Reflection 
* Why trade succeeded/failed 
* Confidence calibration 
* Hypothesis 
* Suggested improvement 
Knowledge 
* Aggregated lessons from many trades 
* Statistical confidence 
* Market conditions 
* Strategy-specific observations 
Memory should evolve: 
Raw Logs 
→ Trade Summaries 
→ Lessons 
→ Versioned Knowledge Base 
________________ 
 
 
Learning Pipeline 
The live bot does not improve itself. 
Nightly Research Agent: 
Read completed trades 
↓ 
Cluster similar trades 
↓ 
Generate hypotheses 
↓ 
Backtest hypotheses 
↓ 
Statistically validate 
↓ 
Update knowledge base 
↓ 
Suggest code improvements 
Only validated knowledge is promoted. 
________________ 
 
 
Statistical Principle 
Do NOT update strategy after every trade. 
Trading is noisy. 
Instead: 
Every trade: 
* Generate reflection 
Every 100+ trades (or daily/weekly): 
* Update beliefs 
* Generate lessons 
* Modify strategy if statistically justified 
________________ 
 
 
Model Routing 
Different models should perform different tasks. 
Python 
* Indicators 
* Statistics 
* Sharpe 
* Regression 
* Position sizing 
* Risk 
* PnL 
* Correlations 
Embedding Model 
* Vector search 
* RAG 
Small Local Model 
* Summaries 
* Reflection 
* Classification 
* JSON extraction 
* Memory compression 
Medium Model 
* Trade analysis 
* Daily reports 
* Failure analysis 
* Pattern discovery 
Large Reasoning Model 
* Strategy research 
* Code review 
* Architecture 
* Strategy redesign 
Expensive reasoning models should run rarely. 
________________ 
 
 
Telegram 
Telegram should become a read-only analyst. 
Architecture: 
Telegram 
↓ 
SQL 
↓ 
Vector Search 
↓ 
LLM 
Capabilities: 
* Explain trades 
* Compare periods 
* Search historical failures 
* Retrieve lessons 
* Explain performance 
* Answer questions about reports 
No ability to place trades or modify production systems. 
________________ 
 
 
Storage 
Trading VPS should remain lightweight. 
Store only: 
* Current state 
* Recent cache 
* Recent trades 
Move historical knowledge into PostgreSQL + pgvector. 
Archive raw logs after summarization. 
________________ 
 
 
Optional Components 
Hermes Agent: 
Useful as a research orchestrator. 
Can: 
* Query database 
* Run backtests 
* Read code 
* Generate reports 
* Suggest code changes 
Should NOT execute trades. 
OpenClaw: 
Not necessary. 
Obsidian: 
Useful for human research notes only, not as machine memory. 
________________ 
 
 
Long-Term Vision 
The system is evolving from a pair of trading bots into a quantitative research platform. 
Execution should remain deterministic and lightweight. 
Most intelligence should exist inside an asynchronous research pipeline that continuously generates statistically validated knowledge for the live trading bots to retrieve. 
Learning should come from evidence and experimentation, not from continuously expanding prompt history. 
This summary is concise enough to fit comfortably into another agent's context window while preserving the core architectural decisions. From there, you can ask another coding agent to implement a specific subsystem (database schema, RAG, nightly research agent, Telegram analyst, etc.) without it needing to reread this entire conversation. 
Ad 
Is this a world class set up? Why or why not? 
I think it's on the path to a world-class architecture, but it's not world-class yet. The difference isn't the LLMs—it's the rigor around research, validation, and operations. 
If I compare your proposed system to what you'd see at a top quantitative trading firm or an elite AI startup, here's how I'd score it. 
Area 
 Current Vision 
 World-Class? 
 Strategy isolation 
 ✅ Excellent 
 Yes 
 Research pipeline 
 ✅ Excellent direction 
 Yes 
 RAG / knowledge retrieval 
 ✅ Strong 
 Yes 
 Model orchestration 
 ✅ Strong 
 Yes 
 Autonomous research 
 ✅ Strong 
 Yes 
 Statistical validation 
 ⚠️ Needs expansion 
 Not yet 
 Experiment management 
 ⚠️ Missing 
 No 
 Monitoring & observability 
 ⚠️ Basic 
 No 
 Deployment safety 
 ⚠️ Needs maturity 
 No 
 Portfolio/risk management 
 ⚠️ Limited 
 No 
 The exciting part is that you've already identified the right direction. The remaining gap is less about AI and more about engineering discipline. 
I will use Neon Postrgres for storage database and I have credentials I can give you. 
 
Do you recommend this plan, and is there anything else that needs to be thought out? 
 
Some of these things need to be adapted to the way the trader works now.