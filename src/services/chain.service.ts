import { chain } from '../config.js';

/**
 * Fetches live chain stats by calling the Paxeer JSON-RPC endpoint.
 */

interface JsonRpcResponse<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T = unknown>(method: string, params: unknown[] = []): Promise<T | null> {
  try {
    const res = await fetch(chain.rpc.evmJsonRpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as JsonRpcResponse<T>;
    if (data.error) return null;
    return data.result ?? null;
  } catch {
    return null;
  }
}

export async function getNetworkInfo() {
  return {
    name: chain.name,
    cosmosChainId: chain.cosmosChainId,
    evmChainId: chain.evmChainId,
    token: chain.token,
    bech32Prefix: chain.bech32Prefix,
    rpc: chain.rpc,
    explorer: chain.explorer,
    website: chain.website,
    docs: chain.docs,
  };
}

export async function getNetworkStats() {
  const [blockNumber, gasPrice, chainId, peerCount] = await Promise.all([
    rpcCall<string>('eth_blockNumber'),
    rpcCall<string>('eth_gasPrice'),
    rpcCall<string>('eth_chainId'),
    rpcCall<string>('net_peerCount'),
  ]);

  return {
    blockHeight: blockNumber ? parseInt(blockNumber, 16) : null,
    gasPrice: gasPrice ? parseInt(gasPrice, 16).toString() : null,
    gasPriceGwei: gasPrice ? (parseInt(gasPrice, 16) / 1e9).toFixed(2) : null,
    chainId: chainId ? parseInt(chainId, 16) : null,
    peerCount: peerCount ? parseInt(peerCount, 16) : null,
    timestamp: new Date().toISOString(),
  };
}

export async function getHealthCheck() {
  const blockNumber = await rpcCall<string>('eth_blockNumber');
  return {
    healthy: blockNumber !== null,
    blockHeight: blockNumber ? parseInt(blockNumber, 16) : null,
    rpcEndpoint: chain.rpc.evmJsonRpc,
    timestamp: new Date().toISOString(),
  };
}

/** Allowlisted JSON-RPC methods that anonymous users can call */
export const ALLOWED_RPC_METHODS = [
  'eth_blockNumber',
  'eth_chainId',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getTransactionCount',
  'eth_getCode',
  'eth_call',
  'eth_estimateGas',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'net_version',
  'net_peerCount',
  'net_listening',
  'web3_clientVersion',
  'web3_sha3',
] as const;

export const RPC_METHOD_DOCS: Record<string, { description: string; params: string; example: unknown[] }> = {
  eth_blockNumber: {
    description: 'Returns the number of the most recent block',
    params: 'none',
    example: [],
  },
  eth_chainId: {
    description: 'Returns the chain ID',
    params: 'none',
    example: [],
  },
  eth_gasPrice: {
    description: 'Returns the current gas price in wei',
    params: 'none',
    example: [],
  },
  eth_getBalance: {
    description: 'Returns the balance of an account',
    params: 'address: string, block: string',
    example: ['0x0000000000000000000000000000000000000000', 'latest'],
  },
  eth_getBlockByNumber: {
    description: 'Returns block information by block number',
    params: 'blockNumber: string, fullTx: boolean',
    example: ['latest', false],
  },
  eth_getBlockByHash: {
    description: 'Returns block information by block hash',
    params: 'blockHash: string, fullTx: boolean',
    example: ['0x...', false],
  },
  eth_getTransactionByHash: {
    description: 'Returns transaction information by hash',
    params: 'txHash: string',
    example: ['0x...'],
  },
  eth_getTransactionReceipt: {
    description: 'Returns the receipt of a transaction',
    params: 'txHash: string',
    example: ['0x...'],
  },
  eth_call: {
    description: 'Executes a call without creating a transaction',
    params: 'tx: object, block: string',
    example: [{ to: '0x...', data: '0x...' }, 'latest'],
  },
  eth_estimateGas: {
    description: 'Estimates gas needed for a transaction',
    params: 'tx: object',
    example: [{ to: '0x...', data: '0x...' }],
  },
  eth_getLogs: {
    description: 'Returns logs matching a filter',
    params: 'filter: object',
    example: [{ fromBlock: '0x0', toBlock: 'latest', address: '0x...' }],
  },
  eth_getCode: {
    description: 'Returns the code at an address',
    params: 'address: string, block: string',
    example: ['0x...', 'latest'],
  },
  net_version: {
    description: 'Returns the current network ID',
    params: 'none',
    example: [],
  },
  web3_clientVersion: {
    description: 'Returns the client version',
    params: 'none',
    example: [],
  },
};

export async function proxyRpcCall(method: string, params: unknown[]) {
  if (!ALLOWED_RPC_METHODS.includes(method as (typeof ALLOWED_RPC_METHODS)[number])) {
    return { error: { code: -32601, message: `Method '${method}' is not allowed` } };
  }

  const res = await fetch(chain.rpc.evmJsonRpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });

  return res.json();
}
