import WebSocket from "ws";
import { MatchingEngine } from "../matching/MatchingEngine.js";
import { AuctionUpdate } from "../types.js";

export interface BidJSConfig {
  auctionUuid: string;
  region: string; // e.g. "eu-west-2" for London
  lotMapping: Map<string, number>; // listingUuid -> lotNumber (populated at runtime)
  highEstimates: Map<number, number>; // lotNumber -> high estimate in GBP
  engine: MatchingEngine;
  autoResolve: boolean;
  onUpdate?: (update: AuctionUpdate) => void;
}

interface BidJSMessage {
  action: string;
  data: any;
}

/**
 * Connects to BidJS WebSocket to receive live Christie's auction events.
 *
 * Key events:
 *   - WEBCAST_INPLAY_SET: which lot is currently being auctioned
 *   - BID_PLACED: new bid placed (contains amount in pence)
 *   - SALE_COMPLETED: lot finished (sold or passed)
 *
 * The client maps BidJS listing UUIDs to our lot numbers and triggers
 * market resolution when lots sell.
 */
export class BidJSClient {
  private ws: WebSocket | null = null;
  private config: BidJSConfig;
  private bids: Map<string, number> = new Map(); // bidUuid -> amount in pence
  private listingLots: Map<string, number> = new Map(); // listingUuid -> lotNumber
  private currentInPlay: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  constructor(config: BidJSConfig) {
    this.config = config;
    this.listingLots = new Map(config.lotMapping);
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Register a mapping from BidJS listing UUID to lot number.
   * Call this when the auction data becomes available (e.g. from SALE_ADDED messages).
   */
  registerListing(listingUuid: string, lotNumber: number): void {
    this.listingLots.set(listingUuid, lotNumber);
  }

  private connect(): void {
    const url = `wss://broadcast.${this.config.region}.bidjs.com`;
    console.log(`[BidJS] Connecting to ${url}...`);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[BidJS] Connected, subscribing to auction", this.config.auctionUuid);
      this.connected = true;

      this.ws!.send(
        JSON.stringify({
          action: "SubscribeToAuction",
          data: [this.config.auctionUuid],
        }),
      );

      // Keep-alive ping every 5 minutes
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: "Ping" }));
        }
      }, 300_000);
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg: BidJSMessage = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.on("close", () => {
      console.log("[BidJS] Disconnected");
      this.connected = false;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      console.error("[BidJS] WebSocket error:", err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log("[BidJS] Reconnecting in 5s...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private handleMessage(msg: BidJSMessage): void {
    switch (msg.action) {
      case "AUCTION_SUBSCRIBED":
        console.log("[BidJS] Subscribed to auction:", msg.data);
        break;

      case "PONG":
        break;

      case "SALE_ADDED":
        this.handleSaleAdded(msg.data);
        break;

      case "WEBCAST_INPLAY_SET":
      case "WEBCAST_INPLAY_STATE_SET":
        this.handleInPlay(msg.data);
        break;

      case "BID_PLACED":
        this.handleBidPlaced(msg.data);
        break;

      case "SALE_COMPLETED":
        this.handleSaleCompleted(msg.data);
        break;

      case "SALE_STARTED":
        this.handleSaleStarted(msg.data);
        break;

      case "SALE_WITHDRAWN":
        this.handleSaleWithdrawn(msg.data);
        break;

      default:
        break;
    }
  }

  private handleSaleAdded(data: any): void {
    if (!data.listings) return;

    for (const [uuid, listing] of Object.entries<any>(data.listings)) {
      if (listing.lotNumber) {
        const lotNum = parseInt(listing.lotNumber, 10);
        if (!isNaN(lotNum)) {
          this.registerListing(uuid, lotNum);
          console.log(`[BidJS] Mapped listing ${uuid} -> Lot ${lotNum}`);
        }
      }
    }
  }

  private handleInPlay(data: any): void {
    const listingUuid = data.listingUuid;
    if (!listingUuid) return;

    this.currentInPlay = listingUuid;
    const lotNumber = this.listingLots.get(listingUuid);
    if (!lotNumber) return;

    const update: AuctionUpdate = {
      lotNumber,
      status: "in_play",
      currency: "GBP",
    };

    this.emitUpdate(update);
  }

  private handleBidPlaced(data: any): void {
    const bid = data.bid;
    if (!bid) return;

    // Store bid amount (in pence/cents)
    this.bids.set(bid.uuid, bid.amount);

    const listingUuid = bid.listingUuid;
    const lotNumber = this.listingLots.get(listingUuid);
    if (!lotNumber) return;

    // Amount is in pence; convert to pounds
    const currentBidGBP = bid.amount / 100;

    const update: AuctionUpdate = {
      lotNumber,
      status: "bid",
      currentBid: currentBidGBP,
      currency: "GBP",
    };

    this.emitUpdate(update);
  }

  private handleSaleCompleted(data: any): void {
    const saleStatus = data.saleStatus;
    if (!saleStatus) return;

    const listingUuid = saleStatus.listingUuid;
    const lotNumber = this.listingLots.get(listingUuid);
    if (!lotNumber) return;

    const sold = saleStatus.sold === true;
    const withdrawn = saleStatus.withdrawn === true;

    let hammerPrice: number | undefined;
    if (sold && saleStatus.highestBidUuid) {
      const bidAmount = this.bids.get(saleStatus.highestBidUuid);
      if (bidAmount) {
        hammerPrice = bidAmount / 100; // pence to pounds
      }
    }

    const status = withdrawn ? "withdrawn" : sold ? "sold" : "passed";

    const update: AuctionUpdate = {
      lotNumber,
      status,
      hammerPrice,
      sold,
      currency: "GBP",
    };

    console.log(
      `[BidJS] Lot ${lotNumber}: ${status}` +
        (hammerPrice ? ` at £${hammerPrice.toLocaleString()}` : ""),
    );

    this.emitUpdate(update);

    if (this.config.autoResolve) {
      this.resolveMarket(lotNumber, sold, hammerPrice);
    }
  }

  private handleSaleStarted(data: any): void {
    const saleStatus = data.saleStatus;
    if (!saleStatus) return;

    const listingUuid = saleStatus.listingUuid;
    const lotNumber = this.listingLots.get(listingUuid);
    if (!lotNumber) return;

    this.emitUpdate({
      lotNumber,
      status: "in_play",
      currency: "GBP",
    });
  }

  private handleSaleWithdrawn(data: any): void {
    if (!data.saleStatuses) return;

    for (const [listingUuid, saleStatus] of Object.entries<any>(data.saleStatuses)) {
      const lotNumber = this.listingLots.get(listingUuid);
      if (!lotNumber) continue;

      const update: AuctionUpdate = {
        lotNumber,
        status: "withdrawn",
        sold: false,
        currency: "GBP",
      };

      this.emitUpdate(update);

      if (this.config.autoResolve) {
        this.resolveMarket(lotNumber, false, undefined);
      }
    }
  }

  private resolveMarket(
    lotNumber: number,
    sold: boolean,
    hammerPrice: number | undefined,
  ): void {
    const marketId = `lot-${lotNumber}`;
    const highEstimate = this.config.highEstimates.get(lotNumber);

    if (highEstimate === undefined) {
      console.warn(`[BidJS] No high estimate for Lot ${lotNumber}, skipping resolution`);
      return;
    }

    let outcome: boolean;
    if (!sold) {
      outcome = false;
    } else if (hammerPrice !== undefined && hammerPrice >= highEstimate) {
      outcome = true;
    } else {
      outcome = false;
    }

    console.log(
      `[BidJS] Resolving Lot ${lotNumber}: ${outcome ? "YES" : "NO"}` +
        (hammerPrice ? ` (£${hammerPrice.toLocaleString()} vs £${highEstimate.toLocaleString()})` : " (unsold)"),
    );

    try {
      this.config.engine.resolveMarket(marketId, outcome);
    } catch (err: any) {
      console.error(`[BidJS] Failed to resolve ${marketId}:`, err.message);
    }
  }

  private emitUpdate(update: AuctionUpdate): void {
    this.config.onUpdate?.(update);

    this.config.engine.emitEvent({
      type: "auction_update",
      data: update,
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
