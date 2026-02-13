// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HybridDEX
 * @notice Hybrid AMM + Orderbook DEX for USDC/PAX trading on Paxeer Network
 * @dev Combines constant product AMM with central limit order book (CLOB)
 */
contract HybridDEX is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============
    
    IERC20 public immutable USDC;
    
    // AMM Reserves
    uint256 public reserveUSDC;  // USDC reserve
    uint256 public reservePAX;   // PAX (native) reserve
    uint256 public totalLiquidity; // LP tokens
    
    // Liquidity providers
    mapping(address => uint256) public liquidityBalances;
    
    // Order Book
    uint256 private orderIdCounter;
    
    enum OrderType { BUY, SELL }
    enum OrderStatus { OPEN, FILLED, CANCELLED, PARTIAL }
    
    struct Order {
        uint256 orderId;
        address trader;
        OrderType orderType;
        uint256 price;          // Price in USDC per PAX (scaled by 1e18)
        uint256 amount;         // Amount of PAX
        uint256 filledAmount;
        OrderStatus status;
        uint256 timestamp;
    }
    
    mapping(uint256 => Order) public orders;
    uint256[] public buyOrderIds;   // Sorted by price DESC
    uint256[] public sellOrderIds;  // Sorted by price ASC
    
    // Fee structure
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public tradingFee = 30;        // 0.3%
    uint256 public makerFee = 10;          // 0.1%
    uint256 public takerFee = 20;          // 0.2%
    
    address public feeCollector;
    uint256 public collectedFeesUSDC;
    uint256 public collectedFeesPAX;
    
    // Price oracle (simple implementation, can be upgraded)
    uint256 public lastPrice; // Last traded price (USDC per PAX, scaled by 1e18)
    
    // Trading limits
    uint256 public minTradeAmount = 1e18;      // 1 PAX minimum
    uint256 public maxPriceDeviation = 1000;   // 10% max deviation from AMM price
    
    // ============ Events ============
    
    event LiquidityAdded(address indexed provider, uint256 usdcAmount, uint256 paxAmount, uint256 liquidity);
    event LiquidityRemoved(address indexed provider, uint256 usdcAmount, uint256 paxAmount, uint256 liquidity);
    event SwapExecuted(address indexed trader, bool buyPAX, uint256 amountIn, uint256 amountOut, uint256 fee);
    event OrderPlaced(uint256 indexed orderId, address indexed trader, OrderType orderType, uint256 price, uint256 amount);
    event OrderFilled(uint256 indexed orderId, uint256 filledAmount, uint256 remainingAmount);
    event OrderCancelled(uint256 indexed orderId);
    event PriceUpdated(uint256 newPrice);
    
    // ============ Constructor ============
    
    constructor(address _usdc, address _feeCollector) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_feeCollector != address(0), "Invalid fee collector");
        
        USDC = IERC20(_usdc);
        feeCollector = _feeCollector;
        lastPrice = 3.44e18; // Initial price: $3.44 per PAX
    }
    
    // ============ AMM Functions ============
    
    /**
     * @notice Add liquidity to the AMM pool
     * @param usdcAmount Amount of USDC to add
     */
    function addLiquidity(uint256 usdcAmount) external payable nonReentrant returns (uint256 liquidity) {
        require(usdcAmount > 0 && msg.value > 0, "Invalid amounts");
        
        if (totalLiquidity == 0) {
            // Initial liquidity
            liquidity = sqrt(usdcAmount * msg.value);
            require(liquidity > 0, "Insufficient liquidity minted");
        } else {
            // Proportional liquidity
            uint256 usdcLiquidity = (usdcAmount * totalLiquidity) / reserveUSDC;
            uint256 paxLiquidity = (msg.value * totalLiquidity) / reservePAX;
            liquidity = usdcLiquidity < paxLiquidity ? usdcLiquidity : paxLiquidity;
        }
        
        USDC.safeTransferFrom(msg.sender, address(this), usdcAmount);
        
        reserveUSDC += usdcAmount;
        reservePAX += msg.value;
        totalLiquidity += liquidity;
        liquidityBalances[msg.sender] += liquidity;
        
        emit LiquidityAdded(msg.sender, usdcAmount, msg.value, liquidity);
    }
    
    /**
     * @notice Remove liquidity from the AMM pool
     * @param liquidity Amount of LP tokens to burn
     */
    function removeLiquidity(uint256 liquidity) external nonReentrant returns (uint256 usdcAmount, uint256 paxAmount) {
        require(liquidity > 0 && liquidityBalances[msg.sender] >= liquidity, "Insufficient liquidity");
        
        usdcAmount = (liquidity * reserveUSDC) / totalLiquidity;
        paxAmount = (liquidity * reservePAX) / totalLiquidity;
        
        liquidityBalances[msg.sender] -= liquidity;
        totalLiquidity -= liquidity;
        reserveUSDC -= usdcAmount;
        reservePAX -= paxAmount;
        
        USDC.safeTransfer(msg.sender, usdcAmount);
        (bool success, ) = msg.sender.call{value: paxAmount}("");
        require(success, "PAX transfer failed");
        
        emit LiquidityRemoved(msg.sender, usdcAmount, paxAmount, liquidity);
    }
    
    /**
     * @notice Swap USDC for PAX using AMM
     * @param usdcAmount Amount of USDC to swap
     * @param minPaxOut Minimum PAX to receive (slippage protection)
     */
    function swapUSDCForPAX(uint256 usdcAmount, uint256 minPaxOut) external nonReentrant returns (uint256 paxOut) {
        require(usdcAmount >= minTradeAmount, "Below minimum trade");
        
        uint256 fee = (usdcAmount * tradingFee) / FEE_DENOMINATOR;
        uint256 usdcAfterFee = usdcAmount - fee;
        
        // Constant product formula: (x + Δx)(y - Δy) = xy
        paxOut = (usdcAfterFee * reservePAX) / (reserveUSDC + usdcAfterFee);
        require(paxOut >= minPaxOut, "Slippage exceeded");
        require(paxOut <= reservePAX, "Insufficient PAX liquidity");
        
        USDC.safeTransferFrom(msg.sender, address(this), usdcAmount);
        
        reserveUSDC += usdcAfterFee;
        reservePAX -= paxOut;
        collectedFeesUSDC += fee;
        
        (bool success, ) = msg.sender.call{value: paxOut}("");
        require(success, "PAX transfer failed");
        
        _updatePrice();
        emit SwapExecuted(msg.sender, true, usdcAmount, paxOut, fee);
    }
    
    /**
     * @notice Swap PAX for USDC using AMM
     * @param minUsdcOut Minimum USDC to receive (slippage protection)
     */
    function swapPAXForUSDC(uint256 minUsdcOut) external payable nonReentrant returns (uint256 usdcOut) {
        require(msg.value >= minTradeAmount, "Below minimum trade");
        
        uint256 fee = (msg.value * tradingFee) / FEE_DENOMINATOR;
        uint256 paxAfterFee = msg.value - fee;
        
        usdcOut = (paxAfterFee * reserveUSDC) / (reservePAX + paxAfterFee);
        require(usdcOut >= minUsdcOut, "Slippage exceeded");
        require(usdcOut <= reserveUSDC, "Insufficient USDC liquidity");
        
        reservePAX += paxAfterFee;
        reserveUSDC -= usdcOut;
        collectedFeesPAX += fee;
        
        USDC.safeTransfer(msg.sender, usdcOut);
        
        _updatePrice();
        emit SwapExecuted(msg.sender, false, msg.value, usdcOut, fee);
    }
    
    // ============ Order Book Functions ============
    
    /**
     * @notice Place a limit buy order (buy PAX with USDC)
     * @param price Price in USDC per PAX (scaled by 1e18)
     * @param amount Amount of PAX to buy
     */
    function placeBuyOrder(uint256 price, uint256 amount) external nonReentrant returns (uint256 orderId) {
        require(amount >= minTradeAmount, "Below minimum trade");
        require(_isPriceValid(price), "Price deviation too high");
        
        uint256 usdcRequired = (price * amount) / 1e18;
        USDC.safeTransferFrom(msg.sender, address(this), usdcRequired);
        
        orderId = ++orderIdCounter;
        orders[orderId] = Order({
            orderId: orderId,
            trader: msg.sender,
            orderType: OrderType.BUY,
            price: price,
            amount: amount,
            filledAmount: 0,
            status: OrderStatus.OPEN,
            timestamp: block.timestamp
        });
        
        _insertBuyOrder(orderId);
        _tryMatchOrders();
        
        emit OrderPlaced(orderId, msg.sender, OrderType.BUY, price, amount);
    }
    
    /**
     * @notice Place a limit sell order (sell PAX for USDC)
     * @param price Price in USDC per PAX (scaled by 1e18)
     * @param amount Amount of PAX to sell
     */
    function placeSellOrder(uint256 price, uint256 amount) external payable nonReentrant returns (uint256 orderId) {
        require(msg.value == amount, "PAX amount mismatch");
        require(amount >= minTradeAmount, "Below minimum trade");
        require(_isPriceValid(price), "Price deviation too high");
        
        orderId = ++orderIdCounter;
        orders[orderId] = Order({
            orderId: orderId,
            trader: msg.sender,
            orderType: OrderType.SELL,
            price: price,
            amount: amount,
            filledAmount: 0,
            status: OrderStatus.OPEN,
            timestamp: block.timestamp
        });
        
        _insertSellOrder(orderId);
        _tryMatchOrders();
        
        emit OrderPlaced(orderId, msg.sender, OrderType.SELL, price, amount);
    }
    
    /**
     * @notice Cancel an open order
     * @param orderId ID of the order to cancel
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.trader == msg.sender, "Not order owner");
        require(order.status == OrderStatus.OPEN || order.status == OrderStatus.PARTIAL, "Order not open");
        
        uint256 remainingAmount = order.amount - order.filledAmount;
        order.status = OrderStatus.CANCELLED;
        
        if (order.orderType == OrderType.BUY) {
            uint256 usdcToReturn = (order.price * remainingAmount) / 1e18;
            USDC.safeTransfer(msg.sender, usdcToReturn);
            _removeBuyOrder(orderId);
        } else {
            (bool success, ) = msg.sender.call{value: remainingAmount}("");
            require(success, "PAX transfer failed");
            _removeSellOrder(orderId);
        }
        
        emit OrderCancelled(orderId);
    }
    
    // ============ Internal Functions ============
    
    function _tryMatchOrders() internal {
        if (buyOrderIds.length == 0 || sellOrderIds.length == 0) return;
        
        uint256 bestBuyId = buyOrderIds[0];
        uint256 bestSellId = sellOrderIds[0];
        
        Order storage buyOrder = orders[bestBuyId];
        Order storage sellOrder = orders[bestSellId];
        
        // Match if buy price >= sell price
        while (buyOrder.price >= sellOrder.price && 
               buyOrder.status != OrderStatus.FILLED && 
               sellOrder.status != OrderStatus.FILLED) {
            
            uint256 buyRemaining = buyOrder.amount - buyOrder.filledAmount;
            uint256 sellRemaining = sellOrder.amount - sellOrder.filledAmount;
            uint256 matchAmount = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;
            
            // Execute match at sell price (price improvement for buyer)
            uint256 usdcAmount = (sellOrder.price * matchAmount) / 1e18;
            
            // Calculate fees
            uint256 makerFeeAmount = (usdcAmount * makerFee) / FEE_DENOMINATOR;
            uint256 takerFeeAmount = (usdcAmount * takerFee) / FEE_DENOMINATOR;
            
            buyOrder.filledAmount += matchAmount;
            sellOrder.filledAmount += matchAmount;
            
            // Transfer PAX to buyer
            (bool success, ) = buyOrder.trader.call{value: matchAmount}("");
            require(success, "PAX transfer to buyer failed");
            
            // Transfer USDC to seller (minus fees)
            USDC.safeTransfer(sellOrder.trader, usdcAmount - takerFeeAmount);
            
            collectedFeesUSDC += makerFeeAmount + takerFeeAmount;
            
            // Update order statuses
            if (buyOrder.filledAmount == buyOrder.amount) {
                buyOrder.status = OrderStatus.FILLED;
                _removeBuyOrder(bestBuyId);
            } else {
                buyOrder.status = OrderStatus.PARTIAL;
            }
            
            if (sellOrder.filledAmount == sellOrder.amount) {
                sellOrder.status = OrderStatus.FILLED;
                _removeSellOrder(bestSellId);
            } else {
                sellOrder.status = OrderStatus.PARTIAL;
            }
            
            emit OrderFilled(bestBuyId, matchAmount, buyOrder.amount - buyOrder.filledAmount);
            emit OrderFilled(bestSellId, matchAmount, sellOrder.amount - sellOrder.filledAmount);
            
            lastPrice = sellOrder.price;
            emit PriceUpdated(lastPrice);
            
            // Check if we can continue matching
            if (buyOrderIds.length == 0 || sellOrderIds.length == 0) break;
            bestBuyId = buyOrderIds[0];
            bestSellId = sellOrderIds[0];
            buyOrder = orders[bestBuyId];
            sellOrder = orders[bestSellId];
        }
    }
    
    function _insertBuyOrder(uint256 orderId) internal {
        uint256 price = orders[orderId].price;
        uint256 i = 0;
        
        // Insert sorted DESC by price
        while (i < buyOrderIds.length && orders[buyOrderIds[i]].price > price) {
            i++;
        }
        
        buyOrderIds.push(0);
        for (uint256 j = buyOrderIds.length - 1; j > i; j--) {
            buyOrderIds[j] = buyOrderIds[j - 1];
        }
        buyOrderIds[i] = orderId;
    }
    
    function _insertSellOrder(uint256 orderId) internal {
        uint256 price = orders[orderId].price;
        uint256 i = 0;
        
        // Insert sorted ASC by price
        while (i < sellOrderIds.length && orders[sellOrderIds[i]].price < price) {
            i++;
        }
        
        sellOrderIds.push(0);
        for (uint256 j = sellOrderIds.length - 1; j > i; j--) {
            sellOrderIds[j] = sellOrderIds[j - 1];
        }
        sellOrderIds[i] = orderId;
    }
    
    function _removeBuyOrder(uint256 orderId) internal {
        for (uint256 i = 0; i < buyOrderIds.length; i++) {
            if (buyOrderIds[i] == orderId) {
                for (uint256 j = i; j < buyOrderIds.length - 1; j++) {
                    buyOrderIds[j] = buyOrderIds[j + 1];
                }
                buyOrderIds.pop();
                break;
            }
        }
    }
    
    function _removeSellOrder(uint256 orderId) internal {
        for (uint256 i = 0; i < sellOrderIds.length; i++) {
            if (sellOrderIds[i] == orderId) {
                for (uint256 j = i; j < sellOrderIds.length - 1; j++) {
                    sellOrderIds[j] = sellOrderIds[j + 1];
                }
                sellOrderIds.pop();
                break;
            }
        }
    }
    
    function _updatePrice() internal {
        if (reserveUSDC > 0 && reservePAX > 0) {
            lastPrice = (reserveUSDC * 1e18) / reservePAX;
            emit PriceUpdated(lastPrice);
        }
    }
    
    function _isPriceValid(uint256 price) internal view returns (bool) {
        uint256 ammPrice = getAMMPrice();
        if (ammPrice == 0) return true;
        
        uint256 deviation = price > ammPrice ? 
            ((price - ammPrice) * FEE_DENOMINATOR) / ammPrice :
            ((ammPrice - price) * FEE_DENOMINATOR) / ammPrice;
            
        return deviation <= maxPriceDeviation;
    }
    
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
    
    // ============ View Functions ============
    
    function getAMMPrice() public view returns (uint256) {
        if (reservePAX == 0) return 0;
        return (reserveUSDC * 1e18) / reservePAX;
    }
    
    function getOrderBook(uint256 depth) external view returns (
        uint256[] memory buyPrices,
        uint256[] memory buyAmounts,
        uint256[] memory sellPrices,
        uint256[] memory sellAmounts
    ) {
        uint256 buyDepth = depth > buyOrderIds.length ? buyOrderIds.length : depth;
        uint256 sellDepth = depth > sellOrderIds.length ? sellOrderIds.length : depth;
        
        buyPrices = new uint256[](buyDepth);
        buyAmounts = new uint256[](buyDepth);
        sellPrices = new uint256[](sellDepth);
        sellAmounts = new uint256[](sellDepth);
        
        for (uint256 i = 0; i < buyDepth; i++) {
            Order memory order = orders[buyOrderIds[i]];
            buyPrices[i] = order.price;
            buyAmounts[i] = order.amount - order.filledAmount;
        }
        
        for (uint256 i = 0; i < sellDepth; i++) {
            Order memory order = orders[sellOrderIds[i]];
            sellPrices[i] = order.price;
            sellAmounts[i] = order.amount - order.filledAmount;
        }
    }
    
    function getUserOrders(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= orderIdCounter; i++) {
            if (orders[i].trader == user && 
                (orders[i].status == OrderStatus.OPEN || orders[i].status == OrderStatus.PARTIAL)) {
                count++;
            }
        }
        
        uint256[] memory userOrderIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= orderIdCounter; i++) {
            if (orders[i].trader == user && 
                (orders[i].status == OrderStatus.OPEN || orders[i].status == OrderStatus.PARTIAL)) {
                userOrderIds[index++] = i;
            }
        }
        
        return userOrderIds;
    }
    
    // ============ Admin Functions ============
    
    function setFees(uint256 _tradingFee, uint256 _makerFee, uint256 _takerFee) external onlyOwner {
        require(_tradingFee <= 100 && _makerFee <= 50 && _takerFee <= 50, "Fees too high");
        tradingFee = _tradingFee;
        makerFee = _makerFee;
        takerFee = _takerFee;
    }
    
    function setMaxPriceDeviation(uint256 _maxDeviation) external onlyOwner {
        require(_maxDeviation <= 5000, "Deviation too high"); // Max 50%
        maxPriceDeviation = _maxDeviation;
    }
    
    function collectFees() external {
        require(msg.sender == feeCollector || msg.sender == owner(), "Not authorized");
        
        if (collectedFeesUSDC > 0) {
            uint256 usdcFees = collectedFeesUSDC;
            collectedFeesUSDC = 0;
            USDC.safeTransfer(feeCollector, usdcFees);
        }
        
        if (collectedFeesPAX > 0) {
            uint256 paxFees = collectedFeesPAX;
            collectedFeesPAX = 0;
            (bool success, ) = feeCollector.call{value: paxFees}("");
            require(success, "PAX fee transfer failed");
        }
    }
    
    receive() external payable {}
}
