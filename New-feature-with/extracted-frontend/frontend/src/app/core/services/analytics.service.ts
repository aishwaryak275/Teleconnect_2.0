import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/* ─────────────────────────────────────────────────────────────────────────
 * Response contracts — mirror analytics-service dto/response/* (port 8089,
 * reached via gateway at /teleConnect/api/reports & /api/dashboard).
 * Every endpoint wraps its payload in ApiResponse<T> = { success, message, data }.
 * ────────────────────────────────────────────────────────────────────────*/

export interface ArpuReport {
  cycleId: number;
  scope: string;
  scopeValue: string;
  arpuOverall: number;
  arpuPrepaid: number;
  arpuPostpaid: number;
  arpuEnterprise: number;
  arpuByRegion: Record<string, number>;
  activeSubscribers: number;
  totalRevenue: number;
}

export interface ChurnReport {
  periodStart: string;
  periodEnd: string;
  region: string | null;
  subscribersAtPeriodStart: number;
  terminatedAccounts: number;
  portedOutLines: number;
  grossChurned: number;
  churnRate: number;
  highChurnAlert: boolean;
  atRiskCount: number;
  atRiskAccountIds: number[];
}

export interface NetworkUtilisationReport {
  cycleId: number;
  region: string | null;
  totalDataUsedMb: number;
  totalVoiceUsedMin: number;
  totalSmsUsed: number;
  subscriberCount: number;
  avgDataPerSubscriberMb: number;
  avgVoicePerSubscriberMin: number;
}

export interface PriorityStats {
  total: number;
  slaMet: number;
  slaBreached: number;
  complianceRate: number;
  avgResolutionHours: number;
}

export interface SlaComplianceReport {
  periodStart: string;
  periodEnd: string;
  overallComplianceRate: number;
  statsByPriority: Record<string, PriorityStats>;
  totalTicketsClosed: number;
  totalBreaches: number;
  escalatedCount: number;
  avgResolutionHours: number;
}

export interface CollectionEfficiencyReport {
  cycleId: number;
  totalInvoiced: number;
  totalCollected: number;
  collectionEfficiencyPct: number;
  overdueCount0to30: number;
  overdueAmount0to30: number;
  overdueCount31to60: number;
  overdueAmount31to60: number;
  overdueCount60plus: number;
  overdueAmount60plus: number;
}

export interface SubscriberGrowthReport {
  periodStart: string;
  periodEnd: string;
  grossAdds: number;
  terminations: number;
  netAdds: number;
  activeSIMActivations: number;
  prepaidAdds: number;
  postpaidAdds: number;
  enterpriseAdds: number;
}

export type ExportFormat = 'pdf' | 'csv';

/**
 * Analytics & Reporting — the frontend bridge to analytics-service (§4.7).
 * Each metric endpoint is guarded by a VIEW_REPORT_* permission at the gateway;
 * the AnalyticsPanel only calls the endpoints the current role is entitled to,
 * so a well-formed session never triggers a 403.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private base = 'http://localhost:9090/teleConnect/api/reports';

  constructor(private http: HttpClient) {}

  private unwrap<T>(): (src: Observable<any>) => Observable<T> {
    return map((res: any) => (res?.data ?? res) as T);
  }

  // ── Metric reads ────────────────────────────────────────────────────────
  getArpu(cycleId: number, scope = 'PERIOD', scopeValue = 'ALL'): Observable<ArpuReport> {
    const params = new HttpParams()
      .set('cycleId', String(cycleId))
      .set('scope', scope)
      .set('scopeValue', scopeValue);
    return this.http.get<any>(`${this.base}/arpu`, { params }).pipe(this.unwrap<ArpuReport>());
  }

  getChurn(periodStart: string, periodEnd: string, region?: string): Observable<ChurnReport> {
    let params = new HttpParams().set('periodStart', periodStart).set('periodEnd', periodEnd);
    if (region) params = params.set('region', region);
    return this.http.get<any>(`${this.base}/churn`, { params }).pipe(this.unwrap<ChurnReport>());
  }

  getNetworkUtilisation(cycleId: number, region?: string): Observable<NetworkUtilisationReport> {
    let params = new HttpParams().set('cycleId', String(cycleId));
    if (region) params = params.set('region', region);
    return this.http.get<any>(`${this.base}/network-utilisation`, { params }).pipe(this.unwrap<NetworkUtilisationReport>());
  }

  getSlaCompliance(periodStart: string, periodEnd: string): Observable<SlaComplianceReport> {
    const params = new HttpParams().set('periodStart', periodStart).set('periodEnd', periodEnd);
    return this.http.get<any>(`${this.base}/sla-compliance`, { params }).pipe(this.unwrap<SlaComplianceReport>());
  }

  getCollectionEfficiency(cycleId: number): Observable<CollectionEfficiencyReport> {
    const params = new HttpParams().set('cycleId', String(cycleId));
    return this.http.get<any>(`${this.base}/collection-efficiency`, { params }).pipe(this.unwrap<CollectionEfficiencyReport>());
  }

  getSubscriberGrowth(periodStart: string, periodEnd: string): Observable<SubscriberGrowthReport> {
    const params = new HttpParams().set('periodStart', periodStart).set('periodEnd', periodEnd);
    return this.http.get<any>(`${this.base}/subscriber-growth`, { params }).pipe(this.unwrap<SubscriberGrowthReport>());
  }

  // ── Exports (PDF / CSV attachments) ───────────────────────────────────────
  exportMetric(
    metric: 'arpu' | 'churn' | 'network-utilisation' | 'sla-compliance' | 'collection-efficiency' | 'subscriber-growth',
    format: ExportFormat,
    query: Record<string, string | number | undefined>
  ): Observable<Blob> {
    let params = new HttpParams().set('format', format);
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get(`${this.base}/${metric}/export`, { params, responseType: 'blob' });
  }
}
