import { Component, OnInit, OnDestroy, signal, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Chart } from 'chart.js/auto';
import { AuthService, User } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { IamService } from '../../core/services/iam.service';
import { PlanService } from '../../core/services/plan.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { ReportService } from '../../core/services/report.service';
import { fadeInUp, staggerFadeIn, scaleIn, shake } from '../../shared/animations';
import { MyAccountModalComponent } from '../../shared/my-account-modal/my-account-modal.component';
import { AnalyticsPanelComponent } from '../../shared/analytics/analytics-panel.component';
import { PaginatePipe } from '../../shared/pagination/paginate.pipe';
import { PaginatorComponent } from '../../shared/pagination/paginator.component';

type Section = 'invoices' | 'payments' | 'disputes' | 'reports' | 'analytics' | 'settings' | 'catalog';

interface Invoice {
  invoiceId: string;
  rawId?: number;      // numeric backend id, used for the per-invoice PDF download
  accountId: string;
  customer: string;
  cycle: string;
  amount: number;
  dueDate: string;
  status: 'Paid' | 'Overdue' | 'Disputed' | 'Open';
}

interface Payment {
  paymentId: string;
  invoiceRef: string;
  accountId: string;
  customer: string;
  amount: number;
  method: 'Bank Transfer' | 'UPI' | 'Direct Debit' | 'Cheque';
  date: string;
  reference: string;
  status: 'Confirmed' | 'Cleared';
}

interface Dispute {
  disputeId: string;
  accountId: string;
  customer: string;
  invoice: string;
  category: string;
  reason: string;
  amount: number;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Under Review' | 'Escalated' | 'Pending Info' | 'Resolved';
  assignee: string;
  daysOpen: number;
}

