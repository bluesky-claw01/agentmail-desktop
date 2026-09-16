import React, { useState, useEffect } from 'react';
import SetupPage from './components/SetupPage';
import MainApp from './components/MainApp';

declare global {
  interface Window {
    electronAPI: any;
  }
}

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const result = await window.electronAPI.hasApiKey();
    setHasApiKey(result);
  };

  if (hasApiKey === null) {
    return <div className="loading">Loading...</div>;
  }

  if (!hasApiKey) {
    return <SetupPage onComplete={() => setHasApiKey(true)} />;
  }

  return <MainApp onLogout={() => setHasApiKey(false)} />;
};

export default App;
