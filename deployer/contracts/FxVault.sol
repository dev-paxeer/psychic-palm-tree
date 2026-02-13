// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./FxPriceOracle.sol";
import "./FxPositionToken.sol";

contract FxVault is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    enum Side { Long, Short }

    struct MarketConfig {
        bool isActive;
        bytes32 marketId;
        FxPositionToken longToken;
        FxPositionToken shortToken;
        uint256 maxLeverage;         // 1e18 = 1x, e.g. 1000e18 for 1000x
        uint256 defaultLeverage;     // 1e18 = 1x, e.g. 100e18 for 100x
        uint256 minInitialMarginBps; // in basis points, applied to notional
        uint256 tradeFeeBps;         // simple fee on notional
    }

    struct Position {
        bool exists;
        bytes32 marketId;
        bool isLong;
        uint256 sizeBase;   // 18-decimal base size
        uint256 entryPrice; // 18-decimal USD
        uint256 marginUsd;  // 18-decimal USD
        uint256 leverage;   // 1e18 = 1x
        bytes32 closeAuthHash;
    }

    struct ClosePositionPayload {
        address account;
        bytes32 marketId;
        bool isLong;
        uint256 sizeUsdToClose;
        uint256 maxSlippageBps;
        uint256 deadline;
        uint256 nonce;
    }

    FxPriceOracle public immutable priceOracle;

    // Stable collateral tokens (e.g. CUSD, USDC, USDT) and their decimals
    mapping(address => bool) public isCollateralToken;
    mapping(address => uint8) public collateralDecimals;

    // Collateral balances per user per token
    mapping(address => mapping(address => uint256)) public collateralBalances;

    // MarketId => config
    mapping(bytes32 => MarketConfig) public markets;

    // account => marketId => side => Position
    mapping(address => mapping(bytes32 => mapping(bool => Position))) public positions;

    // Used nonces for pre-signed closes: account => nonce => used
    mapping(address => mapping(uint256 => bool)) public usedCloseNonces;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    event CollateralTokenRegistered(address indexed token, uint8 decimals);
    event CollateralDeposited(address indexed account, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed account, address indexed token, uint256 amount);

    event MarketRegistered(bytes32 indexed marketId, address longToken, address shortToken);
    event PositionOpened(address indexed account, bytes32 indexed marketId, bool isLong, uint256 sizeBase, uint256 marginUsd, uint256 leverage);
    event PositionClosed(address indexed account, bytes32 indexed marketId, bool isLong, uint256 sizeBaseClosed, int256 pnlUsd);

    event PreSignedCloseExecuted(address indexed caller, address indexed account, bytes32 indexed marketId, bool isLong, uint256 sizeUsdToClose, uint256 nonce);

    constructor(address _priceOracle) Ownable(msg.sender) {
        require(_priceOracle != address(0), "Invalid oracle address");
        priceOracle = FxPriceOracle(_priceOracle);
    }

    // --- Admin configuration ---

    function registerCollateralToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(!isCollateralToken[token], "Already collateral");

        uint8 dec = IERC20Metadata(token).decimals();
        require(dec > 0 && dec <= 18, "Invalid decimals");

        isCollateralToken[token] = true;
        collateralDecimals[token] = dec;

        emit CollateralTokenRegistered(token, dec);
    }

    function registerMarket(
        bytes32 marketId,
        address longToken,
        address shortToken,
        uint256 maxLeverage,
        uint256 defaultLeverage,
        uint256 minInitialMarginBps,
        uint256 tradeFeeBps
    ) external onlyOwner {
        require(marketId != bytes32(0), "Invalid marketId");
        require(!markets[marketId].isActive, "Market exists");
        require(longToken != address(0) && shortToken != address(0), "Invalid tokens");
        require(maxLeverage >= 1e18, "Invalid maxLeverage");
        require(defaultLeverage >= 1e18 && defaultLeverage <= maxLeverage, "Invalid defaultLeverage");

        markets[marketId] = MarketConfig({
            isActive: true,
            marketId: marketId,
            longToken: FxPositionToken(longToken),
            shortToken: FxPositionToken(shortToken),
            maxLeverage: maxLeverage,
            defaultLeverage: defaultLeverage,
            minInitialMarginBps: minInitialMarginBps,
            tradeFeeBps: tradeFeeBps
        });

        emit MarketRegistered(marketId, longToken, shortToken);
    }

    // --- Collateral management ---

    function depositCollateral(address token, uint256 amount) external nonReentrant {
        require(isCollateralToken[token], "Not collateral");
        require(amount > 0, "Amount=0");

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        collateralBalances[msg.sender][token] += amount;

        emit CollateralDeposited(msg.sender, token, amount);
    }

    function withdrawCollateral(address token, uint256 amount) external nonReentrant {
        require(isCollateralToken[token], "Not collateral");
        require(amount > 0, "Amount=0");

        uint256 bal = collateralBalances[msg.sender][token];
        require(bal >= amount, "Insufficient collateral");

        // NOTE: For v1 we do not enforce maintenance margin checks here; network risk engine is expected
        collateralBalances[msg.sender][token] = bal - amount;

        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");

        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    // --- Opening positions ---

    function openLong(
        bytes32 marketId,
        address collateralToken,
        uint256 collateralAmount,
        uint256 leverage,
        ClosePositionPayload calldata closePayload,
        bytes calldata closeSignature
    ) external nonReentrant {
        _openPosition(marketId, collateralToken, collateralAmount, leverage, true, closePayload, closeSignature);
    }

    function openShortCashSecured(
        bytes32 marketId,
        address collateralToken,
        uint256 collateralAmount,
        ClosePositionPayload calldata closePayload,
        bytes calldata closeSignature
    ) external nonReentrant {
        // For cash-secured short, leverage is fixed to 1x
        _openPosition(marketId, collateralToken, collateralAmount, 1e18, false, closePayload, closeSignature);
    }

    function _openPosition(
        bytes32 marketId,
        address collateralToken,
        uint256 collateralAmount,
        uint256 leverage,
        bool isLong,
        ClosePositionPayload calldata closePayload,
        bytes calldata closeSignature
    ) internal {
        MarketConfig memory cfg = markets[marketId];
        require(cfg.isActive, "Market inactive");
        require(isCollateralToken[collateralToken], "Not collateral");
        require(collateralAmount > 0, "Collateral=0");
        require(leverage >= 1e18 && leverage <= cfg.maxLeverage, "Invalid leverage");

        // Pull collateral from user into vault
        require(IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount), "Transfer failed");
        collateralBalances[msg.sender][collateralToken] += collateralAmount;

        // Convert collateral to USD 18-dec (we assume stable tokens ~= 1 USD)
        uint8 dec = collateralDecimals[collateralToken];
        uint256 collateralUsd = _toUsd(collateralAmount, dec);

        // Notional in USD
        uint256 notionalUsd = collateralUsd * leverage / 1e18;

        // Margin requirement with possible extra BPS
        if (cfg.minInitialMarginBps > 0) {
            // collateralUsd * 10000 >= notionalUsd * minInitialMarginBps
            require(collateralUsd * BPS_DENOMINATOR >= notionalUsd * cfg.minInitialMarginBps, "Margin too low");
        }

        // Fetch price
        uint256 price = priceOracle.getPrice(marketId);
        require(price > 0, "No price");

        // Base size
        uint256 sizeBase = notionalUsd * 1e18 / price;
        require(sizeBase > 0, "Size=0");

        // Compute fee on notional and lock it as extra margin burn (simple for v1)
        uint256 feeUsd = notionalUsd * cfg.tradeFeeBps / BPS_DENOMINATOR;
        uint256 effectiveMarginUsd = collateralUsd - feeUsd;
        require(effectiveMarginUsd > 0, "Fee>collateral");

        // Update position (single position per (account, marketId, side) in v1)
        Position storage p = positions[msg.sender][marketId][isLong];
        require(!p.exists, "Position exists");

        p.exists = true;
        p.marketId = marketId;
        p.isLong = isLong;
        p.sizeBase = sizeBase;
        p.entryPrice = price;
        p.marginUsd = effectiveMarginUsd;
        p.leverage = leverage;

        // Validate and store closeAuthHash
        _validateAndStoreCloseAuth(msg.sender, marketId, isLong, notionalUsd, closePayload, closeSignature);

        // Mint exposure tokens equal to notional USD
        if (isLong) {
            cfg.longToken.mint(msg.sender, notionalUsd);
        } else {
            cfg.shortToken.mint(msg.sender, notionalUsd);
        }

        emit PositionOpened(msg.sender, marketId, isLong, sizeBase, effectiveMarginUsd, leverage);
    }

    function _validateAndStoreCloseAuth(
        address account,
        bytes32 marketId,
        bool isLong,
        uint256 notionalUsd,
        ClosePositionPayload calldata payload,
        bytes calldata signature
    ) internal {
        require(payload.account == account, "Bad account");
        require(payload.marketId == marketId, "Bad marketId");
        require(payload.isLong == isLong, "Bad side");
        require(payload.sizeUsdToClose <= notionalUsd, "Too large size");
        require(payload.deadline >= block.timestamp, "Close payload expired");
        require(!usedCloseNonces[account][payload.nonce], "Nonce used");

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ClosePositionPayload(address account,bytes32 marketId,bool isLong,uint256 sizeUsdToClose,uint256 maxSlippageBps,uint256 deadline,uint256 nonce)"
                ),
                payload.account,
                payload.marketId,
                payload.isLong,
                payload.sizeUsdToClose,
                payload.maxSlippageBps,
                payload.deadline,
                payload.nonce
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        address signer = digest.recover(signature);
        require(signer == account, "Bad signature");

        Position storage p = positions[account][marketId][isLong];
        p.closeAuthHash = structHash;
    }

    // --- User-initiated closes ---

    function closePosition(
        bytes32 marketId,
        bool isLong,
        uint256 sizeUsdToClose
    ) external nonReentrant {
        _closePositionInternal(msg.sender, marketId, isLong, sizeUsdToClose, false);
    }

    // --- Pre-signed forced closes ---

    function executePreSignedClose(
        ClosePositionPayload calldata payload,
        bytes calldata signature
    ) external nonReentrant {
        require(payload.deadline >= block.timestamp, "Expired");
        require(!usedCloseNonces[payload.account][payload.nonce], "Nonce used");

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ClosePositionPayload(address account,bytes32 marketId,bool isLong,uint256 sizeUsdToClose,uint256 maxSlippageBps,uint256 deadline,uint256 nonce)"
                ),
                payload.account,
                payload.marketId,
                payload.isLong,
                payload.sizeUsdToClose,
                payload.maxSlippageBps,
                payload.deadline,
                payload.nonce
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        address signer = digest.recover(signature);
        require(signer == payload.account, "Bad signature");

        Position storage p = positions[payload.account][payload.marketId][payload.isLong];
        require(p.exists, "No position");
        require(p.closeAuthHash == structHash, "Auth mismatch");

        usedCloseNonces[payload.account][payload.nonce] = true;

        _closePositionInternal(payload.account, payload.marketId, payload.isLong, payload.sizeUsdToClose, true);

        emit PreSignedCloseExecuted(msg.sender, payload.account, payload.marketId, payload.isLong, payload.sizeUsdToClose, payload.nonce);
    }

    function _closePositionInternal(
        address account,
        bytes32 marketId,
        bool isLong,
        uint256 sizeUsdToClose,
        bool isForced
    ) internal {
        require(sizeUsdToClose > 0, "Size=0");

        MarketConfig memory cfg = markets[marketId];
        require(cfg.isActive, "Market inactive");

        Position storage p = positions[account][marketId][isLong];
        require(p.exists, "No position");

        // Determine notional and proportion
        uint256 notionalUsdTotal = p.sizeBase * p.entryPrice / 1e18;
        require(sizeUsdToClose <= notionalUsdTotal, "Too large");

        uint256 proportion = sizeUsdToClose * 1e18 / notionalUsdTotal;
        uint256 sizeBaseToClose = p.sizeBase * proportion / 1e18;

        // Burn exposure tokens
        if (isLong) {
            cfg.longToken.burn(account, sizeUsdToClose);
        } else {
            cfg.shortToken.burn(account, sizeUsdToClose);
        }

        // Get new price
        uint256 price = priceOracle.getPrice(marketId);
        require(price > 0, "No price");

        // PnL computation (signed)
        int256 pnlUsd;
        if (isLong) {
            // long: size * (P_close - P_entry)
            int256 diff = int256(price) - int256(p.entryPrice);
            pnlUsd = int256(sizeBaseToClose) * diff / int256(1e18);
        } else {
            // short: size * (P_entry - P_close)
            int256 diff = int256(p.entryPrice) - int256(price);
            pnlUsd = int256(sizeBaseToClose) * diff / int256(1e18);
        }

        // Margin portion being released
        uint256 marginPortion = p.marginUsd * proportion / 1e18;

        // Update position
        p.sizeBase -= sizeBaseToClose;
        p.marginUsd -= marginPortion;

        if (p.sizeBase == 0) {
            p.exists = false;
        }

        // Simple settlement: assume single stable token backing for now, not tracked per-token here.
        // For MVP, we do not move actual collateral; risk engine can track margin vs PnL off-chain.

        emit PositionClosed(account, marketId, isLong, sizeBaseToClose, pnlUsd);
    }

    // --- Helpers ---

    function _toUsd(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) {
            return amount;
        } else if (decimals < 18) {
            return amount * (10 ** (18 - decimals));
        } else {
            return amount / (10 ** (decimals - 18));
        }
    }
}
