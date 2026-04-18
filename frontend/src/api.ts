/**
 * api.ts — Artillegence AI Authenticated Fetch Helper
 *
 * All API calls go through `apiFetch` which automatically:
 *  1. Reads the JWT from localStorage
 *  2. Attaches it as a Bearer Authorization header
 *  3. Redirects to /login on 401 (expired/invalid token)
 */

const BASE_URL = '';  // Vite proxies /api/* → http://localhost:8000

/** Low-level authenticated fetch. Throws on network errors; returns parsed JSON. */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Token expired or invalid — clear token and throw. 
  // Individual components (like App.tsx) will handle the redirect if needed.
  if (response.status === 401) {
    localStorage.removeItem('token');
    // We explicitly avoid window.location.replace here so that the Landing Page
    // can mount ParticleGlobe even if the existing token is invalid.
    throw new Error('Unauthorized');
  }

  return response.json() as Promise<T>;
}

/** Convenience wrappers */
export const apiGet  = <T = unknown>(path: string) => apiFetch<T>(path);

export const apiPost = <T = unknown>(path: string, body: unknown) =>
  apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
