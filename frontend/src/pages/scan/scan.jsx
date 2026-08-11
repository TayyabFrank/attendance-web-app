import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import Clock from '../../utils/Clock';
import { Geolocation } from '@capacitor/geolocation';
import { useOfflineSync } from '../../utils/OfflineSyncProvider';
import './scan.css';

const Scan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline, saveOfflineRequest } = useOfflineSync();
  const [loggedEmployee, setLoggedEmployee] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'scanning' | 'confirm' | 'success'
  const [countdown, setCountdown] = useState(3);
  const [capturedFace, setCapturedFace] = useState(null);
  const [employeeName, setEmployeeName] = useState('Employee');
  const [employeePhoto, setEmployeePhoto] = useState(null);
  const [scanMessage, setScanMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [payloadData, setPayloadData] = useState(null);
  const [flashColor, setFlashColor] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualEmployeeId, setManualEmployeeId] = useState('');
  const [scanStats, setScanStats] = useState(null);

  const [detectedAction, setDetectedAction] = useState('check-in');
  const [detailsText, setDetailsText] = useState('');
  const [matchedEmpData, setMatchedEmpData] = useState(null);
  const [verificationConfidence, setVerificationConfidence] = useState('');
  const [scannedPhotoB64, setScannedPhotoB64] = useState(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [coords, setCoords] = useState({ latitude: null, longitude: null });

  const [locationStatus, setLocationStatus] = useState('fetching'); // 'fetching', 'granted', 'denied'

  const requestLocation = async () => {
    setLocationStatus('fetching');
    setErrorMsg('');
    try {
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          isMocked: position.mocked || false
        });
        setLocationStatus('granted');
        setErrorMsg('');
      } catch (highAccuracyError) {
        console.warn("High accuracy failed, falling back to low accuracy:", highAccuracyError);
        const lowPosition = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
        setCoords({
          latitude: lowPosition.coords.latitude,
          longitude: lowPosition.coords.longitude,
          accuracy: lowPosition.coords.accuracy,
          isMocked: lowPosition.mocked || false
        });
        setLocationStatus('granted');
        setErrorMsg('');
      }
    } catch (error) {
      console.error("Error getting location: ", error);
      setLocationStatus('denied');
      setErrorMsg("Location permission is required to mark attendance. Please enable location services or check app permissions.");
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    const emp = localStorage.getItem('employee');
    if (!emp) {
      navigate('/login');
      return;
    }
    try {
      const parsed = JSON.parse(emp);
      setLoggedEmployee(parsed);
    } catch (_) {}
  }, [navigate]);

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

    const secretKey = import.meta.env.VITE_HMAC_SECRET || 'fallback-secret-key-12345';
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

  // Check if routed from PIN success
  useEffect(() => {
    if (location.state && location.state.showSuccess) {
      setScanStatus('success');
      setEmployeeName(location.state.employeeName || 'Ahmad Ali');
      setEmployeePhoto(location.state.employeePhoto || null);
      setScanMessage(location.state.message || 'Checked in successfully.');
      setScanStats(location.state.stats || null);
      setCountdown(3);
      setCapturedFace("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e8ecf4'/><circle cx='50' cy='35' r='18' fill='%231062b3'/><path d='M15 82c0-18 15-32 35-32s35 14 35 32H15z' fill='%231062b3'/></svg>");
    }
  }, [location]);

  // Holiday Check State
  const [isHolidayBlocked, setIsHolidayBlocked] = useState(false);
  const [holidayMessage, setHolidayMessage] = useState('');

  // Fetch holidays and office settings to check if today is blocked
  useEffect(() => {
    const checkHoliday = async () => {
      try {
        const [holRes, setRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/holidays`),
          fetch(`${API_BASE_URL}/api/settings/office`)
        ]);
        if (!holRes.ok || !setRes.ok) return;
        const holidays = await holRes.json();
        const settings = await setRes.json();
        
        const now = new Date();
        const dateStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const dayOfWeek = now.getDay();
        
        const todayHol = holidays.find(h => new Date(h.date).toISOString().split('T')[0] === dateStr);
        const isSunday = dayOfWeek === 0;
        const isSatOff = settings.saturdayOff && dayOfWeek === 6;

        if (todayHol || isSunday || isSatOff) {
          setIsHolidayBlocked(true);
          let reason = 'a Holiday';
          if (isSunday || isSatOff) reason = 'a Weekend';
          if (todayHol) reason = `a Holiday (${todayHol.name})`;
          setHolidayMessage(`Cannot check in today. It is ${reason}. Enjoy your day off!`);
        }
      } catch (err) {
        console.error('Failed to check holidays:', err);
      }
    };
    checkHoliday();
  }, []);

  // Start web camera ONCE on mount
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
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          if (typeof streamRef.current.removeTrack === 'function') {
            streamRef.current.removeTrack(track);
          }
        });
      } catch (_) {}
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Start web camera ONCE on mount
  const startCamera = async () => {
    if (streamRef.current) return; // Already running
    
    // Check permission state in browser first to avoid repeating popup confirmations
    let permissionStatus;
    try {
      permissionStatus = await navigator.permissions.query({ name: 'camera' });
    } catch (_) {}

    if (!permissionStatus || permissionStatus.state !== 'granted') {
      const hasPermission = window.confirm("Attendance System requires access to your camera for biometric verification. Allow camera access?");
      if (!hasPermission) {
        setErrorMsg("Camera permission denied by user.");
        setCameraActive(false);
        return;
      }
    }
    
    try {
      // 1. Prompt/secure webcam stream immediately
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      
      if (!isMountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;
      setCameraActive(true);
      setErrorMsg('');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.warn('Direct camera stream initialization failed:', err);
      setErrorMsg('Camera access denied or unavailable. Please ensure your browser has permission.');
      setCameraActive(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    const handlePageExit = () => {
      stopCamera();
    };

    window.addEventListener('beforeunload', handlePageExit);
    window.addEventListener('pagehide', handlePageExit);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handlePageExit);
      window.removeEventListener('pagehide', handlePageExit);
      stopCamera();
    };
  }, []);

  // Set srcObject when camera is active and video element mounts
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive, scanStatus]);

  // Auto-scan disabled. User must explicitly click "BEGIN SCAN" button to scan face.
  useEffect(() => {
    // Left empty to prevent automatic background scanning loops
  }, [scanStatus]);

  // Handle countdown when in success state
  useEffect(() => {
    let timer;
    if (scanStatus === 'success') {
      if (countdown > 0) {
        timer = setTimeout(() => {
          setCountdown(prev => prev - 1);
        }, 1000);
      } else {
        // Automatically redirect to log history page
        stopCamera();
        navigate('/history');
      }
    }
    return () => clearTimeout(timer);
  }, [scanStatus, countdown, navigate]);

  const captureSnapshot = () => {
    if (videoRef.current && cameraActive) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 400;
        canvas.height = videoRef.current.videoHeight || 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg');
          setCapturedFace(dataUrl);
        }
      } catch (e) {
        console.warn("Failed to capture snapshot, using default avatar", e);
        setDefaultAvatar();
      }
    } else {
      setDefaultAvatar();
    }
  };

  const setDefaultAvatar = () => {
    setCapturedFace("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e8ecf4'/><circle cx='50' cy='35' r='18' fill='%231062b3'/><path d='M15 82c0-18 15-32 35-32s35 14 35 32H15z' fill='%231062b3'/></svg>");
  };

  const handleBeginScan = async () => {
    if (scanStatus === 'scanning') return;
    setScanStatus('scanning');
    setErrorMsg('');
    
    try {
      const apiBase = API_BASE_URL;
      
      const tokenRes = await fetch(`${apiBase}/api/scan-attendance`);
      if (!tokenRes.ok) {
        throw new Error('Failed to obtain color challenge token');
      }
      const tokenData = await tokenRes.json();
      const token = tokenData.token;

      // Active color flash protocol (Neon Pink)
      setFlashColor('pink');
      await new Promise(r => setTimeout(r, 350));
      const blobA = await captureFrameBlob();

      // Active color flash protocol (Neon Green)
      setFlashColor('green');
      await new Promise(r => setTimeout(r, 350));
      const blobB = await captureFrameBlob();

      setFlashColor(null);

      // Save a local preview URL
      const previewReader = new FileReader();
      previewReader.readAsDataURL(blobB);
      previewReader.onloadend = () => {
        setCapturedFace(previewReader.result);
      };

      const timestamp = Date.now();
      const signature = await calculateSignature(blobA, blobB, token, timestamp);

      // Immediate verification!
      setIsProcessing(true);
      setErrorMsg('');

      const toBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const frameABase64 = await toBase64(blobA);
      const frameBBase64 = await toBase64(blobB);

      const resolvedEmployeeId = (location.state && location.state.employeeId) || (loggedEmployee ? loggedEmployee.employeeId : (manualEmployeeId.trim() || null));

      const response = await fetch(`${apiBase}/api/scan-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameA: frameABase64,
          frameB: frameBBase64,
          token,
          timestamp,
          signature,
          employeeId: resolvedEmployeeId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Face verification failed');
        setScanStatus('idle');
      } else {
        if (data.action === 'already-completed') {
          setErrorMsg('You have already completed check-in and check-out for today.');
          setScanStatus('idle');
        } else {
          setMatchedEmpData(data.employee);
          setDetectedAction(data.action);
          setVerificationConfidence(data.confidence);
          setScannedPhotoB64(data.scannedPhoto || frameBBase64);
          setDetailsText('');
          setScanStatus('confirm');
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Verification initialization failed');
      setScanStatus('idle');
      setFlashColor(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitLog = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    
    try {
      setIsProcessing(true);
      const response = await fetch(`${API_BASE_URL}/api/attendance/submit-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: matchedEmpData.employeeId,
          action: detectedAction,
          tasks: '',
          workDone: '',
          confidence: verificationConfidence,
          photo: scannedPhotoB64,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          isMocked: coords.isMocked,
          timezoneOffset: new Date().getTimezoneOffset()
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Failed to submit attendance log.');
      } else {
        if (data.log && data.log.employeeId) {
          const loggedEmp = {
            employeeId: data.log.employeeId,
            name: data.employeeName || 'Matched Employee',
            photo: data.log.photo || data.employeePhoto
          };
          try {
            localStorage.setItem('employee', JSON.stringify(loggedEmp));
          } catch (_) {}
        }
        setEmployeeName(data.employeeName || 'Matched Employee');
        setEmployeePhoto(data.log?.photo || data.employeePhoto);
        setScanMessage(data.message || 'Verified successfully');
        setScanStats(data.stats || null);
        setCountdown(3);
        setScanStatus('success');
      }
    } catch (err) {
      console.error(err);
      if (!isOnline || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        await saveOfflineRequest(`${API_BASE_URL}/api/attendance/submit-log`, 'POST', {
          employeeId: matchedEmpData.employeeId,
          action: detectedAction,
          tasks: '',
          workDone: '',
          confidence: verificationConfidence,
          photo: scannedPhotoB64,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          isMocked: coords.isMocked,
          timezoneOffset: new Date().getTimezoneOffset()
        }, { 'Content-Type': 'application/json' });
        
        setScanMessage('Saved offline. Will sync when connected.');
        setCountdown(3);
        setScanStatus('success');
      } else {
        setErrorMsg('Network error, log submission failed');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const targetId = (loggedEmployee ? loggedEmployee.employeeId : manualEmployeeId).trim();
    if (!targetId) {
      setErrorMsg('Please enter your Employee ID');
      return;
    }
    if (!passwordValue) {
      setErrorMsg('Please enter your Password');
      return;
    }
    
    try {
      setIsProcessing(true);
      const response = await fetch(`${API_BASE_URL}/api/attendance/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: targetId,
          password: passwordValue
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Password verification failed');
      } else {
        if (data.action === 'already-completed') {
          setErrorMsg('You have already completed check-in and check-out for today.');
        } else {
          setMatchedEmpData(data.employee);
          setDetectedAction(data.action);
          setVerificationConfidence('--');
          setScannedPhotoB64(data.employee.photo);
          setDetailsText('');
          setScanStatus('confirm');
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error, verification failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    setScanStatus('idle');
    setCapturedFace(null);
  };

  const handleDone = () => {
    setScanStatus('idle');
    setCountdown(3);
    setCapturedFace(null);
    setEmployeePhoto(null);
  };

  return (
    <div className="scan-container">
      {flashColor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: flashColor === 'pink' ? '#ff007f' : '#39ff14',
          zIndex: 99999,
          opacity: 0.95,
          pointerEvents: 'none'
        }} />
      )}
      {/* Header */}
      <header className="scan-header">
        <div className="header-left">
          <button className="btn-back-portal-header" onClick={() => navigate('/dashboard')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Dashboard</span>
          </button>
        </div>
        <div className="header-right-time">
          <span className="time-display"><Clock format="time" /></span>
          <span className="date-display"><Clock format="date" /></span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="scan-main">
        {scanStatus === 'confirm' && matchedEmpData && (
          /* Confirm Captured Picture Card */
          <div className="marked-card confirm-card">
            <div className="marked-face-container confirm-face-circle">
              {capturedFace ? (
                <img src={capturedFace} alt="Captured Face" className="captured-face-img" />
              ) : matchedEmpData.photo ? (
                <img src={matchedEmpData.photo} alt="Employee Avatar" className="captured-face-img" />
              ) : (
                <div className="fallback-face-circle"></div>
              )}
            </div>
            <h1 className="marked-title">Hello, {matchedEmpData.name}!</h1>
            <p className="marked-subtitle" style={{ color: '#059669', fontWeight: '700', fontSize: '15px' }}>
              Identity Verified successfully {verificationConfidence && verificationConfidence !== '--' && `(${verificationConfidence})`}
            </p>

            <form onSubmit={handleSubmitLog} style={{ width: '100%', maxWidth: '340px', marginTop: '8px', textAlign: 'left' }}>
              {errorMsg && (
                <p style={{ color: '#ef4444', fontWeight: '600', fontSize: '14px', textAlign: 'center', marginBottom: '12px' }}>{errorMsg}</p>
              )}

              <div className="success-actions-row flex-vertical">
                <button 
                  type="submit"
                  className="btn btn-primary action-btn-large" 
                  disabled={isProcessing}
                >
                  {isProcessing ? 'SUBMITTING...' : detectedAction === 'check-in' ? 'Submit & Check In' : 'Submit & Check Out'}
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary action-btn-large" 
                  onClick={handleRetake}
                  disabled={isProcessing}
                >
                  Retake / Reset
                </button>
              </div>
            </form>
          </div>
        )}

        {scanStatus === 'success' && (
          /* Attendance Marked Card */
          <div className="marked-card">
            <div 
              className="marked-face-container"
              style={(scanMessage || '').toLowerCase().includes('out') ? {
                border: '4px solid #1e40af',
                backgroundColor: '#eff6ff'
              } : {}}
            >
              {employeePhoto && typeof employeePhoto === 'string' && !employeePhoto.includes('<svg>') ? (
                <img src={employeePhoto} alt="Employee Photo" className="captured-face-img" />
              ) : capturedFace ? (
                <img src={capturedFace} alt="Scanned Face" className="captured-face-img" />
              ) : (
                <div className="fallback-face-circle" style={(scanMessage || '').toLowerCase().includes('out') ? {
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                } : {}} />
              )}
              <div 
                className="mini-checkmark-badge"
                style={(scanMessage || '').toLowerCase().includes('out') ? {
                  backgroundColor: '#2563eb'
                } : {}}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h1 className="marked-title">
              {(scanMessage || '').toLowerCase().includes('out') ? (
                <span>Exit Logged <span style={{ color: '#2563eb' }}>✓</span></span>
              ) : (
                <span>Attendance Marked <span style={{ color: '#059669' }}>✓</span></span>
              )}
            </h1>
             <p className="marked-subtitle">
              {(scanMessage || '').toLowerCase().includes('out') ? 'Goodbye' : 'Welcome'}, {employeeName} — {scanMessage || `Checked in at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}.
             </p>

             {scanStats && (
               <div className="scan-success-stats-box" style={{
                 marginTop: '16px',
                 padding: '16px',
                 borderRadius: '12px',
                 backgroundColor: '#f8fafc',
                 border: '1px solid #e2e8f0',
                 width: '100%',
                 display: 'flex',
                 flexDirection: 'column',
                 gap: '12px',
                 textAlign: 'left',
                 marginBottom: '20px'
               }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                   <span style={{ color: '#64748b', fontWeight: '600' }}>Role Type:</span>
                   <span style={{ color: '#1e293b', fontWeight: '700', textTransform: 'capitalize' }}>{scanStats.employeeType || 'employee'}</span>
                 </div>
                 {scanStats.isLate && !(scanMessage || '').toLowerCase().includes('out') && (
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '13px', fontWeight: '700', backgroundColor: '#fee2e2', padding: '8px 12px', borderRadius: '8px' }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                     <span>Status: Checked In Late Today</span>
                   </div>
                 )}
                 {!scanStats.isLate && !(scanMessage || '').toLowerCase().includes('out') && (
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '13px', fontWeight: '700', backgroundColor: '#d1fae5', padding: '8px 12px', borderRadius: '8px' }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                     <span>Status: Checked In On-Time</span>
                   </div>
                 )}
                 {(scanMessage || '').toLowerCase().includes('out') && (
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                     <span style={{ color: '#64748b', fontWeight: '600' }}>Shift Duration:</span>
                     <span style={{ color: '#1e293b', fontWeight: '700' }}>{scanStats.todayHours || '0.0'} hours worked today</span>
                   </div>
                 )}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', fontWeight: '600', alignItems: 'center' }}>
                     <span>Weekly Progress</span>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <span>{scanStats.weeklyHoursCompleted || '0.0'}h / {scanStats.weeklyHoursTarget || '40'}h</span>
                       {parseFloat(scanStats.weeklyHoursCompleted || 0) > parseFloat(scanStats.weeklyHoursTarget || 40) && (
                         <span style={{ fontSize: '10px', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '10px', fontWeight: '700' }}>
                           +{(parseFloat(scanStats.weeklyHoursCompleted || 0) - parseFloat(scanStats.weeklyHoursTarget || 40)).toFixed(1)}h Overtime
                         </span>
                       )}
                     </div>
                   </div>
                   <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                     <div style={{
                       width: `${Math.min(100, (parseFloat(scanStats.weeklyHoursCompleted || 0) / parseFloat(scanStats.weeklyHoursTarget || 40)) * 100)}%`,
                       height: '100%',
                       backgroundColor: parseFloat(scanStats.weeklyHoursCompleted || 0) >= parseFloat(scanStats.weeklyHoursTarget || 40) ? '#16a34a' : '#1062b3',
                       borderRadius: '4px',
                       transition: 'width 0.5s ease-out'
                     }}></div>
                   </div>
                 </div>
               </div>
             )}

             <div className="success-actions-row">
               <button className="btn btn-secondary done-btn" onClick={handleDone}>
                 Rescan
               </button>
               <button className="btn btn-primary done-btn" onClick={() => navigate('/history')}>
                 View Attendance
               </button>
             </div>
             <span className="countdown-text">Redirecting to log history in {countdown}s...</span>
            <button className="btn-back-portal-link" onClick={() => navigate('/')}>
              Back to Selection
            </button>
          </div>
        )}

        {isHolidayBlocked && (
          <div className="success-container holiday-blocked-container" style={{ textAlign: 'center', padding: '30px' }}>
            <div className="mini-checkmark-badge" style={{ backgroundColor: '#ef4444', width: '48px', height: '48px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h1 className="marked-title" style={{ color: '#ef4444' }}>Off Day Today</h1>
            <p className="marked-subtitle" style={{ fontSize: '16px', color: '#334155', maxWidth: '300px', margin: '16px auto' }}>
              {holidayMessage}
            </p>
            <button className="btn-back-portal-link" style={{ marginTop: '24px', display: 'inline-block' }} onClick={() => navigate('/')}>
              Back to Home
            </button>
          </div>
        )}

        {!isHolidayBlocked && scanStatus !== 'confirm' && scanStatus !== 'success' && scanStatus !== 'password' && (
          /* Live Scanner View */
          <>
            <div className="scanner-outer-circle">
              <div className="scanner-inner-container">
                {cameraActive ? (
                  <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
                ) : (
                  <div className="camera-fallback">
                    <div className="fallback-lobby-art"></div>
                  </div>
                )}
                
                {/* HUD Overlay inside the camera preview */}
                <div className="hud-overlay">
                  <span className="hud-title">Live Face Scan</span>
                  <span className="hud-status">
                    {scanStatus === 'scanning' ? 'ANALYZING BIOMETRICS...' : 'SYSTEM READY - POSITION FACE IN FRAME'}
                  </span>
                  
                  <div className="scanning-box">
                    <div className="corner-top-left"></div>
                    <div className="corner-top-right"></div>
                    <div className="corner-bottom-left"></div>
                    <div className="corner-bottom-right"></div>
                    {scanStatus === 'scanning' && <div className="laser-line"></div>}
                  </div>

                  <button 
                    className={`begin-scan-btn ${scanStatus === 'scanning' ? 'scanning' : ''}`} 
                    onClick={handleBeginScan}
                    disabled={scanStatus === 'scanning' || locationStatus !== 'granted'}
                  >
                    {scanStatus === 'scanning' ? 'SCANNING...' : 
                     locationStatus === 'fetching' ? 'FETCHING GPS...' : 
                     locationStatus === 'denied' ? 'LOCATION BLOCKED' : 'BEGIN SCAN'}
                  </button>
                  {locationStatus === 'denied' && (
                    <button 
                      onClick={requestLocation}
                      style={{ marginTop: '12px', background: 'transparent', border: '1px solid rgba(255,50,50,0.8)', color: '#ff6b6b', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', zIndex: 10 }}
                    >
                      RETRY LOCATION
                    </button>
                  )}
                </div>
              </div>
            </div>

             <h2 className="scan-instruction-title">
               {loggedEmployee ? `Please look at the camera, ${loggedEmployee.name}` : 'Please look at the camera'}
             </h2>
            <p className="scan-instruction-subtitle">Hold still for a moment.</p>
            
            {!loggedEmployee && scanStatus === 'idle' && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>
                  (Optional) Enter your Employee ID for a faster scan:
                </label>
                <input
                  type="text"
                  placeholder="e.g. EMP-001"
                  value={manualEmployeeId}
                  onChange={(e) => setManualEmployeeId(e.target.value)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                    textAlign: 'center',
                    width: '220px'
                  }}
                />
              </div>
            )}
            {errorMsg && (
              <p className="error-message-text" style={{
                color: '#ef4444',
                fontWeight: '600',
                marginTop: '12px',
                fontSize: '15px',
                textAlign: 'center',
                maxWidth: '320px',
                margin: '12px auto 0'
              }}>{errorMsg}</p>
            )}

            <div className="scanner-bottom-links">
              <a href="#" className="trouble-link" onClick={(e) => { e.preventDefault(); setScanStatus('password'); setErrorMsg(''); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Trouble scanning? Verify with Password.
              </a>

              <button className="btn-back-portal-footer" onClick={() => { stopCamera(); navigate('/'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Selection
              </button>
            </div>
          </>
        )}

        {scanStatus === 'password' && (
          /* Password Fallback Form Card */
          <div className="marked-card">
            <div className="marked-face-container password-fallback-circle" style={{ border: '4px solid #1062b3', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="marked-title" style={{ fontSize: '22px', marginTop: '12px' }}>Credential Verification</h1>
            <p className="marked-subtitle">
              Verify your identity using your credentials before logging tasks.
            </p>
            
            <form onSubmit={handlePasswordSubmit} style={{ width: '100%', maxWidth: '340px', marginTop: '16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!loggedEmployee && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Employee ID:</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-1042"
                    required
                    value={manualEmployeeId}
                    onChange={(e) => setManualEmployeeId(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }}
                  />
                </div>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Password:</label>
                <input
                  type="password"
                  placeholder="Enter your profile password"
                  required
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }}
                />
              </div>

              {errorMsg && (
                <p style={{ color: '#ef4444', fontWeight: '600', fontSize: '14px', textAlign: 'center', margin: '4px 0 0 0' }}>{errorMsg}</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '12px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', width: '100%' }} disabled={isProcessing}>
                  {isProcessing ? 'VERIFYING...' : 'Verify Credentials'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ padding: '10px', fontSize: '14px', fontWeight: '600', borderRadius: '8px', width: '100%' }} onClick={() => { setScanStatus('idle'); setPasswordValue(''); setErrorMsg(''); }} disabled={isProcessing}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

export default Scan;
