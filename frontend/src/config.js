// Central API and Application configurations
// TODO: Replace this with your hosted Render backend URL after deploying it
export const PRODUCTION_API_URL = 'https://attendance-api.onrender.com';

export const API_BASE_URL = import.meta.env.PROD
  ? PRODUCTION_API_URL // In production (both web & mobile), point directly to the hosted Render backend
  : (window.Capacitor
      ? 'http://127.0.0.1:5000'
      : 'http://localhost:5000'
    );
