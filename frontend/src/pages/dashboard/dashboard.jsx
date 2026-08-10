import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import './dashboard.css';
import '../history/history.css'; // import to share unified navbar styles
import { Geolocation } from '@capacitor/geolocation';

const Dashboard = () => {
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [officeSettings, setOfficeSettings] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [allLogs, setAllLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [viewMode, setViewMode] = useState('week');
  const [dateOffset, setDateOffset] = useState(0);

  // Profile management states
  const [showDropdown, setShowDropdown] = useState(false);
  const [profileModal, setProfileModal] = useState({ isOpen: false, password: '', facePhotos: [], showPassword: false });
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  // Status Banner Notification
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [coords, setCoords] = useState({ latitude: null, longitude: null });

  const fetchNotificationsCount = async (empId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/requests/employee/${empId}`);
      if (res.ok) {
        const data = await res.json();
        const acknowledgedRequests = JSON.parse(localStorage.getItem(`ack_requests_${empId}`) || '{}');
        let unread = 0;
        data.forEach(req => {
          if (req.status !== 'Pending') {
            if (!acknowledgedRequests[req._id] || acknowledgedRequests[req._id] !== req.status) {
              unread++;
            }
          }
        });
        setNotificationsCount(unread);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const showStatusBanner = (msg, type) => {
    setNotification({ message: msg, type });
    setTimeout(() => {
      setNotification({ message: '', type: '' });
    }, 4000);
  };

  const fetchTodayStatus = async (empId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/logs/${empId}`);
      if (response.ok) {
        const logs = await response.json();
        setAllLogs(logs);
        const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const log = logs.find(l => l.date === todayStr);
        setTodayLog(log || null);
      }
    } catch (err) {
      console.error('Error fetching today status:', err);
    }
  };

  useEffect(() => {
    const loggedEmployee = localStorage.getItem('employee');
    if (!loggedEmployee) {
      navigate('/login');
      return;
    }
    const emp = JSON.parse(loggedEmployee);
    setEmployee(emp);

    const loadDashboardData = async () => {
      const fetchLocation = async () => {
        try {
          try {
            const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
            setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          } catch (err) {
            console.warn("High accuracy failed, falling back to low accuracy:", err);
            const lowPosition = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000 });
            setCoords({ latitude: lowPosition.coords.latitude, longitude: lowPosition.coords.longitude });
          }
        } catch (error) {
          console.error("Error getting location on dashboard: ", error);
        }
      };

      const fetchOffice = async () => {
        try { const res = await fetch(`${API_BASE_URL}/api/settings/office`); if (res.ok) setOfficeSettings(await res.json()); } catch (e) { console.error(e); }
      };

      const fetchHol = async () => {
        try { const res = await fetch(`${API_BASE_URL}/api/holidays`); if (res.ok) setHolidays(await res.json()); } catch (e) { console.error(e); }
      };

      const fetchProfile = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/employees/${emp.employeeId}/profile`);
          if (res.ok) {
            const latestEmp = await res.json();
            const mergedEmp = {
              ...emp,
              ...latestEmp,
              plainPassword: latestEmp.plainPassword || latestEmp.password || emp.plainPassword || emp.password,
              password: latestEmp.plainPassword || latestEmp.password || emp.plainPassword || emp.password
            };
            setEmployee(mergedEmp);
            try { localStorage.setItem('employee', JSON.stringify(mergedEmp)); } catch (e) {}
          }
        } catch (err) {
          console.error('Error fetching profile:', err);
        }
      };

        await fetchOffice();
        await fetchHol();
        await fetchLocation();
        await fetchTodayStatus(emp.employeeId);
        await fetchNotificationsCount(emp.employeeId);
        await fetchProfile();
    };

    loadDashboardData();
  }, [navigate]);

  const isMountedRef = useRef(true);

  const stopCamera = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (_) {}
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (_) {}
      streamRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    const handlePageExit = () => stopCamera();
    window.addEventListener('beforeunload', handlePageExit);
    window.addEventListener('pagehide', handlePageExit);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handlePageExit);
      window.removeEventListener('pagehide', handlePageExit);
      stopCamera();
    };
  }, []);

  const handleLogout = () => {
    stopCamera();
    localStorage.removeItem('employee');
    navigate('/');
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Camera error:', err);
      setVerifyError('Camera access required for verification.');
    }
  };

  const captureFrameBase64 = () => {
    return new Promise((resolve) => {
      if (!videoRef.current) return resolve(null);
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 400;
      canvas.height = videoRef.current.videoHeight || 400;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    });
  };

  const handleVerifyFace = async () => {
    if (!employee) return;
    setVerifyError('');
    setIsVerifyingFace(true);
    try {
      const frameData = await captureFrameBase64();
      if (!frameData) throw new Error('Camera not ready');
      
      const response = await fetch(`${API_BASE_URL}/api/verify-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employee.employeeId, frameB: frameData })
      });
      const data = await response.json();
      if (response.ok) {
        stopCamera();
        setVerifyModalOpen(false);
        setProfileModal(prev => ({ ...prev, isOpen: true }));
      } else {
        setVerifyError(data.error || 'Face verification failed');
      }
    } catch (err) {
      console.error(err);
      setVerifyError('Verification error occurred');
    } finally {
      setIsVerifyingFace(false);
    }
  };

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const cleaned = timeStr.trim().toUpperCase();
    const ampmMatch = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = parseInt(ampmMatch[2], 10);
      const ampm = ampmMatch[3];
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    const twentyFourMatch = cleaned.match(/^(\d+):(\d+)$/);
    if (twentyFourMatch) {
      return parseInt(twentyFourMatch[1], 10) * 60 + parseInt(twentyFourMatch[2], 10);
    }
    return 0;
  };

  const calculateHours = (checkIn, checkOut) => {
    if (!checkIn || checkIn === '--:--' || !checkOut || checkOut === '--:--') return 0;
    const inM = timeToMinutes(checkIn);
    const outM = timeToMinutes(checkOut);
    return outM > inM ? (outM - inM) / 60 : 0;
  };

  const getWeeklyHours = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    let totalMinutes = 0;
    allLogs.forEach(log => {
      const logDate = new Date(log.date);
      if (logDate >= startOfWeek && logDate <= now) {
        if (log.checkIn && log.checkIn !== '--:--' && log.checkOut && log.checkOut !== '--:--') {
          totalMinutes += (timeToMinutes(log.checkOut) - timeToMinutes(log.checkIn));
        }
      }
    });
    return (totalMinutes / 60).toFixed(1);
  };

  const handleProfilePhotosChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfileModal(prev => ({ ...prev, facePhotos: [ev.target.result] }));
    };
    reader.readAsDataURL(file);
  };

  const handleProfileUpdate = async () => {
    if (!employee) return;
    setIsUpdatingProfile(true);
    try {
      const payload = {};
      if (profileModal.password) payload.password = profileModal.password;
      if (profileModal.facePhotos.length > 0) payload.facePhotos = profileModal.facePhotos;

      const response = await fetch(`${API_BASE_URL}/api/employees/${employee.employeeId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        showStatusBanner('Profile updated successfully!', 'success');
        if (data.facePhoto) {
           const updatedEmp = { ...employee, photo: data.facePhoto };
           setEmployee(updatedEmp);
           localStorage.setItem('employee', JSON.stringify(updatedEmp));
        }
        setProfileModal({ isOpen: false, password: '', facePhotos: [] });
      } else {
        const errData = await response.json();
        showStatusBanner(errData.error || 'Failed to update profile.', 'error');
      }
    } catch (err) {
      console.error(err);
      showStatusBanner('Network error updating profile.', 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleQuickMark = async () => {
    if (!employee) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/dashboard-mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          employeeId: employee.employeeId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          timezoneOffset: new Date().getTimezoneOffset()
        })
      });
      const data = await response.json();
      if (response.ok) {
        showStatusBanner(data.message, 'success');
        fetchTodayStatus(employee.employeeId);
      } else {
        showStatusBanner(data.error || 'Failed to update attendance status.', 'error');
      }
    } catch (err) {
      console.error(err);
      showStatusBanner('Network error marking attendance.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusText = () => {
    if (!todayLog) return 'Not Checked In';
    if (todayLog.checkOut !== '--:--') return `Checked Out at ${todayLog.checkOut}`;
    if (todayLog.checkIn !== '--:--') return `Checked In at ${todayLog.checkIn}`;
    return 'Not Checked In';
  };

  const getStatusClass = () => {
    if (!todayLog) return 'status-absent';
    if (todayLog.checkOut !== '--:--') return 'status-absent';
    if (todayLog.checkIn !== '--:--') return 'status-present';
    return 'status-absent';
  };

  if (!employee) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', color: '#64748b' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid #cbd5e1', borderTopColor: '#1062b3', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '16px', fontWeight: '600', fontSize: '15px' }}>Loading Dashboard...</p>
      </div>
    );
  }

  const todayHours = todayLog ? calculateHours(todayLog.checkIn, todayLog.checkOut === '--:--' ? new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : todayLog.checkOut).toFixed(1) : '0.0';
  const weeklyHoursCompleted = getWeeklyHours();
  const isLateToday = todayLog ? todayLog.isLate : false;

  return (
    <div className="dashboard-container">
      {/* Top Navbar */}
      <header className="history-navbar" style={{ width: '100%' }}>
        <div className="navbar-left">
          <button className="mobile-back-btn" onClick={() => navigate('/')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <div className="logo-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <span className="logo-text">Smart Attendance</span>
        </div>
        <nav className="navbar-center-links">
          <button className="nav-link active">Dashboard</button>
          <button className="nav-link" onClick={() => navigate('/history', { state: { tab: 'Logs' } })}>Logs</button>
          <button className="nav-link" onClick={() => navigate('/history', { state: { tab: 'Approvals' } })} style={{ position: 'relative' }}>
            Approvals
            {notificationsCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '-8px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                borderRadius: '50%',
                width: '6px',
                height: '6px',
                display: 'block'
              }}></span>
            )}
          </button>
        </nav>
        <div className="navbar-right">
          <button className="icon-badge-btn" onClick={() => navigate('/history', { state: { tab: 'Approvals' } })} style={{ position: 'relative' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notificationsCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '0px',
                right: '0px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                borderRadius: '50%',
                width: '8px',
                height: '8px',
                display: 'block'
              }}></span>
            )}
          </button>
          <button className="icon-badge-btn" onClick={() => setProfileModal(prev => ({ ...prev, isOpen: true }))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div className="profile-menu-container">
            <div className="profile-avatar" onClick={() => setShowDropdown(!showDropdown)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            {showDropdown && (
              <div className="profile-dropdown">
                <button 
                  className="dropdown-item" 
                  disabled={employee && !employee.isActive}
                  style={{ opacity: (employee && !employee.isActive) ? 0.5 : 1, cursor: (employee && !employee.isActive) ? 'not-allowed' : 'pointer' }}
                  onClick={() => { 
                    if (employee && !employee.isActive) return; 
                    setShowDropdown(false); 
                    setProfileModal(prev => ({ ...prev, isOpen: true }));
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Manage Profile
                </button>
                <button className="dropdown-item logout" onClick={handleLogout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {employee && !employee.isActive && (
          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            ⚠ Your account is inactive. You cannot check in/out. Please contact the administrator.
          </div>
        )}
        <h1 className="main-title">Welcome, {employee ? employee.name : 'Employee'}</h1>
        <p className="main-subtitle">Manage your daily shifts and log attendance seamlessly.</p>

        {/* Dynamic Employee Stats Panel */}
        <div className="dashboard-stats-grid">
          {/* Card 1: Expected Arrival, Off Time, and Lateness */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <div style={{ backgroundColor: isLateToday ? '#fee2e2' : '#d1fae5', padding: '12px', borderRadius: '12px', color: isLateToday ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', display: 'block' }}>Shift Timings</span>
              <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '700', display: 'block' }}>Start: {employee?.arrivalTime || '09:00 AM'}</span>
              <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '700', display: 'block' }}>Off Time: {employee?.departureTime || '05:00 PM'}</span>
              {todayLog && (
                <span style={{ display: 'block', fontSize: '12px', color: isLateToday ? '#ef4444' : '#10b981', fontWeight: '700', marginTop: '2px' }}>
                  {isLateToday ? '✓ Late Today' : '✓ On-Time Today'}
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Today's Shift Duration */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: '12px', color: '#1062b3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            </div>
            <div>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', display: 'block' }}>Present Hours</span>
              <span style={{ fontSize: '18px', color: '#1e293b', fontWeight: '800' }}>{todayHours} hrs</span>
            </div>
          </div>

          {/* Card 3: Weekly Dedicated hours progress */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', display: 'block' }}>Weekly Progress ({employee?.employeeType === 'intern' ? 'Intern' : 'Employee'})</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px', color: '#1e293b', fontWeight: '800' }}>{weeklyHoursCompleted} / {employee?.weeklyHours || 40} hrs</span>
                  {parseFloat(weeklyHoursCompleted) > (employee?.weeklyHours || 40) && (
                    <span style={{ fontSize: '11px', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                      +{(parseFloat(weeklyHoursCompleted) - (employee?.weeklyHours || 40)).toFixed(1)}h Overtime
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, (parseFloat(weeklyHoursCompleted) / (employee?.weeklyHours || 40)) * 100)}%`,
                height: '100%',
                backgroundColor: parseFloat(weeklyHoursCompleted) >= (employee?.weeklyHours || 40) ? '#16a34a' : '#1062b3',
                borderRadius: '4px',
                transition: 'width 0.5s ease-out'
              }}></div>
            </div>
          </div>
        </div>

        {/* Shift status card */}
        <div className="status-shift-card" style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
          border: '1px solid #e2e8f0',
          width: '100%',
          maxWidth: '600px',
          margin: '0 auto 32px auto',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Today's Shift Status</h2>
          <div className={`status-badge ${getStatusClass()}`} style={{
            display: 'inline-block',
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: '600',
            fontSize: '14px',
            marginBottom: '20px',
            textTransform: 'uppercase'
          }}>
            {getStatusText()}
          </div>

          <div style={{ marginTop: '8px' }}>
            {(!todayLog || todayLog.checkOut === '--:--') ? (
              <button 
                disabled={employee && !employee.isActive}
                onClick={() => navigate('/scan', { state: { employeeId: employee?.employeeId } })}
                style={{
                  padding: '14px 28px',
                  backgroundColor: (employee && !employee.isActive) ? '#cbd5e1' : (!todayLog ? '#10b981' : '#f43f5e'),
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: (employee && !employee.isActive) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s ease',
                  width: '100%',
                  maxWidth: '300px'
                }}
              >
                {!todayLog ? 'Check In Now' : 'Check Out Now'}
              </button>
            ) : (
              <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '500' }}>You have completed your shift today.</p>
            )}
          </div>
        </div>

        {/* Attendance Summary Card */}
        <div className="dashboard-weekly-summary-card" style={{ position: 'relative' }}>
          {(() => {
            const now = new Date();
            
            // Calculate active timeline month and year based on dateOffset and viewMode
            const activePeriodDate = new Date(now.getFullYear(), now.getMonth() + (viewMode === 'month' ? dateOffset : Math.floor(dateOffset * 7 / 30)), 1);
            const activeYear = activePeriodDate.getFullYear();
            const activeMonth = activePeriodDate.getMonth();

            let periodLabel = '';
            if (viewMode === 'week') {
              const startOfWeek = new Date(now);
              const day = startOfWeek.getDay();
              const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1) + (dateOffset * 7);
              startOfWeek.setDate(diff);
              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 4);
              const startStr = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const endStr = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              periodLabel = `${startStr} – ${endStr}`;
            } else {
              periodLabel = activePeriodDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }

            const handleTimelineMonthChange = (e) => {
              const selectedMonth = parseInt(e.target.value, 10);
              const monthDiff = (activeYear - now.getFullYear()) * 12 + (selectedMonth - now.getMonth());
              setDateOffset(monthDiff);
            };

            const handleTimelineYearChange = (e) => {
              const selectedYear = parseInt(e.target.value, 10);
              const monthDiff = (selectedYear - now.getFullYear()) * 12 + (activeMonth - now.getMonth());
              setDateOffset(monthDiff);
            };

            const days = [];
            let totalHours = 0;
            let periodGoal = employee?.weeklyHours || 40;

            if (viewMode === 'week') {
              const startOfWeek = new Date(now);
              const day = startOfWeek.getDay();
              const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1) + (dateOffset * 7);
              startOfWeek.setDate(diff);
              
              for (let i = 0; i < 7; i++) {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                days.push(d);
              }
            } else {
              periodGoal = (employee?.weeklyHours || 40) * 4;
              const startOfMonth = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + dateOffset + 1, 0).getDate();
              for (let i = 1; i <= daysInMonth; i++) {
                const d = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), i);
                days.push(d);
              }
            }

            const dayDataArr = days.map(d => {
              const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const log = allLogs.find(l => l.date === dateStr);
              const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
              const hoursNum = log ? calculateHours(log.checkIn, log.checkOut === '--:--' ? new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : log.checkOut) : 0;
              totalHours += hoursNum;
              return { dateStr, dayName, log, d, hours: hoursNum.toFixed(1) };
            });
            
            const isPast = dateOffset < 0;
            const goalMet = totalHours >= periodGoal;

            const yearsList = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
            const monthsList = [
              { label: 'Jan', val: 0 }, { label: 'Feb', val: 1 }, { label: 'Mar', val: 2 },
              { label: 'Apr', val: 3 }, { label: 'May', val: 4 }, { label: 'Jun', val: 5 },
              { label: 'Jul', val: 6 }, { label: 'Aug', val: 7 }, { label: 'Sep', val: 8 },
              { label: 'Oct', val: 9 }, { label: 'Nov', val: 10 }, { label: 'Dec', val: 11 }
            ];

            const upcomingHolidays = holidays.filter(h => new Date(h.date) >= new Date(new Date().setHours(0,0,0,0))).slice(0, 3);

            return (
              <>
                {/* Upcoming Holidays Banner */}
                {upcomingHolidays.length > 0 && (
                  <div style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#be123c', fontWeight: '700', fontSize: '15px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Upcoming Holidays
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
                      {upcomingHolidays.map((hol, idx) => (
                        <div key={idx} style={{ backgroundColor: '#ffffff', border: '1px solid #ffe4e6', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: '700', color: '#881337' }}>{hol.name}</span>
                          <span style={{ color: '#e11d48', fontWeight: '500' }}>
                            {new Date(hol.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modern Summary Header */}
                <div className="dashboard-summary-header">
                  <div className="summary-title-block">
                    <h2 className="summary-title">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      Attendance Summary
                    </h2>
                    <div className="summary-period-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>{periodLabel}</span>
                    </div>
                  </div>

                  <div className="summary-controls-wrapper">
                    {/* Timeline Jump: Month & Year Dropdowns */}
                    <div className="timeline-select-group">
                      <select 
                        value={activeMonth} 
                        onChange={handleTimelineMonthChange} 
                        className="timeline-select"
                        title="Select Timeline Month"
                      >
                        {monthsList.map(m => (
                          <option key={m.val} value={m.val}>{m.label}</option>
                        ))}
                      </select>

                      <select 
                        value={activeYear} 
                        onChange={handleTimelineYearChange} 
                        className="timeline-select"
                        title="Select Timeline Year"
                      >
                        {yearsList.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    {/* Action Group for View Toggle & Navigation */}
                    <div className="summary-controls-action-group">
                      {/* View Mode Segmented Pill */}
                      <div className="summary-segmented-toggle">
                        <button 
                          type="button"
                          className={`segmented-btn ${viewMode === 'week' ? 'active' : ''}`}
                          onClick={() => { setViewMode('week'); setDateOffset(0); }}
                        >
                          Week
                        </button>
                        <button 
                          type="button"
                          className={`segmented-btn ${viewMode === 'month' ? 'active' : ''}`}
                          onClick={() => { setViewMode('month'); setDateOffset(0); }}
                        >
                          Month
                        </button>
                      </div>

                      {/* Navigation Buttons Group */}
                      <div className="summary-nav-group">
                        <button 
                          type="button"
                          className="summary-nav-btn" 
                          onClick={() => setDateOffset(prev => prev - 1)}
                          title="Previous Period"
                        >
                          &lt;
                        </button>
                        <button 
                          type="button"
                          className={`summary-nav-btn current-btn ${dateOffset === 0 ? 'is-current' : ''}`} 
                          onClick={() => setDateOffset(0)}
                        >
                          Current
                        </button>
                        <button 
                          type="button"
                          className="summary-nav-btn" 
                          onClick={() => setDateOffset(prev => prev + 1)}
                          title="Next Period"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {isPast && !goalMet && (
                  <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <strong>Goal Not Reached:</strong> You completed {totalHours.toFixed(1)} hrs of your {periodGoal} hrs goal for this {viewMode}.
                  </div>
                )}
                {isPast && goalMet && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginBottom: '16px', color: '#166534', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <strong>Goal Reached!</strong> You completed {totalHours.toFixed(1)} hrs. Great job!
                  </div>
                )}
                
                <div style={{ marginBottom: '16px', fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                  Total hours for this {viewMode}: <span style={{ color: '#1e293b' }}>{totalHours.toFixed(1)} / {periodGoal}</span> hrs
                </div>

                <div style={{ overflowX: 'auto', paddingBottom: '12px', margin: '0 -16px', padding: '0 16px 12px 16px' }}>
                  <div className="dashboard-weekly-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: viewMode === 'month' ? 'repeat(auto-fill, minmax(100px, 1fr))' : 'repeat(7, minmax(85px, 1fr))',
                    gap: '12px',
                    minWidth: viewMode === 'week' ? '600px' : 'auto'
                  }}>
                  {dayDataArr.map((dayData, idx) => {
                    const { dateStr, dayName, log, d, hours } = dayData;
                    
                    let cardBg = '#f8fafc';
                    let borderColor = '#e2e8f0';
                    let statusColor = '#64748b';
                    
                    let displayStatus = 'Upcoming';
                    const nowDt = new Date();

                    const dayOfWeek = d.getDay();
                    const localDateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                    const hol = holidays.find(h => new Date(h.date).toISOString().split('T')[0] === localDateStr);
                    const isSatOff = officeSettings?.saturdayOff && dayOfWeek === 6;
                    const isWeekend = (dayOfWeek === 0) || isSatOff;
                                        
                    if (log) {
                      displayStatus = log.status;
                      if (log.status === 'Present') { cardBg = '#f0fdf4'; borderColor = '#bbf7d0'; statusColor = '#166534'; }
                      else if (log.status === 'Absent') { cardBg = '#fef2f2'; borderColor = '#fecaca'; statusColor = '#991b1b'; }
                      else if (log.status === 'Leave') { cardBg = '#faf5ff'; borderColor = '#e9d5ff'; statusColor = '#7e22ce'; }
                      else if (log.status === 'Pending') { cardBg = '#fffbeb'; borderColor = '#fde68a'; statusColor = '#92400e'; }
                    } else if (isWeekend || hol) {
                      displayStatus = hol ? hol.name : 'Weekend';
                      cardBg = '#f1f5f9';
                      borderColor = '#cbd5e1';
                      statusColor = '#475569';
                    } else if (d < new Date(nowDt.setHours(0,0,0,0))) {
                      displayStatus = 'Absent';
                      cardBg = '#fef2f2'; borderColor = '#fecaca'; statusColor = '#991b1b';
                    } else if (d.toDateString() === new Date().toDateString()) {
                      displayStatus = 'Not Checked In';
                      statusColor = '#64748b';
                    }

                    return (
                      <div key={idx} style={{
                        backgroundColor: cardBg,
                        border: `1.5px solid ${borderColor}`,
                        borderRadius: '12px',
                        padding: '12px',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>{dayName}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{dateStr.split(',')[0]}</span>
                        
                        <div style={{ margin: '4px 0' }}>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            backgroundColor: (log || displayStatus === 'Absent') ? 'rgba(255,255,255,0.6)' : '#e2e8f0',
                            color: statusColor,
                            textTransform: 'uppercase',
                            display: 'inline-block',
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>{displayStatus}</span>
                        </div>

                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>In:</span>
                            <span style={{ fontWeight: '600' }}>{log?.checkIn || '--:--'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Out:</span>
                            <span style={{ fontWeight: '600' }}>{log?.checkOut || '--:--'}</span>
                          </div>
                        </div>

                        <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: '6px', marginTop: '4px', fontSize: '12px', fontWeight: '700', color: statusColor }}>
                          {hours} hrs
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
            );
          })()}
        </div>
      </main>

      {/* Verification Modal */}
      {verifyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content profile-modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header">
              <h2>Face Verification</h2>
              <button className="btn-close-modal" onClick={() => { stopCamera(); setVerifyModalOpen(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="profile-modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={{ color: '#475569', fontSize: '14px', marginBottom: '16px' }}>Please look at the camera to verify your identity.</p>
              <div style={{ width: '250px', height: '250px', borderRadius: '50%', overflow: 'hidden', border: '4px solid #1062b3', position: 'relative', marginBottom: '16px', backgroundColor: '#e2e8f0' }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              </div>
              {verifyError && <p style={{ color: '#ef4444', fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>{verifyError}</p>}
              <button 
                className={`btn btn-primary ${isVerifyingFace ? 'btn-loading' : ''}`}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: '700' }}
                onClick={handleVerifyFace}
                disabled={isVerifyingFace}
              >
                {isVerifyingFace ? 'VERIFYING...' : 'Verify Face'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Settings Modal */}
      {profileModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content profile-modal-card">
            <div className="modal-header">
              <h2>Manage Profile</h2>
              <button className="btn-close-modal" onClick={() => setProfileModal({ isOpen: false, password: '', facePhotos: [], showPassword: false })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="profile-modal-body">
              {/* Premium Interactive Avatar Selector */}
              <div className="avatar-picker-section">
                <div className="avatar-picker-container">
                  <img 
                    src={profileModal.facePhotos[0] || employee?.photo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e2e8f0'/><path d='M20 80c0-15 12-25 30-25s30 10 30 25H20z' fill='%2364748b'/><circle cx='50' cy='40' r='15' fill='%2364748b'/></svg>"} 
                    alt="Profile Avatar" 
                    className="avatar-picker-preview" 
                  />
                  <label htmlFor="modal-avatar-upload" className="avatar-picker-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>Change Photo</span>
                  </label>
                  <input 
                    type="file" 
                    id="modal-avatar-upload"
                    accept="image/*"
                    onChange={handleProfilePhotosChange}
                    style={{ display: 'none' }}
                  />
                </div>
                <div className="avatar-picker-label">Click photo to update avatar</div>
              </div>

              {/* Employee Details Read-Only Card */}
              <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Employee ID</span>
                  <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>{employee?.employeeId}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Joining Date</span>
                  <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>{employee?.createdAt ? new Date(employee.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Current Password</span>
                  <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>{employee?.plainPassword || employee?.password || 'N/A'}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Assigned Admin</span>
                  <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>System Admin</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Department</span>
                  <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>{employee?.department || '--'}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Target Hours</span>
                  <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>{employee?.weeklyHours || 40} hrs/week</span>
                </div>
              </div>

              {/* Styled Inputs */}
              <div className="form-group-modern">
                <label className="form-label-modern">New Password</label>
                <div className="modern-input-wrapper">
                  <input 
                    type={profileModal.showPassword ? 'text' : 'password'} 
                    value={profileModal.password}
                    onChange={(e) => setProfileModal(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter new password (optional)"
                    className="modern-input"
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn"
                    onClick={() => setProfileModal(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                  >
                    {profileModal.showPassword ? (
                      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer-buttons-modern">
              <button 
                type="button" 
                className="btn-modern btn-cancel" 
                onClick={() => setProfileModal({ isOpen: false, password: '', facePhotos: [], showPassword: false })}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className={`btn-modern btn-save ${isUpdatingProfile ? 'btn-loading' : ''}`}
                onClick={handleProfileUpdate} 
                disabled={isUpdatingProfile}
              >
                {isUpdatingProfile ? <span className="spinner"></span> : 'Save & Sync'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Status Toast Notification */}
      {notification.message && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '16px 24px',
          borderRadius: '12px',
          backgroundColor: notification.type === 'error' ? '#fee2e2' : '#d1fae5',
          color: notification.type === 'error' ? '#991b1b' : '#065f46',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          fontWeight: '600',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: `1px solid ${notification.type === 'error' ? '#fca5a5' : '#6ee7b7'}`
        }}>
          {notification.type === 'error' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span>{notification.message}</span>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
