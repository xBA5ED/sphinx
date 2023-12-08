# Sphinx: DevOps for Deployments



"Sphinx offers seamless, gasless multichain deployments for smart contracts with its Gnosis Safe module, facilitating secure, one-click deployments across 11 networks. It's compatible with Forge scripts, ensuring easy integration and automated deployments directly from CI processes, all underpinned by trustless, audited security."

Sphinx is a protocol and Foundry plugin that automates the smart contract deployment process.

TODO(md): consider mentioning that the user's deployment is executed via the Gnosis Safe somewhere in the main readme.

TODO(md-end): add a 'security'/'audit' section in the main readme

TODO(md): in the "writing scripts with sphinx" guide, make it clear that deployments are executed by the Gnosis Safe.

_. You can integrate Sphinx

TODO(md):
coming soon:
- support for arbitrary networks
- view the contents of a deployment
- use sphinx with an existing gnosis safe
coming soon to the DevOps platform:
- deployment artifacts
- payments in usdc

TODO(md): say which versions of Safe we support

TODO(md): add documentation for deploying on a live network from a single owner. ofc, make it clear that you can only do this with a single owner.

TODO(md): document the erc20-style failure that m4rio pointed out

TODO(md): document which gnosis safe versions we support. mention that 1.3.0 is currently the canonical gnosis safe version.

TODO(md-end): c/f SphinxModuleProxy.t.sol in the specs and update line numbers.

TODO(md-end): c/f: the `setUp` function in *.md. the referenced logic is no longer in the setUp function.

TODO(md): document how we handle failures.

## Key features:

* **Gasless deployments**: You don't need to worry about securing a funded private key or getting native gas tokens on any chain. We'll bill you in fiat after your deployment is finished.

* **One-Click Multichain Deployments**: Approve deployments across 11 supported networks by signing a single meta transaction. Sphinx's backend will execute the deployment on each network in parallel and then verify your smart contracts on Etherscan.

* **Deployments in CI**: Eliminate human error and improve security by gaslessly triggering deployments from your CI process. You can always propose from your local machine if you'd prefer.

- **Powered by Gnosis Safe**: The Sphinx protocol is a [Gnosis Safe Module](https://docs.safe.global/safe-smart-account/modules) designed for deployments. With the Sphinx Module, your Gnosis Safe owners can approve deployments across an arbitrary number of chains by signing a single meta transaction. Sphinx will deploy a Gnosis Safe on your behalf at a consistent address with `CREATE2`.

- **Completely Trustless**: It's impossible for Sphinx to execute anything that your Gnosis Safe owners have not explicitly approved. Our system has been audited by Spearbit; see our audit report [here](TODO(md)).

TODO: practically speaking, how can a user do a create3 deployment like this? if it's not reasonable for a user to figure it out themselves, either make a guide or remove this bullet point.

- **Secure `CREATE3` Deployments**: You can use your multisig as your permissioned `CREATE3` deployer instead of relying on a single private key to get consistent contract addresses across networks.

* **Compatible with Forge Scripts**: You can integrate Sphinx with minimal changes to your existing Forge scripts. All you need to do is add a modifier to your `run()` function.

## Request access

Sphinx is currently invite-only. [Request access on our website.](https://sphinx.dev)

## Documentation

### Getting started

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)
- [The Sphinx DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/main/docs/ops-getting-started.md)

### Reference guides

- [Writing Deployment Scripts](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md)
- [Configuration Options](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md)
- [Using Sphinx in a CI Process](https://github.com/sphinx-labs/sphinx/blob/main/docs/ci-proposals.md)
- [Deploying on Anvil](TODO(md))
- [How Sphinx Works](TODO(md))
- [Troubleshooting Guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/troubleshooting-guide.md)

### Specifications

- [Introduction](https://github.com/sphinx-labs/sphinx/blob/develop/specs/introduction.md)
- [Sphinx Merkle Tree](https://github.com/sphinx-labs/sphinx/blob/develop/specs/merkle-tree.md)
- [`SphinxModuleProxy` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy.md)
- [`SphinxModuleProxyFactory` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy-factory.md)
- [`ManagedService` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/specs/managed-service.md)

## Current limitations

- Sphinx supports `CREATE2` and `CREATE3`, but not the `CREATE` opcode, i.e. `new MyContract(...)`.
- You cannot send ETH as part of a deployment.

Please feel free to reach out in our [Discord](https://discord.gg/7Gc3DK33Np) to request a feature!

## Supported Networks

- Ethereum
- Optimism
- Arbitrum
- Polygon
- Polygon zkEVM
- BNB Smart Chain (aka BSC)
- Gnosis Chain
- Avalanche C-Chain
- Linea
- Fantom
- Base

Test networks:

- Ethereum Sepolia
- Optimism Sepolia
- Arbitrum Sepolia
- Polygon Mumbai
- Polygon zkEVM Goerli
- BNB Smart Chain Testnet
- Gnosis Chiado
- Avalanche Fuji
- Linea Goerli
- Fantom Testnet
- Base Sepolia

More networks are on the way! Please feel free to reach out in our [Discord](https://discord.gg/7Gc3DK33Np) if there are networks you'd like us to add.

## Contributors

[@smartcontracts](https://github.com/smartcontracts)\
[Wonderland](https://defi.sucks/)\
[@rpate97](https://github.com/RPate97)\
[@sam-goldman](https://github.com/sam-goldman)

## Contributing

Contributions to Sphinx are greatly appreciated! Please read our [contributing guide](https://github.com/sphinx-labs/sphinx/blob/main/CONTRIBUTING.md) to get started. Then, check out the list of [Good First Issues](https://github.com/sphinx-labs/sphinx/contribute). Let us know if you have any questions!

## Reach Out

If you have any questions or feature requests, send us a message in our [Discord!](https://discord.gg/7Gc3DK33Np)

## License
We use the Gnosis Safe contracts as a library, licensed under [LGPL v3](https://github.com/safe-global/safe-contracts/blob/main/LICENSE). You can access the Gnosis Safe contracts in their [public repo](https://github.com/safe-global/safe-contracts).

The Sphinx Safe Module and all other code in this repository is licensed under [MIT](https://github.com/sphinx-labs/sphinx/blob/develop/LICENSE).
