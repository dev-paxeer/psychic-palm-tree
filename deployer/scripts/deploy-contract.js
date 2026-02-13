#!/usr/bin/env node
/**
 * @fileoverview Deploy a pre-compiled contract using ethers.js directly.
 * Reads ABI + bytecode from __COMPILED-ARTIFACTS__, no Hardhat runtime needed.
 *
 * Environment variables:
 *   CONTRACT_NAME     - Name of the contract (e.g. "HybridDEX")
 *   SOURCE_FILE       - Source .sol file name (e.g. "HybridDEX.sol")
 *   CONSTRUCTOR_ARGS  - JSON array of constructor arguments
 *   OWNER_ADDRESS     - Address to transfer ownership to (if applicable)
 *   JOB_ID            - Deployment job ID for status tracking
 *   OUTPUT_FILE       - Path to write deployment result JSON
 *   DEPLOYER_PRIVATE_KEY or PRIVATE_KEY - Deployer wallet private key
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://public-rpc.paxeer.app/rpc";
const CHAIN_ID = 125;
const EXPLORER = "https://paxscan.paxeer.app";
const EXPLORER_API = "https://paxscan.paxeer.app/api";
const DEPLOYMENTS_DIR = path.join(__dirname, "../deployments");
const COMPILED_DIR = path.join(__dirname, "../__COMPILED-ARTIFACTS__");
const ARTIFACTS_DIR = path.join(COMPILED_DIR, "contracts");
const BUILD_INFO_DIR = path.join(COMPILED_DIR, "build-info");

async function main() {
  const contractName = process.env.CONTRACT_NAME;
  const sourceFile = process.env.SOURCE_FILE;
  const constructorArgsJson = process.env.CONSTRUCTOR_ARGS || "[]";
  const ownerAddress = process.env.OWNER_ADDRESS;
  const jobId = process.env.JOB_ID || "manual";
  const outputFile = process.env.OUTPUT_FILE;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!contractName || !sourceFile) {
    throw new Error("CONTRACT_NAME and SOURCE_FILE are required");
  }
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required");
  }

  // Load artifact
  const artifactPath = path.join(ARTIFACTS_DIR, sourceFile, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode;

  if (!bytecode || bytecode === "0x") {
    throw new Error(`No bytecode in artifact for ${contractName}`);
  }

  // Connect to Paxeer Network
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying ${contractName} to Paxeer Network (Chain ${CHAIN_ID})...`);
  console.log(`Job ID: ${jobId}`);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} PAX`);

  if (balance === 0n) {
    throw new Error("Deployer has no PAX for gas");
  }

  // Parse constructor arguments
  let args = [];
  try {
    args = JSON.parse(constructorArgsJson);
  } catch (e) {
    throw new Error(`Invalid CONSTRUCTOR_ARGS JSON: ${e.message}`);
  }

  // Type conversion: strings that look like big numbers → BigInt
  const ctorAbi = abi.find(item => item.type === "constructor");
  if (ctorAbi && ctorAbi.inputs) {
    args = args.map((arg, i) => {
      const paramType = ctorAbi.inputs[i]?.type || "";
      // uint/int types: convert string numbers to BigInt
      if (paramType.startsWith("uint") || paramType.startsWith("int")) {
        if (typeof arg === "string" && /^\d+$/.test(arg)) {
          return BigInt(arg);
        }
      }
      // address[] type: split comma-separated string
      if (paramType === "address[]" && typeof arg === "string") {
        return arg.split(",").map(a => a.trim());
      }
      // uint256[] type: split comma-separated string
      if (paramType === "uint256[]" && typeof arg === "string") {
        return arg.split(",").map(a => BigInt(a.trim()));
      }
      return arg;
    });
  }

  console.log(`Constructor args: ${JSON.stringify(args.map(a => typeof a === "bigint" ? a.toString() : a))}`);

  // Deploy
  console.log("Sending deployment transaction...");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);
  console.log(`Tx hash: ${contract.deploymentTransaction().hash}`);

  console.log("Waiting for confirmation...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log(`Deployed to: ${address}`);
  console.log(`Explorer: ${EXPLORER}/address/${address}`);

  // ── Verify on PaxScan ─────────────────────────────────────────────
  let verified = false;
  try {
    console.log("Verifying on PaxScan...");
    verified = await verifyContract(address, contractName, sourceFile, args, abi);
  } catch (verifyErr) {
    console.error(`Verification failed: ${verifyErr.message}`);
  }

  // Build result
  const result = {
    jobId,
    contractName,
    sourceFile,
    address,
    deployer: wallet.address,
    ownerAddress: ownerAddress || wallet.address,
    network: "paxeer-network",
    chainId: CHAIN_ID,
    constructorArgs: args.map(a => typeof a === "bigint" ? a.toString() : JSON.stringify(a)),
    txHash,
    abi,
    explorerUrl: `${EXPLORER}/address/${address}`,
    verified,
    timestamp: new Date().toISOString(),
    status: "complete"
  };

  // Save to deployments dir
  if (!fs.existsSync(DEPLOYMENTS_DIR)) fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const networkDir = path.join(DEPLOYMENTS_DIR, "paxeer-network");
  if (!fs.existsSync(networkDir)) fs.mkdirSync(networkDir, { recursive: true });
  fs.writeFileSync(
    path.join(networkDir, `${contractName}-${Date.now()}.json`),
    JSON.stringify(result, null, 2)
  );
  console.log(`Deployment info saved`);

  // Write output file for the worker to read
  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  }

  // Output result marker for worker stdout parsing
  console.log(`\n__DEPLOY_RESULT__${JSON.stringify(result)}__END_RESULT__`);
}

// ═══════════════════════════════════════════════════════════════════════
//  VERIFICATION — Blockscout standard JSON input via build-info
// ═══════════════════════════════════════════════════════════════════════

async function verifyContract(address, contractName, sourceFile, constructorArgs, abi) {
  // 1. Read .dbg.json to find build-info
  const dbgPath = path.join(ARTIFACTS_DIR, sourceFile, `${contractName}.dbg.json`);
  if (!fs.existsSync(dbgPath)) {
    console.log(`No .dbg.json found at ${dbgPath}, skipping verification`);
    return false;
  }
  const dbg = JSON.parse(fs.readFileSync(dbgPath, "utf-8"));
  const buildInfoPath = path.resolve(path.dirname(dbgPath), dbg.buildInfo);
  if (!fs.existsSync(buildInfoPath)) {
    console.log(`Build info not found: ${buildInfoPath}, skipping verification`);
    return false;
  }

  // 2. Read build-info for standard JSON input + compiler version
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
  const compilerVersion = `v${buildInfo.solcLongVersion}`;
  const standardJsonInput = JSON.stringify(buildInfo.input);

  // Fully qualified contract name: "contracts/PriceOracle.sol:PriceOracle"
  const fqName = `contracts/${sourceFile}:${contractName}`;

  // 3. ABI-encode constructor arguments (hex without 0x prefix)
  let encodedArgs = "";
  const ctorAbi = abi.find(item => item.type === "constructor");
  if (ctorAbi && ctorAbi.inputs && ctorAbi.inputs.length > 0) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const types = ctorAbi.inputs.map(inp => inp.type);
    encodedArgs = abiCoder.encode(types, constructorArgs).slice(2); // remove 0x
  }

  console.log(`Compiler: ${compilerVersion}`);
  console.log(`Contract: ${fqName}`);
  console.log(`Constructor args encoded: ${encodedArgs ? encodedArgs.slice(0, 40) + '...' : '(none)'}`);

  // 4. Submit verification request
  const formData = new URLSearchParams();
  formData.append("module", "contract");
  formData.append("action", "verifysourcecode");
  formData.append("contractaddress", address);
  formData.append("sourceCode", standardJsonInput);
  formData.append("codeformat", "solidity-standard-json-input");
  formData.append("contractname", fqName);
  formData.append("compilerversion", compilerVersion);
  formData.append("optimizationUsed", "1");
  formData.append("runs", "200");
  if (encodedArgs) {
    formData.append("constructorArguements", encodedArgs);
  }

  const submitRes = await fetch(EXPLORER_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  const submitData = await submitRes.json();

  if (submitData.status !== "1" || !submitData.result) {
    console.error(`Verification submission failed:`, submitData);
    return false;
  }

  const guid = submitData.result;
  console.log(`Verification submitted, GUID: ${guid}`);

  // 5. Poll verification status
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(3000);
    const checkRes = await fetch(
      `${EXPLORER_API}?module=contract&action=checkverifystatus&guid=${guid}`
    );
    const checkData = await checkRes.json();

    if (checkData.result === "Pass - Verified") {
      console.log(`✓ Contract verified on PaxScan!`);
      return true;
    } else if (checkData.result === "Fail - Unable to verify") {
      console.error(`✗ Verification failed: ${checkData.result}`);
      return false;
    } else if (checkData.result === "Already Verified") {
      console.log(`✓ Contract already verified`);
      return true;
    }
    // Still pending, keep polling
    if (attempt % 5 === 0) {
      console.log(`Verification pending... (${checkData.result})`);
    }
  }

  console.log("Verification timed out after 90s (may still complete in background)");
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    const result = {
      jobId: process.env.JOB_ID || "manual",
      contractName: process.env.CONTRACT_NAME,
      status: "failed",
      error: error.message,
      timestamp: new Date().toISOString()
    };
    if (process.env.OUTPUT_FILE) {
      fs.writeFileSync(process.env.OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
    console.error(`\n__DEPLOY_RESULT__${JSON.stringify(result)}__END_RESULT__`);
    console.error(error);
    process.exit(1);
  });
