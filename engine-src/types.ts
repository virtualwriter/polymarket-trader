export enum Side {
  BUY = 0,
  SELL = 1,
}

export enum OrderType {
  GTC = "GTC", // Good-til-cancelled
  GTD = "GTD", // Good-til-date
  FOK = "FOK", // Fill-or-kill
  FAK = "FAK", // Fill-and-kill (immediate-or-cancel)
}

export enum MatchType {
  NORMAL = 0,
  MINT = 1,
  MERGE = 2,
}

export interface Order {
  id: string;
  maker: string;
  tokenId: string;
  makerAmount: bigint;
  takerAmount: bigint;
  nonce: number;
  expiration: number; // unix timestamp, 0 = no expiry
  side: Side;
  signature: string;
  orderType: OrderType;
  postOnly: boolean;
  timestamp: number;
}

export interface OrderBookEntry {
  price: number; // 0.00 to 1.00
  size: bigint; // in USDC (6 decimals)
  order: Order;
}

export interface Trade {
  id: string;
  marketId: string;
  makerOrderId: string;
  takerOrderId: string;
  maker: string;
  taker: string;
  side: Side;
  price: number;
  size: bigint;
  fee: bigint;
  matchType: MatchType;
  makerOrderAge?: number; // seconds the maker order sat on the book before fill
  timestamp: number;
  settled: boolean;
  txHash?: string;
}

export interface Market {
  id: string;
  questionId: string;
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  question: string;
  description: string;
  resolutionSource: string;
  endDate: number;
  resolved: boolean;
  outcome?: boolean;
  createdAt: number;
  // Christie's-specific metadata
  lotNumber: number;
  artist: string;
  title: string;
  year: string;
  lowEstimate: string;
  highEstimate: string;
  currency: string;
  auctionId: string;
  imageUrl?: string;
}

export interface OrderBookSnapshot {
  marketId: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  lastTradePrice?: number;
  spread?: number;
  hash: string;
  timestamp: number;
}

export interface PriceLevel {
  price: number;
  size: bigint;
  numOrders: number;
}

export interface UserPosition {
  address: string;
  marketId: string;
  yesShares: bigint;
  noShares: bigint;
  avgBuyPrice: number;
  unrealizedPnl: number;
}

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
  expiresAt: number;
}

// WebSocket message types
export type WSMessage =
  | { type: "orderbook_snapshot"; data: OrderBookSnapshot }
  | { type: "orderbook_update"; data: { marketId: string; bids: PriceLevel[]; asks: PriceLevel[] } }
  | { type: "trade"; data: Trade }
  | { type: "order_update"; data: { orderId: string; status: string; filled: bigint } }
  | { type: "market_update"; data: Partial<Market> & { id: string } }
  | { type: "auction_update"; data: AuctionUpdate };

export interface AuctionUpdate {
  lotNumber: number;
  status: "in_play" | "bid" | "sold" | "passed" | "withdrawn";
  currentBid?: number;   // in GBP (whole pounds)
  hammerPrice?: number;   // in GBP, set when sold
  sold?: boolean;
  currency?: string;
}
