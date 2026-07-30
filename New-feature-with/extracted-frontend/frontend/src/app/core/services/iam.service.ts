import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class IamService {
  private base = 'http://localhost:9090/teleConnect/iam/api';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/users`);
  }

  searchUsers(params: { name?: string; email?: string; phone?: string; status?: string; role?: string }): Observable<any[]> {
    let p = new HttpParams();
    if (params.name)   p = p.set('name', params.name);
    if (params.email)  p = p.set('email', params.email);
    if (params.phone)  p = p.set('phone', params.phone);
    if (params.status) p = p.set('status', params.status);
    if (params.role)   p = p.set('role', params.role);
    return this.http.get<any[]>(`${this.base}/users/search`, { params: p });
  }

  updateUserStatus(id: number, status: string): Observable<any> {
    return this.http.put<any>(`${this.base}/users/${id}/status`, { status });
  }

  changeUserRole(id: number, roleName: string): Observable<any> {
    return this.http.put<any>(`${this.base}/users/${id}`, { roleName });
  }

  resetPassword(id: number): Observable<any> {
    return this.http.put<any>(`${this.base}/admin/users/${id}/resetPassword`, {});
  }

  createStaff(data: { name: string; email: string; phone: string; roleName: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/admin/users/createStaff`, data);
  }

  getUser(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/users/${id}`);
  }

  getMe(): Observable<any> {
    return this.http.get<any>(`${this.base}/users/me`);
  }

  updateProfile(id: number, req: { name?: string; phone?: string }): Observable<any> {
    return this.http.put<any>(`${this.base}/users/${id}`, req);
  }

  getRoles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/roles`);
  }

  getRoleWithPermissions(roleId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/roles/${roleId}/permissions`);
  }

  getAuditLogs(params: { module?: string; action?: string; page?: number; size?: number }): Observable<any> {
    let p = new HttpParams();
    if (params.module)  p = p.set('module', params.module);
    if (params.action)  p = p.set('action', params.action);
    if (params.page !== undefined) p = p.set('page', String(params.page));
    if (params.size !== undefined)  p = p.set('size', String(params.size));
    return this.http.get<any>(`${this.base}/auditLogs`, { params: p });
  }

  getAuditLogsByUser(userId: number, params: { module?: string; action?: string; page?: number; size?: number }): Observable<any> {
    let p = new HttpParams();
    if (params.module)  p = p.set('module', params.module);
    if (params.action)  p = p.set('action', params.action);
    if (params.page !== undefined) p = p.set('page', String(params.page));
    if (params.size !== undefined)  p = p.set('size', String(params.size));
    return this.http.get<any>(`${this.base}/auditLogs/user/${userId}`, { params: p });
  }

  recordAudit(action: string, module: string): void {
    this.http.post(`${this.base}/auditLogs`, { action, module })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  // ── Region management ────────────────────────────────────────────────────────
  getRegions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/regions`);
  }

  createRegion(name: string): Observable<any> {
    return this.http.post<any>(`${this.base}/regions`, { name });
  }

  updateRegionStatus(regionId: number, status: string): Observable<any> {
    return this.http.put<any>(`${this.base}/regions/${regionId}/status`, { status });
  }
}
