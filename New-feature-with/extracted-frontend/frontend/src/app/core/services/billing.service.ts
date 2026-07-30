import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private base = 'http://localhost:9090/teleConnect/billing';

  constructor(private http: HttpClient) {}

  // ── Billing Cycles ───────────────────────────────────────────────────────────

  getBillingCycles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/cycles`);
  }

  getBillingCycle(cycleId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/cycles/${cycleId}`);
  }

  /**
   * Trigger a billing run. Components call: triggerBillingRun(cycleId, accountId)
   */
  triggerBillingRun(cycleId: number, accountId: number): Observable<any> {
    return this.http.post<any>(`${this.base}/cycles/generate`, { cycleId, accountId });
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────

  getInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/invoices`);
  }

  getInvoice(invoiceId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/invoices/${invoiceId}`);
  }

  getInvoicesByAccount(accountId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/invoices/account/${accountId}`);
  }

  /**
   * Get current user's own invoices (no args needed).
   * Components call: getMyInvoices()
   */
  getMyInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/invoices/my`);
  }

  payInvoice(invoiceId: number, request: { amountPaid: number; paymentMethod: string; transactionRef?: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/invoices/${invoiceId}/pay`, request);
  }

  generateInvoice(req: { accountId: number; cycleId: number; planCharges: number; excessCharges: number; addOnCharges: number; taxes: number }): Observable<any> {
    return this.http.post<any>(`${this.base}/invoices/generate`, req);
  }

  downloadInvoice(invoiceId: number): Observable<Blob> {
    return this.http.get(`${this.base}/invoices/${invoiceId}/download`, { responseType: 'blob' });
  }

  createBillingCycle(accountId: number, cycleStart: string, cycleEnd: string): Observable<any> {
    return this.http.post<any>(`${this.base}/cycles`, { accountId, cycleStart, cycleEnd });
  }

  getCyclesByAccount(accountId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/cycles/account/${accountId}`);
  }

  markOverdueInvoices(): Observable<any> {
    return this.http.post<any>(`${this.base}/invoices/mark-overdue`, {});
  }

  /**
   * Apply late fees to all overdue invoices.
   * Components call: applyLateFees() — no args.
   */
  applyLateFees(): Observable<any> {
    return this.markOverdueInvoices();
  }

  // ── Disputes ─────────────────────────────────────────────────────────────────

  /**
   * Get all disputes. Components call: getDisputes() — no args.
   */
  getDisputes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/disputes`);
  }

  getDispute(disputeId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/disputes/${disputeId}`);
  }

  /**
   * Raise a billing dispute.
   * Subscriber portal calls: raiseDispute({ invoiceId, disputeReason, disputedAmount })
   */
  raiseDispute(request: { invoiceId: number; disputeReason?: string; disputedAmount?: number; [key: string]: any }): Observable<any> {
    return this.http.post<any>(`${this.base}/disputes`, request);
  }

  /**
   * Resolve a dispute. Components call: resolveDispute(id, status, remarks)
   */
  resolveDispute(disputeId: number, resolution: string, resolutionNotes: string): Observable<any> {
    return this.http.put<any>(`${this.base}/disputes/${disputeId}/resolve`, {
      resolution,
      resolutionNotes
    });
  }

  // ── Payments ─────────────────────────────────────────────────────────────────

  getPayments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/payments`);
  }

  getPaymentsByInvoice(invoiceId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/payments/invoice/${invoiceId}`);
  }

  // ── Reports ──────────────────────────────────────────────────────────────────

  getRevenueReport(startDate: string, endDate: string): Observable<any> {
    return this.http.get<any>(`${this.base}/reports/revenue`, {
      params: { startDate, endDate }
    });
  }

  getOutstandingReport(): Observable<any> {
    return this.http.get<any>(`${this.base}/reports/outstanding`);
  }

  /** Real collection metrics for a period (totalBilled/totalCollected/collectionEfficiency/...). */
  getCollectionReport(fromDate: string, toDate: string, region?: string): Observable<any> {
    const params: any = { fromDate, toDate };
    if (region) params.region = region;
    return this.http.get<any>(`${this.base}/reports/collection`, { params });
  }

  /** Real overdue invoices grouped by aging bucket. */
  getOverdueReport(region?: string, agingBucket?: string): Observable<any> {
    const params: any = {};
    if (region) params.region = region;
    if (agingBucket) params.agingBucket = agingBucket;
    return this.http.get<any>(`${this.base}/reports/overdue`, { params });
  }

  // ── System Config ────────────────────────────────────────────────────────────
  // Shared tariff/late-fee row — read by both the Admin Console's tariff screen
  // and the Billing Dashboard's late-fee setting.

  getSystemConfig(): Observable<any> {
    return this.http.get<any>(`${this.base}/config`);
  }

  updateSystemConfig(config: any): Observable<any> {
    return this.http.put<any>(`${this.base}/config`, config);
  }
}
