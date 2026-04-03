import { ethers } from "ethers";
import { createHmac, randomBytes } from "crypto";

const CHAIN_ID = parseInt(process.env.CHAIN_ID || "84532");
const EXCHANGE_ADDRESS = process.env.CTF_EXCHANGE_ADDRESS || "0x0000000000000000000000000000000000000000";

const EIP712_DOMAIN = {
  name: "CTFExchange",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: EXCHANGE_ADDRESS,
};

const AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
};

const ORDER_TYPES = {
  Order: [
    { name: "maker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "side", type: "uint8" },
  ],
};

export interface ApiKey {
  key: string;
  secret: string;
  address: string;
  expiresAt: number;
}

const apiKeys = new Map<string, ApiKey>();

/**
 * L1 Auth: Verify an EIP-712 signature to derive the signer's address.
 * Used for initial API key derivation.
 */
export function verifyL1Auth(
  address: string,
  timestamp: string,
  nonce: number,
  message: string,
  signature: string,
): boolean {
  try {
    const recovered = ethers.verifyTypedData(EIP712_DOMAIN, AUTH_TYPES, { address, timestamp, nonce, message }, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Create L2 API credentials from a verified L1 auth.
 * Returns an API key + secret for HMAC-based authentication.
 */
export function createApiKey(address: string): ApiKey {
  const key = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  const apiKey: ApiKey = { key, secret, address, expiresAt };
  apiKeys.set(key, apiKey);
  return apiKey;
}

/**
 * L2 Auth: Verify HMAC-SHA256 signature for API requests.
 */
export function verifyL2Auth(
  apiKey: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
  signature: string,
): { valid: boolean; address?: string } {
  const stored = apiKeys.get(apiKey);
  if (!stored) return { valid: false };
  if (stored.expiresAt < Date.now()) {
    apiKeys.delete(apiKey);
    return { valid: false };
  }

  // Signature must be recent (30 second window)
  const ts = parseInt(timestamp);
  if (Math.abs(Date.now() - ts) > 30_000) return { valid: false };

  const message = timestamp + method.toUpperCase() + path + body;
  const expected = createHmac("sha256", stored.secret).update(message).digest("hex");

  if (expected !== signature) return { valid: false };
  return { valid: true, address: stored.address };
}

/**
 * Verify an EIP-712 order signature matches the claimed maker.
 */
export function verifyOrderSignature(order: {
  maker: string;
  tokenId: string;
  makerAmount: bigint;
  takerAmount: bigint;
  nonce: number;
  expiration: number;
  side: number;
  signature: string;
}): boolean {
  try {
    const orderData = {
      maker: order.maker,
      tokenId: BigInt(order.tokenId),
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      nonce: order.nonce,
      expiration: order.expiration,
      side: order.side,
    };

    const recovered = ethers.verifyTypedData(EIP712_DOMAIN, ORDER_TYPES, orderData, order.signature);
    return recovered.toLowerCase() === order.maker.toLowerCase();
  } catch {
    return false;
  }
}

export function revokeApiKey(key: string): boolean {
  return apiKeys.delete(key);
}

export function getApiKeyAddress(key: string): string | undefined {
  return apiKeys.get(key)?.address;
}
