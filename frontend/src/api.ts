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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Token expired or invalid — clear token and throw. 
    // Individual components (like App.tsx) will handle the redirect if needed.
    if (response.status === 401) {
      localStorage.removeItem('token');
      // If the session expires on an authenticated page (e.g. /dashboard), redirect to login
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    return await response.json() as Promise<T>;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request Timeout: The server is taking too long to respond.');
    }
    throw err;
  }
}

/** Convenience wrappers */
export const apiGet  = <T = unknown>(path: string) => apiFetch<T>(path);

export const apiPost = <T = unknown>(path: string, body: unknown) =>
  apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
