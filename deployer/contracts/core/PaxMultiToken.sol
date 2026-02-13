// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxMultiToken
 * @notice ERC1155 multi-token: fungible + non-fungible in one contract,
 *         supply tracking, per-token URI, pausable, burnable, batch ops, access control
 */
contract PaxMultiToken is
    ERC1155,
    ERC1155Burnable,
    ERC1155Pausable,
    ERC1155Supply,
    AccessControl
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    string public name;
    string public symbol;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => uint256) private _maxSupply;

    /**
     * @param _uri    Default metadata URI
     * @param _name   Collection name
     * @param _symbol Collection symbol
     * @param _owner  Address receiving admin roles
     */
    constructor(
        string memory _uri,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC1155(_uri) {
        if (_owner == address(0)) revert PaxErrors.ZeroAddress();
        name = _name;
        symbol = _symbol;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(MINTER_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(URI_SETTER_ROLE, _owner);

        emit PaxEvents.ContractDeployed("PaxMultiToken", address(this), msg.sender, block.timestamp);
    }

    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyRole(MINTER_ROLE) {
        if (_maxSupply[id] != 0 && totalSupply(id) + amount > _maxSupply[id]) {
            revert PaxErrors.MaxSupplyReached(_maxSupply[id]);
        }
        _mint(to, id, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external onlyRole(MINTER_ROLE) {
        if (ids.length != amounts.length) revert PaxErrors.ArrayLengthMismatch(ids.length, amounts.length);
        for (uint256 i = 0; i < ids.length; i++) {
            if (_maxSupply[ids[i]] != 0 && totalSupply(ids[i]) + amounts[i] > _maxSupply[ids[i]]) {
                revert PaxErrors.MaxSupplyReached(_maxSupply[ids[i]]);
            }
        }
        _mintBatch(to, ids, amounts, data);
    }

    function setMaxSupply(uint256 id, uint256 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _maxSupply[id] = max;
    }

    function setURI(string memory newuri) external onlyRole(URI_SETTER_ROLE) {
        _setURI(newuri);
    }

    function setTokenURI(uint256 tokenId, string memory tokenUri) external onlyRole(URI_SETTER_ROLE) {
        _tokenURIs[tokenId] = tokenUri;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenUri = _tokenURIs[tokenId];
        return bytes(tokenUri).length > 0 ? tokenUri : super.uri(tokenId);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155, ERC1155Pausable, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
