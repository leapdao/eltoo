// First version only for rebalancing between L2s using Hop SDK

//const ethers = require('ethers');
const { Hop, Chain, HopBridge } = require('@hop-protocol/sdk');

const supportedChains = [ 'ethereum', 'arbitrum', 'optimism', 'xdai', 'polygon' ];
const supportedNetworks = [ 'mainnet', 'staging', 'kovan', 'goerli' ];

// Kovan - USDC only
const availablePathsKovan = {
  "USDC": {
    xdai: ['optimism'],
    optimism: ['xdai'],
  },
  "USDT": {
    xdai: ['optimism'],
    optimism: ['xdai'],
  }
}

const availablePathsMainnet = {
  "USDC": {
    xdai: ['polygon', 'optimism'],
    polygon: ['xdai', 'optimism'],
    optimism: ['polygon', 'xdai'],
  },
  "USDT": {
    xdai: ['polygon', 'optimism'],
    polygon: ['xdai', 'optimism'],
    optimism: ['polygon', 'xdai'],
  },
  "MATIC": {
    xdai: ['polygon'],
    polygon: ['xdai']
  }
}

const availableTokens = {
  kovan: ['USDC'],
  mainnet: ['USDC', 'USDT', 'MATIC'],
}
// param set Object
/*
{ USDC:
   { arbitrum: 20, optimism: 40, xdai: 20, polygon: 15 },
  USDT:
   { arbitrum: 15, optimism: 50, xdai: 10, polygon: 20 } }
*/
// param signer is ethers.Wallet instance
// param network is 'mainnet' or 'kovan'
async function rebalanceL2(set, network, signer) {
  const hop = new Hop(network);
  // what are the current set balances and prefered set balances
  const { preferedSet, currentSet } = await calculateSets(set, hop, signer.address);
  // for example if difference bigger than 10% -> rebalance
  const needs = calculateNeeds(preferedSet, currentSet); // {USDC: {arbitrum: 1200, optimism: 6900, xdai: -5100, polygon: -3000}}
  const paths = await estimatePathsCost(needs, hop);
  // remove all paths that cost more than 0.7% of the amount
  const filteredPaths = filterPathsByCost(paths);
  const transactionHashes = await usePaths(filteredPaths, hop, signer);
  return transactionHashes; // array
}


async function calculateSets(set, hop, address) {
  // set - { "USDC": { optimism: 30, xdai: 70 } }
  // balancesSet - {USDC: {optimism: 23130n, xdai: 0n}};
    const balancesSet = await _getBalancesWithHop(hop, address);

    if (!_compareKeys(set, balancesSet)) {
      Object.keys(set).forEach((tokenName) => {
        if (!Object.prototype.hasOwnProperty.call(balancesSet, tokenName)) {
          console.log(`Hop doesn't support bridge for ${tokenName} token.`);
          delete set[tokenName];
        }
      });
      Object.keys(balancesSet).forEach((tokenName) => {
        if (!Object.prototype.hasOwnProperty.call(set, tokenName)) {
          delete balancesSet[tokenName];
        }
      });
    }
    Object.keys(set).forEach(tokenName => {
      if (!_compareKeys(set[tokenName], balancesSet[tokenName])) {
        Object.keys(set[tokenName]).forEach((chain) => {
          if (!Object.prototype.hasOwnProperty.call(balancesSet[tokenName], chain)) {
            console.log(`Hop doesn't support bridge for ${chain}. The portion is distributed along the rest of the chains.`);
            delete set[tokenName][chain];
          }
        });
        Object.keys(balancesSet[tokenName]).forEach((chain) => {
          if (!Object.prototype.hasOwnProperty.call(set[tokenName], chain)) {
            delete balancesSet[tokenName][chain];
          }
        });
      }

      // check set has 100% distribution
      let sum = Object.values(set[tokenName]).reduce((acc, value) => acc + value);
      if (sum !== 100) {
        // redistribute - precision is 1% - should we have more? 0.1%, 0.01%? 0.001%?
        let difference = 100 - sum;
        let chains = Object.keys(set[tokenName]);

        let remainder = difference % chains.length;
        let portion = (difference - remainder) / chains.length;
        for (let i = 0; i < chains.length; i++) {
          if (remainder !== 0) {
            set[tokenName][chains[i]] += portion + 1;
            remainder -= 1;
          } else {
            set[tokenName][chains[i]] += portion;
          }
        }
      }
    });

    // here we have exactly the same keys in set and balancesSet, and set is 100%

    const tokens = Object.keys(balancesSet);
    const sums = {};
    //{USDC: 4324n, USDT: 342n}
    tokens.forEach((tokenName) => {
      sums[tokenName] = Object.values(balancesSet[tokenName]).reduce((acc, value) => acc + value);
    });

    const preferedSet = {};
    tokens.forEach((tokenName) => {
      preferedSet[tokenName] = {};
      Object.keys(balancesSet[tokenName]).forEach((chain) => {
        preferedSet[tokenName][chain] = sums[tokenName] * BigInt(set[tokenName][chain]) / 100n;
      });
    });

    return { preferedSet, currentSet: balancesSet};
}

