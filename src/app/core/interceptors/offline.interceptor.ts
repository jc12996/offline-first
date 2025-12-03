import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse,
} from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { IndexedDbService } from '../services/indexed-db.service';
import { OfflineDetectionService } from '../services/offline-detection.service';
import { isMutationMethod, isGetMethod, HTTP_STATUS } from '../utils/http.utils';

@Injectable()
export class OfflineInterceptor implements HttpInterceptor {
  constructor(
    private indexedDb: IndexedDbService,
    private offlineDetection: OfflineDetectionService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const isOnline = this.offlineDetection.isOnline;
    const isMutation = isMutationMethod(req.method);
    const isGet = isGetMethod(req.method);

    if (!isOnline && isMutation) {
      console.log('🔴 [OFFLINE] Intercepting mutation:', req.method, req.url);
      return from(this.handleOfflineMutation(req));
    }

    if (!isOnline && isGet) {
      return from(this.handleOfflineGet(req));
    }

    if (isOnline && isGet) {
      return this.handleOnlineGet(req, next);
    }

    return next.handle(req);
  }

  private async handleOfflineMutation(req: HttpRequest<any>): Promise<HttpEvent<any>> {
    const outboxItem = {
      url: req.url,
      method: req.method,
      payload: req.body || {},
      timestamp: Date.now(),
    };

    const outboxId = await this.indexedDb.addToOutbox(outboxItem);
    console.log('✅ [OUTBOX] Queued for sync:', req.method, req.url, '| ID:', outboxId);

    const responseBody = this.createOfflineMutationResponse(req.method, req.body);

    console.log('✅ [RESPONSE] Returning optimistic 200 response');
    return new HttpResponse({
      status: HTTP_STATUS.OK,
      statusText: 'OK',
      body: responseBody,
    });
  }

  private createOfflineMutationResponse(method: string, body: any): any {
    if (method === 'POST') {
      return {
        success: true,
        message: 'Saved offline, will sync when online',
        data: body,
      };
    }

    if (method === 'PUT') {
      return {
        success: true,
        message: 'Updated offline, will sync when online',
        data: body,
      };
    }

    if (method === 'DELETE') {
      return {
        success: true,
        message: 'Delete queued offline, will sync when online',
      };
    }

    return {
      success: true,
      message: 'Saved offline, will sync when online',
    };
  }

  private async handleOfflineGet(req: HttpRequest<any>): Promise<HttpEvent<any>> {
    const cachedData = await this.indexedDb.getCached(req.url);

    if (cachedData) {
      return this.createCachedResponse(cachedData);
    }

    return this.createServiceUnavailableResponse();
  }

  private createCachedResponse(data: any): HttpResponse<any> {
    return new HttpResponse({
      status: HTTP_STATUS.OK,
      statusText: 'OK (Cached)',
      body: data,
    });
  }

  private createServiceUnavailableResponse(): HttpResponse<any> {
    return new HttpResponse({
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      statusText: 'Service Unavailable',
      body: { error: 'No cached data available and device is offline' },
    });
  }

  private handleOnlineGet(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const self = this;
    const HttpResponseClass = HttpResponse;
    return new Observable(function (observer) {
      next.handle(req).subscribe({
        next: function (event) {
          const isHttpResponse =
            HttpResponseClass &&
            typeof HttpResponseClass === 'function' &&
            event instanceof HttpResponseClass;
          const hasResponseProperties =
            event && typeof event === 'object' && 'status' in event && 'body' in event;

          if ((isHttpResponse || hasResponseProperties) && event.status === HTTP_STATUS.OK) {
            self.indexedDb.cacheGet(req.url, event.body).catch(function (err) {
              console.error('Failed to cache response:', err);
            });
          }
          observer.next(event);
        },
        error: function (err) {
          observer.error(err);
        },
        complete: function () {
          observer.complete();
        },
      });
    });
  }
}
