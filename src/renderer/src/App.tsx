import { useEffect, useState } from 'react';
import logo from './assets/logo.png';

export function App() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion);
  }, []);

  return (
    <main className="app">
      <img className="logo" src={logo} alt="" width={96} height={96} />
      <h1>GlobalConvert</h1>
      <p className="muted">Drop files here to convert — coming in Phase 4.</p>
      <footer className="muted">v{version}</footer>
    </main>
  );
}
