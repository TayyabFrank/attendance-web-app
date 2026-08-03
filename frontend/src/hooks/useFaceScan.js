import { useState, useRef, useCallback, useEffect } from 'react';

export const useFaceScan = () => {
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);

  const stopCamera = useCallback(() => {
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
    setCameraActive(false);
  }, []);

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
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (!isMountedRef.current) {
        mediaStream.getTracks().forEach(track => track.stop());
        return false;
      }
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
      return true;
    } catch (err) {
      if (!isMountedRef.current) return false;
      console.error('Camera error:', err);
      return false;
    }
  }, []);

  const captureFrameBlob = useCallback(() => {
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
  }, [cameraActive]);

  return {
    videoRef,
    cameraActive,
    startCamera,
    stopCamera,
    captureFrameBlob
  };
};
