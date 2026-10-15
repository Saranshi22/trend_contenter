// Centralized API Base configuration
// Defaults to local dev server (port 8001), but uses relative '/api/v1' when hosted in production on Cloud Run.
export const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? '/api/v1'
    : 'http://127.0.0.1:8001/api/v1'
);

