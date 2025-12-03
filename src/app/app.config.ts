import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode, APP_INITIALIZER, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { IndexedDbService } from './core/services/indexed-db.service';
import { SyncService } from './core/services/sync.service';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { OfflineInterceptor } from './core/interceptors/offline.interceptor';
import { ApiInterceptor } from './core/services/api.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: OfflineInterceptor,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const indexedDb = inject(IndexedDbService);
        return () => {
          return indexedDb.init().catch((err) => {
            console.error('Failed to initialize IndexedDB:', err);
            return Promise.resolve();
          });
        };
      },
      multi: true
    }
  ]
};
