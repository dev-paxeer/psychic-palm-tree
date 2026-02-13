require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");

const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!privateKey) {
  console.warn("WARNING: DEPLOYER_PRIVATE_KEY is not set. Deployments will not be possible.");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
      {
        version: "0.8.21",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
      {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./__COMPILED-ARTIFACTS__"
  },
  networks: {
    hardhat: { chainId: 31337 },
    'paxeer-network': {
      url: 'https://public-rpc.paxeer.app/rpc',
      accounts: privateKey ? [privateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      'paxeer-network': 'empty'
    },
    customChains: [
      {
        network: "paxeer-network",
        chainId: 125,
        urls: {
          apiURL: "https://paxscan.paxeer.app/api/",
          browserURL: "https://paxscan.paxeer.app"
        }
      }
    ]
  }
};
