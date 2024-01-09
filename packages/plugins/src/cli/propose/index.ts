import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'

import {
  ProjectDeployment,
  ProposalRequest,
  SphinxJsonRpcProvider,
  WEBSITE_URL,
  elementsEqual,
  ensureSphinxAndGnosisSafeDeployed,
  getPreview,
  getPreviewString,
  makeDeploymentData,
  spawnAsync,
  getParsedConfigWithCompilerInputs,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue, red } from 'chalk'
import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  DeploymentInfo,
  GetConfigArtifacts,
  ParsedConfig,
  RawActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  SphinxLeafType,
  SphinxMerkleTree,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

import {
  makeParsedConfig,
  decodeDeploymentInfo,
  convertFoundryDryRunToActionInputs,
} from '../../foundry/decode'
import { getFoundryToml } from '../../foundry/options'
import {
  getSphinxConfigFromScript,
  getSphinxLeafGasEstimates,
  getUniqueNames,
  getFoundrySingleChainDryRunPath,
  readFoundrySingleChainDryRun,
  readInterface,
  compile,
} from '../../foundry/utils'
import { SphinxContext } from '../context'
import { FoundryToml } from '../../foundry/types'
import { BuildParsedConfigArray } from '../types'

/**
 * @param isDryRun If true, the proposal will not be relayed to the back-end.
 * @param targetContract The name of the contract within the script file. Necessary when there are
 * multiple contracts in the specified script.
 * @param forceRecompile Force re-compile the contracts. By default, we force re-compile. This
 * ensures that we're using the correct artifacts for the proposal. This is mostly out of an
 * abundance of caution, since using the incorrect contract artifact will prevent us from verifying
 * the contract on Etherscan and providing a deployment artifact for the contract.
 */
export interface ProposeArgs {
  confirm: boolean
  isTestnet: boolean
  isDryRun: boolean
  silent: boolean
  scriptPath: string
  sphinxContext: SphinxContext
  forceRecompile: boolean
  targetContract?: string
}

