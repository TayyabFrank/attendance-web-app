// Central API and Application configurations
// TODO: Replace this with your actual Vercel URL for the Capacitor mobile app if you deploy it tomorrow
export const PRODUCTION_API_URL = 'https://attendance-web-app-five.vercel.app';

export const API_BASE_URL = import.meta.env.PROD
  ? (window.Capacitor ? PRODUCTION_API_URL : window.location.origin) // Relative for web (prevents CORS issues), static for mobile
  : (window.Capacitor
      ? 'http://127.0.0.1:5000'
      : 'http://localhost:5000'
    );
