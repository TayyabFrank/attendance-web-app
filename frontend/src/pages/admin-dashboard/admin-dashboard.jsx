import { API_BASE_URL } from '../../config';
import { exportAttendanceReport } from '../../utils/pdfExport';
import { compressImage } from '../../utils/imageCompression';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './admin-dashboard.css';
import DepartmentDeleteModal from './DepartmentDeleteModal';
import EmployeeProfileModal from './EmployeeProfileModal';
import HolidayModal from './HolidayModal';

const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('adminToken');
  const customHeaders = { ...(options.headers || {}) };
  if (token) {
    customHeaders['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers: customHeaders, credentials: 'include' });
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');
  const [globalSearch, setGlobalSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loggedAdmin, setLoggedAdmin] = useState(() => {
    const adm = localStorage.getItem('admin');
    return adm ? JSON.parse(adm) : null;
  });

  const [editingEmployee, setEditingEmployee] = useState({
    id: '',
    name: '',
    department: '',
    password: '',
    facePhotos: [],
    role: 'employee',
    isActive: true,
    adminMessage: '',
    employeeType: 'employee',
    weeklyHours: 40,
    arrivalTime: '09:00 AM',
    departureTime: '05:00 PM'
  });

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteEmployeeObj, setDeleteEmployeeObj] = useState(null);
  const [deleteInputName, setDeleteInputName] = useState('');

  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel'
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Present' | 'Absent' | 'Pending'
  // Date and Employee Filter States for Attendance Logs
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceEmployeeFilter, setAttendanceEmployeeFilter] = useState('All');

  const [employees, setEmployees] = useState([]);
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('active'); // 'all', 'active', 'inactive'
  const [itemsPerPage, setItemsPerPage] = useState(500);
  const [selectedProfileEmployee, setSelectedProfileEmployee] = useState(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState('All');
  const [roleTypeFilter, setRoleTypeFilter] = useState('All');
  const [departmentToDelete, setDepartmentToDelete] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);
  const [deptEmployeeSearch, setDeptEmployeeSearch] = useState('');
  const [deptEmployeeSort, setDeptEmployeeSort] = useState('name-asc');
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [activeChatRequestId, setActiveChatRequestId] = useState(null);
  const [chatMessageText, setChatMessageText] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const chatEndRef = useRef(null);
  const [officeSettings, setOfficeSettings] = useState({
    officeLatitude: 33.6844,
    officeLongitude: 73.0479,
    allowedRadius: 100,
    vpnCheckEnabled: true,
    geofenceEnabled: true
  });
  const [holidays, setHolidays] = useState([]);
  const [currentHolidayMonth, setCurrentHolidayMonth] = useState(new Date());
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [currentAddress, setCurrentAddress] = useState('Fetching address...');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapCenter, setMapCenter] = useState([33.6844, 73.0479]);

  // Goal Tracking States
  const [goalTrackingSearch, setGoalTrackingSearch] = useState('');
  const [goalTrackingSort, setGoalTrackingSort] = useState({ column: 'name', direction: 'asc' });
  const [goalTrackingViewMode, setGoalTrackingViewMode] = useState('week'); // 'week' | 'month'
  const [goalTrackingDateOffset, setGoalTrackingDateOffset] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [holidayModal, setHolidayModal] = useState({ isOpen: false, dateStr: '', hol: null });

  useEffect(() => {
    const fetchAddress = async () => {
      try {
        const { officeLatitude, officeLongitude } = officeSettings;
        if (!officeLatitude || !officeLongitude) return;
        
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${officeLatitude}&lon=${officeLongitude}`);
        if (res.ok) {
          const data = await res.json();
          if (data.error) {
            setCurrentAddress(`Coordinates: ${officeLatitude}, ${officeLongitude}`);
          } else {
            setCurrentAddress(data.display_name || `Coordinates: ${officeLatitude}, ${officeLongitude}`);
          }
        } else {
          setCurrentAddress(`Coordinates: ${officeLatitude}, ${officeLongitude}`);
        }
      } catch (err) {
        console.error('Reverse geocode error:', err);
        const { officeLatitude, officeLongitude } = officeSettings;
        if (officeLatitude && officeLongitude) {
          setCurrentAddress(`Coordinates: ${officeLatitude}, ${officeLongitude}`);
        } else {
          setCurrentAddress('Location not set');
        }
      }
    };
    
    const timeout = setTimeout(fetchAddress, 1000);
    return () => clearTimeout(timeout);
  }, [officeSettings.officeLatitude, officeSettings.officeLongitude]);

  const handleAddressSearch = async (e) => {
    if (e) e.preventDefault();
    if (!addressSearchQuery.trim()) {
      setOfficeSettings(prev => ({ ...prev, officeLatitude: '', officeLongitude: '' }));
      setCurrentAddress('Location not set');
      return;
    }
    setIsSearchingAddress(true);

    let queryToParse = addressSearchQuery.trim();

    // Resolve any URLs (Google Maps shortlinks, maps links, goo.gl, etc.) dynamically via backend
    if (queryToParse.startsWith('http://') || queryToParse.startsWith('https://') || queryToParse.toLowerCase().includes('maps') || queryToParse.toLowerCase().includes('goo.gl')) {
      try {
        const resolveRes = await fetch(`${API_BASE_URL}/api/resolve-shortlink?url=${encodeURIComponent(queryToParse)}`);
        if (resolveRes.ok) {
          const resolveData = await resolveRes.json();
          if (resolveData.url) queryToParse = resolveData.url;
        }
      } catch (e) {
        console.error('Error resolving shortlink:', e);
      }
    }

    let parsedLat = null, parsedLon = null;

    // Pattern 1: /search/lat,+lng or /place/lat,+lng or /dir/lat,+lng
    const searchPlaceRegex = /(?:search|place|dir)\/(-?\d+\.?\d*)[,\s+]+(-?\d+\.?\d*)/i;
    // Pattern 2: !3d<lat> and !4d<lng> anywhere in the URL
    const pinLatRegex = /!3d(-?\d+\.?\d*)/i;
    const pinLonRegex = /!4d(-?\d+\.?\d*)/i;
    // Pattern 3: @lat,lng
    const gmapsCenterRegex = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/i;
    // Pattern 4: Query params like ?q=lat,lng or ?query=lat,lng or ?ll=lat,lng or ?center=lat,lng
    const qParamRegex = /[?&](?:q|query|ll|center|destination|point)=(-?\d+\.?\d*)[,\s+]+(-?\d+\.?\d*)/i;
    // Pattern 5: Raw coordinates (e.g. 31.442855, 74.366061 or 31.442855,74.366061)
    const rawCoordsRegex = /^(-?\d+\.?\d*)[,\s+]+(-?\d+\.?\d*)$/;

    const searchPlaceMatch = queryToParse.match(searchPlaceRegex);
    const pinLatMatch = queryToParse.match(pinLatRegex);
    const pinLonMatch = queryToParse.match(pinLonRegex);
    const gmapsCenterMatch = queryToParse.match(gmapsCenterRegex);
    const qParamMatch = queryToParse.match(qParamRegex);
    const rawCoordsMatch = queryToParse.match(rawCoordsRegex);

    if (searchPlaceMatch) {
      parsedLat = parseFloat(searchPlaceMatch[1]);
      parsedLon = parseFloat(searchPlaceMatch[2]);
    } else if (pinLatMatch && pinLonMatch) {
      parsedLat = parseFloat(pinLatMatch[1]);
      parsedLon = parseFloat(pinLonMatch[2]);
    } else if (gmapsCenterMatch) {
      parsedLat = parseFloat(gmapsCenterMatch[1]);
      parsedLon = parseFloat(gmapsCenterMatch[2]);
    } else if (qParamMatch) {
      parsedLat = parseFloat(qParamMatch[1]);
      parsedLon = parseFloat(qParamMatch[2]);
    } else if (rawCoordsMatch) {
      parsedLat = parseFloat(rawCoordsMatch[1]);
      parsedLon = parseFloat(rawCoordsMatch[2]);
    }

    if (parsedLat !== null && parsedLon !== null && !isNaN(parsedLat) && !isNaN(parsedLon)) {
      setOfficeSettings(prev => ({ ...prev, officeLatitude: parsedLat, officeLongitude: parsedLon }));
      setMapCenter([parsedLat, parsedLon]);
      
      try {
        const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${parsedLat}&lon=${parsedLon}`);
        if (revRes.ok) {
           const revData = await revRes.json();
           const addr = revData.display_name || `Location (${parsedLat.toFixed(5)}, ${parsedLon.toFixed(5)})`;
           setCurrentAddress(addr);
           setAddressSearchQuery(addr);
        } else {
           setCurrentAddress(`Location (${parsedLat.toFixed(5)}, ${parsedLon.toFixed(5)})`);
        }
      } catch(e) {
        setCurrentAddress(`Location (${parsedLat.toFixed(5)}, ${parsedLon.toFixed(5)})`);
      }
      setIsSearchingAddress(false);
      return;
    }

    // Fallback: If not recognized as coordinate URL, search via Nominatim text geocoding API
    try {
      let searchQuery = queryToParse;
      if (searchQuery.includes('/search/')) {
        searchQuery = searchQuery.split('/search/')[1]?.split('?')[0]?.replace(/\+/g, ' ') || searchQuery;
      }
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          const firstResult = geoData[0];
          const newLat = parseFloat(firstResult.lat);
          const newLon = parseFloat(firstResult.lon);
          setOfficeSettings(prev => ({ ...prev, officeLatitude: newLat, officeLongitude: newLon }));
          setMapCenter([newLat, newLon]);
          setCurrentAddress(firstResult.display_name);
          setAddressSearchQuery(firstResult.display_name);
          setIsSearchingAddress(false);
          return;
        }
      }
    } catch(err) {
      console.error('Nominatim text search failed:', err);
    }

    alert('Could not extract location from the provided link or search query. Please try pasting raw coordinates (e.g. 31.442855, 74.366061) or search by location name.');
    setOfficeSettings(prev => ({ ...prev, officeLatitude: '', officeLongitude: '' }));
    setCurrentAddress('Address not found');
    setIsSearchingAddress(false);
  };

  const handleSelectSuggestion = (suggestion) => {
    const newLat = parseFloat(suggestion.lat);
    const newLon = parseFloat(suggestion.lon);
    setOfficeSettings(prev => ({ ...prev, officeLatitude: newLat, officeLongitude: newLon }));
    setMapCenter([newLat, newLon]);
    setCurrentAddress(suggestion.display_name);
    setAddressSearchQuery(suggestion.display_name);
    setShowSuggestions(false);
  };

  // Leave Feature States
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveEmployee, setLeaveEmployee] = useState(null);
  const [leaveDate, setLeaveDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Super Admin Past Attendance Edit States
  const [showManualEditModal, setShowManualEditModal] = useState(false);
  const [manualEditData, setManualEditData] = useState({
    employeeId: '',
    employeeName: '',
    date: '',
    status: 'Present',
    checkIn: '--:--',
    checkOut: '--:--'
  });
  const [isSubmittingManualEdit, setIsSubmittingManualEdit] = useState(false);

  // Selected employee for calendar attendance view
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeAttendanceLogs, setEmployeeAttendanceLogs] = useState([]);
  const [currentModalDate, setCurrentModalDate] = useState(new Date());
  const [isCalendarEditMode, setIsCalendarEditMode] = useState(false);

  useEffect(() => {
    const handleAddDataLabels = () => {
      const tables = document.querySelectorAll('.employees-table');
      tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText);
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell, index) => {
            if (headers[index] && !cell.hasAttribute('data-label')) {
              cell.setAttribute('data-label', headers[index]);
            }
          });
        });
      });
    };
    handleAddDataLabels();
    const timeout = setTimeout(handleAddDataLabels, 500);
    return () => clearTimeout(timeout);
  }, []);

  const convertTo12Hour = (time24) => {
    if (!time24 || time24 === '--:--') return '--:--';
    const parts = time24.split(':');
    if (parts.length < 2) return time24;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    return `${strHours}:${minutes} ${ampm}`;
  };

  const convertTo24Hour = (time12) => {
    if (!time12 || time12 === '--:--') return '09:00';
    const cleaned = time12.trim().toUpperCase();
    const match = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/);
    if (!match) return '09:00';
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3];
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  };

  const helperTimeToMinutes = (timeStr) => {
    if (!timeStr || timeStr === '--:--') return 0;
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
      const hours = parseInt(twentyFourMatch[1], 10);
      const minutes = parseInt(twentyFourMatch[2], 10);
      return hours * 60 + minutes;
    }
    return 0;
  };

  const calculateHoursWorkedText = (checkIn, checkOut) => {
    if (!checkIn || checkIn === '--:--' || !checkOut || checkOut === '--:--') return '0.0';
    const inMins = helperTimeToMinutes(checkIn);
    const outMins = helperTimeToMinutes(checkOut);
    if (outMins > inMins) {
      return ((outMins - inMins) / 60).toFixed(1);
    }
    return '0.0';
  };

  const canManageEmployees = ['admin', 'super-admin', 'hr-admin'].includes(loggedAdmin?.role);

  const handleExportPDF = () => {
    exportAttendanceReport(employees, attendanceLogs);
  };

  // Form state for adding an employee
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    department: '',
    password: '',
    facePhotos: [],
    role: 'employee',
    employeeType: 'employee',
    weeklyHours: 40,
    arrivalTime: '09:00 AM',
    departureTime: '05:00 PM'
  });

  // Password visibility toggle states
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Biometric Unlock states
  const [credentialsUnlocked, setCredentialsUnlocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [flashColor, setFlashColor] = useState(null);
  const videoRef = useRef(null);
  const unlockStreamRef = useRef(null);

  const startUnlockCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
      unlockStreamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Error starting camera for unlock:', err);
      alert('Could not start live webcam scan: ' + err.message);
    }
  };

  const stopUnlockCamera = () => {
    if (unlockStreamRef.current) {
      unlockStreamRef.current.getTracks().forEach(track => track.stop());
      unlockStreamRef.current = null;
    }
    setCameraActive(false);
    setFlashColor(null);
  };

  const captureFrameBlob = () => {
    return new Promise((resolve, reject) => {
      if (videoRef.current && cameraActive) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create JPEG blob'));
              }
            }, 'image/jpeg', 0.7);
          } else {
            reject(new Error('Failed to get canvas 2D context'));
          }
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error('Camera is not active'));
      }
    });
  };

  const calculateSignature = async (blobA, blobB, token, timestamp) => {
    const arrayBufferA = await blobA.arrayBuffer();
    const arrayBufferB = await blobB.arrayBuffer();
    const tokenBytes = new TextEncoder().encode(token);
    const timestampBytes = new TextEncoder().encode(String(timestamp));

    const totalLength = arrayBufferA.byteLength + arrayBufferB.byteLength + tokenBytes.byteLength + timestampBytes.byteLength;
    const combined = new Uint8Array(totalLength);

    combined.set(new Uint8Array(arrayBufferA), 0);
    combined.set(new Uint8Array(arrayBufferB), arrayBufferA.byteLength);
    combined.set(new Uint8Array(tokenBytes), arrayBufferA.byteLength + arrayBufferB.byteLength);
    combined.set(new Uint8Array(timestampBytes), arrayBufferA.byteLength + arrayBufferB.byteLength + tokenBytes.byteLength);

    const secretKey = 'fallback-secret-key-12345';
    const keyData = new TextEncoder().encode(secretKey);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );

    const signatureBuffer = await window.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      combined
    );

    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const captureAndVerifyFace = async () => {
    if (!videoRef.current) return;
    setIsUnlocking(true);
    try {
      // 1. Fetch color challenge token
      const tokenRes = await fetchWithAuth(`${API_BASE_URL}/api/scan-attendance`);
      if (!tokenRes.ok) throw new Error('Failed to obtain color challenge token');
      const tokenData = await tokenRes.json();
      const token = tokenData.token;

      // 2. Active color flash protocol (Neon Pink)
      setFlashColor('pink');
      await new Promise(r => setTimeout(r, 350));
      const blobA = await captureFrameBlob();

      // 3. Active color flash protocol (Neon Green)
      setFlashColor('green');
      await new Promise(r => setTimeout(r, 350));
      const blobB = await captureFrameBlob();

      setFlashColor(null);

      const timestamp = Date.now();
      const signature = await calculateSignature(blobA, blobB, token, timestamp);

      const toBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const frameABase64 = await toBase64(blobA);
      const frameBBase64 = await toBase64(blobB);

      const response = await fetchWithAuth(`${API_BASE_URL}/api/admin/verify-face-for-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole(),
        },
        credentials: 'include',
        body: JSON.stringify({
          frameA: frameABase64,
          frameB: frameBBase64,
          adminId: loggedAdmin?.employeeId || loggedAdmin?.id || '',
          targetEmployeeId: editingEmployee.employeeId || editingEmployee.id || ''
        })
      });
      const data = await response.json();
      if (response.ok) {
        setCredentialsUnlocked(true);
        setShowEditPassword(true);
        setEditingEmployee(prev => ({ ...prev, password: data.password }));
        alert('Admin identity verified securely via Face Scan! Employee credentials unlocked.');
        stopUnlockCamera();
      } else {
        alert(data.error || 'Admin face verification failed.');
      }
    } catch (err) {
      console.error(err);
      alert('Verification error: ' + err.message);
      setFlashColor(null);
    } finally {
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/api/admin/verify-session`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setLoggedAdmin(data.user);
        } else {
          localStorage.removeItem('admin');
          navigate('/admin-login');
        }
      } catch (err) {
        localStorage.removeItem('admin');
        navigate('/admin-login');
      }
    };
    verifySession();
  }, [navigate]);

  const getAdminRole = () => {
    const adm = localStorage.getItem('admin');
    return adm ? JSON.parse(adm).role : 'viewer-admin';
  };

  const fetchData = async () => {
    try {
      const headers = { 'x-user-role': getAdminRole(), };

      // Use Promise.all to fetch all endpoints concurrently to prevent waterfall delays
      const safeJson = async (res) => {
        try {
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/dashboard-data?limit=${itemsPerPage}&page=${currentPage}&status=${employeeStatusFilter}&_t=${Date.now()}`, { headers, credentials: 'include' }).catch((err) => { console.error('Dashboard data fetch failed:', err); return { json: async () => ({ employees: [], logs: [], requests: [] }) }; });
      const dashboardData = await res.json().catch(() => ({ employees: [], logs: [], requests: [] }));
      
      const empData = Array.isArray(dashboardData.employees) ? dashboardData.employees : [];
      const logData = Array.isArray(dashboardData.logs) ? dashboardData.logs : [];
      const reqData = Array.isArray(dashboardData.requests) ? dashboardData.requests : [];



      setRequests(Array.isArray(reqData) ? reqData : []);

      // Group logs by employeeId for O(1) lookups instead of O(N*M) loop filtering
      const logsByEmp = {};
      logData.forEach(log => {
        if (!log.checkIn) return;
        if (!logsByEmp[log.employeeId]) logsByEmp[log.employeeId] = [];
        logsByEmp[log.employeeId].push(log);
      });

      const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const processedEmployees = empData.map(emp => {
        const empLogs = logsByEmp[emp.employeeId] || [];
        empLogs.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort descending
        const todayLog = empLogs.find(log => log.date === todayStr);
        const latestLog = empLogs.length > 0 ? empLogs[0] : null;

        let lastCheckInDisplay = 'N/A';
        if (latestLog) {
          lastCheckInDisplay = latestLog.date === todayStr
            ? `Today, ${latestLog.checkIn}`
            : `${latestLog.date}, ${latestLog.checkIn}`;
        }

        return {
          id: emp.employeeId,
          employeeId: emp.employeeId,
          name: emp.name,
          department: emp.department || 'Engineering',
          status: todayLog ? todayLog.status : 'Absent',
          lastCheckIn: lastCheckInDisplay,
          photo: `${API_BASE_URL}/api/employees/${emp.employeeId}/photo`,
          role: emp.role || 'employee',
          employeeType: emp.employeeType || 'employee',
          weeklyHours: emp.weeklyHours || 40,
          arrivalTime: emp.arrivalTime || '09:00 AM',
          departureTime: emp.departureTime || '05:00 PM',
          isActive: emp.isActive !== false, // default true
          adminMessage: emp.adminMessage || '',
          createdAt: emp.createdAt
        };
      });

      setEmployees(processedEmployees);

      // Map attendance logs to match table
      const processedLogs = logData.map(log => ({
        id: log.employeeId,
        employeeId: log.employeeId,
        name: log.name,
        date: log.date,
        checkIn: log.checkIn,
        checkOut: log.checkOut,
        status: log.status,
        confidence: log.confidence,
        confidenceType: log.confidence === '--' ? 'none' : (parseFloat(log.confidence) > 85 ? 'high' : 'warning'),
        photo: log.photo && log.photo.startsWith('data:') ? log.photo : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        tasks: log.tasks || '',
        workDone: log.workDone || '',
        _id: log._id
      }));

      setAttendanceLogs(processedLogs.reverse());

      const deptRes = await fetchWithAuth(`${API_BASE_URL}/api/departments`, { credentials: 'include' }).catch(() => ({ json: () => [] }));
      const deptData = await safeJson(deptRes);
      setDepartments(deptData);

      const settingsRes = await fetchWithAuth(`${API_BASE_URL}/api/settings/office`, { credentials: 'include' }).catch(() => null);
      const holRes = await fetchWithAuth(`${API_BASE_URL}/api/holidays`, { headers, credentials: 'include' }).catch(() => ({ json: async () => [] }));
      const holData = await safeJson(holRes);
      setHolidays(holData);
      
      if (settingsRes && settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setOfficeSettings(settingsData);
        if (settingsData.officeLatitude) {
           setMapCenter([settingsData.officeLatitude, settingsData.officeLongitude]);
        }
      }
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHolidayAction = async (dateStr, newName, action, holToUpdate) => {
    // Optimistic update
    setHolidays(prev => {
      if (action === 'remove') {
        return prev.filter(h => h.date.split('T')[0] !== dateStr);
      } else if (action === 'add') {
        return [...prev, { date: dateStr + 'T00:00:00.000Z', name: newName, type: 'company' }];
      } else if (action === 'rename') {
        return prev.map(h => h.date.split('T')[0] === dateStr ? { ...h, name: newName } : h);
      }
      return prev;
    });

    setHolidayModal({ isOpen: false, dateStr: '', hol: null });

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/holidays/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': getAdminRole() },
        credentials: 'include',
        body: JSON.stringify({ date: dateStr, name: newName, action, type: 'company' })
      });
      if (!res.ok) {
        // Revert on failure
        const holRes = await fetchWithAuth(`${API_BASE_URL}/api/holidays`, { headers: { 'x-user-role': getAdminRole() }, credentials: 'include' });
        if (holRes.ok) {
          const holData = await holRes.json();
          setHolidays(Array.isArray(holData) ? holData : []);
        }
      }
    } catch (err) {
      console.error('Holiday toggle error', err);
    }
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setIsUpdatingSettings(true);

    const isGeofenceDisabled = officeSettings.geofenceEnabled === false;
    const payload = {
      ...officeSettings,
      officeLatitude: isGeofenceDisabled ? null : (officeSettings.officeLatitude !== '' && officeSettings.officeLatitude != null ? Number(officeSettings.officeLatitude) : null),
      officeLongitude: isGeofenceDisabled ? null : (officeSettings.officeLongitude !== '' && officeSettings.officeLongitude != null ? Number(officeSettings.officeLongitude) : null),
      allowedRadius: isGeofenceDisabled ? null : (officeSettings.allowedRadius !== '' && officeSettings.allowedRadius != null ? Number(officeSettings.allowedRadius) : null),
    };

    if (isGeofenceDisabled) {
      setAddressSearchQuery('');
      setCurrentAddress('Location not set');
    }

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/settings/office`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole()
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setOfficeSettings(payload);
        alert('Office Settings updated successfully!');
      } else {
        alert('Failed to update office settings.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating settings');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  useEffect(() => {
    return () => {
      stopUnlockCamera();
    };
  }, []);

  useEffect(() => {
    if (loggedAdmin) {
      fetchData();
      const intervalId = setInterval(() => {
        fetchData();
      }, 30000);
      return () => clearInterval(intervalId);
    }
  }, [activeTab, loggedAdmin]);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployee.name || !newEmployee.department || !newEmployee.password || !newEmployee.facePhotos || newEmployee.facePhotos.length === 0) {
      alert('Please fill out all required fields and upload 4 to 5 face photos.');
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole(),
        },
        credentials: 'include',
        body: JSON.stringify(newEmployee)
      });
      if (response.ok) {
        fetchData();
        setNewEmployee({
          name: '',
          department: '',
          password: '',
          facePhotos: [],
          role: 'employee',
          employeeType: 'employee',
          weeklyHours: 40,
          arrivalTime: '09:00 AM',
          departureTime: '05:00 PM'
        });
        setShowAddModal(false);
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to add employee');
      }
    } catch (err) {
      console.error(err);
      alert('Error adding employee');
    }
  };

  const handleEditClick = (emp) => {
    setSelectedProfileEmployee(emp);
  };

  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    if (!editingEmployee.name || !editingEmployee.department) {
      alert('Please fill out Name and Department.');
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(editingEmployee.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole(),
        },
        credentials: 'include',
        body: JSON.stringify(editingEmployee)
      });
      if (response.ok) {
        fetchData();
        setShowEditModal(false);
      } else {
        let errMsg = 'Failed to update employee';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch (_) {
          try {
            const txt = await response.text();
            errMsg = txt || errMsg;
          } catch (__) { }
        }
        alert(errMsg);
      }
    } catch (err) {
      console.error(err);
      alert('Error updating employee: ' + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth(`${API_BASE_URL}/api/admin-logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.error('Logout API failed:', e);
    }
    localStorage.removeItem('admin');
    navigate('/');
  };

  const handleExport = () => {
    if (filteredAttendanceLogs.length === 0) {
      alert("No logs to export.");
      return;
    }
    const headers = ['Employee ID', 'Name', 'Date', 'Check-in', 'Check-out', 'Status', 'Confidence'];
    const csvRows = [headers.join(',')];
    filteredAttendanceLogs.forEach(log => {
      const row = [
        log.id,
        `"${log.name}"`,
        `"${log.date}"`,
        log.checkIn,
        log.checkOut,
        log.status,
        log.confidence
      ];
      csvRows.push(row.join(','));
    });
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeApproveAttendance = async (logId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/approve/${logId}`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to approve attendance');
      }
    } catch (err) {
      console.error(err);
      alert('Error approving attendance');
    }
  };

  const executeRejectAttendance = async (logId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/reject/${logId}`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to reject attendance');
      }
    } catch (err) {
      console.error(err);
      alert('Error rejecting attendance');
    }
  };

  const executeApproveRequest = async (requestId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to approve request');
      }
    } catch (err) {
      console.error(err);
      alert('Error approving request');
    }
  };

  const executeRejectRequest = async (requestId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to reject request');
      }
    } catch (err) {
      console.error(err);
      alert('Error rejecting request');
    }
  };

  const executeUndoRequest = async (requestId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/requests/${requestId}/undo`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to undo request action');
      }
    } catch (err) {
      console.error(err);
      alert('Error undoing request action');
    }
  };

  const handleMarkRequestAsSeen = async (requestId) => {
    setRequests((prevRequests) =>
      prevRequests.map((r) => (r._id === requestId ? { ...r, adminSeen: true } : r))
    );
    try {
      await fetchWithAuth(`${API_BASE_URL}/api/requests/${requestId}/seen`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
    } catch (err) {
      console.error('Failed to mark request as seen:', err);
    }
  };

  const executeUndoAttendance = async (logId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/undo/${logId}`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to undo attendance');
      }
    } catch (err) {
      console.error(err);
      alert('Error undoing attendance');
    }
  };

  const executeUndoCheckout = async (logId) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/undo-checkout/${logId}`, {
        method: 'POST',
        headers: { 'x-user-role': getAdminRole(), },
        credentials: 'include'
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to undo checkout');
      }
    } catch (err) {
      console.error(err);
      alert('Error undoing checkout');
    }
  };

  const handleMarkLeaveOpen = (emp) => {
    setLeaveEmployee(emp);
    setLeaveDate(new Date().toISOString().split('T')[0]);
    setShowLeaveModal(true);
  };

  const handleMarkLeaveSubmit = async () => {
    if (!leaveEmployee || !leaveDate) return;
    setIsSubmittingLeave(true);
    try {
      const dateParts = leaveDate.split('-');
      const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/mark-leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole(),
        },
        credentials: 'include',
        body: JSON.stringify({
          employeeId: leaveEmployee.id,
          date: formattedDate
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert(`Leave marked successfully for ${leaveEmployee.name} on ${formattedDate}`);
        setShowLeaveModal(false);
        fetchData();
      } else {
        alert(data.error || 'Failed to mark leave');
      }
    } catch (err) {
      console.error(err);
      alert('Error marking leave');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleManualEditOpen = (empId, empName, dateStr = '', status = 'Present', checkIn = '--:--', checkOut = '--:--') => {
    const finalDate = dateStr || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    setManualEditData({
      employeeId: empId || '',
      employeeName: empName || '',
      date: finalDate,
      status: status || 'Present',
      checkIn: checkIn || '09:00 AM',
      checkOut: checkOut || '05:00 PM'
    });
    setShowManualEditModal(true);
  };

  const handleManualEditSubmit = async () => {
    if (!manualEditData.employeeId || !manualEditData.date || !manualEditData.status || !manualEditData.checkIn || !manualEditData.checkOut) {
      alert('Please fill out all required fields.');
      return;
    }
    setIsSubmittingManualEdit(true);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/manual-edit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole(),
        },
        credentials: 'include',
        body: JSON.stringify({
          employeeId: manualEditData.employeeId,
          date: manualEditData.date,
          status: manualEditData.status,
          checkIn: manualEditData.checkIn,
          checkOut: manualEditData.checkOut
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert('Attendance record updated successfully');
        setShowManualEditModal(false);
        fetchData();
        if (selectedEmployee) {
          handleViewEmployeeAttendance(selectedEmployee);
        }
      } else {
        alert(data.error || 'Failed to update attendance record');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating attendance record');
    } finally {
      setIsSubmittingManualEdit(false);
    }
  };


  const handleRemoveEmployee = (emp) => {
    setDeleteEmployeeObj(emp);
    setDeleteInputName('');
    setDeleteModalVisible(true);
  };

  const confirmRemoveEmployee = async () => {
    if (deleteInputName !== deleteEmployeeObj.name) {
      alert("Name does not match. Deletion cancelled.");
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(deleteEmployeeObj.id)}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': getAdminRole(),
        },
        credentials: 'include'
      });
      if (response.ok) {
        setDeleteModalVisible(false);
        setDeleteEmployeeObj(null);
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to remove employee');
      }
    } catch (err) {
      console.error(err);
      alert('Error removing employee');
    }
  };

  const executeToggleActive = async (emp) => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/employees/${encodeURIComponent(emp.id)}/active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole(),
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: !emp.isActive })
      });
      if (response.ok) {
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to toggle active status');
      }
    } catch (err) {
      console.error(err);
      alert('Error toggling active status');
    }
  };

  const handleApproveAttendance = (logId) => setConfirmConfig({ isOpen: true, title: 'Approve Attendance', message: 'Mark this employee as Present?', confirmText: 'Yes, Mark Present', cancelText: 'Cancel', onConfirm: () => executeApproveAttendance(logId) });
  const handleRejectAttendance = (logId) => setConfirmConfig({ isOpen: true, title: 'Reject Attendance', message: 'Mark this employee as Absent?', confirmText: 'Yes, Mark Absent', cancelText: 'Cancel', onConfirm: () => executeRejectAttendance(logId) });
  const handleApproveRequest = (requestId) => setConfirmConfig({ isOpen: true, title: 'Approve Request', message: 'Approve this request?', confirmText: 'Yes, Approve', cancelText: 'Cancel', onConfirm: () => executeApproveRequest(requestId) });
  const handleRejectRequest = (requestId) => setConfirmConfig({ isOpen: true, title: 'Reject Request', message: 'Reject this request?', confirmText: 'Yes, Reject', cancelText: 'Cancel', onConfirm: () => executeRejectRequest(requestId) });
  const handleUndoRequest = (requestId) => setConfirmConfig({ isOpen: true, title: 'Undo Request Action', message: 'Revert this request back to Pending?', confirmText: 'Yes, Revert to Pending', cancelText: 'Cancel', onConfirm: () => executeUndoRequest(requestId) });
  const handleUndoAttendance = (logId) => setConfirmConfig({ isOpen: true, title: 'Undo Attendance', message: 'Completely undo this attendance record?', confirmText: 'Yes, Undo', cancelText: 'Cancel', onConfirm: () => executeUndoAttendance(logId) });
  const handleUndoCheckout = (logId) => setConfirmConfig({ isOpen: true, title: 'Undo Checkout', message: 'Undo the checkout for this employee?', confirmText: 'Yes, Undo Checkout', cancelText: 'Cancel', onConfirm: () => executeUndoCheckout(logId) });
  const handleToggleActive = (emp) => setConfirmConfig({ isOpen: true, title: 'Toggle Active Status', message: `Change the active status of ${emp.name}?`, confirmText: 'Yes, Proceed', cancelText: 'Cancel', onConfirm: () => executeToggleActive(emp) });


  const handleSendChatMessage = async (reqId) => {
    if (!chatMessageText.trim()) return;
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/requests/${reqId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': getAdminRole()
        },
        credentials: 'include',
        body: JSON.stringify({
          senderId: loggedAdmin?.employeeId || 'admin',
          senderName: loggedAdmin?.name || 'Admin',
          senderRole: 'admin',
          text: chatMessageText.trim()
        })
      });
      if (response.ok) {
        setChatMessageText('');
        fetchData();
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData.error || 'Failed to send reply.');
      }
    } catch (err) {
      console.error(err);
      alert('Error sending reply: ' + (err.message || 'Network error'));
    }
  };

  const handleViewEmployeeAttendance = async (emp) => {
    setSelectedProfileEmployee(emp);
    setIsCalendarEditMode(false);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/attendance/logs/${encodeURIComponent(emp.id)}?_t=${Date.now()}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setEmployeeAttendanceLogs(data);
      }
    } catch (err) {
      console.error('Error fetching employee attendance logs:', err);
    }
  };

  const handlePrevModalMonth = () => {
    setCurrentModalDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextModalMonth = () => {
    setCurrentModalDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const renderCalendar = () => {
    const year = currentModalDate.getFullYear();
    const month = currentModalDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const blanks = Array(firstDay).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const calendarCells = [...blanks, ...days];

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStrShort = monthNamesShort[month];
    const monthNameLong = currentModalDate.toLocaleString('default', { month: 'long' });

    const getLogForDay = (day) => {
      if (!day) return null;
      const dayStr = day.toString();
      return employeeAttendanceLogs.find(log => {
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
    };

    const getStatusForDay = (day) => {
      const log = getLogForDay(day);
      return log ? log.status : null;
    };

    return (
      <div style={{ marginTop: '20px' }}>
        {/* Edit Mode Control Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: isCalendarEditMode ? '#7c3aed' : '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isCalendarEditMode ? (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#7c3aed', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
                Click any date to edit
              </>
            ) : 'View Mode'}
          </span>
          <button
            type="button"
            onClick={() => setIsCalendarEditMode(!isCalendarEditMode)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              border: '1px solid',
              backgroundColor: isCalendarEditMode ? '#475569' : '#7c3aed',
              borderColor: isCalendarEditMode ? '#475569' : '#7c3aed',
              color: '#ffffff',
              transition: 'all 0.2s'
            }}
          >
            {isCalendarEditMode ? 'Close Edit Mode' : 'Edit Attendance'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <button type="button" onClick={handlePrevModalMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>{monthNameLong} {year}</h3>
          <button type="button" onClick={handleNextModalMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ fontWeight: '600', fontSize: '12px', color: '#64748b' }}>{d}</div>
          ))}
          {calendarCells.map((day, idx) => {
            const log = getLogForDay(day);
            const status = log ? log.status : null;

            let isWeekend = false;
            if (day) {
              const cellDate = new Date(year, month, day);
              const dayOfWeek = cellDate.getDay();
              isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            }

            let bgColor = '#f1f5f9';
            let textColor = '#1e293b';

            if (isWeekend) {
              bgColor = '#e2e8f0';
              textColor = '#475569';
            }

            if (status === 'Present') { bgColor = '#22c55e'; textColor = '#ffffff'; }
            else if (status === 'Absent') { bgColor = '#ef4444'; textColor = '#ffffff'; }
            else if (status === 'Pending') { bgColor = '#f59e0b'; textColor = '#ffffff'; }
            else if (status === 'Manual Verify') { bgColor = '#e11d48'; textColor = '#ffffff'; }
            else if (status === 'Leave') { bgColor = '#7c3aed'; textColor = '#ffffff'; }

            const handleCellClick = () => {
              if (!day || !isCalendarEditMode) return;
              const cellDate = new Date(year, month, day);

              const now = new Date();
              now.setHours(0, 0, 0, 0);
              if (cellDate > now) {
                alert('Cannot modify attendance for future dates.');
                return;
              }

              const dateStr = cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

              handleManualEditOpen(
                selectedEmployee.id,
                selectedEmployee.name,
                dateStr,
                status || 'Present',
                log && log.checkIn ? log.checkIn : '09:00 AM',
                log && log.checkOut ? log.checkOut : '05:00 PM'
              );
            };

            return (
              <div
                key={idx}
                onClick={handleCellClick}
                style={{
                  height: '42px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  backgroundColor: day ? bgColor : 'transparent',
                  color: textColor,
                  fontSize: '14px',
                  fontWeight: '600',
                  border: day ? (isCalendarEditMode ? '1.5px dashed #7c3aed' : '1px solid #e2e8f0') : 'none',
                  cursor: day && isCalendarEditMode ? 'pointer' : 'default',
                  transition: 'all 0.2s'
                }}
              >
                <span>{day || ''}</span>
                {day && log && log.isLate && (
                  <span style={{
                    fontSize: '8px',
                    fontWeight: '800',
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    padding: '1px 4px',
                    borderRadius: '4px',
                    lineHeight: '1',
                    marginTop: '2px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Late
                  </span>
                )}
                {day && isWeekend && !status && (
                  <span style={{ fontSize: '9px', fontWeight: '500', color: '#64748b', display: 'block', marginTop: '1px' }}>Holiday</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Dynamic calculations for cards
  const totalEmployeesCount = employees.length;
  const presentCount = employees.filter(e => e.status === 'Present' || e.status === 'Active' || e.status === 'Manual Verify').length;
  const absentCount = employees.filter(e => e.status === 'Absent').length;
  const pendingApprovalsCount = requests.filter(r => r.status === 'Pending').length + attendanceLogs.filter(log => log.status === 'Pending').length;

  // Filter list based on search term and stats cards filter (Overview Tab)
  const filteredEmployees = employees.filter((emp) => {
    const term = (tableSearch || globalSearch).toLowerCase();
    const matchesSearch = (
      emp.name.toLowerCase().includes(term) ||
      emp.id.toLowerCase().includes(term) ||
      emp.department.toLowerCase().includes(term)
    );
    if (!matchesSearch) return false;

    if (selectedDepartmentFilter !== 'All' && (emp.department || '').trim().toLowerCase() !== selectedDepartmentFilter.trim().toLowerCase()) {
      return false;
    }

    if (roleTypeFilter !== 'All' && (emp.employeeType || emp.role) !== roleTypeFilter) {
      return false;
    }

    const empStatus = (emp.status || '').toLowerCase();
    if (statusFilter === 'Present') {
      return ['present', 'active', 'manual verify'].includes(empStatus);
    }
    if (statusFilter === 'Absent') {
      return empStatus === 'absent';
    }
    if (statusFilter === 'Pending') {
      const hasPendingRequest = requests.some(r => r.employeeId === emp.id && r.status === 'Pending');
      const hasPendingLog = attendanceLogs.some(log => log.employeeId === emp.id && log.status === 'Pending');
      return empStatus === 'pending' || hasPendingRequest || hasPendingLog;
    }
    return true;
  });

  const formatDateToYYYYMMDD = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // Filter list for Attendance logs
  const filteredAttendanceLogs = attendanceLogs.filter((log) => {
    const term = globalSearch.toLowerCase();
    const matchesSearch = log.name.toLowerCase().includes(term) || log.id.toLowerCase().includes(term);
    const matchesEmployee = attendanceEmployeeFilter === 'All' || log.id === attendanceEmployeeFilter;
    const logDateFormatted = formatDateToYYYYMMDD(log.date);
    const matchesDate = !attendanceDate || logDateFormatted === attendanceDate;
    return matchesSearch && matchesEmployee && matchesDate;
  });

  return (
    <div className="admin-dashboard">
      {/* Sidebar */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-user-info">
            <img
              src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150"
              alt="Admin Profile"
              className="brand-profile-pic"
            />
            <div className="brand-text">
              <h2>{loggedAdmin?.name || 'Admin Panel'}</h2>
              <p style={{ textTransform: 'uppercase', color: '#38bdf8', fontSize: '11px', fontWeight: 'bold' }}>
                {loggedAdmin?.role?.replace('-', ' ') || 'Administrator'}
              </p>
            </div>
          </div>
          <button
            className="mobile-hamburger-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

        <nav className="sidebar-menu">
          <button
            className={`menu-item ${activeTab === 'Overview' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Overview'); setIsMobileMenuOpen(false); }}
          >
            <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
            Overview
          </button>
          <button
            className={`menu-item ${activeTab === 'GoalTracking' ? 'active' : ''}`}
            onClick={() => { setActiveTab('GoalTracking'); setIsMobileMenuOpen(false); }}
          >
            <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Goal Tracking
          </button>
          <button
            className={`menu-item ${activeTab === 'Employees' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Employees'); setIsMobileMenuOpen(false); }}
          >
            <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Employees
          </button>
          <button
            className={`menu-item ${activeTab === 'Attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Attendance'); setIsMobileMenuOpen(false); }}
          >
            <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Attendance
          </button>
          <button
            className={`menu-item ${activeTab === 'Approvals' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Approvals'); setIsMobileMenuOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', width: '100%' }}
          >
            <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Approvals</span>
            {requests.filter(r => !r.adminSeen).length > 0 && (
              <span className="menu-badge" style={{
                marginLeft: 'auto',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '10px',
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
              }}>
                {requests.filter(r => !r.adminSeen).length}
              </span>
            )}
          </button>
          {['super-admin', 'admin'].includes(loggedAdmin?.role) && (
            <>
              <button
                className={`menu-item ${activeTab === 'Departments' ? 'active' : ''}`}
                onClick={() => { setActiveTab('Departments'); setIsMobileMenuOpen(false); }}
              >
                <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                  <rect x="9" y="9" width="6" height="6" />
                </svg>
                Departments
              </button>
              <button
                className={`menu-item ${activeTab === 'OfficeSettings' ? 'active' : ''}`}
                onClick={() => { setActiveTab('OfficeSettings'); setIsMobileMenuOpen(false); }}
              >
                <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Office Settings
              </button>
              <button
                className={`menu-item ${activeTab === 'Holidays' ? 'active' : ''}`}
                onClick={() => { setActiveTab('Holidays'); setIsMobileMenuOpen(false); }}
              >
                <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                Holidays
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          {loggedAdmin?.role !== 'viewer-admin' && (
            <button className="btn-add-employee" onClick={() => { setShowAddModal(true); setIsMobileMenuOpen(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="17" y1="11" x2="23" y2="11" />
              </svg>
              Add Employee
            </button>
          )}

          <button className="menu-item settings-link" onClick={() => setIsMobileMenuOpen(false)}>
            <svg className="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
          <button className="menu-item logout-link" onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}>
            <svg className="menu-icon logout-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      {activeTab === 'Overview' && (
        <main className="main-content">
          <header className="content-header">
            <div className="header-titles">
              <h1>Dashboard Overview</h1>
              <p>Today&apos;s attendance summary and quick actions.</p>
            </div>
            <div className="header-search-wrapper">
              <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Quick search..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
            </div>
          </header>

          {/* Stats Grid */}
          <section className="stats-grid">
            <div
              className={`stat-card ${statusFilter === 'All' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter('All')}
              style={{ cursor: 'pointer', border: statusFilter === 'All' ? '2px solid #1062b3' : '1px solid #e2e8f0', transition: 'all 0.2s ease' }}
            >
              <div className="stat-icon-wrapper total-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Total</span>
                <h3 className="stat-value">{totalEmployeesCount}</h3>
                <span className="stat-trend trend-up">↑ 2 new this week</span>
              </div>
            </div>

            <div
              className={`stat-card ${statusFilter === 'Present' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'Present' ? 'All' : 'Present')}
              style={{ cursor: 'pointer', border: statusFilter === 'Present' ? '2px solid #10b981' : '1px solid #e2e8f0', transition: 'all 0.2s ease' }}
            >
              <div className="stat-icon-wrapper present-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Present</span>
                <h3 className="stat-value">{presentCount}</h3>
                <span className="stat-trend trend-neutral">Today</span>
              </div>
            </div>

            <div
              className={`stat-card ${statusFilter === 'Absent' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'Absent' ? 'All' : 'Absent')}
              style={{ cursor: 'pointer', border: statusFilter === 'Absent' ? '2px solid #ef4444' : '1px solid #e2e8f0', transition: 'all 0.2s ease' }}
            >
              <div className="stat-icon-wrapper absent-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Absent</span>
                <h3 className="stat-value">{absentCount}</h3>
                <span className="stat-trend trend-neutral">Today</span>
              </div>
            </div>

            <div
              className={`stat-card ${statusFilter === 'Pending' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'Pending' ? 'All' : 'Pending')}
              style={{ cursor: 'pointer', border: statusFilter === 'Pending' ? '2px solid #f59e0b' : '1px solid #e2e8f0', transition: 'all 0.2s ease' }}
            >
              <div className="stat-icon-wrapper pending-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Pending Approvals</span>
                <h3 className="stat-value">{pendingApprovalsCount}</h3>
                <span className="stat-trend trend-warning">▲ Requires attention</span>
              </div>
            </div>
          </section>

          {/* Data Table Section */}
          <section className="data-table-section">
            <div className="table-header-controls">
              <h2>Employees Data</h2>
              <div className="controls-right">
                <div className="table-search-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                  />
                </div>

                <select 
                  className="sleek-inline-select"
                  value={selectedDepartmentFilter} 
                  onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                >
                  <option value="All">All Departments</option>
                  {departments.map((d) => (
                    <option key={d._id || d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>

                <select 
                  className="sleek-inline-select"
                  value={roleTypeFilter} 
                  onChange={(e) => setRoleTypeFilter(e.target.value)}
                >
                  <option value="All">All Roles</option>
                  <option value="full-time">Full-Time</option>
                  <option value="part-time">Part-Time</option>
                  <option value="contract">Contractor</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
            </div>
            <div className="sleek-employee-list" style={{ marginTop: '16px' }}>
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => {
                  const empIdStr = String(emp.id || '').trim();
                  const empAltIdStr = String(emp.employeeId || '').trim();

                  const pendingReq = requests.find(r => {
                    if (r.status !== 'Pending' || !r.employeeId) return false;
                    const rId = String(r.employeeId).trim();
                    return Boolean(rId && (rId === empIdStr || (empAltIdStr && rId === empAltIdStr)));
                  });

                  const pendingLog = attendanceLogs.find(log => {
                    if (log.status !== 'Pending') return false;
                    const lId = String(log.employeeId || log.id || '').trim();
                    return Boolean(lId && (lId === empIdStr || (empAltIdStr && lId === empAltIdStr)));
                  });

                  return (
                    <div
                      key={emp.id}
                      className="sleek-employee-row"
                      onClick={() => handleViewEmployeeAttendance(emp)}
                    >
                      <div className="sleek-row-left">
                        <img
                          src={emp.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || 'User')}&background=f1f5f9&color=0f172a&rounded=true`}
                          alt={emp.name}
                          className="sleek-avatar"
                        />
                        <div className="sleek-info">
                          <div className="sleek-name">{emp.name}</div>
                          <div className="sleek-subinfo">ID: {emp.id} <span className="sleek-dot">•</span> {emp.department} <span className="sleek-dot">•</span> {emp.employeeType || 'employee'} ({emp.weeklyHours || 40}h)</div>
                          {pendingReq && (
                            <div style={{ fontSize: '12px', color: '#b45309', fontWeight: '600', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>⚠️ Pending {pendingReq.requestType} Request:</span>
                              <span style={{ fontStyle: 'italic', opacity: 0.9 }}>"{pendingReq.details}"</span>
                            </div>
                          )}
                          {!pendingReq && pendingLog && (
                            <div style={{ fontSize: '12px', color: '#b45309', fontWeight: '600', marginTop: '3px' }}>
                              ⚠️ Pending Attendance Log Verification
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="sleek-row-right">
                        <div className="sleek-status">
                          {statusFilter === 'Pending' || pendingReq || pendingLog ? (
                            <span className="sleek-badge" style={{ backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                              {pendingReq ? `Pending (${pendingReq.requestType})` : pendingLog ? 'Pending (Log)' : 'Pending'}
                            </span>
                          ) : (
                            <span className={`sleek-badge ${emp.status.toLowerCase() === 'absent' ? 'inactive' : 'active'}`}>
                              {emp.status}
                            </span>
                          )}
                        </div>

                        <div className="sleek-actions" onClick={(e) => e.stopPropagation()}>
                          {(pendingReq || pendingLog) && (
                            <button
                              className="sleek-btn"
                              style={{ backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}
                              onClick={(e) => { e.stopPropagation(); setActiveTab('Approvals'); }}
                              title="Go to Approvals tab to review"
                            >
                              Review Request
                            </button>
                          )}
                          {canManageEmployees ? (
                            <>
                              <button
                                className="sleek-btn"
                                style={{ backgroundColor: '#f3e8ff', color: '#7c3aed', borderColor: '#e9d5ff' }}
                                onClick={(e) => { e.stopPropagation(); handleMarkLeaveOpen(emp); }}
                              >
                                Leave
                              </button>
                              <button
                                className="sleek-btn sleek-btn-remove"
                                onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(emp); }}
                              >
                                Remove
                              </button>
                              <button
                                className="sleek-btn"
                                style={{ 
                                  backgroundColor: emp.isActive ? '#dcfce7' : '#fef3c7',
                                  color: emp.isActive ? '#166534' : '#92400e',
                                  borderColor: emp.isActive ? '#bbf7d0' : '#fde68a'
                                }}
                                onClick={(e) => { e.stopPropagation(); handleToggleActive(emp); }}
                              >
                                {emp.isActive ? 'Active' : 'Inactive'}
                              </button>
                            </>
                          ) : (
                            <span className="sleek-view-only">Restricted</span>
                          )}
                        </div>
                        
                        <div className="sleek-chevron">
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="sleek-empty-state">No employees found.</div>
              )}
            </div>

            <div className="table-footer">
              <span>Showing 1 to {filteredEmployees.length} of {totalEmployeesCount} entries</span>
              <div className="pagination-buttons">
                <button className="btn-pagination" disabled>Prev</button>
                <button className="btn-pagination">Next</button>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Attendance Logs Content Area */}
      {activeTab === 'Attendance' && (
        <main className="main-content">
          <header className="content-header">
            <div className="header-titles">
              <h1>Attendance Logs</h1>
              <p>Review daily employee check-ins and system confidence scores.</p>
            </div>

            {/* Filters Row from image */}
            <div className="attendance-filters-row">
              <div className="filter-item-box">
                <label>Date Range</label>
                <div className="filter-input-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="filter-item-box">
                <label>Employee</label>
                <div className="filter-input-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  <select
                    value={attendanceEmployeeFilter}
                    onChange={(e) => setAttendanceEmployeeFilter(e.target.value)}
                  >
                    <option value="All">All Employees</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button className="btn-export-logs" onClick={handleExport}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
            </div>
          </header>

          {/* Attendance Table */}
          <section className="data-table-section">
            <div className="table-wrapper">
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Date</th>
                    <th>Check-in / Tasks</th>
                    <th>Check-out / Done Work</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th style={{ width: '220px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendanceLogs.length > 0 ? (
                    filteredAttendanceLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td>
                          <div className="attendance-profile-cell">
                            {log.photo ? (
                              <img src={log.photo} alt={log.name} className="employee-photo-avatar" />
                            ) : (
                              <div className="initials-avatar">{log.initials}</div>
                            )}
                            <span className="emp-name" style={{ marginLeft: '12px' }}>{log.name}</span>
                          </div>
                        </td>
                        <td className="checkin-time-cell">{log.date}</td>
                        <td className="checkin-time-cell">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{log.checkIn}</span>
                              {log.isLate && (
                                <span style={{
                                  backgroundColor: '#fee2e2',
                                  color: '#ef4444',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: '700'
                                }}>LATE</span>
                              )}
                            </div>
                            {log.tasks && (
                              <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.tasks}>
                                Task: {log.tasks}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="checkin-time-cell">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span>{log.checkOut}</span>
                            {log.workDone && (
                              <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.workDone}>
                                Done: {log.workDone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${log.status.toLowerCase().replace(' ', '-')}`}>
                            <span className="badge-dot"></span>
                            {log.status}
                          </span>
                        </td>
                        <td>
                          <div className="confidence-cell">
                            <span className={`confidence-val ${log.confidenceType}`}>
                              {log.confidence}
                            </span>
                            {log.confidenceType === 'high' && (
                              <svg className="confidence-icon green" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <polyline points="9 11 11 13 15 9" />
                              </svg>
                            )}
                            {log.confidenceType === 'warning' && (
                              <svg className="confidence-icon red" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {log.status === 'Pending' && (
                              <>
                                <button
                                  onClick={() => handleApproveAttendance(log._id)}
                                  style={{
                                    padding: '4px 8px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                                  }}
                                >
                                  Mark Present
                                </button>
                                <button
                                  onClick={() => handleRejectAttendance(log._id)}
                                  style={{
                                    padding: '4px 8px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                                  }}
                                >
                                  Mark Absent
                                </button>
                              </>
                            )}
                            {(log.status === 'Present' || log.status === 'Absent' || log.status === 'Manual Verify') && canManageEmployees && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  title="Undo Attendance"
                                  onClick={() => handleUndoAttendance(log._id)}
                                  style={{
                                    padding: '4px 8px', backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                                  }}
                                >
                                  Undo
                                </button>
                                {log.checkOut !== '--:--' && (
                                  <button
                                    title="Undo Checkout"
                                    onClick={() => handleUndoCheckout(log._id)}
                                    style={{
                                      padding: '4px 8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                                    }}
                                  >
                                    Undo Checkout
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="chat-row">
                      <td colSpan="6" className="no-data-cell" style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontStyle: 'italic' }}>No attendance logs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>Showing 1 to {filteredAttendanceLogs.length} of 24 entries</span>
              <div className="pagination-buttons">
                <button className="btn-pagination" disabled>&lt;</button>
                <button className="btn-pagination active-page">1</button>
                <button className="btn-pagination">2</button>
                <button className="btn-pagination">3</button>
                <span className="pagination-dots">...</span>
                <button className="btn-pagination">5</button>
                <button className="btn-pagination">&gt;</button>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Approvals tab view */}
      {activeTab === 'Approvals' && (
        <main className="main-content">
          <header className="content-header">
            <div className="header-titles">
              <h1>Approvals & Requests</h1>
              <p>Review and manage correction requests or message requests from employees.</p>
            </div>
          </header>

          {/* Pending Attendance Approvals Section */}
          <section className="data-table-section" style={{ marginBottom: '30px' }}>
            <div className="table-header-controls">
              <h2>Pending Attendance Logs</h2>
            </div>
            <div className="table-wrapper">
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Time / Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLogs.filter(log => log.status === 'Pending').length > 0 ? (
                    attendanceLogs.filter(log => log.status === 'Pending').map((log) => (
                      <tr key={log._id}>
                        <td>
                          <img src={log.photo} alt={log.name} className="employee-photo-avatar" />
                        </td>
                        <td>
                          <span className="emp-name">{log.name}</span>
                        </td>
                        <td className="emp-id-cell">{log.id}</td>
                        <td className="checkin-time-cell">{log.checkIn} on {log.date}</td>
                        <td>
                          <span className="status-badge pending">
                            <span className="badge-dot"></span>
                            Pending Approval
                          </span>
                        </td>
                        <td>
                          {loggedAdmin?.role !== 'viewer-admin' ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleApproveAttendance(log._id)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#10b981',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: '500'
                                }}
                              >
                                Mark Present
                              </button>
                              <button
                                onClick={() => handleRejectAttendance(log._id)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#ef4444',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: '500'
                                }}
                              >
                                Mark Absent
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Read Only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="no-data-cell">No pending attendance logs requiring approval.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="data-table-section">
            <div className="table-header-controls">
              <h2>Correction & Message Requests</h2>
            </div>
            <div className="table-wrapper">
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Request Type</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length > 0 ? (
                    requests.map((req) => (
                      <React.Fragment key={req._id}>
                        <tr
                          className={`request-row ${!req.adminSeen ? 'unseen-req' : 'seen-req'} ${req.status.toLowerCase()}`}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: activeChatRequestId === req._id ? '#f1f5f9' : undefined,
                            transition: 'all 0.2s ease'
                          }}
                          onClick={() => {
                            const isOpening = activeChatRequestId !== req._id;
                            setActiveChatRequestId(isOpening ? req._id : null);
                            if (isOpening && !req.adminSeen) {
                              handleMarkRequestAsSeen(req._id);
                            }
                          }}
                        >
                          <td className="emp-id-cell" data-label="Employee ID">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {!req.adminSeen && (
                                <span style={{
                                  display: 'inline-block',
                                  width: '8px',
                                  height: '8px',
                                  backgroundColor: '#1062b3',
                                  borderRadius: '50%',
                                  boxShadow: '0 0 8px #1062b3',
                                  flexShrink: 0
                                }} title="Unseen / New Request"></span>
                              )}
                              {req.employeeId}
                            </span>
                          </td>
                          <td className="emp-name" data-label="Name"><span>{req.name}</span></td>
                          <td data-label="Type"><span>{req.requestType}</span></td>
                          <td style={{ maxWidth: '300px', minWidth: 0 }} data-label="Details">
                            <div className="text-truncate" title={req.details} style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal', wordBreak: 'break-all', fontSize: '14px', color: '#475569' }}>
                              {req.details}
                            </div>
                          </td>
                          <td data-label="Status">
                            <span className={`status-badge ${req.status.toLowerCase()}`}>
                              <span className="badge-dot"></span>
                              {req.status}
                            </span>
                          </td>
                          <td data-label="Actions">
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                              {req.status === 'Pending' && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleApproveRequest(req._id); }}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#10b981',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRejectRequest(req._id); }}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#ef4444',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {req.status !== 'Pending' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>Resolved</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUndoRequest(req._id); }}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#f1f5f9',
                                      color: '#475569',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      transition: 'all 0.2s ease'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '-1px' }}>
                                      <path d="M3 7v6h6" />
                                      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                                    </svg>
                                    Undo
                                  </button>
                                </div>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const isOpening = activeChatRequestId !== req._id;
                                  setActiveChatRequestId(isOpening ? req._id : null);
                                  if (isOpening && !req.adminSeen) {
                                    handleMarkRequestAsSeen(req._id);
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: activeChatRequestId === req._id ? '#475569' : '#eff6ff',
                                  color: activeChatRequestId === req._id ? '#fff' : '#1062b3',
                                  border: '1px solid #dbeafe',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}
                              >
                                💬 <span className="btn-text">Chat</span> {req.messages && req.messages.length > 0 && `(${req.messages.length})`}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {activeChatRequestId === req._id && (
                          <tr className="chat-row" style={{ backgroundColor: '#f8fafc' }}>
                            <td colSpan="6" className="chat-cell" style={{ padding: '16px 24px' }}>
                              <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '12px', backgroundColor: '#ffffff', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', textAlign: 'left' }}>
                                  Discussion Thread with {req.name}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }}>
                                  {req.messages && req.messages.length > 0 ? (
                                    req.messages.map((msg, mIdx) => msg ? (
                                      <div
                                        key={mIdx}
                                        style={{
                                          alignSelf: msg.senderRole === 'admin' ? 'flex-end' : (msg.senderRole === 'system' ? 'center' : 'flex-start'),
                                          backgroundColor: msg.senderRole === 'admin' ? '#1062b3' : (msg.senderRole === 'system' ? '#f1f5f9' : '#ffffff'),
                                          color: msg.senderRole === 'admin' ? '#ffffff' : '#0f172a',
                                          padding: '10px 14px',
                                          borderRadius: '12px',
                                          borderBottomRightRadius: msg.senderRole === 'admin' ? '4px' : '12px',
                                          borderBottomLeftRadius: msg.senderRole === 'employee' ? '4px' : '12px',
                                          maxWidth: '85%',
                                          fontSize: '14px',
                                          boxShadow: msg.senderRole === 'system' ? 'none' : '0 2px 4px rgba(0,0,0,0.05)',
                                          border: msg.senderRole === 'system' ? 'none' : (msg.senderRole === 'employee' ? '1px solid #cbd5e1' : 'none'),
                                          borderLeft: msg.senderRole === 'employee' ? '4px solid #f59e0b' : (msg.senderRole === 'system' ? 'none' : 'none'),
                                          textAlign: 'left'
                                        }}
                                      >
                                        <div style={{ fontWeight: '800', fontSize: '11px', color: msg.senderRole === 'admin' ? '#bfdbfe' : (msg.senderRole === 'system' ? '#64748b' : '#f59e0b'), marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                          {msg.senderRole === 'employee' ? 'Employee Reply' : msg.senderName}
                                        </div>
                                        <div style={{ lineHeight: 1.5 }}>{msg.text}</div>
                                        <div style={{ fontSize: '10px', color: msg.senderRole === 'admin' ? '#bfdbfe' : '#94a3b8', textAlign: 'right', marginTop: '6px' }}>
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
                    <tr>
                      <td colSpan="6" className="no-data-cell">No requests or approvals found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}

      {/* Departments tab view */}
      {activeTab === 'Departments' && ['super-admin', 'admin'].includes(loggedAdmin?.role) && (
        <main className="main-content">
          <header className="content-header">
            <div className="header-titles">
              <h1>Departments Management</h1>
              <p>Create and delete departments within your organization.</p>
            </div>
          </header>

          <section className="data-table-section" style={{ maxWidth: '600px', marginBottom: '24px' }}>
            <h2>Add New Department</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newDeptName.trim()) return;
              try {
                const response = await fetchWithAuth(`${API_BASE_URL}/api/departments`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': getAdminRole(),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ name: newDeptName.trim() })
                });
                if (response.ok) {
                  setNewDeptName('');
                  fetchData();
                } else {
                  const errData = await response.json();
                  alert(errData.error || 'Failed to add department');
                }
              } catch (err) {
                console.error(err);
                alert('Error adding department');
              }
            }} style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <input
                type="text"
                placeholder="e.g. Finance"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                required
                style={{
                  flexGrow: 1,
                  padding: '10px 14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: '8px' }}>Add</button>
            </form>
          </section>

          <section className="data-table-section" style={{ maxWidth: '600px' }}>
            <h2>Existing Departments</h2>
            <div className="table-wrapper" style={{ marginTop: '12px', overflowX: 'hidden' }}>
              <table className="employees-table" style={{ minWidth: '100%', width: '100%' }}>
                <thead>
                  <tr>
                    <th>Department Name</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length > 0 ? (
                    departments.map((dept) => {
                      let deptEmployees = employees.filter(emp => (emp.department || '').trim().toLowerCase() === (dept.name || '').trim().toLowerCase());
                      const totalEmployeesInDept = deptEmployees.length;
                      const isExpanded = expandedDept === dept.name;

                      if (isExpanded) {
                        if (deptEmployeeSearch.trim()) {
                          const lowerQ = deptEmployeeSearch.toLowerCase();
                          deptEmployees = deptEmployees.filter(emp => emp.name.toLowerCase().includes(lowerQ) || String(emp.id).toLowerCase().includes(lowerQ));
                        }
                        deptEmployees.sort((a, b) => {
                          if (deptEmployeeSort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
                          if (deptEmployeeSort === 'name-desc') return (b.name || '').localeCompare(a.name || '');
                          if (deptEmployeeSort === 'id-asc') return String(a.id).localeCompare(String(b.id));
                          if (deptEmployeeSort === 'id-desc') return String(b.id).localeCompare(String(a.id));
                          return 0;
                        });
                      }

                      return (
                        <React.Fragment key={dept._id}>
                          <tr 
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedDept(null);
                              } else {
                                setExpandedDept(dept.name);
                                setDeptEmployeeSearch('');
                                setDeptEmployeeSort('name-asc');
                              }
                            }}
                            style={{ cursor: 'pointer', transition: 'background-color 0.2s', backgroundColor: isExpanded ? '#f8fafc' : 'transparent' }}
                          >
                            <td className="emp-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                <polyline points="9 18 15 12 9 6"></polyline>
                              </svg>
                              {dept.name}
                              <span style={{ fontSize: '12px', backgroundColor: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '12px', marginLeft: 'auto' }}>
                                {totalEmployeesInDept} employees
                              </span>
                            </td>
                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                              <button
                                className="sleek-btn sleek-btn-remove"
                                onClick={() => {
                                  setDepartmentToDelete(dept);
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan="2" style={{ padding: 0, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                                  {totalEmployeesInDept > 0 && (
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', padding: '0 4px' }}>
                                      <div style={{ flex: 1, position: 'relative' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                                          <circle cx="11" cy="11" r="8"></circle>
                                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                        </svg>
                                        <input 
                                          type="text" 
                                          placeholder="Search by name or ID..." 
                                          className="sleek-input" 
                                          style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                          value={deptEmployeeSearch}
                                          onChange={(e) => setDeptEmployeeSearch(e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                      <select 
                                        className="sleek-select" 
                                        style={{ padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
                                        value={deptEmployeeSort}
                                        onChange={(e) => setDeptEmployeeSort(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="name-asc">Sort: A to Z</option>
                                        <option value="name-desc">Sort: Z to A</option>
                                        <option value="id-asc">Sort: ID Asc</option>
                                        <option value="id-desc">Sort: ID Desc</option>
                                      </select>
                                    </div>
                                  )}
                                  
                                  {deptEmployees.length > 0 ? (
                                    <div className="sleek-employee-list">
                                      {deptEmployees.map(emp => (
                                        <div 
                                          key={emp.id} 
                                          className="sleek-employee-row"
                                          onClick={() => setSelectedProfileEmployee(emp)}
                                          style={{ cursor: 'pointer', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                        >
                                          <img
                                            src={emp.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || 'User')}&background=f1f5f9&color=0f172a&rounded=true`}
                                            alt={emp.name}
                                            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                                          />
                                          <div>
                                            <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{emp.name}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b' }}>ID: {emp.id} • {emp.isActive !== false ? 'Active' : 'Inactive'}</div>
                                          </div>
                                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                          </svg>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '20px 0' }}>
                                      No employees in this department.
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="2" className="no-data-cell">No departments configured.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}

      {/* OfficeSettings tab view */}
      {activeTab === 'OfficeSettings' && ['super-admin', 'admin'].includes(loggedAdmin?.role) && (
        <main className="main-content">
          <header className="content-header">
            <div className="header-titles">
              <h1>Office Settings</h1>
              <p>Configure Geofencing coordinates and security/VPN validation.</p>
            </div>
          </header>

          <section className="data-table-section" style={{ maxWidth: '680px', padding: '28px', backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 12px 30px -8px rgba(15, 23, 42, 0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0, lineHeight: 1.2 }}>Geofencing & Security Settings</h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Manage location accuracy, radius limits, and VPN enforcement.</p>
              </div>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Search Location by Link / Address</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  value={addressSearchQuery}
                  onChange={(e) => setAddressSearchQuery(e.target.value)}
                  placeholder="Paste Google Maps Shared Link or coordinates..."
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddressSearch(e); }}
                  style={{ flex: '1 1 240px', padding: '12px 16px', border: '1.5px solid #cbd5e1', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', transition: 'all 0.2s' }}
                />
                <button 
                  type="button"
                  onClick={handleAddressSearch}
                  disabled={isSearchingAddress}
                  style={{ padding: '12px 20px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}
                >
                  {isSearchingAddress ? 'Locating...' : 'Set Location'}
                </button>
              </div>
            </div>

            <form onSubmit={handleUpdateSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%)', padding: '16px', borderRadius: '14px', border: '1px solid #bae6fd', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0, boxShadow: '0 2px 6px rgba(2, 132, 199, 0.15)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Currently Selected Location</span>
                  <p style={{ fontSize: '14px', color: '#0c4a6e', fontWeight: '600', margin: '4px 0 0 0', lineHeight: '1.4' }}>{currentAddress || 'Address not found'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Office Latitude</label>
                  <input
                    type="number"
                    step="any"
                    required={officeSettings.geofenceEnabled !== false}
                    value={officeSettings.officeLatitude ?? ''}
                    onChange={(e) => setOfficeSettings(prev => ({ ...prev, officeLatitude: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="e.g. 31.5771"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      outline: 'none',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      backgroundColor: '#ffffff'
                    }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Office Longitude</label>
                  <input
                    type="number"
                    step="any"
                    required={officeSettings.geofenceEnabled !== false}
                    value={officeSettings.officeLongitude ?? ''}
                    onChange={(e) => setOfficeSettings(prev => ({ ...prev, officeLongitude: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="e.g. 74.3571"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      outline: 'none',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      backgroundColor: '#ffffff'
                    }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Allowed Radius (in meters)</label>
                <input
                  type="number"
                  min="5"
                  max="10000"
                  required={officeSettings.geofenceEnabled !== false}
                  value={officeSettings.allowedRadius ?? ''}
                  onChange={(e) => setOfficeSettings(prev => ({ ...prev, allowedRadius: e.target.value === '' ? '' : Number(e.target.value) }))}
                  placeholder="e.g. 100"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '10px',
                    outline: 'none',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="geofenceEnabled"
                    checked={officeSettings.geofenceEnabled !== false}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setOfficeSettings(prev => ({
                        ...prev,
                        geofenceEnabled: isChecked,
                        ...(isChecked ? {} : { officeLatitude: '', officeLongitude: '', allowedRadius: '' })
                      }));
                      if (!isChecked) {
                        setAddressSearchQuery('');
                        setCurrentAddress('Location not set');
                      }
                    }}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb', marginTop: '2px' }}
                  />
                  <div>
                    <label htmlFor="geofenceEnabled" style={{ fontWeight: '700', color: '#1e293b', cursor: 'pointer', fontSize: '14px' }}>
                      Enable Geofence Location Lock
                    </label>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0', lineHeight: '1.4' }}>
                      Uncheck this if you want to allow employees to check-in from anywhere without distance limits.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <input
                    type="checkbox"
                    id="vpnCheckEnabled"
                    checked={officeSettings.vpnCheckEnabled}
                    onChange={(e) => setOfficeSettings(prev => ({ ...prev, vpnCheckEnabled: e.target.checked }))}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                  <label htmlFor="vpnCheckEnabled" style={{ fontWeight: '700', color: '#1e293b', cursor: 'pointer', fontSize: '14px' }}>
                    Enable VPN Timezone Checking
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <input
                    type="checkbox"
                    id="saturdayOff"
                    checked={officeSettings?.saturdayOff}
                    onChange={(e) => setOfficeSettings(prev => ({ ...prev, saturdayOff: e.target.checked }))}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                  <label htmlFor="saturdayOff" style={{ fontWeight: '700', color: '#1e293b', cursor: 'pointer', fontSize: '14px' }}>
                    Mark Saturdays as Off (Weekend Holiday)
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={isUpdatingSettings}
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.2)', transition: 'all 0.2s ease' }}
                >
                  {isUpdatingSettings ? 'Saving Settings...' : 'Save Office Settings'}
                </button>
              </div>
            </form>
          </section>
        </main>
      )}

      {/* Holidays Management tab view */}
      {activeTab === 'Holidays' && (
        <main className="main-content">
          <header className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="header-titles">
              <h1>Holidays Management</h1>
              <p>Manage company holidays and official public events.</p>
            </div>
          </header>

          <section className="data-table-section" style={{ padding: '24px', backgroundColor: '#f8fafc', borderRadius: '16px' }}>
            {(() => {
              const year = currentHolidayMonth.getFullYear();
              const month = currentHolidayMonth.getMonth();
              const firstDay = new Date(year, month, 1);
              const lastDay = new Date(year, month + 1, 0);
              const startDate = new Date(firstDay);
              startDate.setDate(startDate.getDate() - (startDate.getDay() === 0 ? 6 : startDate.getDay() - 1));
              const endDate = new Date(lastDay);
              if (endDate.getDay() !== 0) {
                endDate.setDate(endDate.getDate() + (7 - endDate.getDay()));
              }

              const days = [];
              let d = new Date(startDate);
              while (d <= endDate) {
                days.push(new Date(d));
                d.setDate(d.getDate() + 1);
              }

              return (
                <div className="holiday-calendar-container">
                  <div className="holiday-calendar-header">
                    <button onClick={() => setCurrentHolidayMonth(new Date(year, month - 1, 1))} className="holiday-nav-btn">
                      &lt; Prev
                    </button>
                    <h2 className="holiday-calendar-title">
                      {currentHolidayMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button onClick={() => setCurrentHolidayMonth(new Date(year, month + 1, 1))} className="holiday-nav-btn">
                      Next &gt;
                    </button>
                  </div>
                  <div className="holiday-calendar-grid">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <div key={day} className="holiday-calendar-day-header">{day}</div>
                    ))}
                    {days.map((date, idx) => {
                      const isCurrentMonth = date.getMonth() === month;
                      const isToday = new Date().toDateString() === date.toDateString();
                      const dateStr = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                      const hol = holidays.find(h => new Date(h.date).toISOString().split('T')[0] === dateStr);
                      const isSatOff = officeSettings?.saturdayOff && date.getDay() === 6;
                      const isSunday = date.getDay() === 0;
                      
                      let cellClass = "holiday-cell";
                      if (!isCurrentMonth) cellClass += " out-of-month";
                      if (isToday) cellClass += " is-today";
                      if (isSatOff || isSunday) cellClass += " is-weekend";
                      else if (hol) cellClass += " is-holiday";

                      return (
                        <div
                          key={idx}
                          className={cellClass}
                          onClick={() => {
                            if (isSatOff || isSunday) return;
                            setHolidayModal({ isOpen: true, dateStr, hol });
                          }}
                        >
                          <span className="holiday-date-num">{date.getDate()}</span>
                          {((isSatOff && date.getDay() === 6) || isSunday) && (
                            <span className="holiday-label weekend-label">Weekend</span>
                          )}
                          {hol && !(isSatOff && date.getDay() === 6) && !isSunday && (
                            <span className="holiday-label public-label">{hol.name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </section>
        </main>
      )}
      {/* Employees tab view */}
      {activeTab === 'Employees' && (
        <main className="main-content">
          <header className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="header-titles">
              <h1>Employee Directory</h1>
              <p>View and manage all registered employees profiles.</p>
            </div>
            <div className="directory-filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
              <select 
                className="form-control" 
                value={employeeStatusFilter} 
                onChange={(e) => { setEmployeeStatusFilter(e.target.value); setCurrentPage(1); }}
                style={{ width: '150px' }}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select 
                className="form-control" 
                value={itemsPerPage} 
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                style={{ width: '150px' }}
              >
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
                <option value="200">200 per page</option>
                <option value="1000">1000 per page</option>
              </select>
            </div>
          </header>

          <section className="data-table-section" style={{ padding: '24px', backgroundColor: '#f8fafc', borderRadius: '16px' }}>
            <div className="employees-directory-container">
              <div className="sleek-employee-list">
                {employees.length > 0 ? (
                  employees.map((emp) => (
                    <div 
                      key={emp.id} 
                      className="sleek-employee-row"
                      onClick={() => setSelectedProfileEmployee(emp)}
                    >
                      <div className="sleek-row-left">
                        <img
                          src={emp.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || 'User')}&background=f1f5f9&color=0f172a&rounded=true`}
                          alt={emp.name}
                          className="sleek-avatar"
                        />
                        <div className="sleek-info">
                          <div className="sleek-name">{emp.name}</div>
                          <div className="sleek-subinfo">ID: {emp.id} <span className="sleek-dot">•</span> {emp.department}</div>
                        </div>
                      </div>

                      <div className="sleek-row-right">
                        <div className="sleek-status">
                          <span className={`sleek-badge ${emp.isActive !== false ? 'active' : 'inactive'}`}>
                            {emp.isActive !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <div className="sleek-actions" onClick={(e) => e.stopPropagation()}>
                          {loggedAdmin?.role !== 'viewer-admin' && (
                            <button
                              className="sleek-btn sleek-btn-edit"
                              onClick={() => handleEditClick(emp)}
                            >
                              Edit
                            </button>
                          )}
                          {canManageEmployees && (
                            <button
                              className="sleek-btn sleek-btn-remove"
                              title="Remove Employee"
                              onClick={() => handleRemoveEmployee(emp.id)}
                            >
                              Remove
                            </button>
                          )}
                          {loggedAdmin?.role === 'viewer-admin' && (
                            <span className="sleek-view-only">View Only</span>
                          )}
                        </div>
                        
                        <div className="sleek-chevron">
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sleek-empty-state">
                    No employees found.
                  </div>
                )}
              </div>


            </div>
          </section>
        </main>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add New Employee</h2>
              <button className="btn-close-modal" onClick={() => {
                setNewEmployee({ name: '', department: '', password: '', facePhotos: [], role: 'employee' });
                const fileInput = document.getElementById('add-employee-file-input');
                if (fileInput) fileInput.value = '';
                setShowAddModal(false);
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddEmployee} className="add-employee-form">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  required
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Department</label>
                <select
                  required
                  value={newEmployee.department}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, department: e.target.value }))}
                  style={{
                    padding: '10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    fontSize: '14px',
                    color: '#1e293b'
                  }}
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d._id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showAddPassword ? 'text' : 'password'}
                    placeholder="Set password for new employee"
                    required
                    value={newEmployee.password}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, password: e.target.value }))}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(prev => !prev)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0'
                    }}
                  >
                    {showAddPassword ? (
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

              {['super-admin', 'admin'].includes(loggedAdmin?.role) && (
                <div className="form-group">
                  <label>Account Role</label>
                  <select
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, role: e.target.value }))}
                    style={{
                      padding: '10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      fontSize: '14px',
                      color: '#1e293b'
                    }}
                  >
                    <option value="employee">Employee (Biometric Attendance)</option>
                    <option value="hr-admin">HR Admin (Dashboard Approver)</option>
                    <option value="viewer-admin">Viewer Admin (Read-Only Logs)</option>
                    <option value="sub-admin">Sub Admin (Branch Manager)</option>
                    <option value="admin">Admin (Manager)</option>
                    {loggedAdmin?.role === 'super-admin' && (
                      <option value="super-admin">Super Admin (Full Access)</option>
                    )}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Role Type</label>
                  <select
                    value={newEmployee.employeeType}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, employeeType: e.target.value }))}
                    style={{
                      padding: '10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      fontSize: '14px',
                      color: '#1e293b',
                      width: '100%'
                    }}
                  >
                    <option value="employee">Employee</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Weekly Hours Target</label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    required
                    value={newEmployee.weeklyHours}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, weeklyHours: parseInt(e.target.value, 10) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Expected Arrival Time</label>
                  <input
                    type="time"
                    required
                    value={convertTo24Hour(newEmployee.arrivalTime)}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, arrivalTime: convertTo12Hour(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Expected Departure Time</label>
                  <input
                    type="time"
                    required
                    value={convertTo24Hour(newEmployee.departureTime || '')}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, departureTime: convertTo12Hour(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Face Photos (Select exactly 4 or 5 pictures)</label>
                <input
                  type="file"
                  id="add-employee-file-input"
                  accept="image/*"
                  multiple
                  required
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (files.length < 4 || files.length > 5) {
                      alert('Please select exactly 4 or 5 photos for high-precision face registration.');
                      e.target.value = null;
                      setNewEmployee(prev => ({ ...prev, facePhotos: [] }));
                      return;
                    }
                    const promises = files.map(file => compressImage(file, 500, 0.7));
                    Promise.all(promises).then(base64s => {
                      setNewEmployee(prev => ({ ...prev, facePhotos: base64s }));
                    });
                  }}
                  style={{
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff'
                  }}
                />
                {newEmployee.facePhotos && newEmployee.facePhotos.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                      Selected ({newEmployee.facePhotos.length}/5) - Click (x) to remove:
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                      {newEmployee.facePhotos.map((photo, i) => (
                        <div key={i} style={{ position: 'relative', width: '100%', height: '50px' }}>
                          <img
                            src={photo}
                            alt={`Preview ${i + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '8px',
                              objectFit: 'cover',
                              border: '2px solid #1062b3'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updatedPhotos = newEmployee.facePhotos.filter((_, idx) => idx !== i);
                              setNewEmployee(prev => ({ ...prev, facePhotos: updatedPhotos }));
                              const fileInput = document.getElementById('add-employee-file-input');
                              if (fileInput) fileInput.value = ''; // Reset input to let them select files again
                            }}
                            style={{
                              position: 'absolute',
                              top: '-4px',
                              right: '-4px',
                              backgroundColor: '#ef4444',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '50%',
                              width: '18px',
                              height: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer-buttons">
                <button type="button" className="btn-modal-cancel" onClick={() => {
                  setNewEmployee({ name: '', department: '', password: '', facePhotos: [], role: 'employee' });
                  const fileInput = document.getElementById('add-employee-file-input');
                  if (fileInput) fileInput.value = '';
                  setShowAddModal(false);
                }}>Cancel</button>
                <button type="submit" className="btn-modal-submit">Create Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Employee Profile</h2>
              <button className="btn-close-modal" onClick={() => { stopUnlockCamera(); setShowEditModal(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdateEmployee} className="add-employee-form">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Department</label>
                <select
                  required
                  value={editingEmployee.department}
                  onChange={(e) => setEditingEmployee(prev => ({ ...prev, department: e.target.value }))}
                  style={{
                    padding: '10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    fontSize: '14px',
                    color: '#1e293b'
                  }}
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d._id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Admin Message for Employee</label>
                <textarea
                  placeholder="Leave a message for the employee to see on their dashboard"
                  value={editingEmployee.adminMessage || ''}
                  onChange={(e) => setEditingEmployee(prev => ({ ...prev, adminMessage: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    minHeight: '80px',
                    resize: 'vertical',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {canManageEmployees ? (
                <div className="form-group credentials-locked-section" style={{ padding: '16px', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#f8fafc', position: 'relative' }}>
                  {!credentialsUnlocked ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                        <svg width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24" style={{ marginRight: '8px' }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span style={{ fontWeight: '600', color: '#0f172a' }}>Security Credentials Locked</span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.4' }}>
                        Privacy protocol active. To view or edit this employee's Password, the admin must verify their identity. Scan your face (Admin) to authorize unlock.
                      </p>

                      {cameraActive ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                          <div style={{ position: 'relative', width: '100%', maxWidth: '280px', height: '210px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #1062b3', backgroundColor: '#000' }}>
                            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '280px' }}>
                            <button
                              type="button"
                              onClick={captureAndVerifyFace}
                              disabled={isUnlocking}
                              style={{ flex: 1, padding: '10px 16px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                            >
                              {isUnlocking ? 'Verifying...' : 'Capture & Verify'}
                            </button>
                            <button
                              type="button"
                              onClick={stopUnlockCamera}
                              style={{ padding: '10px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={startUnlockCamera}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#1062b3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          Start Live Face Scan
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                        <svg width="20" height="20" fill="none" stroke="#10b981" strokeWidth="2" viewBox="0 0 24 24" style={{ marginRight: '8px' }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span style={{ fontWeight: '600', color: '#10b981' }}>Credentials Unlocked</span>
                      </div>

                      <div className="form-group" style={{ position: 'relative', margin: '0' }}>
                        <label>Employee Password (Unlocked & Visible)</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showEditPassword ? 'text' : 'password'}
                            placeholder="Enter password"
                            value={editingEmployee.password}
                            onChange={(e) => setEditingEmployee(prev => ({ ...prev, password: e.target.value }))}
                            style={{ width: '100%', paddingRight: '40px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                          />
                          <button type="button" onClick={() => setShowEditPassword(prev => !prev)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '0' }}>
                            {showEditPassword ? (
                              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                            ) : (
                              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {['super-admin', 'admin'].includes(loggedAdmin?.role) && (
                <div className="form-group">
                  <label>Account Role</label>
                  <select
                    value={editingEmployee.role}
                    onChange={(e) => setEditingEmployee(prev => ({ ...prev, role: e.target.value }))}
                    style={{
                      padding: '10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      fontSize: '14px',
                      color: '#1e293b'
                    }}
                  >
                    <option value="employee">Employee (Biometric Attendance)</option>
                    <option value="hr-admin">HR Admin (Dashboard Approver)</option>
                    <option value="viewer-admin">Viewer Admin (Read-Only Logs)</option>
                    <option value="sub-admin">Sub Admin (Branch Manager)</option>
                    <option value="admin">Admin (Manager)</option>
                    {loggedAdmin?.role === 'super-admin' && (
                      <option value="super-admin">Super Admin (Full Access)</option>
                    )}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Role Type</label>
                  <select
                    value={editingEmployee.employeeType}
                    onChange={(e) => setEditingEmployee(prev => ({ ...prev, employeeType: e.target.value }))}
                    style={{
                      padding: '10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      fontSize: '14px',
                      color: '#1e293b',
                      width: '100%'
                    }}
                  >
                    <option value="employee">Employee</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Weekly Hours Target</label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    required
                    value={editingEmployee.weeklyHours}
                    onChange={(e) => setEditingEmployee(prev => ({ ...prev, weeklyHours: parseInt(e.target.value, 10) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Expected Arrival Time</label>
                  <input
                    type="time"
                    required
                    value={convertTo24Hour(editingEmployee.arrivalTime)}
                    onChange={(e) => setEditingEmployee(prev => ({ ...prev, arrivalTime: convertTo12Hour(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Expected Departure Time</label>
                  <input
                    type="time"
                    required
                    value={convertTo24Hour(editingEmployee.departureTime || '')}
                    onChange={(e) => setEditingEmployee(prev => ({ ...prev, departureTime: convertTo12Hour(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Face Photos (Select exactly 4 or 5 to update biometrics)</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (files.length < 4 || files.length > 5) {
                      alert('Please select exactly 4 or 5 photos for high-precision face registration.');
                      e.target.value = null;
                      return;
                    }
                    const promises = files.map(file => compressImage(file, 500, 0.7));
                    Promise.all(promises).then(base64s => {
                      setEditingEmployee(prev => ({ ...prev, facePhotos: base64s }));
                    });
                  }}
                  style={{
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff'
                  }}
                />
                {editingEmployee.facePhotos && editingEmployee.facePhotos.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                      Selected ({editingEmployee.facePhotos.length}/5):
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                      {editingEmployee.facePhotos.map((photo, i) => (
                        <img
                          key={i}
                          src={photo}
                          alt={`Preview ${i + 1}`}
                          style={{
                            width: '100%',
                            height: '50px',
                            borderRadius: '8px',
                            objectFit: 'cover',
                            border: '2px solid #1062b3'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer-buttons">
                <button type="button" className="btn-modal-cancel" onClick={() => { stopUnlockCamera(); setShowEditModal(false); }}>Cancel</button>
                <button type="submit" className="btn-modal-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Manual Edit Past Attendance Modal */}
      {showManualEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Edit Attendance Log</h2>
              <button className="btn-close-modal" onClick={() => setShowManualEditModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b' }}>Employee Name</p>
                <p style={{ margin: '0', fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{manualEditData.employeeName}</p>
                <p style={{ margin: '8px 0 4px 0', fontSize: '13px', color: '#64748b' }}>Date</p>
                <p style={{ margin: '0', fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>
                  {manualEditData.date ? new Date(manualEditData.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                </p>
              </div>

              <div className="form-group" style={{ margin: '0' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Status</label>
                <select
                  value={manualEditData.status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    setManualEditData(prev => ({
                      ...prev,
                      status: newStatus,
                      checkIn: (newStatus === 'Absent' || newStatus === 'Leave') ? '--:--' : (prev.checkIn === '--:--' ? '09:00 AM' : prev.checkIn),
                      checkOut: (newStatus === 'Absent' || newStatus === 'Leave') ? '--:--' : (prev.checkOut === '--:--' ? '05:00 PM' : prev.checkOut)
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: '#fff'
                  }}
                >
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">Leave</option>
                  <option value="Pending">Pending</option>
                  <option value="Manual Verify">Manual Verify</option>
                </select>
              </div>

              {manualEditData.status !== 'Absent' && manualEditData.status !== 'Leave' && (
                <>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1, margin: '0' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Check In</label>
                      <input
                        type="time"
                        value={convertTo24Hour(manualEditData.checkIn)}
                        onChange={(e) => setManualEditData(prev => ({ ...prev, checkIn: convertTo12Hour(e.target.value) }))}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <div className="form-group" style={{ flex: 1, margin: '0' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Check Out</label>
                      <input
                        type="time"
                        value={convertTo24Hour(manualEditData.checkOut)}
                        onChange={(e) => setManualEditData(prev => ({ ...prev, checkOut: convertTo12Hour(e.target.value) }))}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>Calculated Work Hours:</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#166534' }}>
                      {calculateHoursWorkedText(manualEditData.checkIn, manualEditData.checkOut)} hours
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer-buttons" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowManualEditModal(false)}
                disabled={isSubmittingManualEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-submit"
                onClick={handleManualEditSubmit}
                disabled={isSubmittingManualEdit}
                style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', color: '#fff' }}
              >
                {isSubmittingManualEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mark Leave Confirmation Modal */}
      {showLeaveModal && leaveEmployee && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '420px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Mark Employee Leave</h2>
              <button className="btn-close-modal" onClick={() => setShowLeaveModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '14px', color: '#475569', margin: '0' }}>
                You are marking leave for <strong>{leaveEmployee.name}</strong> (ID: {leaveEmployee.id}). They will not be counted as absent on this day.
              </p>

              <div className="form-group" style={{ margin: '0' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Select Date</label>
                <input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div className="modal-footer-buttons" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowLeaveModal(false)}
                disabled={isSubmittingLeave}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-submit"
                onClick={handleMarkLeaveSubmit}
                disabled={isSubmittingLeave}
                style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', color: '#fff' }}
              >
                {isSubmittingLeave ? 'Saving...' : 'Confirm Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalVisible && deleteEmployeeObj && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '420px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626' }}>Remove Employee</h2>
              <button className="btn-close-modal" onClick={() => setDeleteModalVisible(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '14px', color: '#475569', margin: '0' }}>
                This action is destructive and could impact historical records. To confirm, type the exact name <strong>{deleteEmployeeObj.name}</strong> below:
              </p>

              <div className="form-group" style={{ margin: '0' }}>
                <input
                  type="text"
                  placeholder="Type name here"
                  value={deleteInputName}
                  onChange={(e) => setDeleteInputName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div className="modal-footer-buttons" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setDeleteModalVisible(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-submit"
                onClick={confirmRemoveEmployee}
                disabled={deleteInputName !== deleteEmployeeObj.name}
                style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#fff', opacity: deleteInputName === deleteEmployeeObj.name ? 1 : 0.5, cursor: deleteInputName === deleteEmployeeObj.name ? 'pointer' : 'not-allowed' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Tracking Section */}
      {activeTab === 'GoalTracking' && (() => {
        const now = new Date();
        const activePeriodDate = new Date(now.getFullYear(), now.getMonth() + (goalTrackingViewMode === 'month' ? goalTrackingDateOffset : Math.floor(goalTrackingDateOffset * 7 / 30)), 1);
        const activeYear = activePeriodDate.getFullYear();
        const activeMonth = activePeriodDate.getMonth();

        let periodLabel = '';
        let startDate = new Date(now);
        let endDate = new Date(now);
        let weeksMultiplier = 1;

        if (goalTrackingViewMode === 'week') {
          const startOfWeek = new Date(now);
          const day = startOfWeek.getDay();
          const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1) + (goalTrackingDateOffset * 7);
          startOfWeek.setDate(diff);
          startOfWeek.setHours(0,0,0,0);
          startDate = startOfWeek;

          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23,59,59,999);
          endDate = endOfWeek;

          const startStr = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const endStr = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          periodLabel = `${startStr} – ${endStr}`;
          weeksMultiplier = 1;
        } else {
          // Month Mode
          const startOfMonth = new Date(now.getFullYear(), now.getMonth() + goalTrackingDateOffset, 1);
          startOfMonth.setHours(0,0,0,0);
          startDate = startOfMonth;

          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + goalTrackingDateOffset + 1, 0, 23, 59, 59, 999);
          endDate = endOfMonth;

          periodLabel = activePeriodDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          
          const daysInMonth = endOfMonth.getDate();
          weeksMultiplier = daysInMonth / 7;
        }

        const handleTimelineMonthChange = (e) => {
          const selectedMonth = parseInt(e.target.value, 10);
          const monthDiff = (activeYear - now.getFullYear()) * 12 + (selectedMonth - now.getMonth());
          setGoalTrackingDateOffset(monthDiff);
        };

        const handleTimelineYearChange = (e) => {
          const selectedYear = parseInt(e.target.value, 10);
          const monthDiff = (selectedYear - now.getFullYear()) * 12 + (activeMonth - now.getMonth());
          setGoalTrackingDateOffset(monthDiff);
        };

        const yearsList = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
        const monthsList = [
          { label: 'Jan', val: 0 }, { label: 'Feb', val: 1 }, { label: 'Mar', val: 2 },
          { label: 'Apr', val: 3 }, { label: 'May', val: 4 }, { label: 'Jun', val: 5 },
          { label: 'Jul', val: 6 }, { label: 'Aug', val: 7 }, { label: 'Sep', val: 8 },
          { label: 'Oct', val: 9 }, { label: 'Nov', val: 10 }, { label: 'Dec', val: 11 }
        ];

        let processedGoals = employees.map(emp => {
          const empId = emp.id;
          const empLogs = attendanceLogs.filter(log => String(log.employeeId) === String(empId));
          let totalMins = 0;
          empLogs.forEach(log => {
            const logDate = new Date(log.date);
            if (logDate >= startDate && logDate <= endDate) {
              if (log.checkIn && log.checkIn !== '--:--' && log.checkOut && log.checkOut !== '--:--') {
                const inM = (parseInt(log.checkIn.split(':')[0]) * 60 + parseInt(log.checkIn.split(':')[1].split(' ')[0])) + (log.checkIn.includes('PM') && !log.checkIn.includes('12:') ? 720 : 0) - (log.checkIn.includes('AM') && log.checkIn.includes('12:') ? 720 : 0);
                const outM = (parseInt(log.checkOut.split(':')[0]) * 60 + parseInt(log.checkOut.split(':')[1].split(' ')[0])) + (log.checkOut.includes('PM') && !log.checkOut.includes('12:') ? 720 : 0) - (log.checkOut.includes('AM') && log.checkOut.includes('12:') ? 720 : 0);
                if (outM > inM) totalMins += (outM - inM);
              }
            }
          });
          const hours = totalMins / 60;
          const targetHours = Math.round((emp.weeklyHours || 40) * weeksMultiplier);
          return { ...emp, hours, targetHours };
        }).filter(emp => emp.isActive);

        processedGoals = processedGoals.filter(emp => emp.hours < emp.targetHours);

        if (goalTrackingSearch) {
          const term = goalTrackingSearch.toLowerCase();
          processedGoals = processedGoals.filter(emp => 
            emp.name.toLowerCase().includes(term) || 
            String(emp.id).toLowerCase().includes(term) ||
            (emp.department && emp.department.toLowerCase().includes(term))
          );
        }

        processedGoals.sort((a, b) => {
          let valA, valB;
          switch(goalTrackingSort.column) {
            case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
            case 'hoursWorked': valA = a.hours; valB = b.hours; break;
            case 'status': valA = (a.targetHours - a.hours); valB = (b.targetHours - b.hours); break;
            default: valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
          }
          if (valA < valB) return goalTrackingSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return goalTrackingSort.direction === 'asc' ? 1 : -1;
          return 0;
        });

        return (
          <main className="main-content">
            <header className="content-header" style={{ marginBottom: '10px' }}>
              <div className="header-titles">
                <h1>Goal Tracking</h1>
                <p>Monitor employees falling short of their goals.</p>
              </div>
            </header>

            <section className="data-table-section">
              <div className="dashboard-summary-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
                <div className="summary-title-block">
                  <h2 className="summary-title">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Attendance Goals
                  </h2>
                  <div className="summary-period-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>{periodLabel}</span>
                  </div>
                </div>

                <div className="summary-controls-wrapper">
                  <div className="timeline-select-group">
                    <select 
                      value={activeMonth} 
                      onChange={handleTimelineMonthChange} 
                      className="timeline-select"
                      title="Select Month"
                    >
                      {monthsList.map(m => (
                        <option key={m.val} value={m.val}>{m.label}</option>
                      ))}
                    </select>

                    <select 
                      value={activeYear} 
                      onChange={handleTimelineYearChange} 
                      className="timeline-select"
                      title="Select Year"
                    >
                      {yearsList.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="summary-controls-action-group">
                    <div className="summary-segmented-toggle">
                      <button 
                        type="button"
                        className={`segmented-btn ${goalTrackingViewMode === 'week' ? 'active' : ''}`}
                        onClick={() => { setGoalTrackingViewMode('week'); setGoalTrackingDateOffset(0); }}
                      >
                        Week
                      </button>
                      <button 
                        type="button"
                        className={`segmented-btn ${goalTrackingViewMode === 'month' ? 'active' : ''}`}
                        onClick={() => { setGoalTrackingViewMode('month'); setGoalTrackingDateOffset(0); }}
                      >
                        Month
                      </button>
                    </div>

                    <div className="summary-nav-group">
                      <button 
                        type="button"
                        className="summary-nav-btn" 
                        onClick={() => setGoalTrackingDateOffset(prev => prev - 1)}
                        title="Previous Period"
                      >
                        &lt;
                      </button>
                      <button 
                        type="button"
                        className={`summary-nav-btn current-btn ${goalTrackingDateOffset === 0 ? 'is-current' : ''}`} 
                        onClick={() => setGoalTrackingDateOffset(0)}
                      >
                        Current
                      </button>
                      <button 
                        type="button"
                        className="summary-nav-btn" 
                        onClick={() => setGoalTrackingDateOffset(prev => prev + 1)}
                        title="Next Period"
                      >
                        &gt;
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="table-header-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="Search name, ID..." 
                  className="search-input" 
                  value={goalTrackingSearch} 
                  onChange={(e) => setGoalTrackingSearch(e.target.value)} 
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '250px' }}
                />
                
                <select 
                  value={`${goalTrackingSort.column}-${goalTrackingSort.direction}`}
                  onChange={(e) => {
                    const [col, dir] = e.target.value.split('-');
                    setGoalTrackingSort({ column: col, direction: dir });
                  }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="name-asc">Sort: Name (A-Z)</option>
                  <option value="name-desc">Sort: Name (Z-A)</option>
                  <option value="hoursWorked-asc">Sort: Worked (Low-High)</option>
                  <option value="hoursWorked-desc">Sort: Worked (High-Low)</option>
                  <option value="status-desc">Sort: Missed By (Most)</option>
                </select>
              </div>

              <div className="table-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="employees-table goal-tracking-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>ID</th>
                      <th>Department</th>
                      <th>Goal (Hrs)</th>
                      <th>Actual Worked (Hrs)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedGoals.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px' }}>No records found for this period.</td></tr>
                    ) : (
                      processedGoals.map(emp => (
                        <tr 
                          key={emp.id} 
                          onClick={() => setSelectedProfileEmployee(emp)}
                          className="clickable-row"
                          style={{ cursor: 'pointer' }}
                          title="Click to view profile and adjust hours"
                        >
                          <td style={{ fontWeight: '600', color: '#3b82f6' }}>{emp.name}</td>
                          <td>{emp.id}</td>
                          <td>{emp.department}</td>
                          <td>{emp.targetHours}</td>
                          <td style={{ color: '#dc2626', fontWeight: '700' }}>{emp.hours.toFixed(1)}</td>
                          <td>
                            <span style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                              Missed by {(emp.targetHours - emp.hours).toFixed(1)} hrs
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        );
      })()}

      {/* Generic Confirmation Modal */}
      {confirmConfig.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '10px' }}>
              <div style={{ margin: '0 auto', backgroundColor: '#fee2e2', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 style={{ fontSize: '20px', margin: 0, color: '#1e293b' }}>{confirmConfig.title}</h2>
            </div>
            <div style={{ padding: '0 24px 24px 24px' }}>
              <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '24px', lineHeight: '1.5' }}>
                {confirmConfig.message}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                  onClick={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                >
                  {confirmConfig.cancelText}
                </button>
                <button
                  type="button"
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '600', cursor: 'pointer' }}
                  onClick={() => {
                    if (confirmConfig.onConfirm) confirmConfig.onConfirm();
                    setConfirmConfig({ ...confirmConfig, isOpen: false });
                  }}
                >
                  {confirmConfig.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedProfileEmployee && (
        <EmployeeProfileModal
          employee={selectedProfileEmployee}
          departments={departments}
          onClose={() => setSelectedProfileEmployee(null)}
          onUpdate={fetchData}
          fetchWithAuth={fetchWithAuth}
          currentUserRole={getAdminRole()}
          allRequests={requests}
        />
      )}

      {departmentToDelete && (
        <DepartmentDeleteModal
          department={departmentToDelete}
          departments={departments}
          onClose={() => setDepartmentToDelete(null)}
          onConfirm={() => {
            setDepartmentToDelete(null);
            fetchData();
          }}
          fetchWithAuth={fetchWithAuth}
        />
      )}

      {holidayModal.isOpen && (
        <HolidayModal
          isOpen={holidayModal.isOpen}
          onClose={() => setHolidayModal({ isOpen: false, dateStr: '', hol: null })}
          onSave={(newName) => handleHolidayAction(holidayModal.dateStr, newName, holidayModal.hol ? 'rename' : 'add', holidayModal.hol)}
          onDelete={() => handleHolidayAction(holidayModal.dateStr, '', 'remove', holidayModal.hol)}
          initialName={holidayModal.hol ? holidayModal.hol.name : ''}
          initialAction={holidayModal.hol ? 'edit' : 'add'}
          dateStr={holidayModal.dateStr}
        />
      )}
      
      {isLoading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, color: '#1e293b'
        }}>
          <div className="spinner" style={{
            width: '50px', height: '50px', border: '5px solid #e2e8f0', borderTop: '5px solid #3b82f6',
            borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px'
          }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Loading Dashboard...</h2>
        </div>
      )}

      {flashColor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: flashColor === 'pink' ? '#ff007f' : '#39ff14',
          opacity: 0.8,
          zIndex: 9999,
          pointerEvents: 'none',
          transition: 'all 0.1s ease'
        }} />
      )}
    </div>
  );
};

export default AdminDashboard;