export const buildParsedConfigArray: BuildParsedConfigArray = async (
  scriptPath: string,
  isTestnet: boolean,
  sphinxPluginTypesInterface: ethers.Interface,
  foundryToml: FoundryToml,
  forceRecompile: boolean,
  getConfigArtifacts: GetConfigArtifacts,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<{
  parsedConfigArray?: Array<ParsedConfig>
  configArtifacts?: ConfigArtifacts
  isEmpty: boolean
}> => {
  const { testnets, mainnets, safeAddress } = await getSphinxConfigFromScript(
    scriptPath,
    sphinxPluginTypesInterface,
    targetContract,
    spinner
  )

  const deploymentInfoPath = join(
    foundryToml.cachePath,
    'sphinx-deployment-info.txt'
  )
  const networkNames = isTestnet ? testnets : mainnets
  const collected: Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<RawActionInput>
    libraries: Array<string>
    forkUrl: string
  }> = []
  for (const networkName of networkNames) {
    const rpcUrl = foundryToml.rpcEndpoints[networkName]
    if (!rpcUrl) {
      console.error(
        red(
          `No RPC endpoint specified in your foundry.toml for the network: ${networkName}.`
        )
      )
      process.exit(1)
    }

    const provider = new SphinxJsonRpcProvider(rpcUrl)
    await ensureSphinxAndGnosisSafeDeployed(provider)

    // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
    // use a file from a previous deployment.
    if (existsSync(deploymentInfoPath)) {
      unlinkSync(deploymentInfoPath)
    }

    const forgeScriptCollectArgs = [
      'script',
      scriptPath,
      '--rpc-url',
      rpcUrl,
      '--sig',
      'sphinxCollectProposal(string)',
      deploymentInfoPath,
    ]
    if (targetContract) {
      forgeScriptCollectArgs.push('--target-contract', targetContract)
    }

    // Collect the transactions for the current network. We use the `FOUNDRY_SENDER` environment
    // variable to set the users Safe as the `msg.sender` to ensure that it's the caller for all
    // transactions. We need to do this even though we also broadcast from the Safe's
    // address in the script. Specifically, this is necessary if the user is deploying a contract
    // via CREATE2 that uses a linked library. In this scenario, the caller that deploys the library
    // would be Foundry's default sender if we don't set this environment variable. Note that
    // `FOUNDRY_SENDER` has priority over the `--sender` flag and the `DAPP_SENDER` environment
    // variable. Also, passing the environment variable directly into the script overrides the
    // user defining it in their `.env` file.
    // It's worth mentioning that we can't run a single Forge script for all networks using
    // cheatcodes like `vm.createSelectFork`. This is because we use the `FOUNDRY_SENDER`.
    // Specifically, the state of the Safe on the first fork is persisted across all forks
    // when using `FOUNDRY_SENDER`. This is problematic if the Safe doesn't have the same
    // state across networks. This is a Foundry quirk; it may be a bug.
    const dateBeforeForgeScript = new Date()
    const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
      FOUNDRY_SENDER: safeAddress,
    })

    if (spawnOutput.code !== 0) {
      spinner?.stop()
      // The `stdout` contains the trace of the error.
      console.log(spawnOutput.stdout)
      // The `stderr` contains the error message.
      console.log(spawnOutput.stderr)
      process.exit(1)
    }

    const abiEncodedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf-8')
    const deploymentInfo = decodeDeploymentInfo(
      abiEncodedDeploymentInfo,
      sphinxPluginTypesInterface
    )

    const collectionDryRunPath = getFoundrySingleChainDryRunPath(
      foundryToml.broadcastFolder,
      scriptPath,
      deploymentInfo.chainId,
      `sphinxCollectProposal`
    )
    const collectionDryRun = readFoundrySingleChainDryRun(
      foundryToml.broadcastFolder,
      scriptPath,
      deploymentInfo.chainId,
      `sphinxCollectProposal`,
      dateBeforeForgeScript
    )

    // Check if the dry run file exists. If it doesn't, this must mean that there weren't any
    // transactions broadcasted in the user's script for this network. We return an empty array in
    // this case.
    const actionInputs = collectionDryRun
      ? convertFoundryDryRunToActionInputs(
          deploymentInfo,
          collectionDryRun,
          collectionDryRunPath
        )
      : []

    const libraries = collectionDryRun ? collectionDryRun.libraries : []

    collected.push({ deploymentInfo, actionInputs, libraries, forkUrl: rpcUrl })
  }

  spinner?.succeed(`Collected transactions.`)

  const isEmpty =
    collected.length === 0 ||
    collected.every(({ actionInputs }) => actionInputs.length === 0)
  if (isEmpty) {
    return {
      isEmpty: true,
      parsedConfigArray: undefined,
      configArtifacts: undefined,
    }
  }

  spinner?.start(`Estimating gas...`)

  const gasEstimatesArray = await getSphinxLeafGasEstimates(
    scriptPath,
    foundryToml,
    sphinxPluginTypesInterface,
    collected,
    targetContract,
    spinner
  )

  spinner?.succeed(`Estimated gas.`)
  spinner?.start(`Building proposal...`)

  const { uniqueFullyQualifiedNames, uniqueContractNames } = getUniqueNames(
    collected.map(({ actionInputs }) => actionInputs),
    collected.map(({ deploymentInfo }) => deploymentInfo)
  )

  if (forceRecompile) {
    // Compile silently because compilation also occurred earlier in this function. It'd be
    // confusing if we display the compilation process twice without explanation.
    compile(true, true)
  }
  const configArtifacts = await getConfigArtifacts(
    uniqueFullyQualifiedNames,
    uniqueContractNames
  )

  const parsedConfigArray = collected.map(
    ({ actionInputs, deploymentInfo, libraries }, i) =>
      makeParsedConfig(
        deploymentInfo,
        actionInputs,
        gasEstimatesArray[i],
        configArtifacts,
        libraries
      )
  )

  return {
    parsedConfigArray,
    configArtifacts,
    isEmpty: false,
  }
}

