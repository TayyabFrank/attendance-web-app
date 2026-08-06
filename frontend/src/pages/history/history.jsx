import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import './history.css';

import { useEffect } from 'react';

const History = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ present: 0, absent: 0, percentage: 100 });
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'Logs');
  const [adminsList, setAdminsList] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState('all');
  const [employeeRequests, setEmployeeRequests] = useState([]);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [requestModal, setRequestModal] = useState({ isOpen: false, type: '', details: '' });
  const [profileModal, setProfileModal] = useState({ isOpen: false, password: '', pin: '', facePhotos: [], showPassword: false });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [activeChatRequestId, setActiveChatRequestId] = useState(null);
  const [chatMessageText, setChatMessageText] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [officeSettings, setOfficeSettings] = useState(null);
  const [holidays, setHolidays] = useState([]);

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

  const getWeeklyHours = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    let totalMinutes = 0;
    logs.forEach(log => {
      const logDate = new Date(log.date);
      if (logDate >= startOfWeek && logDate <= now) {
        if (log.checkIn && log.checkIn !== '--:--' && log.checkOut && log.checkOut !== '--:--') {
          totalMinutes += (timeToMinutes(log.checkOut) - timeToMinutes(log.checkIn));
        }
      }
    });
    return (totalMinutes / 60).toFixed(1);
  };

  const fetchEmployeeRequests = async (empId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/requests/employee/${empId}`);
      if (res.ok) {
        const data = await res.json();
        setEmployeeRequests(data);

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

  const handleApprovalsTabClick = () => {
    setActiveTab('Approvals');
    if (employee) {
      const acknowledged = {};
      employeeRequests.forEach(req => {
        acknowledged[req._id] = req.status;
      });
      localStorage.setItem(`ack_requests_${employee.employeeId}`, JSON.stringify(acknowledged));
      setNotificationsCount(0);
    }
  };

  const getNotificationsList = () => {
    const list = [];
    const weeklyHoursNum = parseFloat(getWeeklyHours());
    const targetHours = employee?.weeklyHours || 40;

    // 1. Expected Weekly Hours warning
    if (weeklyHoursNum < targetHours * 0.5) {
      list.push({
        id: 'warning_hours',
        category: 'WARNING',
        title: 'Salary Off Warning',
        text: `You have completed only ${weeklyHoursNum}h out of ${targetHours}h this week. Complete your hours to avoid salary deduction.`,
        color: '#dc2626',
        bgColor: '#fef2f2'
      });
    }

    // 2. Late warning today
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const todayLog = logs.find(l => l.date === todayStr);
    if (todayLog?.isLate) {
      list.push({
        id: 'warning_late',
        category: 'WARNING',
        title: 'Late Arrival Notice',
        text: `You arrived late today at ${todayLog.checkIn} (Expected: ${employee?.arrivalTime || '09:00 AM'}).`,
        color: '#d97706',
        bgColor: '#fffbeb'
      });
    }

    // 3. Holidays
    const dayOfWeek = now.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    if (isWeekend) {
      list.push({
        id: 'holiday_weekend',
        category: 'HOLIDAY',
        title: 'Weekly Off-Day',
        text: 'Today is a weekend holiday. Logs submitted now will require admin approval.',
        color: '#2563eb',
        bgColor: '#eff6ff'
      });
    }

    // 4. Admin Message broadcast
    if (employee?.adminMessage) {
      list.push({
        id: 'broadcast_msg',
        category: 'ANNOUNCEMENT',
        title: 'Admin Broadcast',
        text: employee.adminMessage,
        color: '#7c3aed',
        bgColor: '#f5f3ff'
      });
    }

    // 5. Correction / Approval status updates
    employeeRequests.forEach(req => {
      if (req.status !== 'Pending') {
        list.push({
          id: `req_status_${req._id}`,
          category: 'APPROVAL',
          title: `Correction ${req.status}`,
          text: `Your correction request '${req.details}' was ${req.status.toLowerCase()}.`,
          color: req.status === 'Approved' ? '#10b981' : '#ef4444',
          bgColor: req.status === 'Approved' ? '#ecfdf5' : '#fef2f2'
        });
      }

      const adminMessages = req.messages?.filter(m => m.senderRole === 'admin') || [];
      if (adminMessages.length > 0) {
        const lastMsg = adminMessages[adminMessages.length - 1];
        list.push({
          id: `req_chat_${req._id}`,
          category: 'CORRECTION CHAT',
          title: `Admin Reply - ${req.requestType}`,
          text: `"${lastMsg.text}" - from ${lastMsg.senderName}`,
          color: '#0284c7',
          bgColor: '#f0f9ff'
        });
      }
    });

    return list;
  };

  const handleToggleChat = async (requestId) => {
    if (activeChatRequestId === requestId) {
      setActiveChatRequestId(null);
    } else {
      setActiveChatRequestId(requestId);
      try {
        await fetch(`${API_BASE_URL}/api/requests/${requestId}/employee-seen`, { method: 'POST' });
        if (employee) {
          fetchEmployeeRequests(employee.employeeId);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSendChatMessage = async (requestId) => {
    if (!chatMessageText.trim() || !employee) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/requests/${requestId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: employee.employeeId,
          senderName: employee.name,
          senderRole: 'employee',
          text: chatMessageText.trim()
        })
      });
      if (response.ok) {
        setChatMessageText('');
        fetchEmployeeRequests(employee.employeeId);
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData.error || 'Failed to send reply.');
      }
    } catch (err) {
      console.error(err);
      alert('Error sending message: ' + (err.message || 'Network error'));
    }
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
      if (profileModal.pin) payload.pin = profileModal.pin;
      if (profileModal.facePhotos.length > 0) payload.facePhotos = profileModal.facePhotos;

      const response = await fetch(`${API_BASE_URL}/api/employees/${employee.employeeId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        alert('Profile updated and synced successfully!');
        const updatedEmp = {
          ...employee,
          ...(data.facePhoto ? { photo: data.facePhoto, facePhoto: data.facePhoto } : {}),
          ...(profileModal.password ? { plainPassword: profileModal.password, password: profileModal.password } : {})
        };
        setEmployee(updatedEmp);
        try {
          localStorage.setItem('employee', JSON.stringify(updatedEmp));
        } catch (e) {}
        setProfileModal({ isOpen: false, password: '', pin: '', facePhotos: [] });
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to update profile.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error updating profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  useEffect(() => {
    const loggedEmployee = localStorage.getItem('employee');
    if (!loggedEmployee) {
      alert('Please login first.');
      navigate('/login');
      return;
    }
    const emp = JSON.parse(loggedEmployee);
    setEmployee(emp);

    // Fetch latest profile from API to update local details like adminMessage
    fetch(`${API_BASE_URL}/api/employees/${emp.employeeId}/profile`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch profile');
      })
      .then(latestEmp => {
        const updated = {
          ...emp,
          ...latestEmp,
          name: latestEmp.name,
          department: latestEmp.department,
          photo: latestEmp.facePhoto || emp.photo,
          plainPassword: latestEmp.plainPassword || latestEmp.password || emp.plainPassword || emp.password,
          password: latestEmp.plainPassword || latestEmp.password || emp.plainPassword || emp.password,
          adminMessage: latestEmp.adminMessage || '',
          isActive: latestEmp.isActive
        };
        setEmployee(updated);
        try {
          localStorage.setItem('employee', JSON.stringify(updated));
        } catch (e) {}
      })
      .catch(err => console.error('Error fetching profile:', err));

    // Fetch logs from backend
    fetch(`${API_BASE_URL}/api/attendance/logs/${emp.employeeId}`)
      .then(res => res.json())
      .then(data => {
        const logsArray = Array.isArray(data) ? data : [];
        setLogs(logsArray);
        const present = logsArray.filter(log => log.status === 'Present' || log.status === 'Active' || log.status === 'Manual Verify').length;
        const absent = logsArray.filter(log => log.status === 'Absent').length;
        const total = present + absent;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 100;
        setStats({ present, absent, percentage });
      })
      .catch(err => console.error('Error fetching logs:', err));

    // Fetch target admins for message/request selection dropdown
    fetch(`${API_BASE_URL}/api/admins`)
      .then(res => res.json())
      .then(data => setAdminsList(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error fetching admins:', err));

    // Fetch office settings for calendar holidays
    fetch(`${API_BASE_URL}/api/settings/office`)
      .then(res => res.json())
      .then(data => setOfficeSettings(data))
      .catch(err => console.error('Error fetching office settings:', err));

    // Fetch holidays
    fetch(`${API_BASE_URL}/api/holidays`)
      .then(res => res.json())
      .then(data => setHolidays(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error fetching holidays:', err));

    // Load request logs and notification flags
    fetchEmployeeRequests(emp.employeeId);

    const intervalId = setInterval(() => {
      fetchEmployeeRequests(emp.employeeId);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('employee');
    navigate('/');
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const startPadding = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days = [];

    for (let i = 0; i < startPadding; i++) {
      days.push({ day: '', type: 'empty' });
    }

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStrShort = monthNamesShort[month];

    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dayStr = dayNum.toString();
      const matchingLog = logs.find(log => {
        try {
          const parts = log.date.split(' ');
          const logMonth = parts[0];
          const logDay = parts[1]?.replace(',', '');
          const logYear = parts[2];
          return logMonth === monthStrShort && logDay === dayStr && parseInt(logYear, 10) === year;
        } catch {
          return false;
        }
      });

      const cellDate = new Date(year, month, dayNum);
      const dayOfWeek = cellDate.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      let type = 'plain';
      if (matchingLog) {
        if (matchingLog.status === 'Absent') {
          type = 'absent';
        } else if (['Present', 'Active', 'Manual Verify'].includes(matchingLog.status)) {
          type = 'present';
        } else if (matchingLog.status === 'Pending') {
          type = 'pending';
        } else if (matchingLog.status === 'Leave') {
          type = 'leave';
        }
      } else {
        
        const dateStr = new Date(cellDate.getTime() - cellDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const hol = holidays.find(h => new Date(h.date).toISOString().split('T')[0] === dateStr);
        const isSaturdayOff = officeSettings?.saturdayOff && dayOfWeek === 6;
        const isSunday = dayOfWeek === 0;

        let holidayName = '';
        if (hol) holidayName = hol.name;
        else if (isSunday) holidayName = 'Sunday Off';
        else if (isSaturdayOff) holidayName = 'Saturday Off';

        if (isSunday || isSaturdayOff || hol) {
          type = 'weekend-holiday';
        }
      }

      const today = new Date();
      if (today.getDate() === dayNum && today.getMonth() === month && today.getFullYear() === year) {
        type = type === 'present' ? 'present today-highlight' : 'today';
      }

      days.push({ day: dayStr, type, log: matchingLog, holidayName: type === 'weekend-holiday' ? holidayName : '' });
    }

    return days;
  };

  const calendarDays = getCalendarDays();

  const handleContactAuthority = () => {
    setRequestModal({ isOpen: true, type: 'Message', details: '' });
  };

  const handleRequestCorrection = () => {
    setRequestModal({ isOpen: true, type: 'Correction', details: '' });
  };

  const submitRequest = async () => {
    if (!employee || !requestModal.details) return;
    const targetAdmin = adminsList.find(a => a.employeeId === selectedAdminId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.employeeId,
          name: employee.name,
          requestType: requestModal.type,
          details: requestModal.details,
          adminId: selectedAdminId,
          adminName: targetAdmin ? targetAdmin.name : 'All Admins'
        })
      });
      if (response.ok) {
        alert(`${requestModal.type} request submitted to ${targetAdmin ? targetAdmin.name : 'All Admins'}.`);
        setRequestModal({ isOpen: false, type: '', details: '' });
        setSelectedAdminId('all');
        fetchEmployeeRequests(employee.employeeId);
      } else {
        alert(`Failed to submit ${requestModal.type.toLowerCase()} request.`);
      }
    } catch (err) {
      console.error(err);
      alert('Error submitting request.');
    }
  };

  const handleExportPDF = () => {
    if (!employee) return;
    const printWindow = window.open('', '_blank');
    const joiningDate = employee.createdAt
      ? new Date(employee.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'N/A';

    const presentDays = stats.present;
    const absentDays = stats.absent;
    const attPercentage = stats.percentage;

    const logsHtml = logs.map(log => {
      const logDate = new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <tr>
          <td>${logDate}</td>
          <td>${log.checkIn || '--:--'}</td>
          <td>${log.checkOut || '--:--'}</td>
          <td>${log.status || 'Present'}</td>
          <td>${log.isLate ? '<span class="late-badge">LATE</span>' : 'On-Time'}</td>
          <td>${log.tasks || '--'}</td>
          <td>${log.workDone || '--'}</td>
        </tr>
      `;
    }).join('');

    const requestsHtml = employeeRequests.map(req => {
      const reqDate = new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <tr>
          <td>${reqDate}</td>
          <td>${req.requestType}</td>
          <td>${req.details || '--'}</td>
          <td>${req.status}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance Report - ${employee.name}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              margin: 40px;
              padding: 0;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .title {
              font-size: 24px;
              font-weight: 800;
              color: #1062b3;
              margin: 0;
            }
            .meta-section {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 30px;
            }
            .meta-card {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 16px;
            }
            .meta-card h3 {
              margin: 0 0 12px 0;
              font-size: 14px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: auto 1fr;
              column-gap: 16px;
              row-gap: 8px;
              font-size: 14px;
            }
            .meta-label {
              font-weight: 600;
              color: #475569;
            }
            .meta-value {
              color: #0f172a;
            }
            .section-title {
              font-size: 18px;
              font-weight: 700;
              color: #0f172a;
              margin: 30px 0 15px 0;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 8px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              font-size: 13px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
              text-align: left;
            }
            th {
              background-color: #f1f5f9;
              font-weight: 700;
              color: #334155;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .late-badge {
              background-color: #fee2e2;
              color: #dc2626;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 700;
            }
            .footer {
              margin-top: 50px;
              text-align: center;
              font-size: 12px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 15px;
            }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="padding: 15px; background-color: #f8fafc; text-align: center; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px;">
             <button onclick="window.close(); history.back();" style="padding: 12px 24px; font-size: 16px; font-weight: 700; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">🔙 Go Back to Dashboard</button>
             <p style="margin-top: 10px; font-size: 13px; color: #64748b; margin-bottom: 0;">Click to return if the print dialog is cancelled.</p>
          </div>
          <div class="header">
            <div>
              <h1 class="title">Personal Attendance Summary</h1>
              <div style="font-size: 14px; color: #64748b; margin-top: 4px;">Smart Attendance System</div>
            </div>
            <div style="text-align: right; font-size: 13px; color: #475569;">
              <strong>Report Generated:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div class="meta-section">
            <div class="meta-card">
              <h3>Employee Profile</h3>
              <div class="meta-grid">
                <span class="meta-label">Name:</span>
                <span class="meta-value">${employee.name}</span>
                <span class="meta-label">Employee ID:</span>
                <span class="meta-value">${employee.employeeId}</span>
                <span class="meta-label">Department:</span>
                <span class="meta-value">${employee.department || 'Engineering'}</span>
                <span class="meta-label">Role Type:</span>
                <span class="meta-value" style="text-transform: capitalize;">${employee.employeeType || 'employee'}</span>
                <span class="meta-label">Joining Date:</span>
                <span class="meta-value">${joiningDate}</span>
              </div>
            </div>

            <div class="meta-card">
              <h3>Attendance Stats Summary</h3>
              <div class="meta-grid">
                <span class="meta-label">Days Present:</span>
                <span class="meta-value">${presentDays}</span>
                <span class="meta-label">Days Absent:</span>
                <span class="meta-value">${absentDays}</span>
                <span class="meta-label">Attendance Rate:</span>
                <span class="meta-value" style="font-weight: 700; color: ${attPercentage >= 85 ? '#059669' : '#d97706'}">${attPercentage}%</span>
                <span class="meta-label">Expected Shift:</span>
                <span class="meta-value">${employee.arrivalTime || '09:00 AM'} - ${employee.departureTime || '05:00 PM'}</span>
                <span class="meta-label">Weekly Hours Target:</span>
                <span class="meta-value">${employee.weeklyHours || 40} hours</span>
              </div>
            </div>
          </div>

          <h2 class="section-title">Attendance Logs</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
                <th>Punctuality</th>
                <th>Today's Task Plan</th>
                <th>Work Accomplished</th>
              </tr>
            </thead>
            <tbody>
              ${logsHtml || '<tr><td colspan="7" style="text-align: center; color: #64748b;">No attendance logs recorded.</td></tr>'}
            </tbody>
          </table>

          <h2 class="section-title">Correction & Chat Request Logs</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Request Type</th>
                <th>Details / Chat Messages</th>
                <th>Approval Status</th>
              </tr>
            </thead>
            <tbody>
              ${requestsHtml || '<tr><td colspan="4" style="text-align: center; color: #64748b;">No request logs recorded.</td></tr>'}
            </tbody>
          </table>

          <div class="footer">
            Smart Attendance Portal © ${new Date().getFullYear()} — Confidential Internal Employee Record
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="history-container">
      {/* Unified Top Navbar */}
      <header className="history-navbar">
        <div className="navbar-left">
          <button className="mobile-back-btn" onClick={() => navigate('/dashboard')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <div className="logo-box" onClick={() => navigate('/dashboard')} style={{cursor: 'pointer'}}>
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
          <button className={`nav-link ${activeTab === 'Dashboard' ? 'active' : ''}`} onClick={() => navigate('/dashboard')}>Dashboard</button>
          <button className={`nav-link ${activeTab === 'Logs' ? 'active' : ''}`} onClick={() => setActiveTab('Logs')}>Logs</button>
          <button className={`nav-link ${activeTab === 'Approvals' ? 'active' : ''}`} onClick={handleApprovalsTabClick} style={{ position: 'relative' }}>
            Approvals
            {employeeRequests.filter(r => !r.employeeSeen).length > 0 && (
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
        <div className="navbar-right" style={{ position: 'relative' }}>
          <button className="icon-badge-btn" onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)} style={{ position: 'relative' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {getNotificationsList().length > 0 && (
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

          {showNotificationsDropdown && (
            <div className="profile-dropdown" style={{ width: '300px', maxWidth: '90vw', padding: '12px', right: 0, top: '44px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto', overflowX: 'hidden', zIndex: 1000 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '4px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>Notification Center</span>
                <button onClick={() => setShowNotificationsDropdown(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Close</button>
              </div>
              {getNotificationsList().length > 0 ? (
                getNotificationsList().map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: item.bgColor,
                      borderLeft: `4px solid ${item.color}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left'
                    }}
                    onClick={() => {
                      setShowNotificationsDropdown(false);
                      if (item.category === 'APPROVAL' || item.category === 'CORRECTION CHAT') {
                        setActiveTab('Approvals');
                      } else {
                        setActiveTab('Logs');
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '9px', fontWeight: '800', color: item.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.category}</span>
                    </div>
                    <h4 style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>{item.title}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>{item.text}</p>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '13px' }}>No new notifications</div>
              )}
            </div>
          )}
          <button className="icon-badge-btn" onClick={() => setProfileModal(prev => ({ ...prev, isOpen: true }))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div className="profile-menu-container">
            <div className="profile-avatar" onClick={() => setShowDropdown(!showDropdown)}>
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

      {/* Main Profile Area */}
      <main className="history-main">
        {employee && !employee.isActive && (
          <div style={{ width: '100%', maxWidth: '760px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '16px', borderRadius: '12px', marginBottom: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            ⚠ Your account is inactive. Actions are restricted. Please contact the administrator.
          </div>
        )}
        {/* Profile Card */}
        <section className="employee-profile" style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          padding: '24px',
          width: '100%',
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative background element */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '100%', background: 'linear-gradient(90deg, transparent, #eff6ff)', opacity: 0.8, pointerEvents: 'none' }}></div>

          <div className="profile-photo-circle" style={{ width: '110px', height: '110px', border: '4px solid #ffffff', boxShadow: '0 8px 24px rgba(16,98,179,0.15)', flexShrink: 0, margin: 0 }}>
            {employee?.photo || employee?.facePhoto ? (
              <img src={employee.photo || employee.facePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>

          <div className="profile-info-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexGrow: 1, zIndex: 1 }}>
            <h2 className="employee-name" style={{ fontSize: '32px', marginBottom: '8px', letterSpacing: '-0.5px' }}>{employee ? employee.name : 'Loading...'}</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span className="employee-id" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                ID: {employee ? employee.employeeId : ''}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: employee?.isActive ? '#ecfdf5' : '#fee2e2', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', color: employee?.isActive ? '#059669' : '#991b1b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: employee?.isActive ? '#10b981' : '#ef4444' }}></span>
                {employee?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                Joined: {employee?.createdAt ? new Date(employee.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
              </span>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                Password: {showCurrentPassword ? (employee?.plainPassword || employee?.password || 'N/A') : '••••••••'}
                <button
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={{ background: 'none', border: 'none', color: '#1062b3', cursor: 'pointer', fontSize: '12px', fontWeight: '700', padding: 0, marginLeft: '4px' }}
                >
                  {showCurrentPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </div>
          </div>

          <div className="profile-actions-container">
            <button
              onClick={handleExportPDF}
              style={{ padding: '12px 24px', backgroundColor: '#059669', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(5,150,105,0.2)', transition: 'all 0.2s ease' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(5,150,105,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(5,150,105,0.2)'; }}
            >
              Export Report (PDF)
            </button>

            <button
              disabled={employee && !employee.isActive}
              onClick={() => { if (employee && !employee.isActive) return; setProfileModal(prev => ({ ...prev, isOpen: true })); }}
              style={{ padding: '12px 24px', backgroundColor: (employee && !employee.isActive) ? '#cbd5e1' : '#1062b3', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: (employee && !employee.isActive) ? 'not-allowed' : 'pointer', boxShadow: (employee && !employee.isActive) ? 'none' : '0 4px 12px rgba(16,98,179,0.2)', transition: 'all 0.2s ease' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(16,98,179,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,98,179,0.2)'; }}
            >
              Manage Profile
            </button>
          </div>
        </section>

        {employee?.adminMessage && (
          <section style={{ width: '100%', maxWidth: '100%', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '16px', padding: '20px 24px', display: 'flex', gap: '16px', alignItems: 'flex-start', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#991b1b', margin: '0 0 6px 0' }}>Message from Admin</h3>
              <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0, lineHeight: 1.5 }}>
                {employee.adminMessage}
              </p>
            </div>
          </section>
        )}

        {activeTab === 'Logs' ? (
          <>
            {/* Stats Cards Bar */}
            <section className="stats-row">
              <div className="stat-card">
                <div className="stat-icon-circle present-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="stat-label">Days Present</span>
                <span className="stat-value">{stats.present}</span>
              </div>

              <div className="stat-card">
                <div className="stat-icon-circle absent-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
                <span className="stat-label">Days Absent</span>
                <span className="stat-value">{stats.absent}</span>
              </div>

              <div className="stat-card">
                <div className="stat-icon-circle percentage-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="5" x2="5" y2="19" />
                    <circle cx="6.5" cy="6.5" r="2.5" />
                    <circle cx="17.5" cy="17.5" r="2.5" />
                  </svg>
                </div>
                <span className="stat-label">Attendance %</span>
                <span className="stat-value">{stats.percentage}%</span>
              </div>

              <div className="stat-card">
                <div className="stat-icon-circle" style={{ backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <span className="stat-label">Expected Arrival</span>
                <span className="stat-value" style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{employee?.arrivalTime || '09:00 AM'}</span>
              </div>

              <div className="stat-card">
                <div className="stat-icon-circle" style={{ backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <span className="stat-label">Off Time</span>
                <span className="stat-value" style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{employee?.departureTime || '05:00 PM'}</span>
              </div>

              <div className="stat-card">
                <div className="stat-icon-circle" style={{ backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <span className="stat-label">Weekly Hours ({employee?.employeeType === 'intern' ? 'Intern' : 'Employee'})</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="stat-value" style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{getWeeklyHours()} / {employee?.weeklyHours || 40}h</span>
                  {parseFloat(getWeeklyHours()) > (employee?.weeklyHours || 40) && (
                    <span style={{ fontSize: '11px', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                      +{(parseFloat(getWeeklyHours()) - (employee?.weeklyHours || 40)).toFixed(1)}h Overtime
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Calendar Card */}
            <section className="calendar-card">
              <div className="calendar-header">
                <h3 className="calendar-title">
                  {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="calendar-nav-arrows">
                  <button className="arrow-btn" onClick={handlePrevMonth}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button className="arrow-btn" onClick={handleNextMonth}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="calendar-grid-header">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>

              <div className="calendar-grid-days">
                {calendarDays.map((item, index) => (
                  <div
                    key={index}
                    className={`calendar-day-cell ${item.type}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}
                  >
                    <span>{item.day}</span>
                    {item.day && item.type === 'weekend-holiday' && (
                      <span style={{ fontSize: '8px', fontWeight: '500', color: '#64748b', display: 'block', marginTop: '2px', textAlign: 'center', lineHeight: '1.1' }}>{item.holidayName || 'Holiday'}</span>
                    )}
                    {item.day && item.log && (
                      <div style={{ fontSize: '8.5px', color: 'inherit', marginTop: '2px', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1' }}>
                        {item.log.checkIn !== '--:--' && (
                          <>
                            <span style={{ fontWeight: '700' }}>{item.log.checkIn.split(' ')[0]}</span>
                            <span style={{ fontSize: '6.5px', fontWeight: '500', opacity: 0.9, marginTop: '1px' }}>{item.log.checkIn.split(' ')[1]}</span>
                          </>
                        )}
                        {item.log.isLate && (
                          <span style={{
                            backgroundColor: '#ef4444',
                            color: '#ffffff',
                            padding: '1px 4px',
                            borderRadius: '4px',
                            fontSize: '7px',
                            fontWeight: 'bold',
                            marginTop: '2px'
                          }}>LATE</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="calendar-legend">
                <div className="legend-item">
                  <span className="legend-dot green-dot"></span>
                  Present
                </div>
                <div className="legend-item">
                  <span className="legend-dot red-dot"></span>
                  Absent
                </div>
                <div className="legend-item">
                  <span className="legend-dot blue-ring-dot"></span>
                  Today
                </div>
                <div className="legend-item">
                  <span className="legend-dot purple-dot"></span>
                  On Leave
                </div>
              </div>
            </section>

            {/* Authority Action Panel (Correction, Contact, Message) */}
            <section className="authority-actions-card">
              <h3>Authority Actions</h3>
              <div className="authority-buttons-row">
                <button
                  className="btn btn-action"
                  disabled={employee && !employee.isActive}
                  style={{ opacity: (employee && !employee.isActive) ? 0.5 : 1, cursor: (employee && !employee.isActive) ? 'not-allowed' : 'pointer' }}
                  onClick={(e) => { if (employee && !employee.isActive) return; handleRequestCorrection(e); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Request Correction
                </button>
                <button className="btn btn-action" onClick={handleContactAuthority}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Message Authority
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="calendar-card" style={{ width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>My Submitted Requests</h3>
            <div className="history-table-wrapper" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table className="employees-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ width: '15%', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Admin Name</th>
                    <th style={{ width: '12%', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Type</th>
                    <th style={{ width: 'auto', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Details</th>
                    <th style={{ width: '13%', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Status</th>
                    <th style={{ width: '13%', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Seen Status</th>
                    <th style={{ width: '12%', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Date</th>
                    <th style={{ width: '180px', padding: '12px 16px', color: '#475569', fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>Discussion</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeRequests.length > 0 ? (
                    employeeRequests.map((req) => (
                      <React.Fragment key={req._id}>
                        <tr
                          style={{ borderBottom: activeChatRequestId === req._id ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: activeChatRequestId === req._id ? '#f8fafc' : 'transparent' }}
                          onClick={() => handleToggleChat(req._id)}
                        >
                          <td data-label="Admin Name" style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>
                            <span>{req.adminName || (req.targetAdmins && req.targetAdmins.map(a => a.adminName).join(', ')) || 'All Admins'}</span>
                          </td>
                          <td data-label="Type" style={{ padding: '12px 16px', color: '#64748b' }}><span>{req.requestType}</span></td>
                          <td data-label="Details" style={{ padding: '12px 16px', color: '#334155', minWidth: 0 }}>
                            <div style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {req.details}
                            </div>
                          </td>
                          <td data-label="Status" style={{ padding: '12px 16px' }}>
                            <span
                              className={`status-badge ${req.status.toLowerCase()}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                backgroundColor: req.status === 'Approved' ? '#d1fae5' : req.status === 'Rejected' ? '#fee2e2' : '#fef3c7',
                                color: req.status === 'Approved' ? '#065f46' : req.status === 'Rejected' ? '#991b1b' : '#92400e'
                              }}
                            >
                              <span
                                className="badge-dot"
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: req.status === 'Approved' ? '#10b981' : req.status === 'Rejected' ? '#ef4444' : '#f59e0b'
                                }}
                              ></span>
                              {req.status}
                            </span>
                          </td>
                          <td data-label="Seen Status" style={{ padding: '12px 16px', color: '#475569' }}>
                            {!req.employeeSeen ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: '700', fontSize: '13px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
                                Unread Reply
                              </span>
                            ) : req.adminSeen ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', fontWeight: '600', fontSize: '13px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                Seen
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '13px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                Sent
                              </span>
                            )}
                          </td>
                          <td data-label="Date" style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px' }}>
                            <span>{new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </td>
                          <td data-label="Discussion" style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleChat(req._id); }}
                              style={{
                                padding: '8px 16px',
                                backgroundColor: activeChatRequestId === req._id ? '#475569' : '#1062b3',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                gap: '6px',
                                boxShadow: '0 2px 4px rgba(16, 98, 179, 0.15)',
                                width: '100%',
                                maxWidth: '160px'
                              }}
                              onMouseOver={(e) => {
                                if (activeChatRequestId !== req._id) {
                                  e.currentTarget.style.backgroundColor = '#0e559c';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }
                              }}
                              onMouseOut={(e) => {
                                if (activeChatRequestId !== req._id) {
                                  e.currentTarget.style.backgroundColor = '#1062b3';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }
                              }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                              {activeChatRequestId === req._id ? (
                                <span className="btn-text">Close Chat</span>
                              ) : (
                                <span className="btn-text">Open Discussion</span>
                              )}
                              {req.messages && req.messages.length > 0 && ` (${req.messages.length})`}
                            </button>
                          </td>
                        </tr>
                        {activeChatRequestId === req._id && (
                          <tr className="chat-row" style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <td colSpan="7" className="chat-cell" style={{ padding: '16px 24px' }}>
                              <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '12px', backgroundColor: '#ffffff', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', textAlign: 'left' }}>
                                  Discussion Thread
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }}>
                                  {req.messages && req.messages.length > 0 ? (
                                    req.messages.map((msg, mIdx) => msg ? (
                                      <div
                                        key={mIdx}
                                        style={{
                                          alignSelf: msg.senderRole === 'employee' ? 'flex-end' : (msg.senderRole === 'system' ? 'center' : 'flex-start'),
                                          backgroundColor: msg.senderRole === 'employee' ? '#1062b3' : (msg.senderRole === 'system' ? '#f1f5f9' : '#ffffff'),
                                          color: msg.senderRole === 'employee' ? '#ffffff' : '#0f172a',
                                          padding: '10px 14px',
                                          borderRadius: '12px',
                                          borderBottomRightRadius: msg.senderRole === 'employee' ? '4px' : '12px',
                                          borderBottomLeftRadius: msg.senderRole === 'admin' ? '4px' : '12px',
                                          maxWidth: '85%',
                                          fontSize: '14px',
                                          boxShadow: msg.senderRole === 'system' ? 'none' : '0 2px 4px rgba(0,0,0,0.05)',
                                          border: msg.senderRole === 'system' ? 'none' : (msg.senderRole === 'admin' ? '1px solid #cbd5e1' : 'none'),
                                          borderLeft: msg.senderRole === 'admin' ? '4px solid #10b981' : (msg.senderRole === 'system' ? 'none' : 'none'),
                                          textAlign: 'left'
                                        }}
                                      >
                                        <div style={{ fontWeight: '800', fontSize: '11px', color: msg.senderRole === 'employee' ? '#bfdbfe' : (msg.senderRole === 'system' ? '#64748b' : '#10b981'), marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                          {msg.senderRole === 'admin' ? 'Admin Reply' : msg.senderName}
                                        </div>
                                        <div style={{ lineHeight: 1.5 }}>{msg.text}</div>
                                        <div style={{ fontSize: '10px', color: msg.senderRole === 'employee' ? '#bfdbfe' : '#94a3b8', textAlign: 'right', marginTop: '6px' }}>
                                          {msg.createdAt && !isNaN(new Date(msg.createdAt).getTime()) ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </div>
                                      </div>
                                    ) : null)
                                  ) : (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No messages.</div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Type your reply here..."
                                    value={chatMessageText}
                                    onChange={(e) => setChatMessageText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSendChatMessage(req._id);
                                      }
                                    }}
                                    style={{ flexGrow: 1, minWidth: 0, padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                  />
                                  <button
                                    onClick={() => handleSendChatMessage(req._id)}
                                    style={{ padding: '8px 16px', backgroundColor: '#1062b3', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr className="no-data-row">
                      <td colSpan="7" className="no-data-cell" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No submitted requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Back to Scan Button */}
        <div className="back-btn-container">
          <button className="btn-back-scan" onClick={() => navigate('/scan')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Scan
          </button>
        </div>
      </main>
      {/* Request Modal */}
      {requestModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '90%', maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{requestModal.type === 'Correction' ? 'Request Correction' : 'Message Authority'}</h2>
              <button className="btn-close-modal" onClick={() => setRequestModal({ isOpen: false, type: '', details: '' })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>Target Authority / Admin</label>
              <select
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '14px',
                  color: '#1e293b',
                  marginBottom: '12px'
                }}
              >
                <option value="all">All Admins</option>
                {adminsList.map(adm => (
                  <option key={adm.employeeId} value={adm.employeeId}>
                    {adm.name} ({adm.role === 'super-admin' ? 'Super Admin' : adm.role === 'hr-admin' ? 'HR' : 'Admin'})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Details / Reason</label>
              <textarea
                rows="4"
                value={requestModal.details}
                onChange={(e) => setRequestModal(prev => ({ ...prev, details: e.target.value }))}
                placeholder={requestModal.type === 'Correction' ? "E.g., I was present on Jan 12th but marked absent." : "Enter your message here..."}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical' }}
              />
            </div>
            <div className="modal-footer-buttons" style={{ marginTop: '24px' }}>
              <button type="button" className="btn-modal-cancel" onClick={() => setRequestModal({ isOpen: false, type: '', details: '' })}>Cancel</button>
              <button type="button" className="btn-modal-save" onClick={submitRequest}>Submit Request</button>
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
              <button className="btn-close-modal" onClick={() => setProfileModal({ isOpen: false, password: '', pin: '', facePhotos: [], showPassword: false })}>
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
              <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', textAlign: 'left' }}>
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
                onClick={() => setProfileModal({ isOpen: false, password: '', pin: '', facePhotos: [], showPassword: false })}
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

    </div>
  );
};

export default History;