@Component({
  selector: 'app-billing-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MyAccountModalComponent, AnalyticsPanelComponent, PaginatePipe, PaginatorComponent],
  templateUrl: './billing-portal.component.html',
  styleUrls: ['./billing-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, scaleIn, shake]
})
export class BillingPortalComponent implements OnInit, OnDestroy {
  // ── Layout / session ──────────────────────────────────────────────────────
  section = signal<Section>('invoices');
  isNotificationOpen = signal<boolean>(false);
  isSidebarCollapsed = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;
  billingPeriod = 'Jul 2024';
  user!: User;

  readonly sectionTitles: Record<Section, string> = {
    invoices: 'Invoices',
    payments: 'Payments',
    disputes: 'Disputes',
    reports: 'Reports',
    analytics: 'Analytics & Reporting',
    settings: 'Settings',
    catalog: 'Plan Catalog'
  };

  // Plan Catalog (read-only reference)
  catalogPlans: any[] = [];
  catalogAddOns: any[] = [];
  catalogSubTab = 'plans';
  plansPage = 1;
  addOnsPage = 1;

  // ── Invoices ──────────────────────────────────────────────────────────────
  invoices: Invoice[] = [];
  invoiceSearch = '';
  invoiceStatusFilter = 'All Statuses';
  invoicePage = 1;
  readonly invoicePageSize = 8;
  lastSync = '14:32 UTC';

  // Shared page size for the paginated tables (keeps content on one screen).
  readonly pageSize = 8;
  readonly paymentsPageSize = 6;
  paymentsPage = 1;
  disputesPage = 1;

  // ── Payments ──────────────────────────────────────────────────────────────
  payments: Payment[] = [];
  paymentSearch = '';
  isRecordPaymentOpen = false;
  recordPaymentForm!: FormGroup;

  // ── Disputes ────────────────────────────────────────────────────────────────
  disputes: Dispute[] = [];
  disputeFilter = 'All';
  readonly disputeFilters = ['All', 'Under Review', 'Escalated', 'Pending Info', 'Resolved'];
  openKebabId: string | null = null;
  activeDispute: Dispute | null = null;
  resolutionForm!: FormGroup;
  isLogDisputeOpen = false;
  logDisputeForm!: FormGroup;

  // ── Reports ───────────────────────────────────────────────────────────────
  // TODO: wire to a real backend endpoint (e.g. reportService.getTopOverdue()).
  topOverdue: { accountId: string; customer: string; invoice: string; amount: number; daysOverdue: number; plan: string }[] = [];
  openReportKebabId: string | null = null;
  private billingChart: Chart | null = null;
  private disputeTrendChart: Chart | null = null;

  // ── Settings ────────────────────────────────────────────────────────────────
  settingsForm!: FormGroup;
  // TODO: wire to a real backend endpoint (e.g. iamService.getTeamMembers()).
  teamMembers: { initials: string; name: string; email: string; role: string; access: string }[] = [];

  constructor(
    public authService: AuthService,
    private billingService: BillingService,
    private iamService: IamService,
    private planService: PlanService,
    public notificationService: NotificationService,
    private toastService: ToastService,
    private reportService: ReportService,
    private fb: FormBuilder
  ) {
    // Render the Reports charts whenever that section becomes active.
    effect(() => {
      if (this.section() === 'reports') {
        setTimeout(() => this.renderCharts(), 120);
      }
    });
  }

  ngOnInit(): void {
    this.user = this.authService.currentUser()!;
    this.initForms();
    this.loadFromBackend();
  }

  private initForms(): void {
    this.recordPaymentForm = this.fb.group({
      invoiceRef: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(1)]],
      method: ['BANK_TRANSFER', Validators.required],
      reference: ['', Validators.required]
    });

    this.resolutionForm = this.fb.group({
      status: ['Resolved', Validators.required],
      remarks: ['', [Validators.required, Validators.minLength(5)]]
    });

    this.logDisputeForm = this.fb.group({
      invoice: ['', Validators.required],
      customer: ['', Validators.required],
      category: ['Data Billing', Validators.required],
      amount: [null, [Validators.required, Validators.min(1)]],
      priority: ['Medium', Validators.required],
      reason: ['', [Validators.required, Validators.minLength(5)]]
    });

    this.settingsForm = this.fb.group({
      billingCycleDay: ['1st of month'],
      paymentDueWindow: ['30 days'],
      defaultCurrency: ['INR'],
      taxRate: [9.5],
      emailOnOverdue: [true],
      smsHighValue: [false],
      autoReminders: [true],
      dunningProcess: [true]
    });
  }

  /** Loads invoices, payments, and disputes from the backend. */
  private loadFromBackend(): void {
    let pendingPayments: any[] | null = null;
    let pendingDisputes: any[] | null = null;

    this.billingService.getInvoices().subscribe({
      next: (data) => {
        if (Array.isArray(data) && data.length) this.invoices = this.mapInvoices(data);
        // Re-map any payment/dispute data that arrived before invoices did.
        if (pendingPayments) this.payments = this.mapPayments(pendingPayments);
        if (pendingDisputes) this.disputes = this.mapDisputes(pendingDisputes);
      },
      error: () => { /* invoices unavailable */ }
    });
    this.billingService.getPayments().subscribe({
      next: (data) => {
        if (!Array.isArray(data) || !data.length) return;
        pendingPayments = data;
        this.payments = this.mapPayments(data);
      },
      error: () => { /* payments unavailable */ }
    });
    this.billingService.getDisputes().subscribe({
      next: (data) => {
        if (!Array.isArray(data) || !data.length) return;
        pendingDisputes = data;
        this.disputes = this.mapDisputes(data);
      },
      error: () => { /* disputes unavailable */ }
    });
  }

  // Backend → view-model mappers (defensive: fall through to a safe display shape).
  private mapInvoices(data: any[]): Invoice[] {
    return data.map(d => ({
      invoiceId: d.invoiceId != null ? `INV-${d.invoiceId}` : (d.invoiceCode ?? '—'),
      rawId: d.invoiceId != null ? Number(d.invoiceId) : undefined,
      accountId: d.accountId != null ? `ACC-${d.accountId}` : '—',
      customer: d.customerName ?? d.accountName ?? (d.accountId != null ? `Account #${d.accountId}` : '—'),
      cycle: d.cycle ?? this.billingPeriod,
      amount: Number(d.totalAmount ?? d.amount ?? 0),
      dueDate: (d.dueDate ?? '').toString().slice(0, 10),
      status: this.normalizeInvoiceStatus(d.status)
    }));
  }

  private mapPayments(data: any[]): Payment[] {
    return data.map(d => {
      const invoiceId: number | undefined = d.invoiceId != null ? Number(d.invoiceId) : undefined;
      const matched = invoiceId != null ? this.invoices.find(i => i.rawId === invoiceId) : undefined;
      return {
        paymentId: d.paymentId != null ? `PAY-${d.paymentId}` : '—',
        invoiceRef: invoiceId != null ? `INV-${invoiceId}` : '—',
        accountId: d.accountId != null ? `ACC-${d.accountId}` : (matched?.accountId ?? '—'),
        customer: d.customerName ?? matched?.customer ?? '—',
        amount: Number(d.amountPaid ?? d.amount ?? 0),
        method: (d.paymentMethod ?? 'Bank Transfer'),
        date: (d.paymentDate ?? '').toString().slice(0, 10),
        reference: d.transactionRef ?? '—',
        status: (d.status === 'Cleared' ? 'Cleared' : 'Confirmed')
      };
    });
  }

  private mapDisputes(data: any[]): Dispute[] {
    return data.map(d => {
      const invoiceId: number | undefined = d.invoiceId != null ? Number(d.invoiceId) : undefined;
      const matched = invoiceId != null ? this.invoices.find(i => i.rawId === invoiceId) : undefined;
      return {
        disputeId: d.disputeId != null ? `DSP-${d.disputeId}` : '—',
        accountId: matched?.accountId ?? '—',
        customer: d.customerName ?? matched?.customer ?? '—',
        invoice: invoiceId != null ? `INV-${invoiceId}` : '—',
        category: d.category ?? d.disputeReason ?? 'Billing',
        reason: d.description ?? d.disputeReason ?? '',
        amount: Number(d.disputedAmount ?? 0),
        priority: (d.priority ?? 'Medium'),
        status: this.normalizeDisputeStatus(d.status),
        assignee: d.assignedTo ?? 'Unassigned',
        daysOpen: Number(d.daysOpen ?? 0)
      };
    });
  }

  private normalizeInvoiceStatus(s: any): Invoice['status'] {
    const v = (s ?? '').toString().toLowerCase();
    if (v.includes('paid')) return 'Paid';
    if (v.includes('overdue')) return 'Overdue';
    if (v.includes('disput')) return 'Disputed';
    return 'Open';
  }

  private normalizeDisputeStatus(s: any): Dispute['status'] {
    const v = (s ?? '').toString().toLowerCase();
    if (v.includes('escal')) return 'Escalated';
    if (v.includes('pending')) return 'Pending Info';
    if (v.includes('resolv')) return 'Resolved';
    return 'Under Review';
  }

  // ============================================================================
  // Formatting helpers
  // ============================================================================
  inr(value: number): string {
    return '₹' + (value ?? 0).toLocaleString('en-IN');
  }

  get userInitials(): string {
    const name = (this.user?.name || 'J Smith').trim();
    const parts = name.split(/\s+/);
    const first = parts[0]?.charAt(0) ?? 'J';
    const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : 'S';
    return (first + second).toUpperCase();
  }

  // ============================================================================
  // Layout controls
  // ============================================================================
  setSection(s: Section): void {
    this.section.set(s);
    this.isNotificationOpen.set(false);
    this.openKebabId = null;
    this.openReportKebabId = null;
    if (s === 'catalog') this.loadCatalog();
    if (s === 'reports') {
      this.recomputeInvoiceStatusBreakdown();
    } else {
      // Tear down responsive charts when leaving Reports so no orphaned
      // ResizeObserver keeps firing after the canvas is removed.
      this.billingChart?.destroy(); this.billingChart = null;
      this.disputeTrendChart?.destroy(); this.disputeTrendChart = null;
    }
  }

  ngOnDestroy(): void {
    this.billingChart?.destroy(); this.billingChart = null;
    this.disputeTrendChart?.destroy(); this.disputeTrendChart = null;
  }

  loadCatalog(): void {
    this.planService.getPlans(false).subscribe({ next: (data) => this.catalogPlans = data, error: () => {} });
    this.planService.getAddOns().subscribe({ next: (data) => this.catalogAddOns = data, error: () => {} });
  }

  getAddOnTypeLabel(type: string): string {
    const labels: Record<string, string> = { DataTopup: 'Data Top-Up', ISDPack: 'ISD Pack', RoamingPack: 'Roaming Pack', SMSPack: 'SMS Pack' };
    return labels[type] ?? type;
  }

  toggleNotifications(): void {
    this.isNotificationOpen.set(!this.isNotificationOpen());
    if (this.isNotificationOpen()) {
      this.notificationService.refreshNotifications();
    }
  }

  markAllNotificationsRead(): void {
    this.notificationService.markAllAsRead().subscribe(() => this.iamService.recordAudit('MARK_ALL_NOTIFICATIONS_READ', 'NOTIFICATION'));
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isNotificationOpen.set(false);
    this.isProfileDropdownOpen = false;
  }

  toggleProfileDropdown(event: Event): void {
    event.stopPropagation();
    this.isProfileDropdownOpen = !this.isProfileDropdownOpen;
  }

  openMyAccount(): void {
    this.isMyAccountOpen = true;
    this.isNotificationOpen.set(false);
  }

  logout(): void {
    this.authService.logout();
  }

  // ============================================================================
  // INVOICES
  // ============================================================================
  get invoiceKpis() {
    let billed = 0, paid = 0, paidCount = 0, overdue = 0, overdueCount = 0;
    let disputedCount = 0, disputedAmt = 0, openCount = 0, openAmt = 0;
    for (const i of this.invoices) {
      billed += i.amount;
      if (i.status === 'Paid') { paid += i.amount; paidCount++; }
      else if (i.status === 'Overdue') { overdue += i.amount; overdueCount++; }
      else if (i.status === 'Disputed') { disputedAmt += i.amount; disputedCount++; }
      else { openAmt += i.amount; openCount++; }
    }
    return { billed, paid, paidCount, overdue, overdueCount, disputedCount, disputedAmt, openCount, openAmt };
  }

  get filteredInvoices(): Invoice[] {
    const q = this.invoiceSearch.trim().toLowerCase();
    return this.invoices.filter(i => {
      const matchesStatus = this.invoiceStatusFilter === 'All Statuses' || i.status === this.invoiceStatusFilter;
      const matchesQuery = !q ||
        i.invoiceId.toLowerCase().includes(q) ||
        i.accountId.toLowerCase().includes(q) ||
        i.customer.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }

  get pagedInvoices(): Invoice[] {
    const start = (this.invoicePage - 1) * this.invoicePageSize;
    return this.filteredInvoices.slice(start, start + this.invoicePageSize);
  }

  get invoicePageCount(): number {
    return Math.max(1, Math.ceil(this.filteredInvoices.length / this.invoicePageSize));
  }

  get invoicePages(): number[] {
    return Array.from({ length: this.invoicePageCount }, (_, i) => i + 1);
  }

  setInvoicePage(p: number): void {
    if (p >= 1 && p <= this.invoicePageCount) this.invoicePage = p;
  }

  onInvoiceFilterChange(): void {
    this.invoicePage = 1;
  }

  get openDisputesPanel(): Dispute[] {
    return this.disputes.filter(d => d.status !== 'Resolved');
  }

  get openDisputesTotal(): number {
    return this.openDisputesPanel.reduce((sum, d) => sum + d.amount, 0);
  }

  /** Build a CSV file from headers + rows and trigger a download (opens in Excel). */
  private downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
    const esc = (v: any) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
    // Leading BOM so Excel detects UTF-8 correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportInvoices(): void {
    const rows = this.filteredInvoices.map(i => [
      i.invoiceId, i.accountId, i.customer, i.cycle, i.amount, i.dueDate, i.status
    ]);
    this.downloadCsv(
      `invoices_${this.billingPeriod.replace(/\s+/g, '_')}.csv`,
      ['Invoice ID', 'Account ID', 'Customer', 'Cycle', 'Amount (INR)', 'Due Date', 'Status'],
      rows
    );
    this.iamService.recordAudit('INVOICES_EXPORTED', 'BILLING');
    this.toastService.success(`Exported ${rows.length} invoice(s) to CSV.`);
  }

  activeInvoice: Invoice | null = null;

  viewInvoice(inv: Invoice): void {
    this.activeInvoice = inv;
  }

  closeInvoiceDetail(): void {
    this.activeInvoice = null;
  }

  /** Download the individual invoice as a PDF from the backend. */
  exportInvoicePdf(inv: Invoice | null): void {
    if (!inv) return;
    const id = inv.rawId ?? this.parseInvoiceNumber(inv.invoiceId);
    if (!id) {
      this.toastService.error('No downloadable record for this invoice.');
      return;
    }
    this.billingService.downloadInvoice(id).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${inv.invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.iamService.recordAudit('INVOICE_PDF_EXPORTED', 'BILLING');
      },
      error: () => this.toastService.error('Failed to export invoice PDF.')
    });
  }

  private parseInvoiceNumber(code: string): number | null {
    const m = /(\d+)\s*$/.exec(code ?? '');
    return m ? Number(m[1]) : null;
  }

  emailInvoice(inv: Invoice): void {
    this.iamService.recordAudit('INVOICE_EMAILED', 'BILLING');
    this.toastService.success('Invoice ' + inv.invoiceId + ' emailed to ' + inv.customer + '.');
  }

  // ============================================================================
  // PAYMENTS
  // ============================================================================
  get paymentKpis() {
    const byMethod = { 'Bank Transfer': 0, 'UPI': 0, 'Direct Debit': 0, 'Cheque': 0 } as Record<string, number>;
    let total = 0;
    for (const p of this.payments) { total += p.amount; byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount; }
    return {
      total,
      count: this.payments.length,
      bankTransfer: byMethod['Bank Transfer'],
      upi: byMethod['UPI'],
      directDebit: byMethod['Direct Debit'],
      cheque: byMethod['Cheque']
    };
  }

  get filteredPayments(): Payment[] {
    const q = this.paymentSearch.trim().toLowerCase();
    if (!q) return this.payments;
    return this.payments.filter(p =>
      p.paymentId.toLowerCase().includes(q) ||
      p.invoiceRef.toLowerCase().includes(q) ||
      p.accountId.toLowerCase().includes(q) ||
      p.customer.toLowerCase().includes(q) ||
      p.reference.toLowerCase().includes(q)
    );
  }

  openRecordPayment(): void {
    this.recordPaymentForm.reset({ method: 'BANK_TRANSFER', invoiceRef: '', amount: null, reference: '' });
    this.isRecordPaymentOpen = true;
  }

  closeRecordPayment(): void {
    this.isRecordPaymentOpen = false;
  }

  /** Extract numeric invoice id from user input like "INV-42", "inv 42", or plain "42". */
  private parseInvoiceId(raw: string): number | null {
    const digits = (raw ?? '').toString().match(/\d+/);
    return digits ? Number(digits[0]) : null;
  }

  submitRecordPayment(): void {
    if (this.recordPaymentForm.invalid) {
      this.recordPaymentForm.markAllAsTouched();
      return;
    }
    const v = this.recordPaymentForm.value;
    const invoiceId = this.parseInvoiceId(v.invoiceRef);
    if (invoiceId == null) {
      this.toastService.error('Invalid invoice reference — expected format like INV-42.');
      return;
    }
    this.billingService.payInvoice(invoiceId, {
      amountPaid: Number(v.amount),
      paymentMethod: v.method,
      transactionRef: v.reference
    }).subscribe({
      next: () => {
        this.iamService.recordAudit('PAYMENT_RECORDED', 'BILLING');
        this.toastService.success(`Payment recorded for INV-${invoiceId} (${this.inr(Number(v.amount))}).`);
        this.isRecordPaymentOpen = false;
        this.loadFromBackend();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Failed to record payment.')
    });
  }

  exportPayments(): void {
    const rows = this.filteredPayments.map(p => [
      p.paymentId, p.invoiceRef, p.accountId, p.customer, p.amount, p.method, p.date, p.reference, p.status
    ]);
    this.downloadCsv(
      'payments.csv',
      ['Payment ID', 'Invoice Ref', 'Account ID', 'Customer', 'Amount (INR)', 'Method', 'Date', 'Reference', 'Status'],
      rows
    );
    this.toastService.success(`Exported ${rows.length} payment(s) to CSV.`);
  }

  /** Render a printable payment receipt (browser print dialog → Save as PDF). */
  downloadReceipt(p: Payment): void {
    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 0;color:#64748b">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${value}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${p.paymentId}</title>
      <style>
        *{font-family:Inter,Arial,sans-serif;box-sizing:border-box}
        body{margin:0;padding:40px;color:#0f172a}
        .card{max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;padding:32px}
        h1{font-size:20px;margin:0}
        .muted{color:#94a3b8;font-size:12px}
        .badge{display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
        table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
        .total{border-top:1px solid #e2e8f0;margin-top:12px;padding-top:12px;display:flex;justify-content:space-between;align-items:center}
        .total b{font-size:22px}
        @media print{body{padding:0}.card{border:none}}
      </style></head>
      <body><div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div><h1>TeleConnect</h1><p class="muted">Payment Receipt</p></div>
          <span class="badge">${p.status}</span>
        </div>
        <table>
          ${row('Payment ID', p.paymentId)}
          ${row('Invoice Reference', p.invoiceRef)}
          ${row('Account', p.accountId)}
          ${row('Customer', p.customer)}
          ${row('Payment Method', p.method)}
          ${row('Transaction Reference', p.reference)}
          ${row('Date', p.date)}
        </table>
        <div class="total"><span class="muted">Amount Paid</span><b>${this.inr(p.amount)}</b></div>
        <p class="muted" style="margin-top:24px;text-align:center">This is a system-generated receipt from the TeleConnect Billing module.</p>
      </div>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win) { document.body.removeChild(iframe); this.toastService.error('Could not open receipt.'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Clean up the iframe once printing is done.
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 60000);
    this.iamService.recordAudit('PAYMENT_RECEIPT_GENERATED', 'BILLING');
  }

  methodBadgeClass(method: string): string {
    switch (method) {
      case 'Bank Transfer': return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'UPI':           return 'bg-purple-50 text-purple-700 border border-purple-100';
      case 'Direct Debit':  return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Cheque':        return 'bg-amber-50 text-amber-700 border border-amber-100';
      default:              return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  }

  // ============================================================================
  // DISPUTES
  // ============================================================================
  get disputeKpis() {
    let open = 0, underReview = 0, escalated = 0, resolved = 0, totalDisputed = 0;
    for (const d of this.disputes) {
      if (d.status === 'Resolved') { resolved++; }
      else { open++; totalDisputed += d.amount; }
      if (d.status === 'Under Review') underReview++;
      if (d.status === 'Escalated') escalated++;
    }
    return { open, underReview, escalated, resolved, totalDisputed };
  }

  get filteredDisputes(): Dispute[] {
    if (this.disputeFilter === 'All') return this.disputes;
    return this.disputes.filter(d => d.status === this.disputeFilter);
  }

  setDisputeFilter(f: string): void {
    this.disputeFilter = f;
    this.openKebabId = null;
  }

  toggleKebab(id: string): void {
    this.openKebabId = this.openKebabId === id ? null : id;
  }

  openResolution(d: Dispute, presetStatus: 'Under Review' | 'Resolved'): void {
    this.activeDispute = d;
    this.resolutionForm.reset({ status: presetStatus, remarks: '' });
    this.openKebabId = null;
  }

  closeResolution(): void {
    this.activeDispute = null;
  }

  submitResolution(): void {
    if (this.resolutionForm.invalid || !this.activeDispute) {
      this.resolutionForm.markAllAsTouched();
      return;
    }
    const { status } = this.resolutionForm.value;
    const target = this.disputes.find(d => d.disputeId === this.activeDispute!.disputeId);
    if (target) target.status = status;
    this.iamService.recordAudit('DISPUTE_' + String(status).toUpperCase().replace(' ', '_'), 'BILLING');
    this.toastService.success('Dispute ' + this.activeDispute.disputeId + ' updated to "' + status + '".');
    this.activeDispute = null;
  }

  openLogDispute(): void {
    this.logDisputeForm.reset({ category: 'Data Billing', priority: 'Medium', invoice: '', customer: '', amount: null, reason: '' });
    this.isLogDisputeOpen = true;
  }

  closeLogDispute(): void {
    this.isLogDisputeOpen = false;
  }

  submitLogDispute(): void {
    if (this.logDisputeForm.invalid) {
      this.logDisputeForm.markAllAsTouched();
      return;
    }
    const v = this.logDisputeForm.value;
    const nextNum = 4472 + this.disputes.filter(d => d.disputeId.startsWith('DSP-44')).length;
    const newDispute: Dispute = {
      disputeId: 'DSP-' + nextNum,
      accountId: '—',
      customer: v.customer,
      invoice: v.invoice,
      category: v.category,
      reason: v.reason,
      amount: Number(v.amount),
      priority: v.priority,
      status: 'Under Review',
      assignee: this.user?.name ?? 'Unassigned',
      daysOpen: 0
    };
    this.disputes = [newDispute, ...this.disputes];
    this.iamService.recordAudit('DISPUTE_LOGGED', 'BILLING');
    this.toastService.success('Dispute ' + newDispute.disputeId + ' logged.');
    this.isLogDisputeOpen = false;
  }

  exportDisputes(): void {
    const rows = this.filteredDisputes.map(d => [
      d.disputeId, d.accountId, d.customer, d.invoice, d.category, d.reason, d.amount, d.priority, d.status, d.assignee, d.daysOpen
    ]);
    this.downloadCsv(
      'disputes.csv',
      ['Dispute ID', 'Account ID', 'Customer', 'Invoice', 'Category', 'Reason', 'Amount (INR)', 'Priority', 'Status', 'Assignee', 'Days Open'],
      rows
    );
    this.toastService.success(`Exported ${rows.length} dispute(s) to CSV.`);
  }

  priorityBadgeClass(p: string): string {
    switch (p) {
      case 'Critical': return 'bg-rose-50 text-rose-700 border border-rose-100';
      case 'High':     return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Medium':   return 'bg-blue-50 text-blue-700 border border-blue-100';
      default:         return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
  }

  disputeStatusBadgeClass(s: string): string {
    switch (s) {
      case 'Escalated':    return 'bg-rose-50 text-rose-700 border border-rose-100';
      case 'Pending Info': return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Resolved':     return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      default:             return 'bg-blue-50 text-blue-700 border border-blue-100';
    }
  }

  disputeDotClass(s: string): string {
    switch (s) {
      case 'Escalated':    return 'bg-rose-500';
      case 'Pending Info': return 'bg-amber-500';
      case 'Resolved':     return 'bg-emerald-500';
      default:             return 'bg-blue-500';
    }
  }

  invoiceStatusBadgeClass(s: string): string {
    switch (s) {
      case 'Paid':     return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Overdue':  return 'bg-rose-50 text-rose-700 border border-rose-100';
      case 'Disputed': return 'bg-amber-50 text-amber-700 border border-amber-100';
      default:         return 'bg-blue-50 text-blue-700 border border-blue-100';
    }
  }

  invoiceDotClass(s: string): string {
    switch (s) {
      case 'Paid':     return 'bg-emerald-500';
      case 'Overdue':  return 'bg-rose-500';
      case 'Disputed': return 'bg-amber-500';
      default:         return 'bg-blue-500';
    }
  }

  // ============================================================================
  // REPORTS
  // ============================================================================
  // TODO: wire to a real backend endpoint (e.g. reportService.getBillingKpis()).
  // Kept as a stable object (not a getter) so change detection doesn't allocate
  // a new object every cycle next to the responsive Reports charts (that
  // previously caused a resize→CD→reflow freeze).
  readonly reportKpis = {
    totalBilled: 0,
    collected: 0,
    collectionRate: 0,
    outstanding: 0,
    pendingPct: 0,
    disputeRate: 0,
    disputeRateDelta: 0,
    avgInvoice: 0
  };

  invoiceStatusBreakdown: any[] = [];

  private recomputeInvoiceStatusBreakdown(): void {
    const total = this.invoices.length || 1;
    const count = (s: Invoice['status']) => this.invoices.filter(i => i.status === s).length;
    const pct = (n: number) => Math.round((n / total) * 100);
    this.invoiceStatusBreakdown = [
      { label: 'Paid',     count: count('Paid'),     pct: pct(count('Paid')),     bar: 'bg-emerald-500', text: 'text-emerald-600' },
      { label: 'Open',     count: count('Open'),     pct: pct(count('Open')),     bar: 'bg-blue-500',    text: 'text-blue-600' },
      { label: 'Overdue',  count: count('Overdue'),  pct: pct(count('Overdue')),  bar: 'bg-rose-500',    text: 'text-rose-600' },
      { label: 'Disputed', count: count('Disputed'), pct: pct(count('Disputed')), bar: 'bg-amber-500',   text: 'text-amber-600' }
    ];
  }

  toggleReportKebab(id: string): void {
    this.openReportKebabId = this.openReportKebabId === id ? null : id;
  }

  sendReminder(row: any): void {
    this.openReportKebabId = null;
    this.iamService.recordAudit('OVERDUE_REMINDER_SENT', 'BILLING');
    this.toastService.success('Reminder sent to ' + row.customer + '.');
  }

  viewOverdue(row: any): void {
    this.openReportKebabId = null;
    this.toastService.info('Opening ' + row.invoice + ' for ' + row.customer + '.');
  }

  /** Post a compliance report for the current period to the analytics report store. */
  generateComplianceReport(): void {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    const uid = this.authService.currentUser()?.id;
    this.reportService.generateReport({ scope: 'PERIOD', scopeValue: 'Billing & Collections', periodStart: start, periodEnd: endStr, generatedBy: uid }).subscribe({
      next: () => { this.iamService.recordAudit('BILLING_REPORT_GENERATED', 'ANALYTICS'); this.toastService.success('Report sent to Compliance for review.'); },
      error: () => this.toastService.error('Failed to generate report.')
    });
  }

  // TODO: wire chart datasets to a real backend endpoint
  // (e.g. reportService.getBillingTrend() / getDisputeTrend()) instead of
  // rendering empty charts.
  private renderCharts(): void {
    const billingCtx = document.getElementById('billingChart') as HTMLCanvasElement | null;
    if (billingCtx) {
      this.billingChart?.destroy();
      this.billingChart = new Chart(billingCtx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            { label: 'Billed',    data: [], backgroundColor: '#bfdbfe', borderRadius: 6, borderWidth: 0 },
            { label: 'Collected', data: [], backgroundColor: '#bbf7d0', borderRadius: 6, borderWidth: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'rectRounded' } } },
          scales: {
            x: { grid: { display: false }, title: { display: true, text: 'Month' } },
            y: { display: true, beginAtZero: true, title: { display: true, text: 'Amount (₹)' } }
          }
        }
      });
    }

    const trendCtx = document.getElementById('disputeTrendChart') as HTMLCanvasElement | null;
    if (trendCtx) {
      this.disputeTrendChart?.destroy();
      this.disputeTrendChart = new Chart(trendCtx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{ label: 'Disputes opened', data: [], backgroundColor: '#fed7aa', borderRadius: 6, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, title: { display: true, text: 'Month' } },
            y: { display: true, beginAtZero: true, title: { display: true, text: 'Disputes Opened' } }
          }
        }
      });
    }
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================
  toggleSetting(key: string): void {
    const ctrl = this.settingsForm.get(key);
    if (ctrl) ctrl.setValue(!ctrl.value);
  }

  saveSettings(): void {
    this.iamService.recordAudit('BILLING_SETTINGS_UPDATED', 'BILLING');
    this.toastService.success('Billing settings saved.');
  }
}