import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { compressImage } from '../../utils/imageCompression';

const EmployeeProfileModal = ({ 
  employee, 
  departments = [], 
  onClose, 
  onUpdate, 
  fetchWithAuth, 
  currentUserRole,
  allRequests = []
}) => {
  const [activeTab, setActiveTab] = useState('details'); // 'details', 'attendance', 'photos', 'requests'
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [biometricPhotos, setBiometricPhotos] = useState(null);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [officeSettings, setOfficeSettings] = useState(null);
  const [holidays, setHolidays] = useState([]);
  
  // Edit forms state for Profile Details
  const [editDetails, setEditDetails] = useState({
    name: employee.name || '',
    department: employee.department || '',
    isActive: employee.isActive !== false,
    employeeType: employee.employeeType || 'employee',
    weeklyHours: employee.weeklyHours || 40,
    arrivalTime: employee.arrivalTime || '09:00 AM',
    departureTime: employee.departureTime || '05:00 PM',
    joiningDate: employee.createdAt ? new Date(employee.createdAt).toISOString().split('T')[0] : ''
  });

  // Selected date for attendance editing
  const [selectedDate, setSelectedDate] = useState(null);
  const [editAttendance, setEditAttendance] = useState({ checkIn: '09:00 AM', checkOut: '05:00 PM', status: 'Present' });

  // Chat message state for Requests tab
  const [chatMessageText, setChatMessageText] = useState('');
  const [selectedReqId, setSelectedReqId] = useState(null);

  const convertTo24Hour = (time12) => {
    if (!time12 || time12 === '--:--') return '09:00';
    const cleaned = time12.trim().toUpperCase();
    const match = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)?$/);
    if (!match) return '09:00';
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3];
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  };

  const convertTo12Hour = (time24) => {
    if (!time24) return '--:--';
    const [h, m] = time24.split(':');
    let hours = parseInt(h, 10);
    if (isNaN(hours)) return time24;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${m} ${ampm}`;
  };

  useEffect(() => {
    if (employee) {
      fetchProfile();
      fetchPhotos();
      fetchAttendance();
      fetchOfficeSettings();
      fetchHolidays();
    }
  }, [employee]);

  const fetchHolidays = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/holidays`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHolidays(data);
      }
    } catch (err) {
      console.error('Failed to fetch holidays', err);
    }
  };

  const fetchOfficeSettings = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/settings/office`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOfficeSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch office settings', err);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(employee.employeeId || employee.id)}/profile?_t=${Date.now()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
      }
    } catch (err) {
      console.error('Failed to fetch profile', err);
    }
  };

  const fetchPhotos = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(employee.employeeId || employee.id)}/photos?_t=${Date.now()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBiometricPhotos(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch photos', err);
    }
  };

  const fetchAttendance = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/attendance/logs/${encodeURIComponent(employee.employeeId || employee.id)}?_t=${Date.now()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAttendanceLogs(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch attendance logs', err);
    }
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const empId = employee.employeeId || employee.id;
      const res = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(empId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
        body: JSON.stringify(editDetails)
      });
      
      if (editDetails.isActive !== (employee.isActive !== false)) {
        await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(empId)}/active`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
          body: JSON.stringify({ active: editDetails.isActive })
        });
      }

      if (res.ok) {
        alert('Profile details saved successfully!');
        if (onUpdate) onUpdate();
        fetchProfile();
      } else {
        alert('Failed to update profile');
      }
    } catch (err) {
      console.error('Update failed', err);
      alert('Update error');
    }
    setLoading(false);
  };

  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    let successCount = 0;
    const empId = employee.employeeId || employee.id;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const compressedBase64 = await compressImage(file, 500, 0.7);
        const res = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(empId)}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
          body: JSON.stringify({ photo: compressedBase64 })
        });
        if (res.ok) successCount++;
      } catch (err) {
        console.error('Photo upload/compression error', err);
      }
    }

    if (successCount > 0) {
      alert(`${successCount} photo(s) uploaded successfully!`);
      fetchProfile();
      fetchPhotos();
      if (onUpdate) onUpdate();
    } else {
      alert('Failed to upload photos');
    }
    setLoading(false);
  };

  const handleDeletePhoto = async (index) => {
    if (!window.confirm('Delete this face recognition snapshot?')) return;
    setLoading(true);
    try {
      const empId = employee.employeeId || employee.id;
      const res = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(empId)}/photos/${index}`, {
        method: 'DELETE',
        headers: { 'x-user-role': currentUserRole }
      });
      if (res.ok) {
        fetchProfile();
      } else {
        alert('Failed to delete photo');
      }
    } catch (err) {
      console.error('Delete error', err);
    }
    setLoading(false);
  };

  const handleSaveAttendance = async () => {
    if (!selectedDate || !editAttendance.status) {
      alert('Please fill out status field.');
      return;
    }

    const isTimeRequired = editAttendance.status === 'Present' || editAttendance.status === 'Pending';
    if (isTimeRequired && (!editAttendance.checkIn || !editAttendance.checkOut || editAttendance.checkIn === '--:--' || editAttendance.checkOut === '--:--')) {
      alert('Please fill out all attendance time fields (Check-In and Check-Out) for Present/Pending status.');
      return;
    }

    const todayMid = new Date();
    todayMid.setHours(0, 0, 0, 0);
    const selMid = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    if (selMid > todayMid && editAttendance.status === 'Present') {
      alert('Cannot mark Present for future dates. (Leave or Absent is allowed).');
      return;
    }

    setLoading(true);
    try {
      const dateStr = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const empId = employee.employeeId || employee.id;
      
      const payloadCheckIn = isTimeRequired ? editAttendance.checkIn : '--:--';
      const payloadCheckOut = isTimeRequired ? editAttendance.checkOut : '--:--';

      const res = await fetchWithAuth(`${API_BASE_URL}/api/attendance/manual-edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
        body: JSON.stringify({
          employeeId: empId,
          date: dateStr,
          status: editAttendance.status,
          checkIn: payloadCheckIn,
          checkOut: payloadCheckOut
        })
      });
      if (res.ok) {
        alert('Attendance log updated successfully!');
        fetchAttendance();
        if (onUpdate) onUpdate();
      } else {
        const errData = await res.json();
        alert(`Failed to update log: ${errData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Update log error', err);
      alert('Error updating attendance log');
    }
    setLoading(false);
  };

  const handleSendChatMessage = async (reqId) => {
    if (!chatMessageText.trim()) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/requests/${reqId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
        body: JSON.stringify({
          senderId: 'admin',
          senderName: 'Admin',
          text: chatMessageText.trim()
        })
      });
      if (res.ok) {
        setChatMessageText('');
        fetchProfile();
        fetchPhotos();
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  // Filter requests & pending logs for this employee
  const empIdStr = String(employee.employeeId || employee.id || '').trim();
  const empIdAltStr = String(employee.id || employee.employeeId || '').trim();

  const employeeRequests = (allRequests || []).filter(r => {
    const rEmpId = String(r.employeeId || '').trim();
    return Boolean(rEmpId && (rEmpId === empIdStr || rEmpId === empIdAltStr));
  });

  const pendingAttendanceLogs = (attendanceLogs || []).filter(l => l.status === 'Pending' || l.verificationStatus === 'Pending');

  // Compute attendance stats
  const presentLogsCount = attendanceLogs.filter(l => l.status === 'Present').length;
  const absentLogsCount = attendanceLogs.filter(l => l.status === 'Absent').length;
  const leaveLogsCount = attendanceLogs.filter(l => l.status === 'Leave').length;

  // Calendar rendering logic
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

    const getLogForDate = (date) => {
      if (!date) return null;
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return attendanceLogs.find(l => l.date === dateStr);
    };

    const getDayBadgeStyle = (log, dateObj) => {
      if (log) {
        if (log.status === 'Present') return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: log.isLate ? 'Late' : 'Present' };
        if (log.status === 'Absent') return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'Absent' };
        if (log.status === 'Leave') return { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', label: 'Leave' };
        return { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'Pending' };
      }
      if (dateObj) {
        const dayOfWeek = dateObj.getDay();
        const month = dateObj.getMonth();
        const dayNum = dateObj.getDate();
        
        const dateStr = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const hol = holidays.find(h => new Date(h.date).toISOString().split('T')[0] === dateStr);
        const isSaturdayOff = officeSettings?.saturdayOff && dayOfWeek === 6;
        const isSunday = dayOfWeek === 0;

        
        if (isSunday || isSaturdayOff || hol) {
          return { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1', label: 'Holiday' };
        }
      }
      return { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0', label: '' };
    };

    return (
      <div className="beauty-calendar-card">
        <div className="beauty-cal-header">
          <button type="button" className="beauty-cal-btn" onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h4 className="beauty-cal-title">
            {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h4>
          <button type="button" className="beauty-cal-btn" onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div className="beauty-cal-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="beauty-cal-weekday">{d}</div>
          ))}
          {days.map((date, idx) => {
            const log = getLogForDate(date);
            const badge = getDayBadgeStyle(log, date);
            const isSelected = selectedDate && date && selectedDate.toDateString() === date.toDateString();

            return (
              <div 
                key={idx} 
                onClick={() => {
                  if (date) {
                    setSelectedDate(date);
                    setEditAttendance({
                      checkIn: (log?.checkIn && log.checkIn !== '--:--') ? log.checkIn : '09:00 AM',
                      checkOut: (log?.checkOut && log.checkOut !== '--:--') ? log.checkOut : '05:00 PM',
                      status: log?.status || 'Present'
                    });
                  }
                }}
                className={`beauty-cal-day ${date ? 'has-date' : 'empty'} ${isSelected ? 'selected' : ''}`}
                style={{ 
                  backgroundColor: date ? badge.bg : 'transparent',
                  borderColor: isSelected ? '#1062b3' : (date ? badge.border : 'transparent'),
                  color: date ? badge.color : 'transparent'
                }}
              >
                <span className="day-number">{date ? date.getDate() : ''}</span>
                {date && badge.label && <span className="day-tag">{badge.label}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay beauty-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="beauty-profile-modal">
        {/* Web Theme Header */}
        <div className="beauty-hero-header">
          <div className="beauty-hero-profile">
            <div className="avatar-wrapper">
              <img 
                src={profileData?.facePhoto || employee.photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'} 
                alt={employee.name} 
                className="beauty-hero-avatar" 
              />
              <span className={`status-dot ${editDetails.isActive ? 'active' : 'inactive'}`}></span>
            </div>

            <div className="beauty-hero-meta">
              <div className="hero-name-row">
                <h2>{employee.name}</h2>
                <span className={`beauty-badge ${editDetails.isActive ? 'badge-green' : 'badge-amber'}`}>
                  {editDetails.isActive ? 'Active Staff' : 'Inactive'}
                </span>
              </div>
              <p className="hero-subtext">
                <span>ID: <strong>{employee.employeeId || employee.id}</strong></span>
                <span className="dot-sep">&bull;</span>
                <span>{employee.department}</span>
                <span className="dot-sep">&bull;</span>
                <span style={{ textTransform: 'capitalize' }}>{employee.employeeType || 'employee'}</span>
              </p>
            </div>

            {/* Quick Stats Pills */}
            <div className="beauty-stats-pills">
              <div className="stat-pill present">
                <span className="pill-num">{presentLogsCount}</span>
                <span className="pill-lbl">Present</span>
              </div>
              <div className="stat-pill absent">
                <span className="pill-num">{absentLogsCount}</span>
                <span className="pill-lbl">Absent</span>
              </div>
              <div className="stat-pill leave">
                <span className="pill-num">{leaveLogsCount}</span>
                <span className="pill-lbl">On Leave</span>
              </div>
            </div>

            {/* Close Button */}
            <button className="beauty-close-circle-btn" onClick={onClose} title="Close Profile">&times;</button>
          </div>

          {/* Floating Segmented Tabs */}
          <div className="beauty-tabs-nav">
            <button className={`beauty-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Profile Info
            </button>
            <button className={`beauty-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Attendance & Timings
            </button>
            <button 
              className={`beauty-tab ${activeTab === 'photos' ? 'active' : ''}`}
              onClick={() => setActiveTab('photos')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Biometric Photos ({biometricPhotos?.length || 0})
            </button>
            <button className={`beauty-tab ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Requests & Logs ({employeeRequests.length + pendingAttendanceLogs.length})
            </button>
          </div>
        </div>

        {/* Modal Scroll Body */}
        <div className="beauty-modal-body">
          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <form onSubmit={handleDetailsSubmit} className="beauty-form-container">
              <div className="beauty-form-grid">
                <div className="beauty-field-card">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    className="beauty-input" 
                    value={editDetails.name} 
                    onChange={e => setEditDetails({...editDetails, name: e.target.value})} 
                    required 
                  />
                </div>

                <div className="beauty-field-card">
                  <label>Department</label>
                  <select 
                    className="beauty-select" 
                    value={editDetails.department} 
                    onChange={e => setEditDetails({...editDetails, department: e.target.value})}
                  >
                    {departments.map(d => (
                      <option key={d._id || d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="beauty-field-card">
                  <label>Employment Role / Type</label>
                  <select 
                    className="beauty-select" 
                    value={editDetails.employeeType} 
                    onChange={e => setEditDetails({...editDetails, employeeType: e.target.value})}
                  >
                    <option value="full-time">Full-Time Staff</option>
                    <option value="part-time">Part-Time Staff</option>
                    <option value="contract">Contractor</option>
                    <option value="intern">Intern</option>
                    <option value="employee">Standard Employee</option>
                  </select>
                </div>

                <div className="beauty-field-card">
                  <label>Weekly Hours Goal</label>
                  <input 
                    type="number" 
                    className="beauty-input" 
                    value={editDetails.weeklyHours} 
                    onChange={e => setEditDetails({...editDetails, weeklyHours: e.target.value})} 
                  />
                </div>

                <div className="beauty-field-card">
                  <label>Shift Arrival Time</label>
                  <input 
                    type="time" 
                    className="beauty-input" 
                    value={convertTo24Hour(editDetails.arrivalTime)} 
                    onChange={e => setEditDetails({...editDetails, arrivalTime: convertTo12Hour(e.target.value)})} 
                  />
                </div>

                <div className="beauty-field-card">
                  <label>Shift Departure Time</label>
                  <input 
                    type="time" 
                    className="beauty-input" 
                    value={convertTo24Hour(editDetails.departureTime)} 
                    onChange={e => setEditDetails({...editDetails, departureTime: convertTo12Hour(e.target.value)})} 
                  />
                </div>

                <div className="beauty-field-card">
                  <label>Joining Date</label>
                  <input 
                    type="date" 
                    className="beauty-input" 
                    value={editDetails.joiningDate} 
                    onChange={e => setEditDetails({...editDetails, joiningDate: e.target.value})} 
                  />
                </div>

                <div className="beauty-field-card">
                  <label>Account Access Status</label>
                  <select 
                    className="beauty-select" 
                    value={editDetails.isActive ? 'true' : 'false'} 
                    onChange={e => setEditDetails({...editDetails, isActive: e.target.value === 'true'})}
                  >
                    <option value="true">Active (System Access Enabled)</option>
                    <option value="false">Inactive (Suspended Access)</option>
                  </select>
                </div>
              </div>

              <div className="beauty-form-actions">
                <button type="button" className="beauty-cancel-btn" onClick={onClose}>
                  Cancel / Close
                </button>
                <button type="submit" className="beauty-primary-btn" disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {loading ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ATTENDANCE & TIMINGS */}
          {activeTab === 'attendance' && (
            <div className="beauty-attendance-layout">
              <div className="cal-side">
                {renderCalendar()}
              </div>

              <div className="inspector-side">
                {selectedDate ? (
                  <div className="beauty-inspector-card">
                    <div className="inspector-title-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <h4>
                        {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </h4>
                    </div>

                    {selectedDate && (new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()) > new Date(new Date().setHours(0,0,0,0))) && (
                      <div style={{ backgroundColor: editAttendance.status === 'Present' ? '#fef2f2' : '#eff6ff', border: editAttendance.status === 'Present' ? '1px solid #fecaca' : '1px solid #bfdbfe', color: editAttendance.status === 'Present' ? '#dc2626' : '#1e40af', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', marginBottom: '12px' }}>
                        {editAttendance.status === 'Present' ? '⚠️ Invalid Log: This future date is currently marked "Present". Click "Clear Log (Null)" below to remove it.' : 'ℹ️ Future Date: Marking "Present" is disabled, but "On Leave" is allowed.'}
                      </div>
                    )}

                    <div className="inspector-fields">
                      {(editAttendance.status === 'Present' || editAttendance.status === 'Pending') && (
                        <>
                          <div className="field-box">
                            <label>Check In Time</label>
                            <input 
                              type="time" 
                              className="beauty-input" 
                              value={convertTo24Hour(editAttendance.checkIn)} 
                              onChange={e => setEditAttendance({...editAttendance, checkIn: convertTo12Hour(e.target.value)})} 
                            />
                          </div>

                          <div className="field-box">
                            <label>Check Out Time</label>
                            <input 
                              type="time" 
                              className="beauty-input" 
                              value={convertTo24Hour(editAttendance.checkOut)} 
                              onChange={e => setEditAttendance({...editAttendance, checkOut: convertTo12Hour(e.target.value)})} 
                            />
                          </div>
                        </>
                      )}

                      <div className="field-box">
                        <label>Status Mark</label>
                        <select 
                          className="beauty-select" 
                          value={editAttendance.status} 
                          onChange={e => setEditAttendance({...editAttendance, status: e.target.value})}
                        >
                          <option value="Present" disabled={selectedDate && (new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()) > new Date(new Date().setHours(0,0,0,0)))}>
                            Present {selectedDate && (new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()) > new Date(new Date().setHours(0,0,0,0))) ? '(Disabled in Future)' : ''}
                          </option>
                          <option value="Absent">Absent</option>
                          <option value="Leave">On Leave (Allowed in Future)</option>
                          <option value="Pending">Pending</option>
                          <option value="Clear">Clear Record (Set to Null / None)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        type="button" 
                        className="beauty-cancel-btn"
                        onClick={onClose}
                      >
                        Cancel
                      </button>

                      {attendanceLogs.some(l => l.date === selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) && (
                        <button 
                          type="button" 
                          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                          disabled={loading}
                          onClick={async () => {
                            if (!selectedDate) return;
                            if (!window.confirm('Clear and remove attendance record for this date?')) return;
                            setEditAttendance(prev => ({ ...prev, status: 'Clear' }));
                            setLoading(true);
                            try {
                              const dateStr = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                              const empId = employee.employeeId || employee.id;
                              const res = await fetchWithAuth(`${API_BASE_URL}/api/attendance/manual-edit`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
                                body: JSON.stringify({
                                  employeeId: empId,
                                  date: dateStr,
                                  status: 'Clear',
                                  checkIn: '--:--',
                                  checkOut: '--:--'
                                })
                              });

                              if (res.ok) {
                                alert('Attendance record cleared / set to null successfully!');
                                fetchAttendance();
                                if (onUpdate) onUpdate();
                              } else {
                                alert('Failed to clear attendance record');
                              }
                            } catch (err) {
                              console.error('Clear log error', err);
                              alert('Error clearing attendance log');
                            }
                            setLoading(false);
                          }}
                        >
                          Clear Log (Null)
                        </button>
                      )}

                      <button 
                        type="button" 
                        className="beauty-save-btn" 
                        disabled={loading}
                        onClick={handleSaveAttendance}
                      >
                        Update Timing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="beauty-placeholder-card">
                    <div className="icon-circle">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <p>Select any day on the monthly calendar to inspect or adjust check-in / check-out times.</p>
                  </div>
                )}

                {/* Timeline Cards History */}
                <div className="beauty-history-section">
                  <h5>Recent Attendance Logs</h5>
                  <div className="history-scroll-box">
                    {attendanceLogs.length > 0 ? (
                      attendanceLogs.map((l, i) => (
                        <div key={l._id || i} className="history-row-card">
                          <div className="history-date">
                            <span className="d-text">{l.date}</span>
                          </div>
                          <div className="history-times">
                            <span>In: <strong>{l.checkIn || '--:--'}</strong></span>
                            <span>Out: <strong>{l.checkOut || '--:--'}</strong></span>
                          </div>
                          <span className={`beauty-badge ${l.status === 'Present' ? 'badge-green' : (l.status === 'Absent' ? 'badge-red' : 'badge-purple')}`}>
                            {l.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="no-logs">No past logs recorded.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BIOMETRIC PHOTOS */}
          {activeTab === 'photos' && (
            <div className="beauty-photos-section">
              <div className="photos-banner">
                <div>
                  <h4>Biometric Face Snapshots</h4>
                  <p>Clear face images ensure fast and accurate automatic recognition during daily check-ins.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="beauty-cancel-btn" onClick={onClose}>
                    Cancel
                  </button>
                  <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} id="beauty-photo-input" style={{ display: 'none' }} />
                  <label htmlFor="beauty-photo-input" className="beauty-primary-btn" style={{ cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {loading ? 'Uploading...' : 'Upload Face Snapshot'}
                  </label>
                </div>
              </div>

              <div className="beauty-photos-grid">
                {biometricPhotos?.map((photo, index) => (
                  <div key={index} className="beauty-photo-tile">
                    <img src={photo} alt={`Biometric ${index + 1}`} />
                    {biometricPhotos?.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => handleDeletePhoto(index)}
                        className="photo-del-btn"
                        title="Delete Snapshot"
                      >
                        &times;
                      </button>
                    )}
                    <div className="tile-overlay">
                      <span>Snapshot #{index + 1}</span>
                    </div>
                  </div>
                ))}

                {(!biometricPhotos || biometricPhotos.length === 0) && (
                  <div className="no-photos-box">
                    <p>No biometric photos uploaded yet for this employee profile.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REQUESTS & LOGS */}
          {activeTab === 'requests' && (
            <div className="beauty-requests-section">
              {(pendingAttendanceLogs.length > 0 || employeeRequests.length > 0) ? (
                <div className="requests-feed">
                  {/* Render Pending Attendance Verification Logs */}
                  {pendingAttendanceLogs.map((log) => (
                    <div key={log._id} className="request-feed-card" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
                      <div className="feed-card-header">
                        <div className="title-row">
                          <span className="req-type" style={{ color: '#b45309', fontWeight: '700' }}>⚠️ Attendance Log Verification</span>
                          <span className="req-date">&bull; {log.date}</span>
                        </div>
                        <span className="beauty-badge badge-amber">Pending Admin Verification</span>
                      </div>

                      <p className="req-reason" style={{ margin: '8px 0 12px 0' }}>
                        <strong>Recorded Timings:</strong> In: <strong>{log.checkIn || '--:--'}</strong> | Out: <strong>{log.checkOut || '--:--'}</strong>
                      </p>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="beauty-save-btn"
                          style={{ padding: '6px 14px', fontSize: '13px', backgroundColor: '#10b981', borderColor: '#10b981' }}
                          disabled={loading}
                          onClick={async () => {
                            setLoading(true);
                            try {
                              const empId = employee.employeeId || employee.id;
                              const res = await fetchWithAuth(`${API_BASE_URL}/api/attendance/manual-edit`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
                                body: JSON.stringify({
                                  employeeId: empId,
                                  date: log.date,
                                  status: 'Present',
                                  checkIn: log.checkIn || '09:00 AM',
                                  checkOut: log.checkOut || '05:00 PM'
                                })
                              });
                              if (res.ok) {
                                alert('Attendance log verified & approved as Present!');
                                fetchAttendance();
                                if (onUpdate) onUpdate();
                              } else {
                                alert('Failed to verify attendance');
                              }
                            } catch (err) {
                              console.error('Verify log error', err);
                            }
                            setLoading(false);
                          }}
                        >
                          Approve & Mark Present
                        </button>

                        <button
                          type="button"
                          style={{ padding: '6px 14px', fontSize: '13px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}
                          disabled={loading}
                          onClick={async () => {
                            setLoading(true);
                            try {
                              const empId = employee.employeeId || employee.id;
                              const res = await fetchWithAuth(`${API_BASE_URL}/api/attendance/manual-edit`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'x-user-role': currentUserRole },
                                body: JSON.stringify({
                                  employeeId: empId,
                                  date: log.date,
                                  status: 'Absent',
                                  checkIn: '--:--',
                                  checkOut: '--:--'
                                })
                              });
                              if (res.ok) {
                                alert('Log rejected & marked as Absent!');
                                fetchAttendance();
                                if (onUpdate) onUpdate();
                              } else {
                                alert('Failed to reject log');
                              }
                            } catch (err) {
                              console.error('Reject log error', err);
                            }
                            setLoading(false);
                          }}
                        >
                          Mark Absent
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Render Correction / Leave Requests */}
                  {employeeRequests.map((req) => (
                    <div key={req._id} className="request-feed-card">
                      <div className="feed-card-header">
                        <div className="title-row">
                          <span className="req-type">{req.requestType || req.type || 'Correction'} Request</span>
                          <span className="req-date">&bull; {req.date || (req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A')}</span>
                        </div>
                        <span className={`beauty-badge ${req.status === 'Approved' ? 'badge-green' : (req.status === 'Rejected' ? 'badge-red' : 'badge-amber')}`}>
                          {req.status}
                        </span>
                      </div>

                      <p className="req-reason">
                        <strong>Reason:</strong> {req.details || req.reason || 'No description provided.'}
                      </p>

                      {req.messages && req.messages.length > 0 && (
                        <div className="chat-bubble-stream">
                          {req.messages.map((msg, idx) => (
                            <div key={idx} className={`chat-bubble ${msg.senderId === 'admin' ? 'admin' : 'user'}`}>
                              <span className="sender">{msg.senderName}</span>
                              <span className="msg-txt">{msg.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="reply-input-bar">
                        <input 
                          type="text" 
                          placeholder="Type reply to employee..." 
                          className="beauty-input" 
                          value={selectedReqId === req._id ? chatMessageText : ''}
                          onChange={(e) => {
                            setSelectedReqId(req._id);
                            setChatMessageText(e.target.value);
                          }}
                        />
                        <button 
                          type="button"
                          className="beauty-primary-btn compact"
                          onClick={() => handleSendChatMessage(req._id)}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-requests-box">
                  <p>No requests or approval logs filed by this employee.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfileModal;
