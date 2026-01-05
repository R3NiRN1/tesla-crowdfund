# TeslaCoin Crowdfunding Reboot – Action Plan and Code Walkthrough

## 1 Context and Problem Statement

TeslaCoin (TES) originally launched as a cryptocurrency to fund free‑energy research and later moved to the Binance Smart Chain (BSC) as a BEP‑20 token.  Unfortunately the project lost momentum after an exchange hack and the community evaporated.  A search of current aggregator sites shows that TeslaCoin has **no active markets** and is not recognised on major exchanges.  For example, Bitget notes that the price has not been updated and the token is “not widely recognised”【297771556190001†L88-L90】【297771556190001†L230-L234】, and the WEEX guide explains that TeslaCoin is *not listed*【529552180668222†L112-L118】.  In short, TES has essentially zero liquidity on public markets.  This reinforces the need to provide **real utility** to holders rather than simply promising speculative gains.

To reboot the project, we will build an on‑chain crowdfunding platform tailored to research or hardware projects.  Funds will be held in escrow and released only when backers approve milestones, providing transparency and trust.  The TES token will be used for governance (voting on milestones, access to backer‑only updates) rather than as a speculative asset.  Contributors will be able to donate TES to campaigns; optional stable‑coin support can be added later.

## 2 High‑level Solution

1. **Develop a campaign factory and per‑campaign escrow contracts on BSC**.  Backers deposit TES into each campaign contract.  Funds remain locked until milestones are approved by a majority of backer contributions.  If a campaign fails (not enough approvals or past deadline), unspent funds can be refunded proportionally.

2. **Use TES for governance and perks**.  Only contributors (TES holders who donated) can vote on milestone releases.  TES can also gate access to research updates, community calls and micro‑bounties.  The token’s value comes from its utility rather than trading.

3. **Provide a simple front‑end** using Next.js, wagmi and viem for wallet connections.  Users can create campaigns, contribute tokens, vote on milestones and claim refunds through the UI.

4. **Publish a transparent post‑mortem and migration guide**.  Explain why previous efforts stalled, emphasise that funds now live on‑chain (not on an exchange) and that milestones require backer approval.  Make official links clear to avoid scams.


## 3 Smart Contract Design

### 3.1 Campaign Contract

Each campaign is a standalone contract that holds TES tokens and tracks contributions, milestones and approvals.  The key features are:

- **Funding Goal and Deadline** – the creator defines how many TES tokens are needed and when contributions close.  Milestones must be defined upfront.
- **Contribution Tracking** – backers call `contribute(amount)` (after approving the contract to spend their TES) before the deadline.  The contract records each backer’s contribution and total contributions.
- **Milestone Approval** – each milestone stores a description, payout amount and a `claimed` flag.  Backers can call `approveMilestone(milestoneIndex)` once per milestone.  Approval weight is the sum of contributions from backers who approved.  A milestone can be claimed by the campaign owner once approval weight is >50 % of total contributions.
- **Payouts** – when a milestone is approved, the owner calls `claimMilestone(index)`.  The contract transfers the corresponding TES amount to the owner and marks the milestone as claimed.
- **Refunds** – after the deadline, any backer can call `refund()` to withdraw their unspent contribution proportionally if the campaign has ended without all milestones being claimed.  The refund is calculated based on the backer’s contribution relative to total contributions and remaining funds.

