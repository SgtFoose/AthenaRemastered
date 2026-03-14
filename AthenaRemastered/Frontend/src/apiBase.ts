// In dev (Vite on :5173), the backend runs on :5000.
// In production the backend serves the frontend on the same origin.
export const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:5000`
  : window.location.origin;
