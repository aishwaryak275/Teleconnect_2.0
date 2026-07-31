import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private base = 'http://localhost:9090/teleConnect/notification';

  notifications = signal<any[]>([]);
  unreadCount = signal<number>(0);

  constructor(private http: HttpClient, private authService: AuthService) {
    this.refreshNotifications();
    setInterval(() => this.refreshNotifications(), 10000);
  }

  private get userId(): number | null {
    return this.authService.currentUser()?.id ?? null;
  }

  refreshNotifications(): void {
    const id = this.userId;
    if (!id) return;

    this.http.get<any[]>(`${this.base}/fetchNotifications/${id}`).subscribe({
      next: data => {
        // Newest first — the backend returns rows in insertion (oldest-first) order.
        const sorted = (data ?? []).slice().sort(
          (a, b) => new Date(b?.createdDate ?? 0).getTime() - new Date(a?.createdDate ?? 0).getTime()
        );
        this.notifications.set(sorted);
        this.unreadCount.set(sorted.filter(n => n.status === 'UNREAD' || n.status === 'Unread').length);
      },
      error: () => {}
    });
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(`${this.base}/unreadCount/${this.userId}`);
  }

  markAsRead(id: number): Observable<any> {
    return this.http.put<any>(`${this.base}/markAsRead/${id}`, null).pipe(
      tap(() => this.refreshNotifications())
    );
  }

  dismiss(id: number): Observable<any> {
    return this.http.put<any>(`${this.base}/dismiss/${id}`, null).pipe(
      tap(() => this.refreshNotifications())
    );
  }

  markAllAsRead(): Observable<any> {
    return this.http.put<any>(`${this.base}/markAllAsRead/${this.userId}`, null).pipe(
      tap(() => this.refreshNotifications())
    );
  }

  createNotification(request: any): Observable<any> {
    return this.http.post<any>(`${this.base}/createNotification`, request);
  }

  getByStatus(status: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/fetchByStatus/${this.userId}/${status}`);
  }

  getByCategory(category: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/fetchByCategory/${this.userId}/${category}`);
  }

  /** @deprecated use markAsRead or dismiss instead */
  updateStatus(id: number, status: 'Read' | 'Dismissed'): Observable<any> {
    return status === 'Read' ? this.markAsRead(id) : this.dismiss(id);
  }
}
