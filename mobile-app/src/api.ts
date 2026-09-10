import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type {Approval, Device, Envelope, Repository, Task, TaskLog, TokenPair} from './types';

const configured = Constants.expoConfig?.extra?.apiUrl as string | undefined;
let baseUrl = configured || 'http://10.0.2.2:8000';
let tokens: TokenPair | null = null;
export const setBaseUrl = (url: string) => { baseUrl = url.replace(/\/$/, ''); };
export const getBaseUrl = () => baseUrl;

export async function restoreTokens() { const [raw, relay] = await Promise.all([SecureStore.getItemAsync('tokens'), SecureStore.getItemAsync('relay')]); if (relay) baseUrl = relay; tokens = raw ? JSON.parse(raw) : null; return tokens; }
export async function setTokens(value: TokenPair | null) { tokens = value; value ? await SecureStore.setItemAsync('tokens', JSON.stringify(value)) : await SecureStore.deleteItemAsync('tokens'); }

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {...init, headers: {'Content-Type': 'application/json', ...(tokens ? {Authorization: `Bearer ${tokens.access_token}`} : {}), ...init.headers}});
  if (response.status === 401 && retry && tokens?.refresh_token) {
    const refresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refresh_token: tokens.refresh_token})});
    if (refresh.ok) { await setTokens(await refresh.json()); return request(path, init, false); }
  }
  if (!response.ok) { let message = `Request failed (${response.status})`; try { message = (await response.json()).detail || message; } catch {} throw new Error(message); }
  return response.status === 204 ? undefined as T : response.json();
}

async function rememberConnection(value: TokenPair) { await Promise.all([setTokens(value), SecureStore.setItemAsync('relay', baseUrl)]); return value; }
export async function login(email: string, password: string) { return rememberConnection(await request<TokenPair>('/auth/login', {method: 'POST', body: JSON.stringify({email, password})})); }
export const register = async (email: string, password: string) => rememberConnection(await request<TokenPair>('/auth/register', {method: 'POST', body: JSON.stringify({email, password})}));
export const devices = () => request<Device[]>('/devices');
export const repositories = (id: string) => request<Repository[]>(`/devices/${id}/repositories`);
export const tasks = (deviceId?: string) => request<Task[]>(`/tasks${deviceId ? `?device_id=${deviceId}` : ''}`);
export const logs = (id: string) => request<TaskLog[]>(`/tasks/${id}/logs`);
export const createTask = (data: object) => request<Task>('/tasks', {method: 'POST', body: JSON.stringify(data)});
export const cancelTask = (id: string) => request<Task>(`/tasks/${id}/cancel`, {method: 'POST'});
export const sendInput = (id: string, text: string) => request(`/tasks/${id}/input`, {method: 'POST', body: JSON.stringify({text})});
export const approvals = () => request<Approval[]>('/approvals');
export const decideApproval = (id: string, approved: boolean) => request<Approval>(`/approvals/${id}`, {method: 'POST', body: JSON.stringify({approved})});

export function connectEvents(onMessage: (message: Envelope) => void, onState?: (connected: boolean) => void) {
  let stopped = false, socket: WebSocket | null = null, timer: ReturnType<typeof setTimeout>, attempt = 0;
  const connect = () => {
    if (stopped || !tokens) return;
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    socket = new WebSocket(`${wsUrl}/ws/mobile`, undefined, {headers: {Authorization: `Bearer ${tokens.access_token}`}});
    socket.onopen = () => { attempt = 0; onState?.(true); };
    socket.onmessage = event => { try { onMessage(JSON.parse(event.data)); } catch {} };
    socket.onclose = () => { onState?.(false); if (!stopped) timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 30000)); };
    socket.onerror = () => socket?.close();
  };
  connect();
  return () => { stopped = true; clearTimeout(timer); socket?.close(); };
}
