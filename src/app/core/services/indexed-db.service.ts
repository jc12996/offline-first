import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { OutboxItem, SyncConflict, CacheItem, SessionNote } from '../models';

interface OfflineFirstDB extends DBSchema {
  outbox: {
    key: number;
    value: OutboxItem;
    indexes: { 'by-timestamp': number };
  };
  syncConflicts: {
    key: number;
    value: SyncConflict;
    indexes: { 'by-timestamp': number };
  };
  cache: {
    key: string;
    value: CacheItem;
    indexes: { 'by-timestamp': number };
  };
  sessionNotes: {
    key: string;
    value: SessionNote;
    indexes: { 'by-timestamp': number; 'by-shiftDate': string };
  };
}

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {
  private dbName = 'offline-first-db';
  private dbVersion = 3;
  private db: IDBPDatabase<OfflineFirstDB> | null = null;

  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = await openDB<OfflineFirstDB>(this.dbName, this.dbVersion, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', {
            keyPath: 'id',
            autoIncrement: true,
          });
          outboxStore.createIndex('by-timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('syncConflicts')) {
          const conflictsStore = db.createObjectStore('syncConflicts', {
            keyPath: 'id',
            autoIncrement: true,
          });
          conflictsStore.createIndex('by-timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', {
            keyPath: 'key',
          });
          cacheStore.createIndex('by-timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('sessionNotes')) {
          const sessionNotesStore = db.createObjectStore('sessionNotes', {
            keyPath: 'id',
          });
          sessionNotesStore.createIndex('by-timestamp', 'timestamp');
          sessionNotesStore.createIndex('by-shiftDate', 'shiftDate');
        }
      },
    });

    if (!this.db.objectStoreNames.contains('sessionNotes')) {
      console.error('IndexedDbService: sessionNotes store missing after initialization!');
      console.error(
        'IndexedDbService: Please delete the database in DevTools (Application → IndexedDB → offline-first-db) and refresh the page'
      );
      throw new Error('sessionNotes store not found - please delete the database and refresh');
    }

    await this.initializeSampleData();
  }

  private async initializeSampleData(): Promise<void> {
    if (!this.db) return;

    try {
      const count = await this.db.count('sessionNotes');
      if (count === 0) {
        const sampleNotes: SessionNote[] = [
          {
            id: '1',
            clientName: 'John Doe',
            note: 'Completed daily activities. Client was responsive and engaged.',
            timestamp: Date.now() - 86400000,
            shiftDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          },
          {
            id: '2',
            clientName: 'Jane Smith',
            note: 'Assisted with meal preparation and medication administration.',
            timestamp: Date.now() - 172800000,
            shiftDate: new Date(Date.now() - 172800000).toISOString().split('T')[0],
          },
        ];

        for (let i = 0; i < sampleNotes.length; i++) {
          await this.db.add('sessionNotes', sampleNotes[i]);
        }
      }
    } catch (error) {
      console.error('Error initializing sample data:', error);
    }
  }

  private ensureDatabaseInitialized(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  async addToOutbox(item: Omit<OutboxItem, 'id'>): Promise<number> {
    await this.init();
    this.ensureDatabaseInitialized();

    const outboxItem = {
      ...item,
      timestamp: item.timestamp || Date.now(),
    };

    const id = await this.db!.add('outbox', outboxItem);

    return id as number;
  }

  async getOutbox(): Promise<OutboxItem[]> {
    await this.init();
    this.ensureDatabaseInitialized();

    const index = this.db!.transaction('outbox').store.index('by-timestamp');
    return await index.getAll();
  }

  async removeFromOutbox(id: number): Promise<void> {
    await this.init();
    this.ensureDatabaseInitialized();

    await this.db!.delete('outbox', id);
  }

  async addToSyncConflicts(item: Omit<SyncConflict, 'id'>): Promise<number> {
    await this.init();
    this.ensureDatabaseInitialized();

    const id = await this.db!.add('syncConflicts', {
      ...item,
      timestamp: item.timestamp || Date.now(),
    });
    return id as number;
  }

  async getSyncConflicts(): Promise<SyncConflict[]> {
    await this.init();
    this.ensureDatabaseInitialized();

    const index = this.db!.transaction('syncConflicts').store.index('by-timestamp');
    return await index.getAll();
  }

  async removeSyncConflict(id: number): Promise<void> {
    await this.init();
    this.ensureDatabaseInitialized();

    await this.db!.delete('syncConflicts', id);
  }

  async cacheGet(key: string, data: any): Promise<void> {
    await this.init();
    this.ensureDatabaseInitialized();

    await this.db!.put('cache', {
      key,
      data,
      timestamp: Date.now(),
    });
  }

  async getCached(key: string): Promise<any | null> {
    await this.init();
    this.ensureDatabaseInitialized();

    const item = await this.db!.get('cache', key);
    return item ? item.data : null;
  }

  async clearCache(): Promise<void> {
    await this.init();
    this.ensureDatabaseInitialized();

    await this.db!.clear('cache');
  }

  private hasSessionNotesStore(): boolean {
    return this.db !== null && this.db.objectStoreNames.contains('sessionNotes');
  }

  private sortNotesByTimestamp(notes: SessionNote[]): SessionNote[] {
    return notes.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
  }

  async getSessionNotes(): Promise<SessionNote[]> {
    await this.init();
    this.ensureDatabaseInitialized();

    if (!this.hasSessionNotesStore()) {
      console.error('IndexedDbService: sessionNotes store does not exist!');
      console.log('IndexedDbService: Available stores:', Array.from(this.db!.objectStoreNames));
      return [];
    }

    try {
      const store = this.db!.transaction('sessionNotes').store;
      const index = store.index('by-timestamp');
      const notes = await index.getAll();
      const sorted = this.sortNotesByTimestamp(notes);
      return sorted;
    } catch (error) {
      console.error('IndexedDbService: Error getting session notes:', error);
      return this.getSessionNotesFallback();
    }
  }

  private async getSessionNotesFallback(): Promise<SessionNote[]> {
    try {
      const allNotes = await this.db!.getAll('sessionNotes');
      return this.sortNotesByTimestamp(allNotes);
    } catch (fallbackError) {
      console.error('❌ [DB] Error retrieving session notes:', fallbackError);
      return [];
    }
  }

  async addSessionNote(note: Omit<SessionNote, 'id'>): Promise<string> {
    await this.init();
    this.ensureDatabaseInitialized();

    if (!this.hasSessionNotesStore()) {
      console.error('IndexedDbService: sessionNotes store does not exist!');
      throw new Error(
        'sessionNotes store not found. Please refresh the page to upgrade the database.'
      );
    }

    const id = Date.now().toString();
    const sessionNote: SessionNote = {
      id,
      ...note,
      timestamp: note.timestamp || Date.now(),
    };

    await this.db!.add('sessionNotes', sessionNote);
    return id;
  }

  async updateSessionNote(note: SessionNote): Promise<void> {
    await this.init();
    this.ensureDatabaseInitialized();

    await this.db!.put('sessionNotes', note);
  }

  async deleteSessionNote(id: string): Promise<void> {
    await this.init();
    this.ensureDatabaseInitialized();

    if (!this.hasSessionNotesStore()) {
      console.error('IndexedDbService: sessionNotes store does not exist!');
      throw new Error('sessionNotes store not found');
    }

    await this.db!.delete('sessionNotes', id);
  }
}
