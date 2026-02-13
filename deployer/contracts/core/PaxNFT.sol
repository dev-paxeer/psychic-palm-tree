// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IPaxNFT.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxNFT
 * @notice Production-grade ERC721: enumerable, URI storage, royalties (ERC2981),
 *         pausable, burnable, access control, batch mint, max supply
 */
contract PaxNFT is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ERC721Pausable,
    ERC721Burnable,
    ERC2981,
    AccessControl,
    IPaxNFT
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private _nextTokenId;
    uint256 private _maxSupply;
    string private _baseTokenURI;

    /**
     * @param _name        Collection name
     * @param _symbol      Collection symbol
     * @param _royaltyBps  Default royalty in basis points (250 = 2.5%)
     * @param _max         Max supply (0 = unlimited)
     * @param _owner       Address receiving admin roles and royalties
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint96 _royaltyBps,
        uint256 _max,
        address _owner
    ) ERC721(_name, _symbol) {
        if (_owner == address(0)) revert PaxErrors.ZeroAddress();

        _maxSupply = _max == 0 ? type(uint256).max : _max;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(MINTER_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _setDefaultRoyalty(_owner, _royaltyBps);

        emit PaxEvents.ContractDeployed("PaxNFT", address(this), msg.sender, block.timestamp);
    }

    function safeMint(address to, string calldata uri) external onlyRole(MINTER_ROLE) returns (uint256) {
        if (_nextTokenId >= _maxSupply) revert PaxErrors.MaxSupplyReached(_maxSupply);
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit TokenMinted(to, tokenId, uri);
        return tokenId;
    }

    function batchMint(address to, string[] calldata uris) external onlyRole(MINTER_ROLE) returns (uint256[] memory) {
        if (_nextTokenId + uris.length > _maxSupply) revert PaxErrors.MaxSupplyReached(_maxSupply);
        uint256[] memory ids = new uint256[](uris.length);
        uint256 startId = _nextTokenId;
        for (uint256 i = 0; i < uris.length; i++) {
            uint256 tokenId = _nextTokenId++;
            _safeMint(to, tokenId);
            _setTokenURI(tokenId, uris[i]);
            ids[i] = tokenId;
        }
        emit BatchMinted(to, startId, uris.length);
        return ids;
    }

    // ── Admin functions ──────────────────────────────────────────────

    function setBaseURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        string memory old = _baseTokenURI;
        _baseTokenURI = uri;
        emit BaseURIUpdated(old, uri);
    }

    function setMaxSupply(uint256 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = _maxSupply;
        _maxSupply = max == 0 ? type(uint256).max : max;
        emit MaxSupplyUpdated(old, _maxSupply);
    }

    function setDefaultRoyalty(address receiver, uint96 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultRoyalty(receiver, feeBps);
        emit RoyaltyUpdated(receiver, feeBps);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTokenRoyalty(tokenId, receiver, feeBps);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ── Views ────────────────────────────────────────────────────────

    function maxSupply() external view returns (uint256) { return _maxSupply; }
    function totalMinted() external view returns (uint256) { return _nextTokenId; }
    function baseURI() external view returns (string memory) { return _baseTokenURI; }

    // ── Required overrides ───────────────────────────────────────────

    function _baseURI() internal view override returns (string memory) { return _baseTokenURI; }

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Enumerable, ERC721Pausable) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
