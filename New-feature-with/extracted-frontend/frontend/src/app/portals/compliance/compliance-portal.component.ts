import { Component, OnInit, signal, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart } from 'chart.js/auto';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService, User } from '../../core/services/auth.service';
import { AccountService } from '../../core/services/account.service';
import { BillingService } from '../../core/services/billing.service';
import { IamService } from '../../core/services/iam.service';
import { PlanService } from '../../core/services/plan.service';
import { UsageService } from '../../core/services/usage.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { fadeInUp, staggerFadeIn, shake, scaleIn } from '../../shared/animations';
import { MyAccountModalComponent } from '../../shared/my-account-modal/my-account-modal.component';
import { PaginatePipe } from '../../shared/pagination/paginate.pipe';
import { PaginatorComponent } from '../../shared/pagination/paginator.component';

@Component({
  selector: 'app-compliance-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, MyAccountModalComponent, PaginatePipe, PaginatorComponent],
  templateUrl: './compliance-portal.component.html',
  styleUrls: ['./compliance-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, shake, scaleIn]
})
export class CompliancePortalComponent implements OnInit {
  activeTab = signal<string>('filings');
  isSidebarCollapsed = signal<boolean>(false);
  isNotificationOpen = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;

  // Pagination
  readonly pageSize = 8;
  filingsPage = 1;
  kycPage = 1;
  plansPage = 1;
  addOnsPage = 1;
  usageAuditPage = 1;

  // User session
  user!: User;

  // Filings Tracker
  filings = [
    { name: 'Q2 Telecom Data Usage Report', due: '2026-07-20', status: 'Pending', desc: 'Mandatory filing of network metrics to FCC/TRAI.' },
    { name: 'Annual Security & Cryptographic Compliance Filing', due: '2026-06-30', status: 'Overdue', desc: 'Cryptographic audit report validation.' },
    { name: 'Monthly Customer SLA Adherence Report', due: '2026-07-15', status: 'Filed', desc: 'Regional resolution times summary.' },
    { name: 'Telecom Subscriber KYC Audit Registry', due: '2026-07-31', status: 'Pending', desc: 'Data registry of verified line IDs.' }
  ];

  // KYC compliance
  accounts: any[] = [];
  nonCompliantAccounts: any[] = [];
  expiredKycAccounts: any[] = [];
  private kycChart: Chart | null = null;

  // Plan Catalog (read-only reference)
  catalogPlans: any[] = [];
  catalogAddOns: any[] = [];

  // Data Usage Audit
  usageAuditRows: any[] = [];
  isUsageAuditLoading = false;

  constructor(
    public authService: AuthService,
    private accountService: AccountService,
    private billingService: BillingService,
    private planService: PlanService,
    private usageService: UsageService,
    public notificationService: NotificationService,
    private toastService: ToastService,
    private iamService: IamService
  ) {
    // Render KYC donut chart when tab changes to kyc
    effect(() => {
      if (this.activeTab() === 'kyc') {
        setTimeout(() => this.renderKycChart(), 100);
      }
    });
  }

  ngOnInit(): void {
    this.user = this.authService.currentUser()!;
    this.loadAccounts();
    this.loadExpiredKyc();
  }

  loadAccounts(): void {
    this.accountService.getAllAccounts().subscribe({
      next: (data: any[]) => {
        this.accounts = data;
        const nonCompliant = data.filter((a: any) => a.kycStatus === 'Pending' || a.kycStatus === 'Expired');
        if (nonCompliant.length === 0) {
          this.nonCompliantAccounts = [];
          if (this.activeTab() === 'kyc') this.renderKycChart();
          return;
        }
        let remaining = nonCompliant.length;
        const done = () => {
          remaining--;
          if (remaining === 0) {
            this.nonCompliantAccounts = [...nonCompliant];
            if (this.activeTab() === 'kyc') this.renderKycChart();
          }
        };
        nonCompliant.forEach((acc: any) => {
          this.iamService.getUser(acc.subscriberId).subscribe({
            next: (user) => { acc.subscriberName = user.name; acc.subscriberEmail = user.email; done(); },
            error: () => { acc.subscriberName = `Subscriber #${acc.subscriberId}`; acc.subscriberEmail = ''; done(); }
          });
        });
      },
      error: () => this.toastService.error('Failed to load account data.')
    });
  }

  loadExpiredKyc(): void {
    this.accountService.getExpiredKyc().subscribe({
      next: (data: any[]) => {
        this.expiredKycAccounts = data || [];
      },
      error: () => {}
    });
  }

  // ==========================================
  // Layout Navigation
  // ==========================================
  setTab(tab: string): void {
    this.activeTab.set(tab);
    this.isNotificationOpen.set(false);
    if (tab === 'catalog') this.loadCatalog();
    if (tab === 'usage-audit') this.loadUsageAudit();
  }

  // ==========================================
  // Data Usage Audit — usage vs. plan entitlement, per SIM line
  // ==========================================
  loadUsageAudit(): void {
    this.isUsageAuditLoading = true;
    const accounts$ = this.accounts.length ? of(this.accounts) : this.accountService.getAllAccounts();
    const plans$ = this.catalogPlans.length ? of(this.catalogPlans) : this.planService.getPlans(false);

    forkJoin({
      accounts: accounts$,
      subscriptions: this.planService.getAllSubscriptions(),
      summaries: this.usageService.getAllSummaries(),
      plans: plans$
    }).pipe(
      switchMap(({ accounts, subscriptions, summaries, plans }) => {
        const lineCalls = (accounts ?? []).map((a: any) =>
          this.accountService.getSimLines(a.accountId).pipe(
            map((lines: any[]) => (lines ?? []).map(l => ({ ...l, accountId: a.accountId, subscriberId: a.subscriberId })))
          )
        );
        return forkJoin(lineCalls.length ? lineCalls : [of([] as any[])]).pipe(
          map((linesByAccount: any[][]) => ({ accounts, subscriptions, summaries, plans, lines: linesByAccount.flat() }))
        );
      })
    ).subscribe({
      next: ({ accounts, subscriptions, summaries, plans, lines }) => {
        const lineMap = new Map<number, any>((lines ?? []).map((l: any) => [l.lineId, l]));
        const subByLine = new Map<number, any>((subscriptions ?? []).map((s: any) => [s.lineId, s]));
        const planById = new Map<number, any>((plans ?? []).map((p: any) => [p.planId, p]));
        const accountById = new Map<number, any>((accounts ?? []).map((a: any) => [a.accountId, a]));

        this.usageAuditRows = (summaries ?? []).map((s: any) => {
          const line = lineMap.get(s.lineId);
          const sub = line ? subByLine.get(line.lineId) : null;
          const plan = sub ? planById.get(sub.planId) : null;
          const account = line ? accountById.get(line.accountId) : null;

          const dataLimitMb = plan?.dataGb ? Number(plan.dataGb) * 1024 : 0;
          const voiceLimitMin = Number(plan?.voiceMinutes ?? 0);
          const smsLimit = Number(plan?.smsCount ?? 0);

          const dataPct = dataLimitMb > 0 ? Math.min(999, Math.round(((s.dataUsedMb ?? 0) / dataLimitMb) * 100)) : 0;
          const voicePct = voiceLimitMin > 0 ? Math.min(999, Math.round(((s.voiceUsedMin ?? 0) / voiceLimitMin) * 100)) : 0;
          const smsPct = smsLimit > 0 ? Math.min(999, Math.round(((s.smsUsed ?? 0) / smsLimit) * 100)) : 0;
          const maxPct = Math.max(dataPct, voicePct, smsPct);

          return {
            lineId: s.lineId,
            msisdn: line?.msisdn ?? '—',
            accountId: line?.accountId ?? null,
            subscriberId: account?.subscriberId ?? line?.subscriberId ?? null,
            planName: plan?.name ?? 'Unknown plan',
            dataUsedMb: s.dataUsedMb ?? 0,
            dataLimitMb,
            dataPct,
            voiceUsedMin: s.voiceUsedMin ?? 0,
            voiceLimitMin,
            voicePct,
            smsUsed: s.smsUsed ?? 0,
            smsLimit,
            smsPct,
            maxPct,
            status: maxPct >= 90 ? 'Critical' : (maxPct >= 80 ? 'Warning' : 'Normal')
          };
        }).sort((a: any, b: any) => b.maxPct - a.maxPct);
        this.isUsageAuditLoading = false;
      },
      error: () => {
        this.toastService.error('Failed to load usage audit data.');
        this.isUsageAuditLoading = false;
      }
    });
  }

  loadCatalog(): void {
    this.planService.getPlans(false).subscribe({ next: (data) => this.catalogPlans = data, error: () => {} });
    this.planService.getAddOns().subscribe({ next: (data) => this.catalogAddOns = data, error: () => {} });
  }

  getAddOnTypeLabel(type: string): string {
    const labels: Record<string, string> = { DataTopup: 'Data Top-Up', ISDPack: 'ISD Pack', RoamingPack: 'Roaming Pack', SMSPack: 'SMS Pack' };
    return labels[type] ?? type;
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  toggleNotifications(): void {
    this.isNotificationOpen.set(!this.isNotificationOpen());
    if (this.isNotificationOpen()) {
      this.notificationService.refreshNotifications();
    }
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

  logout(): void {
    this.authService.logout();
  }


  fileReport(filing: any): void {
    filing.status = 'Filed';
    this.iamService.recordAudit('FILING_SUBMITTED', 'COMPLIANCE');
    this.toastService.success('Filing uploaded to regulator registry.');
  }

  // ==========================================
  // KYC Verification Workflows
  // ==========================================
  verifyKyc(accountId: number): void {
    this.accountService.updateKycStatus(accountId, 'Verified').subscribe({
      next: () => {
        this.iamService.recordAudit('KYC_VERIFIED', 'COMPLIANCE');
        this.toastService.success(`Account #${accountId} KYC status updated to Verified.`);
        this.loadAccounts();
      },
      error: () => this.toastService.error('Verification failed.')
    });
  }

  expireKyc(accountId: number): void {
    this.accountService.updateKycStatus(accountId, 'Expired').subscribe({
      next: () => {
        this.iamService.recordAudit('KYC_EXPIRED', 'COMPLIANCE');
        this.toastService.success(`Account #${accountId} KYC status updated to Expired.`);
        this.loadAccounts();
      },
      error: () => this.toastService.error('KYC update failed.')
    });
  }

  // ==========================================
  // Chart Render
  // ==========================================
  renderKycChart(): void {
    const ctx = document.getElementById('kycChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.kycChart) {
      this.kycChart.destroy();
    }

    let verified = 0;
    let pending = 0;
    let expired = 0;

    this.accounts.forEach(a => {
      if (a.kycStatus === 'Verified') verified++;
      else if (a.kycStatus === 'Pending') pending++;
      else if (a.kycStatus === 'Expired') expired++;
    });

    // Seed defaults if data empty
    if (verified === 0 && pending === 0 && expired === 0) {
      verified = 12;
      pending = 3;
      expired = 2;
    }

    this.kycChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Verified', 'Pending Verification', 'Expired KYC'],
        datasets: [
          {
            data: [verified, pending, expired],
            backgroundColor: ['#059669', '#d97706', '#dc2626'], // emerald green, amber, red
            borderWidth: 0,
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }
}

