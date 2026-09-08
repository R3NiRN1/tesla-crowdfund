// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/** Test-only token that can short-pay transfers from selected senders by one base unit. */
contract MockDirectionalFeeToken is ERC20 {
    mapping(address => bool) public feeSender;

    constructor() ERC20("Directional Fee Test", "DFT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeSender(address sender, bool enabled) external {
        feeSender[sender] = enabled;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && feeSender[from] && value > 0) {
            super._update(from, to, value - 1);
            super._update(from, address(0x000000000000000000000000000000000000dEaD), 1);
            return;
        }
        super._update(from, to, value);
    }
}
