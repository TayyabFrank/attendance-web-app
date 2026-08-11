import React, { createContext, useContext, useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import localforage from 'localforage';
import { API_BASE_URL } from '../config';

const OfflineSyncContext = createContext();

export const useOfflineSync = () => useContext(OfflineSyncContext);

export const OfflineSyncProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Initial check
    Network.getStatus().then(status => setIsOnline(status.connected));

    // Listeners
    const listener = Network.addListener('networkStatusChange', status => {
      setIsOnline(status.connected);
      if (status.connected) {
        processOfflineQueue();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  const saveOfflineRequest = async (url, method, body, headers = {}) => {
    try {
      const queue = await localforage.getItem('offline_requests') || [];
      queue.push({
        url,
        method,
        body,
        headers,
        timestamp: Date.now()
      });
      await localforage.setItem('offline_requests', queue);
      console.log('Saved offline request for:', url);
    } catch (e) {
      console.error('Error saving offline request:', e);
    }
  };

  const processOfflineQueue = async () => {
    if (syncing) return;
    setSyncing(true);

    try {
      const queue = await localforage.getItem('offline_requests') || [];
      if (queue.length === 0) {
        setSyncing(false);
        return;
      }

      console.log(`Syncing ${queue.length} offline requests...`);
      const newQueue = [];

      for (const req of queue) {
        try {
          // Attempt to send
          const res = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
          });

          if (!res.ok) {
            // Keep in queue if server rejected with a 5xx error, but we'll just try later
            console.warn('Sync failed with status:', res.status);
            newQueue.push(req);
          }
        } catch (err) {
          // Still offline or CORS error, keep in queue
          console.error('Network error during sync:', err);
          newQueue.push(req);
        }
      }

      await localforage.setItem('offline_requests', newQueue);
    } catch (e) {
      console.error('Error processing offline queue:', e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <OfflineSyncContext.Provider value={{ isOnline, saveOfflineRequest, processOfflineQueue }}>
      {children}
    </OfflineSyncContext.Provider>
  );
};
