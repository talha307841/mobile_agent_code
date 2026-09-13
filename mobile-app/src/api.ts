import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type {
  Approval,
  Device,
  Envelope,
  Repository,
  Task,
  TaskLog,
  TokenPair,
} from "./types";

const configured = Constants.expoConfig?.extra?.apiUrl as string | undefined;
let baseUrl = configured || "http://10.0.2.2:8000";
let tokens: TokenPair | null = null;
let refreshPromise: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | undefined;
export const setBaseUrl = (url: string) => {
  const normalized = url.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(normalized))
    throw new Error("Relay URL must start with http:// or https://");
  baseUrl = normalized;
};
export const getBaseUrl = () => baseUrl;
export const onAuthFailure = (handler?: () => void) => {
  authFailureHandler = handler;
};

export async function restoreTokens() {
  const [raw, relay] = await Promise.all([
    SecureStore.getItemAsync("tokens"),
    SecureStore.getItemAsync("relay"),
  ]);
  if (relay) baseUrl = relay;
  tokens = raw ? JSON.parse(raw) : null;
  return tokens;
}
export async function setTokens(value: TokenPair | null) {
  tokens = value;
  value
    ? await SecureStore.setItemAsync("tokens", JSON.stringify(value))
    : await SecureStore.deleteItemAsync("tokens");
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refresh_token) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: tokens?.refresh_token }),
        });
        if (!response.ok) return false;
        await setTokens(await response.json());
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Relay timed out. Check your connection and try again.");
    throw new Error(
      "Cannot reach the relay. Check the relay URL and your internet connection.",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 && retry && tokens?.refresh_token) {
    if (await refreshTokens()) return request(path, init, false);
    await setTokens(null);
    authFailureHandler?.();
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      message = (await response.json()).detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

async function rememberConnection(value: TokenPair) {
  await Promise.all([
    setTokens(value),
    SecureStore.setItemAsync("relay", baseUrl),
  ]);
  return value;
}
export async function login(email: string, password: string) {
  return rememberConnection(
    await request<TokenPair>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  );
}
export const register = async (email: string, password: string) =>
  rememberConnection(
    await request<TokenPair>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  );
export const devices = () => request<Device[]>("/devices");
export const repositories = (id: string) =>
  request<Repository[]>(`/devices/${id}/repositories`);
export const tasks = (deviceId?: string) =>
  request<Task[]>(`/tasks${deviceId ? `?device_id=${deviceId}` : ""}`);
export const task = (id: string) => request<Task>(`/tasks/${id}`);
export const logs = (id: string) => request<TaskLog[]>(`/tasks/${id}/logs`);
export const createTask = (data: object) =>
  request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) });
export const cancelTask = (id: string) =>
  request<Task>(`/tasks/${id}/cancel`, { method: "POST" });
export const sendInput = (id: string, text: string) =>
  request(`/tasks/${id}/input`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
export const approvals = () => request<Approval[]>("/approvals");
export const decideApproval = (id: string, approved: boolean) =>
  request<Approval>(`/approvals/${id}`, {
    method: "POST",
    body: JSON.stringify({ approved }),
  });
export async function logout() {
  if (tokens?.refresh_token) {
    try {
      await request("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
    } catch {}
  }
  await setTokens(null);
}

export function connectEvents(
  onMessage: (message: Envelope) => void,
  onState?: (connected: boolean) => void,
) {
  let stopped = false,
    socket: WebSocket | null = null,
    timer: ReturnType<typeof setTimeout>,
    attempt = 0;
  const connect = () => {
    if (stopped || !tokens) return;
    const wsUrl = baseUrl.replace(/^http/, "ws");
    const NativeWebSocket = WebSocket as unknown as new (
      url: string,
      protocols?: string[],
      options?: { headers?: Record<string, string> },
    ) => WebSocket;
    socket = new NativeWebSocket(`${wsUrl}/ws/mobile`, [], {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    socket.onopen = () => {
      attempt = 0;
      onState?.(true);
    };
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {}
    };
    socket.onclose = (event) => {
      onState?.(false);
      if (!stopped)
        timer = setTimeout(
          async () => {
            if (event.code === 4401 && !(await refreshTokens())) {
              await setTokens(null);
              authFailureHandler?.();
              return;
            }
            connect();
          },
          Math.min(1000 * 2 ** attempt++, 30000),
        );
    };
    socket.onerror = () => socket?.close();
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
  };
}
