export interface SyncConflict {
  id?: number;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
  error: string;
}

