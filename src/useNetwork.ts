import { Contract, ethers } from "ethers";
import { useMemo, useState, useEffect } from 'preact/hooks';
import { NetworkConfig } from './types';
import formatUsdc from "./utils/formatUsdc";

type UseNetworkProps = {
  account: string;
  network: NetworkConfig;
};

export type NetworkParams = {
  balance: bigint;
  balanceStr: string;
  tokenContract?: Contract;
  tokenDecimals: number;
  provider: ethers.providers.JsonRpcProvider;
};

const erc20abi = [
  // Some details about the token
  "function name() view returns (string)",
  "function symbol() view returns (string)",

  "function decimals() view returns (uint8)",

  // Get the account balance
  "function balanceOf(address) view returns (uint)",

  // Send some of your tokens to someone else
  "function transfer(address to, uint amount)",

  // An event triggered whenever anyone transfers to someone else
  "event Transfer(address indexed from, address indexed to, uint amount)"
];


export default ({ account, network }: UseNetworkProps): NetworkParams => {
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [tokenDecimals, setTokenDecimals] = useState<number>(0);
  const provider = useMemo(
    () => new ethers.providers.JsonRpcProvider(network.rpcUrl),
    []
  );
    
  const tokenContract = useMemo(
    () => {
      if (!provider || !network) return;
      return new ethers.Contract(network.tokenAddr, erc20abi, provider);
    },
    [network, provider]
  );

  useEffect(() => {
    if (!tokenContract) return;
    tokenContract.decimals().then(setTokenDecimals);
  }, [tokenContract]);

  useEffect(() => {
    if (!tokenContract) return;
    tokenContract.balanceOf(account).then(
      (balance: ethers.BigNumber) => {
        setBalance(BigInt(String(balance)));
      }
    );
  }, [account, tokenContract]);

  const balanceStr = useMemo(
    () => {
      if (!balance || !tokenDecimals) return '0';
      return formatUsdc(balance, tokenDecimals);
    },
    [balance, tokenDecimals]
  );

  return {
    provider,
    tokenContract,
    balance,
    balanceStr,
    tokenDecimals,
  }
};