import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UsageService {
  private base = 'http://localhost:9090/teleConnect/usage';

  constructor(private http: HttpClient) {}

  // ── Recording ────────────────────────────────────────────────────────────────

  logUsage(usageData: { lineId: number; usageType: string; quantity: number; usageDate?: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/createRecord`, usageData);
  }

  /**
   * Record a usage entry including the billing cycle and plan limits. The backend
   * auto-creates the usage summary (seeded with these limits) if none exists — used
   * to bootstrap usage tracking the moment a plan is activated.
   */
  createRecord(req: {
    lineId: number; billingCycleId: number; usageType: string; quantity: number;
    usageDate?: string; dataLimitMb?: number; voiceLimitMin?: number; smsLimit?: number;
  }): Observable<any> {
    return this.http.post<any>(`${this.base}/createRecord`, req);
  }

  // ── Records ──────────────────────────────────────────────────────────────────

  getRecordsByLine(lineId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/fetchRecords/${lineId}`);
  }

  getRecordsByCycle(lineId: number, billingCycleId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/fetchRecords/${lineId}/${billingCycleId}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  /** Cross-line bulk read (USAGE_ANALYTICS) — backs the Compliance data-usage audit. */
  getAllSummaries(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/allSummaries`);
  }

  getSummary(lineId: number, billingCycleId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/fetchSummary/${lineId}/${billingCycleId}`);
  }

  updateSummary(lineId: number, billingCycleId: number, body: { dataUsedMb?: number; voiceUsedMin?: number; smsUsed?: number }): Observable<any> {
    return this.http.put<any>(`${this.base}/updateSummary/${lineId}/${billingCycleId}`, body);
  }

  // ── Limits & Alerts ──────────────────────────────────────────────────────────

  getLimitStatus(lineId: number, billingCycleId: number, dataLimitMb: number, voiceLimitMin: number, smsLimit: number): Observable<any> {
    return this.http.get<any>(`${this.base}/limitStatus/${lineId}/${billingCycleId}`, {
      params: { dataLimitMb: String(dataLimitMb), voiceLimitMin: String(voiceLimitMin), smsLimit: String(smsLimit) }
    });
  }

  getRemaining(lineId: number, billingCycleId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/remaining/${lineId}/${billingCycleId}`);
  }

  getAlerts(lineId: number, billingCycleId: number, dataLimitMb: number, voiceLimitMin: number, smsLimit: number): Observable<any> {
    return this.http.get<any>(`${this.base}/alerts/${lineId}/${billingCycleId}`, {
      params: { dataLimitMb: String(dataLimitMb), voiceLimitMin: String(voiceLimitMin), smsLimit: String(smsLimit) }
    });
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  getUsageTrend(lineId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/analytics/${lineId}`);
  }

  getTopUsage(lineId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/analytics/${lineId}/top-usage`);
  }

  // ── Legacy compatibility aliases ─────────────────────────────────────────────

  /** @deprecated use getRecordsByLine or getRecordsByCycle */
  getUsageHistory(lineId: number, cycleId?: number): Observable<any> {
    return cycleId ? this.getRecordsByCycle(lineId, cycleId) : this.getRecordsByLine(lineId);
  }
}
