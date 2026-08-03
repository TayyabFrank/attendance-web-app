import React, { useEffect } from 'react';
import './splash.css';

const Splash = ({ onFinished }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinished();
    }, 4000); // 4 seconds delay
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <div className="splash-container">
      <div className="splash-content">
        <div className="icon-container">
          <svg className="fingerprint-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22v-3" />
            <path d="M17 22v-5a5 5 0 0 0-10 0v5" />
            <path d="M12 11a1 1 0 0 0-1-1H9a3 3 0 0 0-3 3v6" />
            <path d="M14 14a2 2 0 0 0-2-2h-1c-1.66 0-3 1.34-3 3v4" />
            <path d="M2 11.5a10 10 0 0 1 20 0" />
            <path d="M12 2a10 10 0 0 0-8.66 5" />
            <path d="M20.66 7A10 10 0 0 0 12 2" />
            <path d="M12 7a5 5 0 0 0-5 5v3" />
            <path d="M12 7a5 5 0 0 1 5 5v3" />
          </svg>
        </div>
        <h1 className="splash-title">Smart Attendance</h1>
        <div className="splash-spinner"></div>
      </div>
      <div className="splash-footer">
        Getting things ready...
      </div>
    </div>
  );
};

export default Splash;