function calculateNeeds(preferedSet, currentSet) {
  // rule #1 differce between current and prefered is bigger than 10%
  const needs = {};
  const tokens = Object.keys(preferedSet);
  tokens.forEach((tokenName) => {
    needs[tokenName] = {};
    Object.keys(preferedSet[tokenName]).forEach((chain) => {
      if (preferedSet[tokenName][chain] * 100n > currentSet[tokenName][chain] * 110n) {
        needs[tokenName][chain] = preferedSet[tokenName][chain] - currentSet[tokenName][chain];
      } else if (preferedSet[tokenName][chain] * 110n < currentSet[tokenName][chain] * 100n) {
        needs[tokenName][chain] = preferedSet[tokenName][chain] - currentSet[tokenName][chain];
      }
    });
  });

  return needs; //{USDC: {arbitrum: 1200, optimism: 6900, xdai: -5100, polygon: -3000}}
}

async function _getBalancesWithHop(hop, address) {
  let balancesSet = {};
  if (hop.network === 'kovan') {
    availableTokens.kovan.map(tokenName => {
      balancesSet[tokenName] = {
        optimism: 0,
        xdai: 0,
      };
    });
  } else if (hop.network === 'mainnet') {
    availableTokens.mainnet.map(tokenName => {
      let setChains = availablePathsMainnet[tokenName];
      Object.keys(setChains).forEach((chain) => setChains[chain] = 0);
      balancesSet[tokenName] = setChains;
    });
  } else {
    throw Error("Unknown network, please use kovan or mainnet.")
  }

  // balancesSet {USDC: {optimism: 0, xdai: 0}};
  await Promise.all(Object.keys(balancesSet).map(async (tokenName) => {
    const bridge = hop.bridge(tokenName);
    await Promise.all(Object.keys(balancesSet[tokenName]).map(async (chain) => {
      const tokenInstance = bridge.getCanonicalToken(chain);
      const balance = await tokenInstance.balanceOf(address);
      balancesSet[tokenName][chain] = BigInt(balance);
    }));
  }));
  // balancesSet {USDC: {optimism: 23130n, xdai: 0n}};
  return balancesSet;
}

function compare(a, b) {
  if (a[0] > b[0]) {
    return -1;
  }
  if (a[0] < b[0]) {
    return 1;
  }
  return 0;
}


