import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, interval, firstValueFrom } from 'rxjs';
import { OfflineDetectionService } from '../core/services/offline-detection.service';
import { IndexedDbService } from '../core/services/indexed-db.service';
import { SessionNote } from '../core/models';
import { SyncService, SyncStatus } from '../core/services/sync.service';
import { isFormValid } from '../core/utils/validation.utils';
import { getTodayDateString, formatTimestamp } from '../core/utils/date.utils';

const API_SESSION_NOTES = '/api/session-notes';
const POLL_INTERVAL_MS = 2000;
const SUCCESS_MESSAGE_DURATION_MS = 3000;

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './demo.component.html',
  styleUrl: './demo.component.css',
})
export class DemoComponent implements OnInit, OnDestroy {
  isOnline$: Observable<boolean>;
  isOnline = true;
  syncStatus$: Observable<SyncStatus>;
  syncStatus: SyncStatus = {
    isSyncing: false,
    totalItems: 0,
    completedItems: 0,
    failedItems: 0,
  };

  sessionNotes: SessionNote[] = [];

  formData = {
    clientName: '',
    note: '',
    shiftDate: getTodayDateString(),
  };

  editingNote: SessionNote | null = null;
  editFormData = {
    clientName: '',
    note: '',
    shiftDate: '',
  };

  showSuccessMessage = false;
  successMessage = '';

  private subscriptions = new Subscription();

  constructor(
    private http: HttpClient,
    private offlineDetection: OfflineDetectionService,
    private indexedDb: IndexedDbService,
    private syncService: SyncService,
    private cdr: ChangeDetectorRef
  ) {
    this.isOnline$ = this.offlineDetection.isOnline$;
    this.syncStatus$ = this.syncService.syncStatus;
  }

  ngOnInit(): void {
    this.setupSubscriptions();
    this.loadInitialData();
    this.startPolling();
  }

  private setupSubscriptions(): void {
    const self = this;
    this.subscriptions.add(
      this.isOnline$.subscribe(function (isOnline) {
        self.isOnline = isOnline;
      })
    );

    this.subscriptions.add(
      this.syncStatus$.subscribe(function (status) {
        self.handleSyncStatusChange(status);
      })
    );
  }

  private handleSyncStatusChange(status: SyncStatus): void {
    const wasSyncing = this.syncStatus.isSyncing;
    this.syncStatus = status;

    if (wasSyncing && !status.isSyncing) {
      console.log('✅ [SYNC] Component: Sync completed, reloading data');
      this.reloadAllData();
      this.cdr.detectChanges();
    }
  }

  private reloadAllData(): void {
    this.loadSessionNotes();
  }

  private loadInitialData(): void {
    this.loadSessionNotes();
  }

  private startPolling(): void {}

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async loadSessionNotes(): Promise<void> {
    try {
      await this.loadSessionNotesFromHttp();
    } catch (error) {
      console.error('❌ [COMPONENT] Error loading session notes via HTTP:', error);
      await this.loadSessionNotesFromIndexedDb();
    }
  }

  private async loadSessionNotesFromHttp(): Promise<void> {
    const notes = await firstValueFrom(this.http.get<SessionNote[]>(API_SESSION_NOTES));
    this.sessionNotes = notes || [];
    this.cdr.detectChanges();
  }

  private async loadSessionNotesFromIndexedDb(): Promise<void> {
    try {
      await this.indexedDb.init();
      const notes = await this.indexedDb.getSessionNotes();
      this.sessionNotes = notes || [];
      this.cdr.detectChanges();
    } catch (dbError) {
      console.error('❌ [COMPONENT] Error loading from IndexedDB:', dbError);
      this.sessionNotes = [];
      this.cdr.detectChanges();
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.isFormValid()) {
      return;
    }

    const formDataToSubmit = { ...this.formData };

    try {
      await firstValueFrom(this.http.post<SessionNote>(API_SESSION_NOTES, formDataToSubmit));

      this.displaySuccessMessage('Shift Saved Successfully');
      this.resetForm();
      await this.handlePostSubmit();
    } catch (error) {
      console.error('❌ [COMPONENT] Error submitting session note:', error);
      await this.handlePostSubmit();
    }
  }

  private isFormValid(): boolean {
    return isFormValid(this.formData);
  }

  private displaySuccessMessage(message: string): void {
    this.showSuccessMessage = true;
    this.successMessage = message;
    const self = this;
    setTimeout(function () {
      self.showSuccessMessage = false;
    }, SUCCESS_MESSAGE_DURATION_MS);
  }

  private resetForm(): void {
    this.formData = {
      clientName: '',
      note: '',
      shiftDate: getTodayDateString(),
    };
  }

  private async handlePostSubmit(): Promise<void> {
    await this.loadSessionNotes();
    this.cdr.detectChanges();
  }

  formatTimestamp(timestamp: number): string {
    return formatTimestamp(timestamp);
  }

  trackByNoteId(index: number, note: SessionNote): string {
    return note.id;
  }

  startEdit(note: SessionNote): void {
    this.editingNote = note;
    this.editFormData = {
      clientName: note.clientName,
      note: note.note,
      shiftDate: note.shiftDate,
    };
  }

  cancelEdit(): void {
    this.editingNote = null;
    this.editFormData = {
      clientName: '',
      note: '',
      shiftDate: '',
    };
  }

  async saveEdit(): Promise<void> {
    if (!this.canSaveEdit()) {
      return;
    }

    try {
      await this.updateSessionNote();
      this.displaySuccessMessage('Note Updated Successfully');
      this.cancelEdit();
      await this.loadSessionNotes();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ [COMPONENT] Error updating session note:', error);
      this.cdr.detectChanges();
    }
  }

  private canSaveEdit(): boolean {
    return !!this.editingNote && isFormValid(this.editFormData);
  }

  private async updateSessionNote(): Promise<void> {
    await firstValueFrom(
      this.http.put<SessionNote>(`${API_SESSION_NOTES}/${this.editingNote!.id}`, {
        clientName: this.editFormData.clientName,
        note: this.editFormData.note,
        shiftDate: this.editFormData.shiftDate,
      })
    );
  }

  async deleteNote(note: SessionNote): Promise<void> {
    if (!this.confirmDelete(note)) {
      return;
    }

    const noteIdToDelete = note.id;

    try {
      this.removeNoteFromLocalList(noteIdToDelete);

      await firstValueFrom(this.http.delete(`${API_SESSION_NOTES}/${noteIdToDelete}`));

      this.displaySuccessMessage('Note Deleted Successfully');
      await this.handlePostDelete();
    } catch (error) {
      console.error('❌ [COMPONENT] Error deleting session note:', error);
      await this.loadSessionNotes();
      this.cdr.detectChanges();
    }
  }

  private confirmDelete(note: SessionNote): boolean {
    return confirm(`Are you sure you want to delete the note for ${note.clientName}?`);
  }

  private removeNoteFromLocalList(noteId: string): void {
    const self = this;
    this.sessionNotes = this.sessionNotes.filter(function (n) {
      return n.id !== noteId;
    });
    this.cdr.detectChanges();
  }

  private async handlePostDelete(): Promise<void> {
    await this.loadSessionNotes();
    this.cdr.detectChanges();
  }
}
