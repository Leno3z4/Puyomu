# Puyomu

**A Portaldot V3.0 perpetual trading protocol with programmable protection and a DaaS-oriented liquidation/recovery lifecycle.**

The UI is the entry point. The protocol is the product: configurable markets, collateral, positions, risk controls, liquidation, and recovery.

> **Current phase:** first on-chain milestone. This repository is being initialized with a deployment probe and configurable market registry. It is **not yet a working perpetual exchange**, and it has not been audited. Do not deposit real funds.

## What we are building

- **Market Registry:** add markets without redeploying the registry; tune leverage, maintenance margin and open-interest limits; switch markets off without deleting their history.
- **Perpetual Engine (next):** collateral accounting, positions, PnL, pricing, open/close and position limits.
- **Risk layer:** oracle freshness/deviation checks, health calculations, circuit breakers, user-defined rescue actions and partial liquidation.
- **DaaS-compatible lifecycle:** default trigger, liquidation, loss accounting, insurance backstop and recovery adapter.
- **Trading terminal:** charts, positions, order controls, protection settings, solvency dashboard and liquidation replay.

Market configuration alone does not execute trades. The future Perpetual Engine must enforce the registry: a disabled market may not open or increase exposure, but existing positions must remain reducible, closable and liquidatable.

## Portaldot V3.0 testnet

The Portaldot V3 testnet guide currently documents the following EVM settings:

| Setting | Value |
|---|---|
| Network | Portaldot V3 Testnet |
| EVM JSON-RPC | `https://testnetv3-eth-rpc.feso-apps.xyz` |
| Chain ID | `420420777` |
| Gas symbol | `tPOTv3` |
| Native token decimals | `14` |
| Node console | [node-console.feso-apps.xyz](https://node-console.feso-apps.xyz/) |

Reference: [Portaldot V3 testnet guide](https://github.com/ItsCogumellum/portaldot-v3-testnet-guide), sections 3.1–3.4.

**Important address/faucet detail:** the guide warns that a Portaldot EVM-format (H160) address is not necessarily the same address generated on Ethereum/BSC from the same key. Use the Node Console's **Developer → Runtime calls → reviveApi → accountId** to query the mapped Portaldot account, then send testnet funds to that mapped account as described in the guide. Confirm the current flow in the console before sending funds.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
```

Edit `.env` and set a **testnet-only** deployer key. Never commit `.env`, and never use a wallet that holds real funds.

```bash
npm run compile
npm test
npm run deploy:v3
```

The deploy script is intentionally guarded: when using the `portaldotV3` network profile, it checks that the connected RPC reports chain ID `420420777`. It deploys `DeploymentProbe` and `MarketRegistry`, then performs a write/read smoke test on the probe. The script prints and saves the deployment addresses and transaction hashes to `deployments/portaldotV3.json`.

If deployment fails, stop and inspect the actual error and chain status; do not silently switch to another network.

## Current contracts

### `DeploymentProbe`

A small verification contract. Its deployment records `block.chainid`, deployer and deployment block. `ping()` is a read-only check; `setMarker()` is a real state-changing transaction restricted to the deployer. This is intended to prove that contract deployment **and** an EVM write work on the target chain.

### `MarketRegistry`

A configuration primitive for later market execution contracts.

- Register a market with a symbol, base/collateral token references, oracle, maximum leverage, maintenance margin and USD-denominated open-interest cap.
- Grant/revoke market managers.
- Change risk parameters and oracle without redeploying.
- Enable/disable a market without deleting its configuration.

Risk units:
- Leverage is in basis points: `10_000 = 1x`, `50_000 = 5x`.
- Maintenance margin is in basis points: `800 = 8%`.
- `maxOpenInterestUsdE8` is USD value with 8 decimal places: `50_000 * 10^8` represents $50,000.
- A zero token address is permitted to represent a native asset. The registry does not move tokens or verify that token/oracle contracts are correct.

Only the owner and explicitly approved managers can alter market configuration. The contract keeps disabled market records so that existing position references and historical data are not erased.

## Initial scope and next milestones

1. Compile and test the starter contracts locally.
2. Deploy the probe and registry to Portaldot V3 testnet.
3. Save verified contract addresses and transaction hashes.
4. Build the Perpetual Engine around the registry interface.
5. Add controlled pricing and position accounting.
6. Add health, liquidation and protection logic with tests before connecting a trading UI.
7. Integrate DaaS only after its current callable interface is confirmed; otherwise keep the adapter boundary explicit and documented.

## Safety status

This is hackathon-stage software. It is **not audited** and must not be used with real funds. The registry is not a perp engine, oracle, bridge or custody contract. Real-money deployment requires independent security review, oracle design, economic modelling, invariant/fuzz tests and a clear upgrade/admin policy.
