import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Register = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to login page after showing message briefly
    const timer = setTimeout(() => {
      navigate('/login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: '"Inter", sans-serif',
      color: '#1e293b',
      padding: '20px',
      textAlign: 'center',
      position: 'relative'
    }}>
      <div className="top-nav-bar">
          <button onClick={() => navigate('/')} className="beautiful-back-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
          </button>
      </div>
      <div style={{
        backgroundColor: '#ffffff',
        padding: '32px',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        maxWidth: '400px'
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" style={{ marginBottom: '16px' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Registration Restricted</h2>
        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5' }}>
          Self-registration is disabled. Only Administrators can add new employees.
        </p>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '16px' }}>
          Redirecting to Login Portal...
        </p>
      </div>
    </div>
  );
};

export default Register;
