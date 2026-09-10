export type TaskState = 'QUEUED' | 'STARTING' | 'ANALYZING' | 'EDITING' | 'TESTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type Device = {id: string; name: string; label: 'Work' | 'Personal'; default_agent: 'codex' | 'claude'; last_seen_at: string | null; online: boolean; metadata_json: Record<string, unknown>};
export type Repository = {id: string; device_id: string; name: string; path: string; enabled: boolean};
export type Task = {id: string; session_id: string; device_id: string; repository_id: string; prompt: string; state: TaskState; error: string | null; result: {branch?: string; status?: string; diff?: string; changed_files?: string[]}; created_at: string; updated_at: string};
export type TaskLog = {sequence: number; stream: string; text: string; payload: Record<string, unknown>; created_at: string};
export type Approval = {id: string; task_id: string; action: string; details: Record<string, unknown>; status: string; requested_at: string; decided_at: string | null};
export type TokenPair = {access_token: string; refresh_token: string; token_type: string};
export type Envelope = {version?: number; id?: string; type: string; sent_at?: string; payload: Record<string, unknown>};

