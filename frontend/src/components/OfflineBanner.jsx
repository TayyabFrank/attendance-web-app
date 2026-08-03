import React, { useState, useEffect } from 'react';
import { Network } from '@capacitor/network';

const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Check initial network status
    const checkInitialStatus = async () => {
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const status = await Network.getStatus();
        setIsOffline(!status.connected);
      } else {
        setIsOffline(!navigator.onLine);
      }
    };
    checkInitialStatus();

    // Listener for Capacitor Network changes
    let networkListener = null;
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      networkListener = Network.addListener('networkStatusChange', status => {
        setIsOffline(!status.connected);
      });
    }

    // Fallback listeners for Web
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      if (networkListener) {
        networkListener.remove();
      }
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div style={{
      backgroundColor: '#ef4444',
      color: 'white',
      textAlign: 'center',
      padding: '8px',
      fontSize: '14px',
      fontWeight: 'bold',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 9.86a10.94 10.94 0 0 0-3 2.69M1 1l22 22"></path>
      </svg>
      You are currently offline. Please connect to a network to proceed.
    </div>
  );
};

export default OfflineBanner;

