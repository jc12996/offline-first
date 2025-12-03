import { Injectable } from '@angular/core';
import { Observable, fromEvent, merge, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class OfflineDetectionService {
  private online$: Observable<boolean>;

  constructor() {
    const onlineEvent$ = fromEvent(window, 'online').pipe(map(() => true));
    const offlineEvent$ = fromEvent(window, 'offline').pipe(map(() => false));
    
    this.online$ = merge(
      of(navigator.onLine),
      onlineEvent$,
      offlineEvent$
    ).pipe(
      startWith(navigator.onLine)
    );
  }

  get isOnline$(): Observable<boolean> {
    return this.online$;
  }

  get isOnline(): boolean {
    return navigator.onLine;
  }
}


