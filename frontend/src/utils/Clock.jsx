import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

const Clock = ({ format = 'time' }) => {
  const [time, setTime] = useState(new Date());
  const [timeOffset, setTimeOffset] = useState(0);

  useEffect(() => {
    const fetchTime = async () => {
      try {
        const startFetch = Date.now();
        const res = await fetch(`${API_BASE_URL}/api/time`);
        if (res.ok) {
          const data = await res.json();
          const serverTime = new Date(data.time).getTime();
          const latency = (Date.now() - startFetch) / 2;
          const offset = (serverTime + latency) - Date.now();
          setTimeOffset(offset);
          setTime(new Date(Date.now() + offset));
        }
      } catch (e) {
        console.error('Failed to sync time with server', e);
      }
    };
    fetchTime();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date(Date.now() + timeOffset));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffset]);

  if (format === 'date') {
    return <>{time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</>;
  } 
  
  if (format === 'timeDate') {
    return (
      <div style={{ textAlign: 'right', color: '#94a3b8' }}>
        <div style={{ fontWeight: 'bold', color: '#38bdf8' }}>{time.toLocaleTimeString()}</div>
        <div style={{ fontSize: '0.8rem' }}>{time.toLocaleDateString()}</div>
      </div>
    );
  }

  return <>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>;
};

export default Clock;
