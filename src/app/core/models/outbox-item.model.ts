export interface OutboxItem {
  id?: number;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
}

