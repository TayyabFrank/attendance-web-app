// Central API and Application configurations
export const PRODUCTION_API_URL = 'https://attendance-web-app-five.vercel.app';

// Automatically use localhost when running locally, and Vercel in production
export const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : PRODUCTION_API_URL;
