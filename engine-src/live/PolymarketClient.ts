/**
 * Production Polymarket CLOB client.
 *
 * Handles wallet setup, API credential derivation, order signing,
 * placement, cancellation, and balance checks. Wraps @polymarket/clob-client.
 */

import { ClobClient, ApiKeyCreds, Side, type TickSize } from "@polymarket/clob-client";
import { ethers } from "ethers";

const DEFAULT_TICK_SIZE: TickSize = "0.01";

export interface LiveOrderRequest {
  tokenId: string;
  price: number;
  size: number;
  side: "BUY" | "SELL";
  expiration?: number;
}

export interface LiveOrder {
  id: string;
  tokenId: string;
  price: number;
  size: number;
  side: "BUY" | "SELL";
  status: string;
  createdAt: number;
}

export type { ApiKeyCreds };

export class PolymarketClient {
  private client!: ClobClient;
  private signer: ethers.Wallet;
  private host: string;
  private chainId: number;
  private creds: ApiKeyCreds | null = null;
  private _ready = false;
  private _dryRun: boolean;
  private funderAddress?: string;

  // Safety counters
  private ordersPlaced = 0;
  private ordersCancelled = 0;
  private totalVolumeUsdc = 0;
  private maxLossUsdc: number;
  private _killed = false;

  // Exponential backoff on consecutive order failures
  private consecutiveErrors = 0;
  private backoffUntil = 0;

  // Dedup repeated rejection messages
  private _lastRejectKey = "";

  constructor(options: {
    privateKey: string;
    host?: string;
    chainId?: number;
    dryRun?: boolean;
    maxLossUsdc?: number;
    funderAddress?: string;
  }) {
    this.host = options.host ?? "https://clob.polymarket.com";
    this.chainId = options.chainId ?? 137;
    this.signer = new ethers.Wallet(options.privateKey);
    this._dryRun = options.dryRun ?? true;
    this.maxLossUsdc = options.maxLossUsdc ?? 500;
    this.funderAddress = options.funderAddress;

    console.log(`[CLOB] Wallet: ${this.signer.address}`);
    console.log(`[CLOB] Mode: ${this._dryRun ? "DRY RUN (no real orders)" : "LIVE TRADING"}`);
    console.log(`[CLOB] Max loss limit: $${this.maxLossUsdc}`);
  }

  get address(): string {
    return this.signer.address;
  }

  get isDryRun(): boolean {
    return this._dryRun;
  }

  get isReady(): boolean {
    return this._ready;
  }

  get isKilled(): boolean {
    return this._killed;
  }

  /**
   * Initialize: derive or create API credentials, then build the L2 client.
   */
  async init(): Promise<void> {
    if (this._dryRun) {
      console.log(`[CLOB] Dry-run mode — skipping API credential setup`);
      this._ready = true;
      return;
    }

    console.log(`[CLOB] Initializing L1 client...`);
    const l1Client = new ClobClient(this.host, this.chainId, this.signer);

    console.log(`[CLOB] Deriving API credentials...`);
    try {
      this.creds = await l1Client.deriveApiKey() as ApiKeyCreds;
      console.log(`[CLOB] Derived existing API key: ${this.creds.key.slice(0, 8)}...`);
    } catch (deriveErr: any) {
      console.log(`[CLOB] derive failed (${deriveErr.message?.slice(0, 60)}), creating new key...`);
      try {
        this.creds = await l1Client.createApiKey() as ApiKeyCreds;
        console.log(`[CLOB] Created new API key: ${this.creds.key.slice(0, 8)}...`);
      } catch (err: any) {
        console.error(`[CLOB] Failed to create API key: ${err.message}`);
        console.error(`[CLOB] Make sure this wallet has a Polymarket account.`);
        console.error(`[CLOB] Visit https://polymarket.com and connect this wallet first.`);
        process.exit(1);
      }
    }

    if (!this.creds?.key) {
      console.error(`[CLOB] No valid API credentials obtained.`);
      process.exit(1);
    }

    this.client = new ClobClient(
      this.host,
      this.chainId,
      this.signer,
      this.creds,
      0,
      this.funderAddress,
    );

    this._ready = true;
    console.log(`[CLOB] Client ready for live trading.`);
  }

