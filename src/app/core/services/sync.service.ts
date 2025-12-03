import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, fromEvent, from, Subject, EMPTY } from 'rxjs';
import { concatMap, catchError, tap } from 'rxjs/operators';
import { IndexedDbService } from './indexed-db.service';
import { OutboxItem } from '../models';
import { OfflineDetectionService } from './offline-detection.service';
import { isClientError } from '../utils/http.utils';

export interface SyncStatus {
  isSyncing: boolean;
  totalItems: number;
  completedItems: number;
  failedItems: number;
}

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private statusSubject = new Subject<SyncStatus>();
  private currentStatus: SyncStatus = {
    isSyncing: false,
    totalItems: 0,
    completedItems: 0,
    failedItems: 0,
  };

  constructor(
    private http: HttpClient,
    private indexedDb: IndexedDbService,
    private offlineDetection: OfflineDetectionService
  ) {
    this.setupOnlineListener();
  }

  get syncStatus(): Observable<SyncStatus> {
    return this.statusSubject.asObservable();
  }

  private setupOnlineListener(): void {
    const self = this;
    fromEvent(window, 'online').subscribe(function () {
      if (self.offlineDetection.isOnline) {
        console.log('🌐 [ONLINE] Connection restored - triggering sync');
        self.sync();
      }
    });
  }

  async sync(): Promise<void> {
    if (this.shouldSkipSync()) {
      return;
    }

    const outboxItems = await this.indexedDb.getOutbox();

    if (outboxItems.length === 0) {
      console.log('📦 [SYNC] No items to sync');
      return;
    }

    console.log('🚀 [SYNC] Starting sync | Items:', outboxItems.length);
    this.startSync(outboxItems.length);
    this.processOutboxItems(outboxItems);
  }

  private shouldSkipSync(): boolean {
    return this.currentStatus.isSyncing || !this.offlineDetection.isOnline;
  }

  private startSync(totalItems: number): void {
    this.updateStatus({
      isSyncing: true,
      totalItems: totalItems,
      completedItems: 0,
      failedItems: 0,
    });
  }

  private processOutboxItems(outboxItems: OutboxItem[]): void {
    const self = this;
    from(outboxItems)
      .pipe(
        concatMap(function (item: OutboxItem) {
          return self.processItem(item).pipe(
            tap(function () {
              self.incrementCompletedItems();
            }),
            catchError(function (error: any) {
              return self.handleSyncError(error, item);
            })
          );
        })
      )
      .subscribe({
        next: function () {},
        complete: function () {
          self.handleSyncComplete();
        },
        error: function (error) {
          console.error('SyncService: Sync error:', error);
        },
      });
  }

  private incrementCompletedItems(): void {
    this.updateStatus({
      ...this.currentStatus,
      completedItems: this.currentStatus.completedItems + 1,
    });
  }

  private async handleSyncError(error: any, item: OutboxItem): Promise<Observable<never>> {
    if (isClientError(error.status)) {
      await this.handleClientError(error, item);
      return EMPTY;
    }

    this.handleServerError();
    throw error;
  }

  private async handleClientError(error: any, item: OutboxItem): Promise<void> {
    console.log('⚠️ [SYNC] Client error (4xx):', item.method, item.url, '| Status:', error.status);
    console.log('⚠️ [CONFLICT] Moving to sync conflicts (queue continues)');

    await this.indexedDb.addToSyncConflicts({
      url: item.url,
      method: item.method,
      payload: item.payload,
      timestamp: item.timestamp,
      error: error.message || `HTTP ${error.status}`,
    });

    if (item.id) {
      await this.indexedDb.removeFromOutbox(item.id);
    }

    this.updateStatus({
      ...this.currentStatus,
      completedItems: this.currentStatus.completedItems + 1,
      failedItems: this.currentStatus.failedItems + 1,
    });
  }

  private handleServerError(): void {
    this.updateStatus({
      isSyncing: false,
      totalItems: this.currentStatus.totalItems,
      completedItems: this.currentStatus.completedItems,
      failedItems: this.currentStatus.failedItems,
    });
  }

  private async handleSyncComplete(): Promise<void> {
    const remainingOutbox = await this.indexedDb.getOutbox();
    console.log('✅ [SYNC] Completed | Remaining items:', remainingOutbox.length);

    this.updateStatus({
      isSyncing: false,
      totalItems: 0,
      completedItems: 0,
      failedItems: 0,
    });
  }

  private processItem(item: OutboxItem): Observable<any> {
    if (!this.hasValidItemId(item)) {
      throw new Error('Item missing ID');
    }

    console.log('🔄 [SYNC] Processing:', item.method, item.url);

    const request = this.createHttpRequest(item);

    const self = this;
    return request.pipe(
      tap(function (response) {
        self.handleSuccessfulRequest(item, response);
      })
    );
  }

  private hasValidItemId(item: OutboxItem): boolean {
    return !!item.id;
  }

  private createHttpRequest(item: OutboxItem): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    switch (item.method) {
      case 'POST':
        return this.http.post(item.url, item.payload, { headers });
      case 'PUT':
        return this.http.put(item.url, item.payload, { headers });
      case 'DELETE':
        return this.http.delete(item.url, { headers });
      default:
        throw new Error(`Unsupported method: ${item.method}`);
    }
  }

  private async handleSuccessfulRequest(item: OutboxItem, response: any): Promise<void> {
    console.log('✅ [SYNC] Success:', item.method, item.url, '| Status:', response.status || 200);

    if (item.id) {
      await this.indexedDb.removeFromOutbox(item.id);
      const remainingOutbox = await this.indexedDb.getOutbox();
      console.log('📦 [OUTBOX] Removed | Remaining:', remainingOutbox.length);
    }
  }

  private updateStatus(status: SyncStatus): void {
    this.currentStatus = status;
    this.statusSubject.next(status);
  }

  triggerSync(): void {
    this.sync();
  }
}