function _craftPaths(needs) {
  const paths = {};
  const tokens = Object.keys(needs);
  tokens.forEach((tokenName) => {
    paths[tokenName] = [];
    const chains = Object.keys(needs[tokenName]);
    let sourceChains = [];
    let destinationChains = [];
    chains.forEach((chain) => {
      if (needs[tokenName][chain] < 0n) {
        sourceChains.push([chain, -needs[tokenName][chain]])
      } else if (needs[tokenName][chain] > 0n) {
        destinationChains.push([chain, needs[tokenName][chain]]);
      }
    });

    sourceChains.sort(compare);
    for (let k = 0; k < sourceChains.length; k++) {
      destinationChains.sort(compare);
      for (let i = 0; i < destinationChains.length; i++) {
        if (destinationChains[i][1] <= sourceChains[k][1] && sourceChains[k][1] !== 0n && destinationChains[i][1] !== 0n) {
          paths[tokenName].push({
            sourceChain: sourceChains[k][0],
            destinationChain: destinationChains[i][0],
            amount: destinationChains[i][1]
          });
          sourceChains[k][1] -= destinationChains[i][1];
          destinationChains[i][1] = 0n;
        } else if (destinationChains[i][1] > sourceChains[k][1] && sourceChains[k][1] !== 0n && destinationChains[i][1] !== 0n) {
          paths[tokenName].push({
            sourceChain: sourceChains[k][0],
            destinationChain: destinationChains[i][0],
            amount: sourceChains[k][1]
          });
          sourceChains[k][1] = 0n;
          destinationChains[i][1] -= sourceChains[k][1];
        }
      }
    }

  });
  return paths;
  /*
  returns Object
  { USDC:
   [ { sourceChain: 'polygon',
       destinationChain: 'arbitrum',
       amount: 1200,
      },
     { sourceChain: 'polygon',
       destinationChain: 'optimism',
       amount: 1800,
      },
     { sourceChain: 'xdai',
       destinationChain: 'optimism',
       amount: 5100,
      } ] }
  */
}


async function estimatePathsCost(needs, hop) {
  const paths = _craftPaths(needs);
  // maybe we should also validate that all our paths are available on hop infrastructure, but it seems like it was already done

  await Promise.all(Object.keys(paths).map(async (tokenName) => {
    // estimate received amount and cost
    paths[tokenName] = await Promise.all(paths[tokenName].map(async (path) => {
      const estimatedReceived = await _getEstimatedReceived(hop, tokenName, path.amount, path.sourceChain, path.destinationChain);
      path.estimatedReceived = estimatedReceived;
      path.cost = path.amount - estimatedReceived;
      return path;
    }));
  }));


  return paths;
  /*
  returns Object
  { USDC:
   [ { sourceChain: 'polygon',
       destinationChain: 'arbitrum',
       amount: 1200,
       estimatedReceived: 1192,
       cost: 8  },
     { sourceChain: 'polygon',
       destinationChain: 'optimism',
       amount: 1800,
       estimatedReceived: 1787
       cost: 13  },
     { sourceChain: 'xdai',
       destinationChain: 'optimism',
       amount: 5100,
       estimatedReceived: 5065
       cost: 35   } ] }
  */
}

function filterPathsByCost(paths) {
  const filtered = {};
  Object.keys(paths).forEach((tokenName) => {
    filtered[tokenName] = paths[tokenName].filter((path) => {
      return (10000n - (path.estimatedReceived * 10000n / path.amount) <= 70n);
    });
  });
  return filtered;
}

async function _getEstimatedReceived(hop, token, amount, sourceChain, destinationChain) {
  const bridge = hop.bridge(token);
//  const bonderFee = await bridge.getBonderFee(amount, sourceChain, destinationChain); // this one takes two times
//  const lpFees = await bridge.getLpFees(amount, sourceChain, destinationChain);
//  const destinationTxFee = await bridge.getDestinationTransactionFee(sourceChain, destinationChain);
  const data = await bridge.getSendData(amount, sourceChain, destinationChain);
  return BigInt(data.estimatedReceived);
}



function _compareKeys(a, b) {
  let aKeys = Object.keys(a).sort();
  let bKeys = Object.keys(b).sort();
  return JSON.stringify(aKeys) === JSON.stringify(bKeys);
}

async function usePaths(paths, hop, signer) {
  let hashes = [];
  for (token in paths) {
    await Promise.all(paths[token].map(async (path) => {
      const hash = await _sendBetweenL2UsingHop(hop, signer, token, '0x' + path.amount.toString(16), path.sourceChain, path.destinationChain);
      if (hash) {
        hashes.push(hash);
      }
    }));
  }
  return hashes;
}


async function _sendBetweenL2UsingHop(hop, signer, tokenName, amount, sourceChainSlug, destinationChainSlug) {
  const bridge = new HopBridge(hop.network, signer, tokenName, hop.toChainModel(sourceChainSlug), hop.toChainModel(destinationChainSlug));
  let tx;
  try {
    tx = await bridge.approveAndSend(amount, hop.toChainModel(sourceChainSlug), hop.toChainModel(destinationChainSlug));
  } catch (e) {
    console.log(e);
  }
  return tx.hash;
}

module.exports = rebalanceL2;
