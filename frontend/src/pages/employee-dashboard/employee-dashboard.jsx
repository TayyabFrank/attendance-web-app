import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import Clock from '../../utils/Clock';
import './employee-dashboard.css';

const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [logs, setLogs] = useState([]);
  const [holidays, setHolidays] = useState([]);

  // Profile Card States
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Webcam PFP States
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const empData = localStorage.getItem('employee');
    if (!empData) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(empData);
    setEmployee(parsed);

    // Fetch personal attendance logs and holidays concurrently
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const [logsRes, holidaysRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/attendance/logs/${parsed.employeeId}`),
          fetch(`${API_BASE_URL}/api/holidays`)
        ]);

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData);
        }
        if (holidaysRes.ok) {
          const holidaysData = await holidaysRes.json();
          setHolidays(holidaysData);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      }
    };
    fetchData();
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
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (_) {}
      streamRef.current = null;
    }
    setCameraActive(false);
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      alert('Could not start camera. Please ensure permissions are granted.');
    }
  };

  const handleCapturePfp = async () => {
    if (!videoRef.current || !cameraActive) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const newPhoto = canvas.toDataURL('image/jpeg');
      
      const response = await fetch(`${API_BASE_URL}/api/employees/${employee.employeeId}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facePhoto: newPhoto })
      });
      
      if (response.ok) {
        const updated = { ...employee, facePhoto: newPhoto };
        setEmployee(updated);
        localStorage.setItem('employee', JSON.stringify(updated));
        setShowWebcamModal(false);
        stopCamera();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update photo');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating profile picture');
    }
  };

  if (!employee) return <div>Loading...</div>;

  const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e8ecf4'/><circle cx='50' cy='35' r='18' fill='%231062b3'/><path d='M15 82c0-18 15-32 35-32s35 14 35 32H15z' fill='%231062b3'/></svg>";
  const displayAvatar = employee.facePhoto || fallbackAvatar;

  // Calculate approximate joining date from MongoDB ObjectID if present, else default
  const joiningDate = employee._id 
    ? new Date(parseInt(employee._id.substring(0, 8), 16) * 1000).toLocaleDateString()
    : 'Unknown';

  const timeToMins = (tStr) => {
    if (!tStr || tStr === '--:--') return 0;
    const cleaned = tStr.trim().toUpperCase();
    const ampmMatch = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = parseInt(ampmMatch[2], 10);
      if (ampmMatch[3] === 'PM' && h !== 12) h += 12;
      if (ampmMatch[3] === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }
    return 0;
  };

  const getWeeklyHoursVal = () => {
    if (!Array.isArray(logs)) return '0.0';
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    let total = 0;
    logs.forEach(log => {
      if (log.checkIn && log.checkIn !== '--:--' && log.checkOut && log.checkOut !== '--:--') {
        const inM = timeToMins(log.checkIn);
        const outM = timeToMins(log.checkOut);
        if (outM > inM) total += (outM - inM) / 60;
      }
    });
    return total.toFixed(1);
  };

  const weeklyCompleted = getWeeklyHoursVal();

  return (
    <div className="employee-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-left" onClick={() => setShowProfileCard(true)}>
          <img src={displayAvatar} alt="Profile" className="header-avatar" />
          <div>
            <h1>Welcome, {employee.name}</h1>
            <p>Role: {employee.role} | Department: {employee.department}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Clock format="timeDate" />
          <button className="logout-btn" onClick={() => { localStorage.clear(); navigate('/login'); }}>Logout</button>
        </div>
      </header>

      {showProfileCard && (
        <div className="profile-modal-overlay" onClick={() => setShowProfileCard(false)}>
          <div className="profile-card" onClick={e => e.stopPropagation()}>
            <button className="profile-card-close" onClick={() => setShowProfileCard(false)}>&times;</button>
            <img src={displayAvatar} alt="Avatar" className="profile-card-avatar" />
            <h2>{employee.name}</h2>
            <div className="profile-card-role">{employee.department}</div>
            
            <div className="profile-details">
              <div className="profile-detail-item">
                <span className="profile-detail-label">Employee ID</span>
                <span className="profile-detail-value">{employee.employeeId}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Joining Date</span>
                <span className="profile-detail-value">{joiningDate}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Password</span>
                <span className="profile-detail-value">
                  {showPassword ? (employee?.plainPassword || employee?.password || 'N/A') : '••••••••'}
                  <button className="pw-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Weekly Expected Hours</span>
                <span className="profile-detail-value">{employee.weeklyHours}h</span>
              </div>
            </div>

            <button 
              className="change-pfp-btn" 
              onClick={() => {
                setShowWebcamModal(true);
                startCamera();
              }}
            >
              Change Profile Picture
            </button>
          </div>
        </div>
      )}

      {showWebcamModal && (
        <div className="webcam-modal-overlay">
          <div className="webcam-container">
            {cameraActive ? (
              <video ref={videoRef} autoPlay playsInline muted className="webcam-video" />
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Starting camera...</div>
            )}
          </div>
          <div className="webcam-actions">
            <button className="btn-capture" onClick={handleCapturePfp}>Capture & Save</button>
            <button className="btn-cancel" onClick={() => { setShowWebcamModal(false); stopCamera(); }}>Cancel</button>
          </div>
        </div>
      )}

      <section className="stats-section">
        <div className="stat-card">
          <h3>Your Weekly Hours</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <p style={{ margin: 0, fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>{weeklyCompleted} / {employee.weeklyHours || 40} hrs</p>
            {parseFloat(weeklyCompleted) > (employee.weeklyHours || 40) && (
              <span style={{ fontSize: '11px', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                +{(parseFloat(weeklyCompleted) - (employee.weeklyHours || 40)).toFixed(1)}h Overtime
              </span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <h3>Shift Timings</h3>
          <p>{employee.arrivalTime} - {employee.departureTime}</p>
        </div>
        <div className="stat-card upcoming-holidays" style={{ minWidth: '250px' }}>
          <h3>Upcoming Holidays</h3>
          <div style={{ marginTop: '10px', maxHeight: '100px', overflowY: 'auto' }}>
            {holidays.filter(h => new Date(h.date) >= new Date(new Date().setHours(0,0,0,0))).slice(0, 3).map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>{h.name}</span>
                <span style={{ fontSize: '13px', color: '#64748b' }}>{new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
            {holidays.filter(h => new Date(h.date) >= new Date(new Date().setHours(0,0,0,0))).length === 0 && (
              <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>No upcoming holidays.</p>
            )}
          </div>
        </div>
      </section>

      <section className="logs-section">
        <h2>My Attendance History</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Check In</th>
              <th>Check Out</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(logs) ? logs.map((log, index) => (
              <tr key={index}>
                <td>{log.date}</td>
                <td>{log.status}</td>
                <td>{log.checkIn || '--:--'}</td>
                <td>{log.checkOut || '--:--'}</td>
              </tr>
            )) : <tr><td colSpan="4">No logs found or error fetching logs.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default EmployeeDashboard;
