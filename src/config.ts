/**
 * Server configuration & Paxeer chain constants
 */

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
  /** PostgreSQL connection string */
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** Redis connection string */
  redisUrl: process.env.REDIS_URL ?? '',
  /** S3-compatible storage */
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'https://t3.storageapi.dev',
    region: process.env.S3_REGION ?? 'auto',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
} as const;

export const chain = {
  name: 'HyperPaxeer Network',
  cosmosChainId: 'hyperpax_125-1',
  evmChainId: 125,
  token: {
    name: 'PAX',
    symbol: 'PAX',
    baseDenom: 'ahpx',
    displayDenom: 'hpx',
    decimals: 18,
  },
  bech32Prefix: 'pax',
  rpc: {
    cosmos: 'https://mainnet-beta.rpc.hyperpaxeer.com/rpc',
    evmJsonRpc: 'https://mainnet-beta.rpc.hyperpaxeer.com',
  },
  explorer: {
    mainnet: 'https://paxscan.paxeer.app',
  },
  website: 'https://paxeer.app',
  docs: 'https://docs.hyperpaxeer.com',
} as const;

/** Paths to tools relative to project root */
export const toolPaths = {
  smartContractSdk: '../tools/products/Paxeer-Smart-Contract-SDK',
  networkFork: '../tools/products/PaxeerNetwork-Alexdandria-Fork',
  evmSdkGenerator: '../tools/services/EVM-SDK-Generator',
  sdkGenerator: '../tools/services/SDK-Generator',
} as const;
