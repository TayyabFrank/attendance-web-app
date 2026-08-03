import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import './selection.css';

const Selection = () => {
  const navigate = useNavigate();
  const [loggedEmployee, setLoggedEmployee] = useState(() => {
    try {
      const emp = localStorage.getItem('employee');
      return emp ? JSON.parse(emp) : null;
    } catch { return null; }
  });
  const [loggedAdmin, setLoggedAdmin] = useState(() => {
    try {
      const adm = localStorage.getItem('admin');
      return adm ? JSON.parse(adm) : null;
    } catch { return null; }
  });

  const [todayStatus, setTodayStatus] = useState('not-checked-in'); // 'not-checked-in' | 'checked-in' | 'checked-out'

  useEffect(() => {
    if (loggedEmployee && (loggedEmployee.employeeId || loggedEmployee._id)) {
      const empId = loggedEmployee.employeeId || loggedEmployee._id;
      fetch(`${API_BASE_URL}/api/attendance/logs/${empId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch logs');
          return res.json();
        })
        .then((logs) => {
          const todayStr = new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          const todayLog = Array.isArray(logs) ? logs.find((l) => l.date === todayStr) : null;

          if (todayLog && todayLog.checkIn && todayLog.checkIn !== '--:--') {
            if (todayLog.checkOut && todayLog.checkOut !== '--:--') {
              setTodayStatus('checked-out');
            } else {
              setTodayStatus('checked-in');
            }
          } else {
            setTodayStatus('not-checked-in');
          }
        })
        .catch((err) => {
          console.error('Error fetching today attendance status:', err);
          setTodayStatus('not-checked-in');
        });
    }
  }, [loggedEmployee]);

  const handleLogout = (type) => {
    if (type === 'employee') {
      localStorage.removeItem('employee');
      setLoggedEmployee(null);
    } else {
      localStorage.removeItem('admin');
      setLoggedAdmin(null);
    }
  };

  const renderWelcomeBack = () => {
    if (loggedEmployee) {
      return (
        <div className="welcome-back-card">
          <div className="welcome-avatar-container">
            {loggedEmployee.facePhoto && !loggedEmployee.facePhoto.includes('<svg>') ? (
              <img src={loggedEmployee.facePhoto} alt={loggedEmployee.name} className="welcome-back-avatar" />
            ) : (
              <div className="welcome-back-avatar-fallback">{loggedEmployee.name.charAt(0)}</div>
            )}
            <div className="active-dot-pulse"></div>
          </div>
          <h3 className="welcome-back-title">Welcome back, {loggedEmployee.name}!</h3>
          <span className="welcome-back-subtitle">ID: {loggedEmployee.employeeId} • EMPLOYEE</span>
          
          <div className="welcome-actions-stack">
            <button className="btn btn-primary welcome-action-btn" onClick={() => navigate('/scan')}>
              {todayStatus === 'checked-in' ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Please Check Out
                </>
              ) : todayStatus === 'checked-out' ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Attendance Completed Today
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Please Mark Your Attendance
                </>
              )}
            </button>
            <button className="btn btn-secondary welcome-action-btn" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          </div>
          <button className="btn-logout-link" onClick={() => handleLogout('employee')}>
            Sign out of {loggedEmployee.name}
          </button>
        </div>
      );
    }

    if (loggedAdmin) {
      const displayRole = loggedAdmin.role === 'super-admin' ? 'Super Admin' : (loggedAdmin.role === 'hr-admin' ? 'HR Admin' : 'Viewer Admin');
      return (
        <div className="welcome-back-card">
          <div className="welcome-avatar-container">
            <div className="welcome-back-avatar-fallback admin-blue">A</div>
            <div className="active-dot-pulse"></div>
          </div>
          <h3 className="welcome-back-title">Welcome back, {loggedAdmin.name}!</h3>
          <span className="welcome-back-subtitle">{displayRole}</span>
          
          <div className="welcome-actions-stack">
            <button className="btn btn-primary welcome-action-btn" onClick={() => navigate('/admin-dashboard')}>
              Go to Admin Dashboard
            </button>
          </div>
          <button className="btn-logout-link" onClick={() => handleLogout('admin')}>
            Sign out of admin
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="selection-container">
      <div className="selection-card">
        <div className="selection-header">
          <div className="logo-box-large">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <h2>Smart Attendance</h2>
          <p>Please select your portal to sign in</p>
        </div>

        {loggedEmployee || loggedAdmin ? (
          renderWelcomeBack()
        ) : (
          <div className="selection-buttons-stack">
            <button className="selection-btn admin" onClick={() => navigate('/admin-login')}>
              <div className="btn-icon-circle blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="btn-text-content">
                <span className="btn-title">Login as Admin</span>
                <span className="btn-desc">Access management portal</span>
              </div>
              <svg className="arrow-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <button className="selection-btn employee" onClick={() => navigate('/login')}>
              <div className="btn-icon-circle gray">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="btn-text-content">
                <span className="btn-title">Login as Employee</span>
                <span className="btn-desc">Access check-in & logs portal</span>
              </div>
              <svg className="arrow-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Selection;
