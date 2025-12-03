export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function generateId(): string {
  return Date.now().toString();
}

