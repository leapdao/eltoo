import { Fragment, render, h } from 'preact';
import { Contract, ethers } from "ethers";
import { useMemo, useState, useEffect, useCallback } from 'preact/hooks';
import { NetworkConfig } from './types';

import useMultichainWallet, { ExtendedNetworkConfig } from './useMultichainWallet';
import useLocalWallet from './useLocalWallet';





const networks: NetworkConfig[] = [
  {
    chainId: 69,
    name: 'Optimism Testnet',
    rpcUrl: 'https://kovan.optimism.io',
    tokenAddr: "0x3b8e53B3aB8E01Fb57D0c9E893bC4d655AA67d84", // USDC
  },
  {
    chainId: 77,
    name: 'XDAI Testnet (Sokol)',
    rpcUrl: 'https://sokol.poa.network',
    tokenAddr: "0x3b0977b9e563F63F219019616BBD12cB1cdFF527", // USDC
  },
  // {
  //   chainId: 80001,
  //   name: 'Polygon testnet',
  //   rpcUrl: 'https://matic-mainnet.chainstacklabs.com',
  //   tokenAddr: "0x3b8e53B3aB8E01Fb57D0c9E893bC4d655AA67d84", // USDC
  // }
];

const modes = ['receive', 'send', 'view'];
type Mode = typeof modes[number];

type SendProps = {
  address?: string;
  amount?: bigint;
  advanced?: boolean;
}

const Send = ({ address, amount, advanced }: SendProps) => {
  const [targetAddress, setTargetAddress] = useState<string>(address || '');
  const [targetAmount, setTargetAmount] = useState<bigint>(amount || BigInt(0));
  const [supportedChains, setSupportedChains] = useState<number[]>([]);

  useEffect(() => {
    const urlParts = window.location.pathname.split("/");
    if (urlParts[2]) setSupportedChains(urlParts[2].split(',').map(c => parseInt(c)));
    if (urlParts[3]) setTargetAddress(urlParts[3]);
    if (urlParts[4]) setTargetAmount(BigInt(urlParts[4]));
  }, [window.location]);

  const supportedChainNames = networks
    .filter(n => supportedChains.includes(n.chainId))
    .map(n => n.name);

  return <div style={{ marginTop: '15px', padding: '25px', border: '1px dotted black' }}>
    <div style={{ padding: '15px 0' }}>
      Send{' '}
      <input id="amount" type="text" value={ethers.utils.formatUnits(targetAmount, 6)} style={{
        width: '50px'
      }}/> USDC
      to{' '}
      <input id="address" type="text" value={targetAddress} style={{
        width: '350px'
      }} />
      
      {advanced && <div>
        <label>Supported chains: </label>
        <span>{supportedChainNames.join(', ')}</span>
      </div>}
    </div>
    <button>Send</button>
  </div>
}

const App = () => {
  const { wallet } = useLocalWallet();
  const account = wallet.address;

  const { balanceStr, networksWithWallet } = useMultichainWallet({ account, networks });
  const [advanced, setAdvanced] = useState<boolean>(false);

  const [mode, setMode] = useState<Mode>('view');
  
  const supportedChains = networks.map(n => n.chainId);
  const recieveUrl = `http://localhost:1234/send/${supportedChains.join(',')}/${wallet.address}`;
  
  useEffect(() => {
    const urlParts = window.location.pathname.split("/");
    if (urlParts.length > 1 && modes.includes(urlParts[1])) {
      setMode(urlParts[1]);
    }
  }, [window.location]);

  return (
    <main style={{  }}>
      <header style={{ position: 'fixed', display: 'flex' }}>
        <div>
          <span style={{ fontSize: '48px' }}>${balanceStr}</span>
          <div style={{ marginTop: '15px', gap: '30px', display: 'flex' }}>
            <button onClick={() => setMode('receive')}>Receive</button>
            <button onClick={() => setMode('send')}>Send</button>
          </div>
        </div>
        <div>
          <ul style={{ visibility: (advanced ? 'visible' : 'hidden') }}>
            {networksWithWallet.map(({ name, wallet }: ExtendedNetworkConfig) => <li>
              {name} — ${wallet.balanceStr}
            </li>)}
          </ul>
        </div>
      </header>

      <div style={{ position: 'absolute', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
        {mode === 'receive' && <div style={{ padding: '30px' }}>
          <a href={recieveUrl}>{recieveUrl}</a>
        </div>}

        {mode === 'send' && <Send advanced={advanced} />}
      </div>
      
      <div style={{ position: 'absolute', top: 0, right: 0, padding: '15px' }}>
        <label>
          advanced
          <input type="checkbox" checked={advanced} onClick={() => setAdvanced(!advanced)} />
        </label>
      </div>
    </main>
  );
};

render(<App />, document.getElementById('app'))