import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of, delay, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { IndexedDbService } from './indexed-db.service';
import { SessionNote } from '../models';
import { HTTP_STATUS, HTTP_METHODS } from '../utils/http.utils';
import { isValidId } from '../utils/validation.utils';
import { getTodayDateString } from '../utils/date.utils';

const API_BASE_PATH = '/api/session-notes';

@Injectable()
export class ApiInterceptor implements HttpInterceptor {
  constructor(private indexedDb: IndexedDbService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isApiRequest(req.url)) {
      return next.handle(req);
    }

    console.log('🔵 [API] Mock API request:', req.method, req.url);

    if (this.isGetSessionNotes(req)) {
      return this.handleGetSessionNotes();
    }

    if (this.isPostSessionNotes(req)) {
      return this.handlePostSessionNotes(req);
    }

    if (this.isPutSessionNote(req)) {
      return this.handlePutSessionNote(req);
    }

    if (this.isDeleteSessionNote(req)) {
      return this.handleDeleteSessionNote(req);
    }

    return this.createNotFoundResponse();
  }

  private isApiRequest(url: string): boolean {
    return url.startsWith('/api/');
  }

  private isGetSessionNotes(req: HttpRequest<any>): boolean {
    return req.method === HTTP_METHODS.GET && req.url === API_BASE_PATH;
  }

  private isPostSessionNotes(req: HttpRequest<any>): boolean {
    return req.method === HTTP_METHODS.POST && req.url === API_BASE_PATH;
  }

  private isPutSessionNote(req: HttpRequest<any>): boolean {
    return req.method === HTTP_METHODS.PUT && req.url.startsWith(API_BASE_PATH + '/');
  }

  private isDeleteSessionNote(req: HttpRequest<any>): boolean {
    return req.method === HTTP_METHODS.DELETE && req.url.startsWith(API_BASE_PATH + '/');
  }

  private extractIdFromUrl(url: string): string | null {
    const id = url.split('/').pop();
    return id && isValidId(id) ? id : null;
  }

  private createNotFoundResponse(): Observable<HttpResponse<any>> {
    return of(
      new HttpResponse({
        status: HTTP_STATUS.NOT_FOUND,
        body: { error: 'Not found' },
      })
    );
  }

  private createBadRequestResponse(message: string): Observable<HttpResponse<any>> {
    return of(
      new HttpResponse({
        status: HTTP_STATUS.BAD_REQUEST,
        body: { error: message },
      })
    );
  }

  private handleGetSessionNotes(): Observable<HttpEvent<any>> {
    const self = this;
    return from(this.indexedDb.getSessionNotes()).pipe(
      switchMap(function (notes) {
        return of(
          new HttpResponse({
            status: HTTP_STATUS.OK,
            body: notes,
          })
        ).pipe(delay(100));
      })
    );
  }

  private handlePostSessionNotes(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    const newNote: Omit<SessionNote, 'id'> = {
      clientName: req.body.clientName,
      note: req.body.note,
      shiftDate: req.body.shiftDate || getTodayDateString(),
      timestamp: Date.now(),
    };

    const self = this;
    return from(this.indexedDb.addSessionNote(newNote)).pipe(
      switchMap(function (id) {
        const createdNote: SessionNote = {
          id,
          ...newNote,
        };
        return of(
          new HttpResponse({
            status: HTTP_STATUS.CREATED,
            body: createdNote,
          })
        ).pipe(delay(100));
      })
    );
  }

  private handlePutSessionNote(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    const id = this.extractIdFromUrl(req.url);
    if (!id) {
      return this.createBadRequestResponse('Invalid ID');
    }

    const self = this;

    return from(this.indexedDb.getSessionNotes()).pipe(
      switchMap(function (notes) {
        return self.updateNoteIfExists(notes, id, req.body);
      }),
      switchMap(function (response) {
        return of(response).pipe(delay(100));
      })
    );
  }

  private async updateNoteIfExists(
    notes: SessionNote[],
    id: string,
    body: any
  ): Promise<HttpResponse<any>> {
    const note = notes.find(function (n) {
      return n.id === id;
    });

    if (!note) {
      console.log('ApiInterceptor: Note not found:', id);
      return new HttpResponse({
        status: HTTP_STATUS.NOT_FOUND,
        body: { error: 'Not found' },
      });
    }

    const updatedNote: SessionNote = {
      ...note,
      ...body,
      timestamp: note.timestamp,
    };

    await this.indexedDb.updateSessionNote(updatedNote);
    console.log('ApiInterceptor: Updated session note in IndexedDB:', updatedNote);

    return new HttpResponse({
      status: HTTP_STATUS.OK,
      body: updatedNote,
    });
  }

  private handleDeleteSessionNote(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    const id = this.extractIdFromUrl(req.url);
    if (!id) {
      return this.createBadRequestResponse('Invalid ID');
    }

    const self = this;

    return from(this.indexedDb.deleteSessionNote(id)).pipe(
      switchMap(function () {
        return of(
          new HttpResponse({
            status: HTTP_STATUS.OK,
            body: { success: true },
          })
        ).pipe(delay(100));
      })
    );
  }
}