The contract uses a simple majority threshold for milestone approval.  For production use you could modify the threshold or snapshot TES balances at the start of the campaign so that non‑contributors who hold TES can vote (but this complicates refund logic).  The code below illustrates the core features and is fully contained in `Campaign.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract Campaign {
    IERC20 public immutable token;
    address public immutable owner;
    uint256 public immutable goal;
    uint256 public immutable deadline;
    string public description;
    mapping(address => uint256) public contributions;
    uint256 public totalContributed;
    struct Milestone {
        string description;
        uint256 amount;
        bool claimed;
    }
    Milestone[] public milestones;
    mapping(uint256 => mapping(address => bool)) public milestoneApprovals;
    mapping(uint256 => uint256) public milestoneApprovalWeight;
    event Contribution(address indexed backer, uint256 amount);
    event MilestoneApproved(uint256 indexed milestoneIndex, address indexed backer, uint256 weight);
    event MilestoneClaimed(uint256 indexed milestoneIndex, uint256 amount);
    event Refund(address indexed backer, uint256 amount);

    constructor(
        IERC20 _token,
        address _owner,
        uint256 _goal,
        uint256 _deadline,
        string memory _description,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) {
        require(_owner != address(0), "owner cannot be zero");
        require(_deadline > block.timestamp, "deadline must be in the future");
        require(milestoneDescriptions.length == milestoneAmounts.length, "milestone arrays mismatch");
        token = _token;
        owner = _owner;
        goal = _goal;
        deadline = _deadline;
        description = _description;

        uint256 totalMilestoneAmount;
        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            milestones.push(Milestone({
                description: milestoneDescriptions[i],
                amount: milestoneAmounts[i],
                claimed: false
            }));
            totalMilestoneAmount += milestoneAmounts[i];
        }
        require(totalMilestoneAmount <= _goal, "milestones exceed goal");
    }

    function contribute(uint256 amount) external {
        require(block.timestamp < deadline, "campaign closed");
        require(amount > 0, "amount must be > 0");
        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "token transfer failed");
        contributions[msg.sender] += amount;
        totalContributed += amount;
        emit Contribution(msg.sender, amount);
    }

    function approveMilestone(uint256 milestoneIndex) external {
        require(milestoneIndex < milestones.length, "invalid milestone");
        require(contributions[msg.sender] > 0, "only backers can approve");
        require(!milestoneApprovals[milestoneIndex][msg.sender], "already approved");
        milestoneApprovals[milestoneIndex][msg.sender] = true;
        uint256 weight = contributions[msg.sender];
        milestoneApprovalWeight[milestoneIndex] += weight;
        emit MilestoneApproved(milestoneIndex, msg.sender, weight);
    }

    function claimMilestone(uint256 milestoneIndex) external {
        require(msg.sender == owner, "only owner can claim");
        require(milestoneIndex < milestones.length, "invalid milestone");
        Milestone storage m = milestones[milestoneIndex];
        require(!m.claimed, "already claimed");
        require(milestoneApprovalWeight[milestoneIndex] * 2 > totalContributed, "insufficient approvals");
        m.claimed = true;
        bool ok = token.transfer(owner, m.amount);
        require(ok, "payout failed");
        emit MilestoneClaimed(milestoneIndex, m.amount);
    }

    function refund() external {
        require(block.timestamp >= deadline, "refunds not available yet");
        uint256 contributed = contributions[msg.sender];
        require(contributed > 0, "nothing to refund");
        uint256 paidOut;
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].claimed) {
                paidOut += milestones[i].amount;
            }
        }
        uint256 remaining = totalContributed - paidOut;
        require(remaining > 0, "no funds remaining");
        uint256 refundAmount = (contributed * remaining) / totalContributed;
        contributions[msg.sender] = 0;
        bool ok = token.transfer(msg.sender, refundAmount);
        require(ok, "refund transfer failed");
        emit Refund(msg.sender, refundAmount);
    }

    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }
}
```

### 3.2 CampaignFactory Contract

To simplify deployment of multiple campaigns, a factory contract deploys instances of `Campaign`.  It stores a reference to the TES token and exposes a `createCampaign()` function.  Campaigns can then be listed on a front‑end.  The factory code is in `CampaignFactory.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Campaign.sol";

contract CampaignFactory {
    IERC20 public immutable token;
    Campaign[] public campaigns;
    event CampaignCreated(address indexed campaign, address indexed owner, string description);

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "token address cannot be zero");
        token = IERC20(tokenAddress);
    }

    function createCampaign(
        string memory description,
        uint256 goal,
        uint256 duration,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) external returns (address campaignAddress) {
        require(goal > 0, "goal must be > 0");
        require(duration > 0, "duration must be > 0");
        require(milestoneDescriptions.length > 0, "no milestones");
        require(milestoneDescriptions.length == milestoneAmounts.length, "milestone array mismatch");
        uint256 deadline = block.timestamp + duration;
        Campaign campaign = new Campaign(
            token,
            msg.sender,
            goal,
            deadline,
            description,
            milestoneDescriptions,
            milestoneAmounts
        );
        campaigns.push(campaign);
        emit CampaignCreated(address(campaign), msg.sender, description);
        return address(campaign);
    }

    function campaignCount() external view returns (uint256) {
        return campaigns.length;
    }
}
```

### 3.3 Why Backer‑Weighted Voting

Although you could let TES holders who did **not** contribute vote on milestones, this complicates refunds (non‑contributors would control funds they didn’t provide) and invites vote buying.  By weighting votes by actual contributions you align voting power with financial skin in the game.  TES still provides utility because only holders can contribute and thus participate in voting.  You can later expand to snapshot TES balances at campaign start if you want broader governance.

### 3.4 Security Considerations

- **Reentrancy & ERC‑777 hooks** – using `transfer` instead of low‑level calls prevents reentrancy but cannot handle fee‑on‑transfer tokens.  If your TES token ever adopts a transfer fee, use OpenZeppelin’s SafeERC20.
- **Approval Threshold** – this example uses >50 % of contributions.  Adjust the threshold or require unanimous consent if appropriate.
- **Admin Powers** – the factory does not hold admin privileges.  The campaign owner is the only one who can claim funds, and cannot withdraw without backer approvals.
- **Auditing** – before handling substantial funds, have the contracts audited and consider using multisig wallets for the campaign owner.


## 4 Development Environment Setup

### 4.1 Prerequisites

- **Node.js ≥ 18** and **npm** installed.
- **Hardhat** for Solidity compilation and deployment.
- **MetaMask** (or another Web3 wallet) configured for BSC Testnet and Mainnet.
- TES token contract address: **`0x9Cb4D8D3BfddC790A807178ba5548314A73A31F8`** (verified on BscScan).

### 4.2 Project Scaffolding