  /**
   * Place a limit order. Returns order ID or null if dry run / error.
   */
  async placeOrder(req: LiveOrderRequest): Promise<string | null> {
    if (this._killed) {
      console.error(`[CLOB] KILL SWITCH ACTIVE — refusing order`);
      return null;
    }

    if (!this._ready) {
      console.error(`[CLOB] Client not initialized`);
      return null;
    }

    // Exponential backoff: skip orders while backing off from consecutive failures
    if (Date.now() < this.backoffUntil) {
      return null;
    }

    const volumeUsdc = req.price * req.size;

    if (this._dryRun) {
      const fakeId = `dry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      console.log(
        `[CLOB][DRY] ${req.side} ${req.size} @ ${req.price} ` +
        `token=${req.tokenId.slice(0, 12)}... → ${fakeId}`
      );
      this.ordersPlaced++;
      this.totalVolumeUsdc += volumeUsdc;
      return fakeId;
    }

    try {
      const tickSize = await this.getTickSize(req.tokenId);

      // Suppress the @polymarket/clob-client internal error spam that dumps
      // entire request bodies to stderr on 400 responses.
      const origErr = console.error;
      console.error = (...args: any[]) => {
        const msg = typeof args[0] === "string" ? args[0] : "";
        if (msg.includes("[CLOB Client] request error")) return;
        origErr.apply(console, args);
      };

      let resp: any;
      try {
        resp = await this.client.createAndPostOrder({
          tokenID: req.tokenId,
          price: req.price,
          size: req.size,
          side: req.side === "BUY" ? Side.BUY : Side.SELL,
          expiration: req.expiration,
        }, {
          tickSize,
          negRisk: false,
        });
      } finally {
        console.error = origErr;
      }

      const orderId = (resp as any)?.orderID ?? (resp as any)?.id ?? null;
      if (orderId) {
        console.log(
          `[CLOB] ${req.side} ${req.size} @ ${req.price} → ${orderId}`
        );
        this.ordersPlaced++;
        this.totalVolumeUsdc += volumeUsdc;
        this._lastRejectKey = "";
      } else {
        const errMsg = (resp as any)?.error ?? "unknown";
        const rejectKey = `${errMsg}|${req.side}`;
        if (rejectKey !== this._lastRejectKey) {
          console.error(`[CLOB] Order rejected: ${errMsg} (${req.side} ${req.size} @ ${req.price})`);
          this._lastRejectKey = rejectKey;
        }
      }
      this.consecutiveErrors = 0;
      return orderId;
    } catch (err: any) {
      this.consecutiveErrors++;
      const backoffMs = Math.min(60_000, 1000 * Math.pow(2, this.consecutiveErrors));
      this.backoffUntil = Date.now() + backoffMs;
      const shortMsg = err.message?.slice(0, 80) ?? "unknown";
      console.error(`[CLOB] Order failed (${this.consecutiveErrors}x, backoff ${backoffMs}ms): ${shortMsg}`);
      return null;
    }
  }

  /**
   * Cancel a single order by ID.
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    if (this._dryRun) {
      console.log(`[CLOB][DRY] Cancel ${orderId}`);
      this.ordersCancelled++;
      return true;
    }

    if (!this._ready) return false;

    try {
      await this.client.cancelOrder({ orderID: orderId });
      this.ordersCancelled++;
      return true;
    } catch (err: any) {
      console.error(`[CLOB] Cancel failed for ${orderId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Cancel all open orders (optionally for a specific market/token).
   */
  private _lastCancelAllTs = 0;

  async cancelAll(quiet = false): Promise<boolean> {
    if (this._dryRun) {
      if (!quiet) console.log(`[CLOB][DRY] Cancel all orders`);
      return true;
    }

    if (!this._ready) return false;

    try {
      await this.client.cancelAll();
      if (!quiet) console.log(`[CLOB] Cancelled all orders`);
      this._lastCancelAllTs = Date.now();
      return true;
    } catch (err: any) {
      console.error(`[CLOB] Cancel all failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Get open orders for the wallet.
   */
  async getOpenOrders(): Promise<any[]> {
    if (this._dryRun || !this._ready) return [];
    try {
      const resp = await this.client.getOpenOrders();
      return (resp as any) ?? [];
    } catch (err: any) {
      console.error(`[CLOB] getOpenOrders failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get the tick size for a token (determines price precision).
   */
  async getTickSize(tokenId: string): Promise<TickSize> {
    try {
      const resp = await this.client.getTickSize(tokenId);
      return (resp as TickSize | null) ?? DEFAULT_TICK_SIZE;
    } catch {
      return DEFAULT_TICK_SIZE;
    }
  }

  /**
   * Kill switch — immediately cancel all orders and refuse new ones.
   */
  async kill(reason: string): Promise<void> {
    console.error(`[CLOB] *** KILL SWITCH *** Reason: ${reason}`);
    this._killed = true;
    await this.cancelAll();
  }

  /**
   * Check if cumulative loss exceeds the max loss limit.
   */
  checkMaxLoss(currentPnl: number): void {
    if (currentPnl < -this.maxLossUsdc && !this._killed) {
      this.kill(`Max loss exceeded: $${currentPnl.toFixed(2)} < -$${this.maxLossUsdc}`);
    }
  }

  getStats() {
    return {
      address: this.signer.address,
      dryRun: this._dryRun,
      ready: this._ready,
      killed: this._killed,
      ordersPlaced: this.ordersPlaced,
      ordersCancelled: this.ordersCancelled,
      totalVolumeUsdc: this.totalVolumeUsdc,
      maxLossUsdc: this.maxLossUsdc,
    };
  }

}
