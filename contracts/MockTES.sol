// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * MockTES (testnet only)
 * - Standard OZ ERC20
 * - Has name/symbol/decimals metadata (decimals = 18 by default in OZ)
 * - Owner can mint for faucet/testing
 */
contract MockTES is ERC20, Ownable {
    constructor(address initialOwner) ERC20("TeslaCoin Test", "TES") Ownable(initialOwner) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