1. **Initialize a project**

   ```bash
   mkdir tesla-crowdfund && cd tesla-crowdfund
   npm init -y
   npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers @openzeppelin/contracts dotenv
   npx hardhat
   # choose “Create an empty hardhat.config.js”
   ```

2. **Copy contract files** into `contracts/`:

   - `Campaign.sol`
   - `CampaignFactory.sol`

3. **Update `hardhat.config.js`** with networks and compiler settings.  Here is an example using BSC testnet (you must supply your own RPC URL and private key in a `.env` file):

   ```javascript
   require('@nomiclabs/hardhat-ethers');
   require('dotenv').config();

   const { BSC_TESTNET_RPC, PRIVATE_KEY } = process.env;

   module.exports = {
     solidity: {
       version: '0.8.20',
       settings: { optimizer: { enabled: true, runs: 200 } },
     },
     networks: {
       bsctest: {
         url: BSC_TESTNET_RPC,
         accounts: [PRIVATE_KEY],
       },
     },
   };
   ```

4. **Deploy the factory** using a Hardhat script (e.g. `scripts/deploy.js`):

   ```javascript
   async function main() {
     const [deployer] = await ethers.getSigners();
     const tokenAddress = '0x9Cb4D8D3BfddC790A807178ba5548314A73A31F8'; // TES token
     const Factory = await ethers.getContractFactory('CampaignFactory');
     const factory = await Factory.deploy(tokenAddress);
     await factory.deployed();
     console.log('Factory deployed to', factory.address);
   }

   main().catch((error) => {
     console.error(error);
     process.exitCode = 1;
   });
   ```

   Run `npx hardhat run --network bsctest scripts/deploy.js` to deploy to BSC testnet.  Record the factory address.

5. **Create a campaign** with a Hardhat task or via the front‑end.  Example using Hardhat console:

   ```javascript
   const factoryAddress = '0x...';
   const factory = await ethers.getContractAt('CampaignFactory', factoryAddress);
   const goal = ethers.utils.parseUnits('10000', 18); // 10k TES goal
   const duration = 30 * 24 * 60 * 60; // 30 days
   const milestoneDescriptions = ['Prototype built', 'Lab tests complete'];
   const milestoneAmounts = [ethers.utils.parseUnits('5000', 18), ethers.utils.parseUnits('5000', 18)];
   const tx = await factory.createCampaign('Free energy experiment', goal, duration, milestoneDescriptions, milestoneAmounts);
   const receipt = await tx.wait();
   const event = receipt.events.find(e => e.event === 'CampaignCreated');
   console.log('New campaign at', event.args.campaign);
   ```


## 5 Front‑end Overview

A simple front‑end can be built with **Next.js** and the **wagmi/viem** libraries for Web3 interactions.  The core components are:

1. **Wallet connect component** – allow users to connect MetaMask or other wallets.
2. **Campaign list page** – call `campaignCount()` on the factory and display each campaign’s metadata (goal, deadline, description, milestones).
3. **Campaign detail page** – connect to a `Campaign` contract by address and show contribution form, milestones with approval and claim buttons, and a refund button.  Use `contribute()`, `approveMilestone()`, `claimMilestone()` and `refund()` functions from the contract.
4. **Create campaign page** – allow the user to enter description, goal, duration and milestones.  On submission, call the factory’s `createCampaign()` function.

Use wagmi’s `useContractWrite` and `useContractRead` hooks to interact with the contracts.  For example, to contribute:

```tsx
const { writeAsync: contribute } = useContractWrite({
  address: campaignAddress,
  abi: CampaignABI,
  functionName: 'contribute',
});

const handleContribute = async (amount: bigint) => {
  await token.approve(campaignAddress, amount);
  await contribute({ args: [amount] });
};
```

Ensure the user has TES tokens in their wallet and has approved the campaign contract to spend them.

## 6 Next Steps and Extensibility

1. **Add stable‑coin support** – to reduce exposure to TES volatility, you can modify the `Campaign` contract to accept a second token (e.g. USDT) for contributions while requiring TES holders to vote.  This would involve storing contributions per token and adjusting payout logic.

2. **Implement token‑weighted voting** – if you want TES holders who didn’t contribute to vote, take a snapshot of TES balances at campaign creation.  Use OpenZeppelin’s `ERC20Snapshot` or store `balances[address]` at creation and weight votes accordingly.

3. **Time‑locked staking** – allow backers to lock their TES for a fixed period in exchange for additional voting power or perks.

4. **Reputation & bounties** – build modules where TES can be used to reward developers, designers and researchers for completing micro‑tasks or bounties.

5. **Governance portal** – integrate the token‑weighted governance modules into a unified portal where the community can propose new campaigns and allocate treasury funds.

## 7 Conclusion

The plan above provides a concrete path to revitalise TeslaCoin through a useful, transparent crowdfunding platform rather than speculative trading.  By focusing on milestone‑based escrow and backer voting, you address the trust deficit after the exchange incident and give TES holders a clear reason to participate.  The provided contracts are intentionally simple and should be audited before handling substantial funds.  Once deployed, you can incrementally add features such as stable‑coin support, token‑weighted governance and staking to deepen the token’s utility.