export const propose = async (
  args: ProposeArgs
): Promise<{
  proposalRequest?: ProposalRequest
  canonicalConfigData?: string
  configArtifacts?: ConfigArtifacts
  parsedConfigArray?: Array<ParsedConfig>
  merkleTree?: SphinxMerkleTree
}> => {
  const {
    confirm,
    isTestnet,
    isDryRun,
    silent,
    scriptPath,
    sphinxContext,
    targetContract,
    forceRecompile,
  } = args

  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    console.error("You must specify a 'SPHINX_API_KEY' environment variable.")
    process.exit(1)
  }

  const projectRoot = process.cwd()

  // Run the compiler. It's necessary to do this before we read any contract interfaces.
  compile(
    silent,
    false // Do not force re-compile.
  )

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const foundryToml = await getFoundryToml()

  // We must load any ABIs after compiling the contracts to prevent a situation where the user
  // clears their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesInterface = readInterface(
    foundryToml.artifactFolder,
    'SphinxPluginTypes'
  )

  const getConfigArtifacts = sphinxContext.makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    projectRoot,
    foundryToml.cachePath
  )

  const { parsedConfigArray, configArtifacts, isEmpty } =
    await sphinxContext.buildParsedConfigArray(
      scriptPath,
      isTestnet,
      sphinxPluginTypesInterface,
      foundryToml,
      forceRecompile,
      getConfigArtifacts,
      targetContract,
      spinner
    )

  if (isEmpty) {
    spinner.succeed(
      `Skipping proposal because there is nothing to execute on any chain.`
    )
    return {}
  }

  // Narrow the TypeScript type of the ParsedConfig and ConfigArtifacts.
  if (!parsedConfigArray || !configArtifacts) {
    throw new Error(
      `ParsedConfig or ConfigArtifacts not defined. Should never happen.`
    )
  }

  const deploymentData = makeDeploymentData(parsedConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  spinner.succeed(`Built proposal.`)
  spinner.start(`Running simulation...`)

  const gasEstimatesPromises = parsedConfigArray
    .filter((parsedConfig) => parsedConfig.actionInputs.length > 0)
    .map((parsedConfig) =>
      sphinxContext.getNetworkGasEstimate(
        parsedConfigArray,
        parsedConfig.chainId,
        foundryToml
      )
    )
  const gasEstimates = await Promise.all(gasEstimatesPromises)

  spinner.succeed(`Simulation succeeded.`)
  const preview = getPreview(parsedConfigArray)
  if (confirm || isDryRun) {
    if (!silent) {
      const previewString = getPreviewString(preview, false)
      console.log(previewString)
    }
  } else {
    const previewString = getPreviewString(preview, true)
    await sphinxContext.prompt(previewString)
  }

  isDryRun
    ? spinner.start('Finishing dry run...')
    : spinner.start(`Proposing...`)

  const shouldBeEqual = parsedConfigArray.map((parsedConfig) => {
    return {
      newConfig: parsedConfig.newConfig,
      safeAddress: parsedConfig.safeAddress,
      moduleAddress: parsedConfig.moduleAddress,
      safeInitData: parsedConfig.safeInitData,
    }
  })
  if (!elementsEqual(shouldBeEqual)) {
    throw new Error(
      `Detected different Safe or SphinxModule addresses for different chains. This is currently unsupported.` +
        `Please use the same Safe and SphinxModule on all chains.`
    )
  }

  // Since we know that the following fields are the same for each network, we get their values
  // here.
  const { newConfig, safeAddress, moduleAddress, safeInitData } =
    parsedConfigArray[0]

  const projectDeployments: Array<ProjectDeployment> = []
  const chainStatus: Array<{
    chainId: number
    numLeaves: number
  }> = []
  const chainIds: Array<number> = []
  for (const parsedConfig of parsedConfigArray) {
    // We skip chains that don't have any transactions to execute to simplify Sphinx's backend
    // logic. From the perspective of the backend, these networks don't serve any purpose in the
    // `ProposalRequest`.
    if (parsedConfig.actionInputs.length === 0) {
      continue
    }

    const projectDeployment = getProjectDeploymentForChain(
      merkleTree,
      parsedConfig
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    chainStatus.push({
      chainId: Number(parsedConfig.chainId),
      numLeaves: parsedConfig.actionInputs.length + 1,
    })
    chainIds.push(Number(parsedConfig.chainId))
  }

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds,
    deploymentName: newConfig.projectName,
    owners: newConfig.owners,
    threshold: Number(newConfig.threshold),
    safeAddress,
    moduleAddress,
    safeInitData,
    safeInitSaltNonce: newConfig.saltNonce,
    projectDeployments,
    gasEstimates,
    diff: preview,
    compilerConfigId: undefined,
    tree: {
      root: merkleTree.root,
      chainStatus,
    },
  }

  const compilerConfigs = getParsedConfigWithCompilerInputs(
    parsedConfigArray,
    configArtifacts
  )
  const canonicalConfigData = JSON.stringify(compilerConfigs, null, 2)

  if (isDryRun) {
    spinner.succeed(`Proposal dry run succeeded.`)
  } else {
    const compilerConfigId = await sphinxContext.storeCanonicalConfig(
      apiKey,
      newConfig.orgId,
      [canonicalConfigData]
    )
    proposalRequest.compilerConfigId = compilerConfigId

    await sphinxContext.relayProposal(proposalRequest)
    spinner.succeed(
      `Proposal succeeded! Go to ${blue.underline(
        WEBSITE_URL
      )} to approve the deployment.`
    )
  }
  return {
    proposalRequest,
    canonicalConfigData,
    configArtifacts,
    parsedConfigArray,
    merkleTree,
  }
}

const getProjectDeploymentForChain = (
  merkleTree: SphinxMerkleTree,
  parsedConfig: ParsedConfig
): ProjectDeployment | undefined => {
  const { newConfig, initialState, chainId } = parsedConfig

  const approvalLeaves = merkleTree.leavesWithProofs.filter(
    (l) =>
      l.leaf.leafType === SphinxLeafType.APPROVE &&
      l.leaf.chainId === BigInt(chainId)
  )

  if (approvalLeaves.length === 0) {
    return undefined
  } else if (approvalLeaves.length > 1) {
    throw new Error(
      `Found multiple approval leaves for chain ${chainId}. Should never happen.`
    )
  }

  const deploymentId = merkleTree.root

  return {
    chainId: Number(chainId),
    deploymentId,
    name: newConfig.projectName,
    isExecuting: initialState.isExecuting,
  }
}
