import { Component, OnInit, AfterViewInit, OnDestroy, signal, computed, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Chart } from 'chart.js/auto';
import { AuthService, User } from '../../core/services/auth.service';
import { AccountService } from '../../core/services/account.service';
import { IamService } from '../../core/services/iam.service';
import { PlanService } from '../../core/services/plan.service';
import { UsageService } from '../../core/services/usage.service';
import { BillingService } from '../../core/services/billing.service';
import { TicketService } from '../../core/services/ticket.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { fadeInUp, staggerFadeIn, shake, scaleIn } from '../../shared/animations';
import { MyAccountModalComponent } from '../../shared/my-account-modal/my-account-modal.component';
import { PaginatePipe } from '../../shared/pagination/paginate.pipe';
import { PaginatorComponent } from '../../shared/pagination/paginator.component';
import { PhoneNumberPipe } from '../../shared/phone-number.pipe';

@Component({
  selector: 'app-subscriber-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MyAccountModalComponent, PaginatePipe, PhoneNumberPipe, PaginatorComponent],
  templateUrl: './subscriber-portal.component.html',
  styleUrls: ['./subscriber-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, shake, scaleIn]
})
export class SubscriberPortalComponent implements OnInit, AfterViewInit, OnDestroy {
  // Pagination
  readonly pageSize = 8;
  invoicesPage = 1;
  requestsPage = 1;
  planSubTab = 'plans';
  plansPage = 1;
  addOnsPage = 1;

  // Navigation
  activeTab = signal<string>('plan');
  isSidebarCollapsed = signal<boolean>(false);
  isNotificationOpen = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;
  isNewConnModalOpen = false;

  // Notification Center
  notifCat = signal<string>('ALL');
  notifStatus = signal<string>('ALL');
  readonly notifCategories = ['ALL', 'USAGE', 'BILLING', 'FAULT', 'PLAN', 'COMPLIANCE'];

  // User details
  user!: User;
  account360: any = null;
  isLoading = true;

  // Plan catalog & change request
  availablePlans = signal<any[]>([]);
  planFilter = signal<'All' | 'Prepaid' | 'Postpaid'>('All');
  planSearch = signal<string>('');
  filteredPlans = computed(() => {
    const filter = this.planFilter();
    const plans = filter === 'All'
      ? this.availablePlans()
      : this.availablePlans().filter((p: any) => p.type === filter);
    const q = this.planSearch().trim();
    if (!q) return plans;
    return plans.filter((p: any) =>
      String(p.dataGb).includes(q) ||
      String(p.validityDays).includes(q) ||
      String(p.planPrice).includes(q)
    );
  });

  get accountType(): string {
    return this.account360?.accountType ?? '';
  }

  isPlanCompatible(p: any): boolean {
    return !this.accountType || p.type === this.accountType;
  }

  get compatiblePlanCount(): number {
    return this.filteredPlans().filter((p: any) => this.isPlanCompatible(p)).length;
  }

  onSelectPlan(p: any): void {
    if (!this.isPlanCompatible(p)) {
      this.toastService.error(`This is a ${this.accountType} account. You can only activate ${this.accountType} plans.`);
      return;
    }
    if (this.hasActivePlan) return;
    this.openUpgradeModal(p);
  }

  // Plan details pop-up (opened by the card's arrow).
  detailsPlan: any = null;
  openPlanDetails(p: any): void { this.detailsPlan = p; }
  closePlanDetails(): void { this.detailsPlan = null; }

  targetPlan: any = null;
  changeRequestForm!: FormGroup;
  isUpgradeModalOpen = false;

  // Usage tracking
  usageSummary: any = null;
  activeBillingCycleId: number | null = null;

  // Payment processing
  isProcessingPayment = false;

  // Add-Ons
  addOns = signal<any[]>([]);
  isAddOnModalOpen = false;
  targetAddOn: any = null;
  addOnPaymentMethod = 'UPI';

  // Invoices & Payments
  myInvoices: any[] = [];
  activeInvoiceDetail: number | null = null;

  get paidInvoicesCount(): number {
    return this.myInvoices.filter(i => (i?.status ?? '').toString().toUpperCase() === 'PAID').length;
  }
  get openInvoicesCount(): number {
    return this.myInvoices.filter(i => {
      const s = (i?.status ?? '').toString().toUpperCase();
      return s !== 'PAID';
    }).length;
  }
  isDisputeModalOpen = false;
  disputeForm!: FormGroup;
  disputingInvoiceId: number | null = null;
  disputingInvoiceTotal = 0;

  // Service Requests & Tickets
  serviceRequests: any[] = [];   // this subscriber's own service requests
  myTickets: any[] = [];         // this subscriber's own fault tickets
  ticketsPage = 1;
  newRequestForm!: FormGroup;
  isRequestModalOpen = false;
  newTicketForm!: FormGroup;
  isTicketModalOpen = false;
  isSubmittingRequest = false;
  isSubmittingTicket = false;

  // Chart reference
  private usageChart: Chart | null = null;

  // Usage-threshold notifications (50/90/100%) — fire once each per line+cycle.
  private firedUsageKeys = new Set<string>();
  private dataPollHandle: any = null;
  private voicePollHandle: any = null;
  private smsPollHandle: any = null;
  private thresholdPollHandle: any = null;
  /**
   * Day-by-day simulated data usage in MB, e.g. [{date:'2026-08-02', usedMb: 400}, ...].
   * Drives the Data card, Limit panel, and the usage history chart — kept independent of
   * the backend's usage records, which are seeded in large lump sums that would otherwise
   * make every day look like a plan violation.
   */
  dailyDataHistory: { date: string; usedMb: number }[] = [];
  // Guard so we seed a missing usage summary at most once.
  private usageSeeded = false;

  constructor(
    public authService: AuthService,
    private accountService: AccountService,
    private iamService: IamService,
    private planService: PlanService,
    private usageService: UsageService,
    private billingService: BillingService,
    private ticketService: TicketService,
    public notificationService: NotificationService,
    private toastService: ToastService,
    private fb: FormBuilder,
    private router: Router
  ) {
    // Re-render usage chart when activeTab changes to 'usage'
    effect(() => {
      if (this.activeTab() === 'usage') {
        setTimeout(() => this.renderUsageChart(), 100);
      }
    });
  }

  ngOnInit(): void {
    this.user = this.authService.currentUser()!;
    this.loadFiredUsageKeys();
    this.loadDailyDataHistory();
    this.loadData();
    this.initForms();
    // Poll each usage type on its own cadence so the dashboard visibly ticks over
    // at different paces instead of all three numbers jumping together.
    this.dataPollHandle = setInterval(() => this.refreshDataUsage(), 2 * 60 * 1000);
    this.voicePollHandle = setInterval(() => this.refreshVoiceUsage(), 5 * 60 * 1000);
    this.smsPollHandle = setInterval(() => this.refreshSmsUsage(), 7 * 60 * 1000);
    // Check today's 50/80/100% data thresholds far more often than the display polls,
    // so a notification fires within seconds of actually crossing a threshold instead of
    // waiting on the next 2-minute data tick.
    this.thresholdPollHandle = setInterval(() => this.checkDataUsageThresholds(), 10000);
    this.checkDataUsageThresholds();
  }

  ngAfterViewInit(): void {
    this.notificationService.refreshNotifications();
  }

  ngOnDestroy(): void {
    if (this.dataPollHandle) { clearInterval(this.dataPollHandle); this.dataPollHandle = null; }
    if (this.voicePollHandle) { clearInterval(this.voicePollHandle); this.voicePollHandle = null; }
    if (this.smsPollHandle) { clearInterval(this.smsPollHandle); this.smsPollHandle = null; }
    if (this.thresholdPollHandle) { clearInterval(this.thresholdPollHandle); this.thresholdPollHandle = null; }
    if (this.usageChart) { this.usageChart.destroy(); this.usageChart = null; }
  }

  private finishAccountLoad(account360: any): void {
    this.account360 = account360;
    this.isLoading = false;
    this.loadInvoices();
    this.loadUsage();
    this.loadServiceRequests();
    this.loadAddOns();
  }

  loadData(): void {
    this.isLoading = true;

    // Plans load independently — no dependency on account data
    this.planService.getPlans(true).subscribe({
      next: data => { this.availablePlans.set(data); },
      error: err => {
        this.toastService.error('Failed to load plans: ' + (err.status ? 'HTTP ' + err.status : err.message));
      }
    });

    // Account chain: IAM user → accounts → SIM lines → subscriptions
    this.iamService.getMe().subscribe({
      next: (iamUser) => {
        // Sync the local user snapshot with the freshest IAM data (phone/email/name may
        // be missing on the currentUser() signal captured at login).
        if (this.user) {
          this.user = { ...this.user, phone: iamUser.phone ?? this.user.phone, name: iamUser.name ?? this.user.name, email: iamUser.email ?? this.user.email };
        }
        this.accountService.getAccountsBySubscriberId(iamUser.userId).subscribe({
          next: (result) => {
            const accounts: any[] = result ?? [];
            // Prefer Active accounts
            const activeAccount = accounts.find((a: any) => a.status === 'Active') ?? accounts[0];
            if (!activeAccount) { this.finishAccountLoad(iamUser); return; }

            this.accountService.getSimLines(activeAccount.accountId).subscribe({
              next: (lines: any[]) => {
                if (!lines?.length) { this.finishAccountLoad({ ...activeAccount, lines: [] }); return; }

                // Fetch subscriptions and enrich lines with activeSubscription + plan
                this.planService.getAllSubscriptions().subscribe({
                  next: (subs: any[]) => {
                    const enrichedLines = lines.map((line: any) => {
                      const sub = subs.find((s: any) => s.lineId === line.lineId && s.status === 'A');
                      if (!sub) return line;
                      const plan = this.availablePlans().find((p: any) => p.planId === sub.planId)
                                ?? { planId: sub.planId };
                      return { ...line, activeSubscription: { ...sub, plan } };
                    });
                    this.finishAccountLoad({ ...activeAccount, lines: enrichedLines });
                  },
                  error: () => this.finishAccountLoad({ ...activeAccount, lines })
                });
              },
              error: () => this.finishAccountLoad({ ...activeAccount, lines: [] })
            });
          },
          error: () => this.finishAccountLoad(iamUser)
        });
      },
      error: () => {
        this.isLoading = false;
        this.toastService.error('Failed to load account profiles.');
      }
    });
  }

  initForms(): void {
    this.changeRequestForm = this.fb.group({
      effectiveDate: ['', Validators.required],
      paymentMethod: ['UPI', Validators.required]
    });

    this.disputeForm = this.fb.group({
      disputeReason: ['', [Validators.required, Validators.minLength(10)]],
      disputedAmount: [0, [Validators.required, Validators.min(1)]]
    });

    this.newRequestForm = this.fb.group({
      requestType: ['PlanChange', Validators.required],
      mobileNumber: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      additionalDetails: ['', Validators.required]
    });

    this.newConnectionForm = this.fb.group({
      accountType: ['Prepaid', Validators.required],
      idProofReference: ['', [Validators.required, Validators.minLength(4)]],
      preferredPlanId: [1, Validators.required]
    });

    this.newTicketForm = this.fb.group({
      faultType: ['NoCoverage', Validators.required],
      lineId: [null],
      description: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  newConnectionForm!: FormGroup;
  isSubmittingNewConn = false;

  get hasAccount(): boolean {
    return !!(this.account360 && this.account360.accountId);
  }

  get hasActivePlan(): boolean {
    return !!this.account360?.lines?.[0]?.activeSubscription?.subscriptionId;
  }


  get activeSubscriptionAddOn(): any {
    const addOnId = this.account360?.lines?.[0]?.activeSubscription?.addOnId;
    if (!addOnId) return null;
    return this.addOns().find((a: any) => a.addOnId === addOnId) ?? null;
  }

  get pendingNewConnRequest(): any {
    return this.serviceRequests.find((r: any) => r.requestType === 'NewConnection' && (r.requestedBy === this.user?.id || r.requestedBy === Number(this.user?.id)) && r.status === 'O');
  }

  get rejectedNewConnRequest(): any {
    return this.serviceRequests.find((r: any) => r.requestType === 'NewConnection' && (r.requestedBy === this.user?.id || r.requestedBy === Number(this.user?.id)) && r.status === 'X');
  }

  submitNewConnectionRequest(): void {
    this.newConnectionForm.markAllAsTouched();
    if (this.newConnectionForm.invalid) {
      this.toastService.error('Please fill in all required onboarding details.');
      return;
    }

    this.isSubmittingNewConn = true;
    const val = this.newConnectionForm.value;
    const payload = {
      requestType: 'NewConnection',
      requestedBy: this.user?.id,
      raisedDate: new Date().toISOString().split('T')[0],
      preferredAccountType: val.accountType,
      idProofReference: val.idProofReference,
      preferredPlanId: Number(val.preferredPlanId)
    };

    this.ticketService.createRequest(payload).subscribe({
      next: () => {
        this.isSubmittingNewConn = false;
        this.iamService.recordAudit('NEW_CONNECTION_REQUESTED', 'SUBSCRIBER');
        this.closeNewConnectionModal();
        this.newConnectionForm.reset({
          accountType: 'Prepaid',
          idProofReference: '',
          preferredPlanId: 1
        });
        this.toastService.success('New connection request submitted successfully! An agent will review it shortly.');
        this.loadServiceRequests();
      },
      error: (err) => {
        this.isSubmittingNewConn = false;
        this.toastService.error('Failed to submit request: ' + (err?.error?.message || err.message));
      }
    });
  }

  loadInvoices(): void {
    const accountId = this.account360?.accountId;
    if (!accountId) return;
    this.billingService.getInvoicesByAccount(accountId).subscribe({
      next: data => {
        this.myInvoices = Array.isArray(data) ? data : [];
        this.maybeHealInvoice();
      },
      error: () => {}
    });
  }

  private healedInvoice = false;

  /**
   * Self-heal: if the subscriber has an active plan but no invoice (provisioning created a
   * billing cycle without generating the bill), generate it now against the open cycle and
   * seed usage — so billing + usage appear for every account on login. Runs at most once.
   */
  private maybeHealInvoice(): void {
    if (this.healedInvoice || this.myInvoices.length > 0) return;
    const line = this.account360?.lines?.[0];
    const plan = this.activePlan;
    const accountId = this.account360?.accountId;
    if (!accountId || !line?.lineId || !plan?.planId || !this.hasActivePlan) return;
    this.healedInvoice = true;
    const planPrice = Number(plan.planPrice ?? 0);
    const taxes = Math.round(planPrice * 0.18 * 100) / 100;
    const start = this.todayStr();
    const end = this.addDaysToDate(start, Number(plan.validityDays ?? 28));
    this.autoCreateInvoice(accountId, line.lineId, plan, planPrice, taxes, start, end);
  }

  loadUsage(): void {
    const line = this.account360?.lines?.[0];
    const accountId = this.account360?.accountId;
    if (!line?.lineId || !accountId) return;

    // A Subscriber cannot list billing cycles (that needs BILLING_CYCLE authority),
    // but can read their own invoices — derive the latest billing cycle from there.
    this.billingService.getInvoicesByAccount(accountId).subscribe({
      next: (invoices: any[]) => {
        const list = Array.isArray(invoices) ? invoices : [];
        if (!list.length) return;
        const latest = list.reduce((a, b) => ((b?.cycleId ?? 0) > (a?.cycleId ?? 0) ? b : a));
        this.activeBillingCycleId = latest?.cycleId ?? null;
        if (!this.activeBillingCycleId) return;

        const lineId = line.lineId, cycleId = this.activeBillingCycleId;
        this.usageService.getSummary(lineId, cycleId).subscribe({
          next: (summary) => this.applyUsageSummary(summary, lineId, cycleId),
          error: () => this.applyUsageSummary(null, lineId, cycleId)
        });
      },
      error: () => {}
    });
  }

  loadServiceRequests(): void {
    this.ticketService.getRequests().subscribe({
      next: (data) => {
        const all = Array.isArray(data) ? data : [];
        // Only this subscriber's own requests
        this.serviceRequests = all.filter((r: any) =>
          r.requestedBy === this.user?.id || r.requestedBy === Number(this.user?.id)
        );
        const completedConnReq = this.serviceRequests.find((r: any) =>
          r.requestType === 'NewConnection' && r.status === 'C'
        );
        if (completedConnReq && (!this.account360 || !this.account360.accountId)) {
          this.loadData();
        }
      },
      error: () => { this.serviceRequests = []; }
    });
    this.loadMyTickets();
  }

  loadAddOns(): void {
    this.planService.getAddOns().subscribe({
      next: (data: any) => {
        this.addOns.set(Array.isArray(data) ? data : []);
      },
      error: () => {}
    });
  }

  // ==========================================
  // Tab Navigation & UI Toggles
  // ==========================================
  setTab(tab: string): void {
    this.activeTab.set(tab);
    this.isNotificationOpen.set(false);
  }

  /** "Add data" on the Usage dashboard's Data card — jumps to Plan Details > Add-Ons. */
  goToAddOns(): void {
    this.setTab('plan');
    this.planSubTab = 'addons';
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  toggleNotifications(event?: Event): void {
    // Stop the bell click from bubbling to the document:click handler, which would
    // immediately re-close the panel.
    event?.stopPropagation();
    this.isNotificationOpen.set(!this.isNotificationOpen());
    if (this.isNotificationOpen()) {
      this.notificationService.refreshNotifications();
    }
  }

  /** Bell dropdown shows only the 3 most recent (non-dismissed) alerts. */
  topNotifications(): any[] {
    return this.recentNotifications().slice(0, 3);
  }

  /** "View all notifications" → open the full Notifications tab. */
  openAllNotifications(): void {
    this.isNotificationOpen.set(false);
    this.setTab('notifications');
  }

  /** Small glyph per category for the bell tiles. */
  notifIcon(cat: string): string {
    switch ((cat ?? '').toString().toUpperCase()) {
      case 'USAGE':      return '▤';
      case 'BILLING':    return '₹';
      case 'FAULT':      return '!';
      case 'PLAN':       return '◆';
      case 'COMPLIANCE': return '✓';
      default:           return '•';
    }
  }

  /** Category-coloured unread dot. */
  notifDot(cat: string): string {
    switch ((cat ?? '').toString().toUpperCase()) {
      case 'USAGE':      return 'bg-sky-500';
      case 'BILLING':    return 'bg-amber-500';
      case 'FAULT':      return 'bg-rose-500';
      case 'PLAN':       return 'bg-indigo-500';
      case 'COMPLIANCE': return 'bg-violet-500';
      default:           return 'bg-slate-400';
    }
  }

  /** Relative timestamp: "just now", "4m ago", "1h ago", "Yesterday", "3d ago". */
  timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return '';
    const m = Math.floor((Date.now() - then) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'Yesterday';
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  // ── Notification Center ─────────────────────────────────────────────────────
  setNotifCat(cat: string): void { this.notifCat.set(cat); }
  setNotifStatus(status: string): void { this.notifStatus.set(status); }

  /** All notifications for this subscriber, minus dismissed, with the active filters applied. */
  filteredNotifications(): any[] {
    const cat = this.notifCat();
    const st = this.notifStatus();
    return this.notificationService.notifications()
      .filter(n => (n?.status ?? '').toString().toUpperCase() !== 'DISMISSED')
      .filter(n => cat === 'ALL' || (n?.category ?? '').toString().toUpperCase() === cat)
      .filter(n => st === 'ALL' || (n?.status ?? '').toString().toUpperCase() === st);
  }

  /** Bell dropdown list — all non-dismissed notifications, ignoring the page filters. */
  recentNotifications(): any[] {
    return this.notificationService.notifications()
      .filter(n => (n?.status ?? '').toString().toUpperCase() !== 'DISMISSED');
  }

  isUnread(n: any): boolean {
    return (n?.status ?? '').toString().toUpperCase() === 'UNREAD';
  }

  markNotifRead(n: any): void {
    if (this.isUnread(n)) this.notificationService.markAsRead(n.notificationId).subscribe(() => this.iamService.recordAudit('MARK_NOTIFICATION_READ', 'NOTIFICATION'));
  }

  dismissNotif(n: any): void {
    this.notificationService.dismiss(n.notificationId).subscribe();
  }

  markAllNotifRead(): void {
    this.notificationService.markAllAsRead().subscribe(() => this.iamService.recordAudit('MARK_ALL_NOTIFICATIONS_READ', 'NOTIFICATION'));
  }

  /** Fire-and-forget: raise a notification for a subscriber (recipient userId). */
  private pushNotification(userId: number | null | undefined, message: string, category: string): void {
    if (!userId) return;
    this.notificationService.createNotification({ userId, message, category }).subscribe({
      next: () => this.notificationService.refreshNotifications(),
      error: () => {}
    });
  }

  /** Tailwind classes for a category badge/icon. */
  notifBadgeClass(cat: string): string {
    switch ((cat ?? '').toString().toUpperCase()) {
      case 'USAGE':      return 'bg-sky-100 text-sky-700';
      case 'BILLING':    return 'bg-amber-100 text-amber-700';
      case 'FAULT':      return 'bg-rose-100 text-rose-700';
      case 'PLAN':       return 'bg-indigo-100 text-indigo-700';
      case 'COMPLIANCE': return 'bg-violet-100 text-violet-700';
      default:           return 'bg-slate-100 text-slate-600';
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

  openNewConnectionModal(): void {
    this.isNewConnModalOpen = true;
  }

  closeNewConnectionModal(): void {
    this.isNewConnModalOpen = false;
  }

  logout(): void {
    this.authService.logout();
  }

  // ==========================================
  // Plan upgrades/downgrades
  // ==========================================
  openUpgradeModal(plan: any): void {
    this.targetPlan = plan;
    this.isUpgradeModalOpen = true;
  }

  closeUpgradeModal(): void {
    this.isUpgradeModalOpen = false;
    this.targetPlan = null;
    this.changeRequestForm.reset();
  }

  submitPlanChange(): void {
    if (this.changeRequestForm.invalid || !this.targetPlan) return;

    this.isProcessingPayment = true;

    const line = this.account360?.lines?.[0];

    if (line?.activeSubscription?.subscriptionId) {
      this.isProcessingPayment = false;
      this.toastService.error('You already have an active plan. It must expire before you can activate a new one.');
      this.closeUpgradeModal();
      return;
    }

    if (line?.lineId) {
      // Normal path — SIM line already loaded
      this.doActivatePlan(line.lineId);
      return;
    }

    const accountId: number | undefined = this.account360?.accountId;

    if (!accountId) {
      // No subscriber account at all — auto-create one, then SIM line, then activate
      this.accountService.createAccount({
        subscriberId: this.user.id,
        accountType: 'Prepaid',
        kycStatus: 'Pending',
        status: 'Active'
      }).subscribe({
        next: () => {
          // Re-fetch accounts to get the new accountId
          this.accountService.getAccountsBySubscriberId(this.user.id).subscribe({
            next: (result: any) => {
              const accounts: any[] = result ?? [];
              const newAccount = accounts.find((a: any) => a.status === 'Active') ?? accounts[0];
              if (!newAccount?.accountId) {
                this.isProcessingPayment = false;
                this.toastService.error('Account setup failed. Please contact support.');
                return;
              }
              this.account360 = { ...newAccount, lines: [] };
              this.createSimLineAndActivate(newAccount.accountId);
            },
            error: () => { this.isProcessingPayment = false; this.toastService.error('Account lookup failed. Please try again.'); }
          });
        },
        error: (err: any) => {
          this.isProcessingPayment = false;
          // Account might already exist; try fetching lines directly
          this.accountService.getAccountsBySubscriberId(this.user.id).subscribe({
            next: (result: any) => {
              const accounts: any[] = result ?? [];
              const acc = accounts.find((a: any) => a.status === 'Active') ?? accounts[0];
              if (acc?.accountId) {
                this.account360 = { ...acc, lines: [] };
                this.createSimLineAndActivate(acc.accountId);
              } else {
                this.toastService.error('No subscriber account found. Please contact support.');
              }
            },
            error: () => { this.toastService.error(err.error?.message ?? 'Account setup failed. Please contact support.'); }
          });
        }
      });
      return;
    }

    // Subscriber account exists but no cached SIM line — fetch fresh then auto-create if needed
    this.accountService.getSimLines(accountId).subscribe({
      next: (freshLines: any[]) => {
        if (freshLines?.length && freshLines[0]?.lineId) {
          this.account360 = { ...this.account360, lines: freshLines };
          this.doActivatePlan(freshLines[0].lineId);
        } else {
          this.createSimLineAndActivate(accountId);
        }
      },
      error: () => this.createSimLineAndActivate(accountId)
    });
  }

  private createSimLineAndActivate(accountId: number): void {
    const msisdn = this.user.phone?.replace(/\D/g, '').slice(-10)
      ? this.user.phone.replace(/\D/g, '').slice(-10)
      : `98${String(accountId).padStart(4, '0')}${String(Date.now()).slice(-4)}`;
    const iccid = `8991000${String(accountId).padStart(4, '0')}${String(Date.now()).slice(-8)}`;

    this.accountService.addLine(accountId, {
      msisdn,
      iccid,
      serviceType: 'VoiceData',
      status: 'Active'
    }).subscribe({
      next: () => {
        this.iamService.recordAudit('SIM_LINE_CREATED', 'SUBSCRIBER');
        // Fetch the newly created line to get its lineId
        this.accountService.getSimLines(accountId).subscribe({
          next: (lines: any[]) => {
            if (!lines?.length) {
              this.isProcessingPayment = false;
              this.toastService.error('SIM line setup failed. Please contact support.');
              return;
            }
            const newLine = lines[lines.length - 1];
            this.account360 = { ...this.account360, lines };
            this.doActivatePlan(newLine.lineId);
          },
          error: () => { this.isProcessingPayment = false; this.toastService.error('Failed to retrieve SIM line. Please try again.'); }
        });
      },
      error: (err: any) => {
        this.isProcessingPayment = false;
        this.toastService.error(err.error?.message ?? 'SIM line creation failed. Please contact support.');
      }
    });
  }

  private doActivatePlan(lineId: number): void {
    const activationDate: string = this.changeRequestForm.value.effectiveDate;
    const paymentMethod: string = this.changeRequestForm.value.paymentMethod ?? 'UPI';
    const validityDays: number = this.targetPlan.validityDays ?? 28;
    const expiryDate = this.addDaysToDate(activationDate, validityDays);
    const planPrice: number = this.targetPlan.planPrice ?? 0;
    const taxes = Math.round(planPrice * 0.18 * 100) / 100;
    const totalAmount = Math.round((planPrice + taxes) * 100) / 100;

    this.planService.createSubscription({
      lineId, planId: this.targetPlan.planId,
      activationDate, expiryDate, renewalType: 'AutoRenew', status: 'A'
    }).subscribe({
      next: () => {
        this.isProcessingPayment = false;
        this.iamService.recordAudit('PLAN_ACTIVATED', 'PLAN');
        this.pushNotification(this.user?.id, `Your ${this.targetPlan.name} plan is now active.`, 'PLAN');
        this.toastService.success(
          `${this.targetPlan.name} activated! ₹${totalAmount.toFixed(0)} paid via ${paymentMethod}.`
        );
        const accountId: number = this.account360?.accountId;
        if (accountId) {
          // Activation already generates the invoice below. Mark the self-heal path as done
          // BEFORE loadData() runs — otherwise loadData → loadInvoices → maybeHealInvoice races
          // against this (still-async) generate call, sees myInvoices.length === 0, and creates
          // a SECOND invoice on a fresh cycle (duplicate bill with identical amount/due date).
          this.healedInvoice = true;
          this.autoCreateInvoice(accountId, lineId, this.targetPlan, planPrice, taxes, activationDate, expiryDate);
        }
        this.closeUpgradeModal();
        this.loadData();
        this.setTab('billing');
      },
      error: (err) => {
        this.isProcessingPayment = false;
        const msg = err.error?.message
          ?? (typeof err.error === 'string' && err.error.trim() ? err.error.trim() : null)
          ?? (err.status === 401 ? 'Session expired. Please log in again.'
            : err.status === 403 ? 'Permission denied. Please contact support.'
            : err.status === 0   ? 'Network error. Check your connection.'
            : `Server error (HTTP ${err.status})`);
        this.toastService.error('Failed to activate plan: ' + msg);
      }
    });
  }

  private addDaysToDate(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private autoCreateInvoice(
    accountId: number,
    lineId: number,
    plan: any,
    planPrice: number,
    taxes: number,
    cycleStart: string,
    cycleEnd: string
  ): void {
    const generate = (cycleId: number) => {
      this.billingService.generateInvoice({
        accountId, cycleId, planCharges: planPrice, excessCharges: 0, addOnCharges: 0, taxes
      }).subscribe({
        next: () => {
          this.toastService.success('Invoice generated successfully.');
          this.seedUsageTracking(lineId, cycleId, plan);
          setTimeout(() => { this.loadInvoices(); this.loadUsage(); }, 600);
        },
        error: (err: any) => {
          const msg: string = err?.error?.message ?? '';
          if (msg.toLowerCase().includes('already exists')) {
            // An invoice already exists for this cycle — surface it, don't error out.
            this.seedUsageTracking(lineId, cycleId, plan);
            setTimeout(() => { this.loadInvoices(); this.loadUsage(); }, 600);
          } else {
            this.toastService.error('Invoice generation failed: ' + (msg || `HTTP ${err?.status}`));
          }
        }
      });
    };

    const createCycleThenGenerate = () => {
      this.billingService.createBillingCycle(accountId, cycleStart, cycleEnd).subscribe({
        next: (cycle: any) => {
          const cycleId: number = cycle?.cycleId ?? cycle?.id;
          if (!cycleId) { this.toastService.error('Invoice not created: billing cycle ID missing.'); return; }
          generate(cycleId);
        },
        error: (err: any) => this.toastService.error('Billing cycle creation failed: ' + (err?.error?.message ?? `HTTP ${err?.status}`))
      });
    };

    // Reuse an existing OPEN cycle if present — the backend rejects a second open cycle
    // per account, which was silently blocking the invoice for a newly-added plan.
    this.billingService.getCyclesByAccount(accountId).subscribe({
      next: (cycles: any[]) => {
        const open = (cycles ?? []).find((c: any) => (c?.status ?? '').toString().toUpperCase() === 'OPEN');
        if (open) generate(open.cycleId ?? open.id);
        else createCycleThenGenerate();
      },
      error: () => createCycleThenGenerate()
    });
  }

  /**
   * Create a zero-usage record so the backend seeds a UsageSummary (with this plan's
   * limits) for the line+cycle. Once the summary exists the scheduled usage simulator
   * grows it over time, so a newly activated plan starts tracking immediately.
   */
  private seedUsageTracking(lineId: number, cycleId: number, plan: any): void {
    const dataLimitMb = Number(plan?.dataGb ?? 0) * 1024;
    const voiceLimitMin = Number(plan?.voiceMinutes ?? 0);
    const smsLimit = Number(plan?.smsCount ?? 0);
    this.usageService.createRecord({
      lineId,
      billingCycleId: cycleId,
      usageType: 'DATA',
      quantity: 1, // backend requires quantity > 0; 1 MB is a negligible seed
      usageDate: new Date().toISOString().slice(0, 19),
      dataLimitMb,
      voiceLimitMin,
      smsLimit
    }).subscribe({ next: () => {}, error: () => {} });
  }

  // ==========================================
  // Invoice history & Payment simulation
  // ==========================================
  toggleInvoiceDetail(id: number): void {
    this.activeInvoiceDetail = this.activeInvoiceDetail === id ? null : id;
  }

  payInvoice(inv: any): void {
    this.billingService.payInvoice(inv.invoiceId, {
      amountPaid: inv.totalAmount,
      paymentMethod: 'UPI',
      transactionRef: `TXN-${inv.invoiceId}-${Date.now()}`
    }).subscribe({
      next: () => {
        this.iamService.recordAudit('INVOICE_PAID', 'BILLING');
        this.pushNotification(this.user?.id, `Payment of ₹${inv.totalAmount} received — invoice #${inv.invoiceId} is now paid.`, 'BILLING');
        this.toastService.success('Payment successful! Thank you.');
        this.loadInvoices();
      },
      error: () => this.toastService.error('Invoice payment failed.')
    });
  }

  downloadInvoice(invoiceId: number): void {
    this.billingService.downloadInvoice(invoiceId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => this.toastService.error('Failed to download invoice.')
    });
  }

  openDisputeModal(invoice: any): void {
    this.disputingInvoiceId = invoice.invoiceId;
    this.disputingInvoiceTotal = invoice.totalAmount;
    this.disputeForm.patchValue({ disputedAmount: invoice.totalAmount });
    this.isDisputeModalOpen = true;
  }

  closeDisputeModal(): void {
    this.isDisputeModalOpen = false;
    this.disputingInvoiceId = null;
    this.disputingInvoiceTotal = 0;
    this.disputeForm.reset();
  }

  // ==========================================
  // Add-Ons
  // ==========================================
  openAddOnModal(addOn: any): void {
    this.targetAddOn = addOn;
    this.addOnPaymentMethod = 'UPI';
    this.isAddOnModalOpen = true;
  }

  closeAddOnModal(): void {
    this.isAddOnModalOpen = false;
    this.targetAddOn = null;
  }

  submitAddOn(): void {
    if (!this.targetAddOn) return;
    const line = this.account360?.lines?.[0];
    if (!line?.lineId) {
      this.toastService.error('No active SIM line. Activate a plan first.');
      return;
    }
    const sub = line.activeSubscription;
    if (!sub?.subscriptionId) {
      this.toastService.error('No active plan found. Activate a plan first.');
      return;
    }
    if (sub.addOnId) {
      this.toastService.error('You already have an active add-on on this plan. Only one add-on per plan is allowed.');
      this.closeAddOnModal();
      return;
    }

    // Capture values before the modal is closed (closeAddOnModal nulls targetAddOn).
    const addOn = this.targetAddOn;
    const accountId: number = this.account360?.accountId;
    const method: string = this.addOnPaymentMethod ?? 'UPI';
    const addOnPrice: number = addOn.price ?? 0;
    const taxes = Math.round(addOnPrice * 0.18 * 100) / 100;

    this.planService.updateSubscription(sub.subscriptionId, { addOnId: addOn.addOnId }).subscribe({
      next: () => {
        this.iamService.recordAudit('ADDON_ACTIVATED', 'PLAN');
        this.pushNotification(this.user?.id, `Your ${addOn.name} add-on is now active.`, 'PLAN');
        this.toastService.success(`${addOn.name} add-on activated!`);
        this.closeAddOnModal();
        // Bill the add-on: generate an invoice carrying the add-on charge, then record payment.
        if (accountId) {
          this.autoCreateAddOnInvoice(accountId, addOnPrice, taxes, method, addOn.name);
        }
        this.loadData();
        this.setTab('billing');
      },
      error: (err: any) => {
        const msg = err.error?.message
          ?? (typeof err.error === 'string' && err.error.trim() ? err.error.trim() : null)
          ?? `HTTP ${err.status}`;
        this.toastService.error('Add-on failed: ' + msg);
      }
    });
  }

  /**
   * Bill an add-on purchase: create a billing cycle, generate an invoice whose
   * charge is the add-on price (+ tax), then record the subscriber's payment.
   * The resulting invoice + payment surface in the subscriber's billing section
   * and in the Billing Executive's invoice and payment ledgers.
   */
  private autoCreateAddOnInvoice(
    accountId: number,
    addOnPrice: number,
    taxes: number,
    method: string,
    addOnName: string
  ): void {
    const cycleStart = this.todayStr();
    const cycleEnd = this.addDaysToDate(cycleStart, 30);

    this.billingService.createBillingCycle(accountId, cycleStart, cycleEnd).subscribe({
      next: (cycle: any) => {
        const cycleId: number = cycle?.cycleId ?? cycle?.id;
        if (!cycleId) {
          this.toastService.error('Add-on invoice not created: billing cycle ID missing.');
          return;
        }
        this.billingService.generateInvoice({
          accountId,
          cycleId,
          planCharges: 0,
          excessCharges: 0,
          addOnCharges: addOnPrice,
          taxes
        }).subscribe({
          next: (inv: any) => {
            const invoiceId: number = inv?.invoiceId ?? inv?.id;
            // Use the backend-computed total to avoid any rounding mismatch on payment.
            const amount: number = inv?.totalAmount ?? Math.round((addOnPrice + taxes) * 100) / 100;
            this.toastService.success(`${addOnName} invoice generated (₹${Number(amount).toFixed(0)}).`);

            if (!invoiceId) {
              setTimeout(() => this.loadInvoices(), 400);
              return;
            }
            this.billingService.payInvoice(invoiceId, {
              amountPaid: amount,
              paymentMethod: method,
              transactionRef: `TXN-ADDON-${invoiceId}-${Date.now()}`
            }).subscribe({
              next: () => {
                this.toastService.success(`Payment of ₹${Number(amount).toFixed(0)} recorded via ${method}.`);
                setTimeout(() => this.loadInvoices(), 400);
              },
              error: (err: any) => {
                const msg = err.error?.message ?? `HTTP ${err.status}`;
                this.toastService.error('Add-on payment failed: ' + msg);
                setTimeout(() => this.loadInvoices(), 400);
              }
            });
          },
          error: (err: any) => {
            const msg = err.error?.message ?? `HTTP ${err.status}`;
            this.toastService.error('Add-on invoice generation failed: ' + msg);
          }
        });
      },
      error: (err: any) => {
        const msg = err.error?.message ?? `HTTP ${err.status}`;
        this.toastService.error('Billing cycle creation failed: ' + msg);
      }
    });
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  getAddOnTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      DataTopup: 'Data Top-Up', ISDPack: 'ISD Pack',
      RoamingPack: 'Roaming Pack', SMSPack: 'SMS Pack'
    };
    return labels[type] ?? type;
  }

  submitDispute(): void {
    if (this.disputeForm.invalid || !this.disputingInvoiceId) return;

    const { disputeReason, disputedAmount } = this.disputeForm.value;
    if (disputedAmount > this.disputingInvoiceTotal) {
      this.toastService.error('Disputed amount cannot exceed the total invoice amount.');
      return;
    }

    this.billingService.raiseDispute({
      invoiceId: this.disputingInvoiceId,
      disputeReason,
      disputedAmount
    }).subscribe({
      next: () => {
        this.iamService.recordAudit('BILLING_DISPUTE_RAISED', 'BILLING');
        this.toastService.success('Billing dispute ticket raised for investigation.');
        this.closeDisputeModal();
        this.loadInvoices();
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Failed to raise billing dispute.');
      }
    });
  }

  // ==========================================
  // Support Request Creation
  // ==========================================
  /** Best-effort default for the mobile number field: user profile → subscriber → line MSISDN, all stripped to digits. */
  private defaultMobileNumber(): string {
    const raw = this.user?.phone
      ?? this.account360?.subscriber?.phone
      ?? this.account360?.lines?.[0]?.msisdn
      ?? '';
    return String(raw).replace(/\D/g, '').slice(-10);
  }

  openRequestModal(): void {
    this.isRequestModalOpen = !this.isRequestModalOpen;   // toggle open/close
    this.isTicketModalOpen = false;                       // only one form at a time
    if (this.isRequestModalOpen) {
      this.newRequestForm.patchValue({ mobileNumber: this.defaultMobileNumber() });
    }
  }

  closeRequestModal(): void {
    this.isRequestModalOpen = false;
    this.newRequestForm.reset({ requestType: 'PlanChange', mobileNumber: this.defaultMobileNumber(), additionalDetails: '' });
  }

  submitServiceRequest(): void {
    if (this.newRequestForm.invalid || !this.account360) {
      this.toastService.error('Please choose a request type and add details.');
      return;
    }
    const v = this.newRequestForm.value;
    const lineId = this.account360.lines?.[0]?.lineId ?? null;
    const mobileNumber = String(v.mobileNumber ?? '').replace(/\D/g, '');
    const detailsWithMobile = mobileNumber
      ? `[Mobile: ${mobileNumber}] ${v.additionalDetails}`
      : v.additionalDetails;
    this.isSubmittingRequest = true;
    this.ticketService.createRequest({
      accountId: this.account360.accountId,
      lineId,
      requestType: v.requestType,
      requestedBy: this.user?.id,
      raisedDate: new Date().toISOString().split('T')[0],
      status: 'Open',
      additionalDetails: detailsWithMobile
    }).subscribe({
      next: () => {
        this.isSubmittingRequest = false;
        this.iamService.recordAudit('SERVICE_REQUEST_SUBMITTED', 'FAULT');
        this.pushNotification(this.user?.id, `Your service request (${v.requestType}) has been submitted — our support team will pick it up.`, 'PLAN');
        this.toastService.success('Service request raised — our support team will pick it up.');
        this.newRequestForm.reset({ requestType: 'PlanChange', mobileNumber: this.defaultMobileNumber(), additionalDetails: '' });
        this.isRequestModalOpen = false;
        this.loadServiceRequests();
        this.notificationService.refreshNotifications();
      },
      error: (err) => {
        this.isSubmittingRequest = false;
        this.toastService.error(err.error?.message || 'Failed to submit service request.');
      }
    });
  }

  /** Cancel an Open service request (allowed while status is Open). */
  cancelServiceRequest(req: any): void {
    const id = req?.requestId ?? req?.id;
    if (!id) return;
    this.ticketService.cancelRequest(id).subscribe({
      next: () => {
        this.iamService.recordAudit('SERVICE_REQUEST_CANCELLED', 'FAULT');
        this.toastService.success('Service request cancelled.');
        this.loadServiceRequests();
      },
      error: (err) => this.toastService.error(err.error?.message || 'Failed to cancel request.')
    });
  }

  openTicketModal(): void {
    this.isTicketModalOpen = !this.isTicketModalOpen;   // toggle open/close
    this.isRequestModalOpen = false;                    // only one form at a time
  }

  closeTicketModal(): void {
    this.isTicketModalOpen = false;
    this.newTicketForm.reset({ faultType: 'NoCoverage', lineId: null, description: '' });
  }

  submitFaultTicket(): void {
    if (this.newTicketForm.invalid || !this.account360) {
      this.toastService.error('Please choose a fault type and describe the issue (min 10 chars).');
      return;
    }
    const v = this.newTicketForm.value;
    const lineId = v.lineId ?? this.account360.lines?.[0]?.lineId ?? null;
    this.isSubmittingTicket = true;
    this.ticketService.createFaultTicket({
      accountId: this.account360.accountId,
      lineId,
      faultType: v.faultType,
      description: v.description,
      priority: 'M',                                      // team sets urgency; backend default Medium
      raisedDate: new Date().toISOString().split('T')[0]  // backend requires a LocalDate; status defaults to O (Open)
    }).subscribe({
      next: () => {
        this.isSubmittingTicket = false;
        this.iamService.recordAudit('FAULT_TICKET_SUBMITTED', 'FAULT');
        this.pushNotification(this.user?.id, `Your fault report (${v.faultType}) has been logged and routed to Network Ops.`, 'FAULT');
        this.toastService.success('Fault reported — routed to Network Ops.');
        this.newTicketForm.reset({ faultType: 'NoCoverage', lineId: null, description: '' });
        this.isTicketModalOpen = false;
        this.loadMyTickets();
        this.notificationService.refreshNotifications();
      },
      error: (err) => {
        this.isSubmittingTicket = false;
        this.toastService.error(err.error?.message || 'Failed to report fault.');
      }
    });
  }

  // ==========================================
  // My requests / tickets loading + status labels
  // ==========================================
  loadMyTickets(): void {
    const accountId = this.account360?.accountId;
    const lineIds = (this.account360?.lines ?? []).map((l: any) => l.lineId);
    this.ticketService.getFaultTickets().subscribe({
      next: (data: any[]) => {
        const all = Array.isArray(data) ? data : [];
        this.myTickets = all.filter((t: any) =>
          (accountId != null && t.accountId === accountId) || lineIds.includes(t.lineId)
        );
      },
      error: () => { this.myTickets = []; }
    });
  }

  private readonly requestStatusWord: Record<string, string> = { O: 'Open', P: 'InProgress', C: 'Completed', X: 'Cancelled' };
  private readonly ticketStatusWord: Record<string, string> = { O: 'Open', P: 'InProgress', R: 'Resolved', C: 'Closed', E: 'Escalated' };

  requestStatusLabel(s: string): string { return this.requestStatusWord[s] ?? s; }
  ticketStatusLabel(s: string): string { return this.ticketStatusWord[s] ?? s; }

  /** True once an invoice is paid (backend status is upper-case, e.g. "PAID"). */
  isInvoicePaid(inv: any): boolean {
    return (inv?.status ?? '').toString().toUpperCase() === 'PAID';
  }

  isInvoiceDisputed(inv: any): boolean {
    return (inv?.status ?? '').toString().toUpperCase() === 'DISPUTED';
  }

  /** Case-insensitive colour classes for an invoice status badge. */
  invoiceBadgeClass(status: string): string {
    switch ((status ?? '').toString().toUpperCase()) {
      case 'PAID':      return 'bg-emerald-100 text-emerald-700';
      case 'SENT':
      case 'GENERATED': return 'bg-amber-100 text-amber-700';
      case 'OVERDUE':   return 'bg-rose-100 text-rose-700';
      case 'DISPUTED':  return 'bg-purple-100 text-purple-700';
      default:          return 'bg-slate-100 text-slate-600';
    }
  }

  statusBadgeClass(label: string): string {
    switch (label) {
      case 'Open': return 'bg-slate-100 text-slate-600';
      case 'InProgress': return 'bg-blue-100 text-blue-700';
      case 'Completed':
      case 'Resolved': return 'bg-emerald-100 text-emerald-700';
      case 'Escalated': return 'bg-rose-100 text-rose-700';
      case 'Closed': return 'bg-slate-200 text-slate-700';
      case 'Cancelled': return 'bg-slate-100 text-slate-400 line-through';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  // ==========================================
  // Usage progress calculators & charts
  // ==========================================
  getDataPerDay(p: any): string {
    if (!p?.dataGb || !p?.validityDays) return 'Unlimited';
    const perDay = (p.dataGb / p.validityDays);
    return perDay >= 1 ? perDay.toFixed(1) + ' GB/Day' : (perDay * 1024).toFixed(0) + ' MB/Day';
  }

  // The subscriber's currently-active plan is the single source of truth for
  // usage entitlements — everything is measured against what the user selected.
  get activePlan(): any {
    return this.account360?.lines?.[0]?.activeSubscription?.plan ?? null;
  }
  private get planVoiceLimitMin(): number { return Number(this.activePlan?.voiceMinutes ?? 0); }
  private get planSmsLimit(): number { return Number(this.activePlan?.smsCount ?? 0); }

  /** Extra per-day data from an active Data Top-Up add-on (its quota spread evenly across its own validity). */
  private get addOnDataPerDayLimitMb(): number {
    const addOn = this.activeSubscriptionAddOn;
    if (!addOn || (addOn.type ?? '').toString().toUpperCase() !== 'DATATOPUP') return 0;
    const gb = Number(addOn.quota ?? 0);
    const days = Number(addOn.validityDays ?? 0);
    return days > 0 ? (gb / days) * 1024 : 0;
  }

  /**
   * The daily data allowance in MB: the plan's dataGb spread evenly across validityDays,
   * plus any active Data Top-Up add-on's contribution — so buying a top-up immediately
   * raises the daily cap shown across the Usage Tracking dashboard.
   */
  private get planDataPerDayLimitMb(): number {
    const gb = Number(this.activePlan?.dataGb ?? 0);
    const days = Number(this.activePlan?.validityDays ?? 0);
    const baseLimitMb = days > 0 ? (gb / days) * 1024 : 0;
    return baseLimitMb + this.addOnDataPerDayLimitMb;
  }

  /** The plan's per-day data allowance in GB, for display (e.g. 1.5, 2.0). */
  get dataPerDayLimitGb(): number { return this.planDataPerDayLimitMb / 1024; }

  /**
   * Data used today — simulated client-side rather than summed from backend usage records,
   * since the backend's usage simulator seeds records in large lump sums that blow well past
   * a single day's allowance. Ticks up in small steps (see refreshDataUsage) and is always
   * capped at the plan's daily limit, so the daily card can never show more than 100% used.
   */
  get todayDataUsedMb(): number {
    const entry = this.dailyDataHistory.find(d => d.date === this.todayStr());
    return Math.min(entry?.usedMb ?? 0, this.planDataPerDayLimitMb);
  }

  getDataPercentage(): number {
    const limit = this.planDataPerDayLimitMb;
    const used = this.todayDataUsedMb;
    return limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }

  /** Percentage of today's allowance still remaining — drives the Data card's progress bar. */
  getDataRemainingPercentage(): number {
    const limit = this.planDataPerDayLimitMb;
    if (limit <= 0) return 0;
    const remaining = Math.max(0, limit - this.todayDataUsedMb);
    return Math.round((remaining / limit) * 100);
  }

  /** Bar color reflects how much of today's allowance is used — matches the app's amber/rose warning language. */
  getDataBarColorClass(): string {
    const pct = this.getDataPercentage();
    if (pct >= 95) return 'bg-rose-500';
    if (pct >= 80) return 'bg-amber-500';
    return 'bg-blue-600';
  }

  getVoicePercentage(): number {
    const limit = this.planVoiceLimitMin;
    const used = Number(this.usageSummary?.voiceUsedMin ?? 0);
    return limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }

  getSmsPercentage(): number {
    const limit = this.planSmsLimit;
    const used = Number(this.usageSummary?.smsUsed ?? 0);
    return limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }

  getDashOffset(percentage: number): number {
    // Ring circumference is 2 * PI * r = 2 * 3.1415 * 40 = 251.2
    const circumference = 251.2;
    return circumference - (percentage / 100) * circumference;
  }

  /**
   * Rows for the Limit Status Panel. Held as a stable field (recomputed only when usage
   * data loads) — NOT a getter, so change detection doesn't rebuild the array every cycle
   * and thrash the responsive chart beside it.
   */
  limitRows: any[] = [];

  recomputeLimitRows(): void {
    const s = this.usageSummary ?? {};
    this.limitRows = [
      this.buildLimitRow('Data',  (this.todayDataUsedMb / 1024),      this.dataPerDayLimitGb,                     'GB/Day', 1),
      this.buildLimitRow('Voice', Number(s.voiceUsedMin ?? 0),        Number(this.activePlan?.voiceMinutes ?? 0), 'Min', 0),
      this.buildLimitRow('SMS',   Number(s.smsUsed ?? 0),             Number(this.activePlan?.smsCount ?? 0),     'SMS', 0)
    ];
  }

  private buildLimitRow(label: string, used: number, limit: number, unit: string, decimals: number): any {
    const unlimited = !limit || limit <= 0;
    const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
    let statusText: string, statusClass: string, barClass: string;
    if (unlimited) {
      statusText = 'Unlimited'; statusClass = 'text-emerald-600'; barClass = 'bg-emerald-300';
    } else if (pct >= 90) {
      statusText = `${pct}% · 90% threshold crossed`; statusClass = 'text-rose-600'; barClass = 'bg-amber-500';
    } else if (pct >= 80) {
      statusText = `${pct}% · Warning`; statusClass = 'text-amber-600'; barClass = 'bg-amber-500';
    } else {
      statusText = `${pct}% · Normal`; statusClass = 'text-sky-600'; barClass = 'bg-sky-500';
    }
    return {
      label, unit, pct, unlimited, statusText, statusClass, barClass,
      usedDisplay: used.toFixed(decimals),
      limitDisplay: unlimited ? '∞' : limit.toFixed(decimals),
      barWidth: unlimited ? 100 : pct
    };
  }

  /** Lightweight periodic refresh of the usage summary (drives threshold alerts). */
  private refreshUsageSummary(): void {
    const line = this.account360?.lines?.[0];
    if (!line?.lineId || !this.activeBillingCycleId) return;
    const lineId = line.lineId, cycleId = this.activeBillingCycleId;
    this.usageService.getSummary(lineId, cycleId).subscribe({
      next: (summary) => this.applyUsageSummary(summary, lineId, cycleId),
      error: () => this.applyUsageSummary(null, lineId, cycleId)
    });
  }

  /**
   * Apply a fetched usage summary. If none exists yet for this line+cycle (e.g. a plan
   * provisioned by Admin/CS that didn't seed usage), seed it once from the active plan's
   * limits and refetch — so Usage Tracking is never left empty for an active plan.
   */
  private applyUsageSummary(summary: any, lineId: number, cycleId: number): void {
    const valid = summary && (summary.dataRemainingMb != null || summary.dataUsedMb != null);
    if (valid) {
      this.usageSummary = summary;
      this.recomputeLimitRows();
      this.checkDataUsageThresholds();
      if (this.activeTab() === 'usage') setTimeout(() => this.renderUsageChart(), 100);
    } else if (!this.usageSeeded && this.activePlan?.planId) {
      this.usageSeeded = true;
      this.seedUsageTracking(lineId, cycleId, this.activePlan);
      setTimeout(() => this.refreshUsageSummary(), 1500);
    }
  }

  /** Copy only the named fields from a freshly-fetched summary into the cached one. */
  private mergeUsageSummaryFields(summary: any, fields: string[]): void {
    if (!summary) return;
    const merged = { ...(this.usageSummary ?? {}) };
    for (const f of fields) {
      if (summary[f] !== undefined) merged[f] = summary[f];
    }
    this.usageSummary = merged;
  }

  /**
   * Data ticks every 2 minutes. The daily-card number is a local simulation (+0.2 GB per
   * tick, capped at the daily limit) rather than a sum of backend records, since those are
   * seeded in large lump sums. The 50/80/100% threshold check runs off this same simulated
   * value on its own, much faster poll (see checkDataUsageThresholds / ngOnInit).
   */
  private refreshDataUsage(): void {
    const nextUsedMb = Math.min(this.planDataPerDayLimitMb, this.todayDataUsedMb + 0.2 * 1024);
    this.recordTodayDataUsage(nextUsedMb);
    this.recomputeLimitRows();
    if (this.activeTab() === 'usage') setTimeout(() => this.renderUsageChart(), 100);
  }

  /** Voice ticks every 5 minutes. */
  private refreshVoiceUsage(): void {
    const line = this.account360?.lines?.[0];
    if (!line?.lineId || !this.activeBillingCycleId) return;
    this.usageService.getSummary(line.lineId, this.activeBillingCycleId).subscribe({
      next: (summary) => { this.mergeUsageSummaryFields(summary, ['voiceUsedMin']); this.recomputeLimitRows(); },
      error: () => {}
    });
  }

  /** SMS ticks every 7 minutes. */
  private refreshSmsUsage(): void {
    const line = this.account360?.lines?.[0];
    if (!line?.lineId || !this.activeBillingCycleId) return;
    this.usageService.getSummary(line.lineId, this.activeBillingCycleId).subscribe({
      next: (summary) => { this.mergeUsageSummaryFields(summary, ['smsUsed']); this.recomputeLimitRows(); },
      error: () => {}
    });
  }

  /**
   * Fire a USAGE notification the first time today's data usage crosses 50%, 80% and 100% —
   * matching the same daily percentage the Data card and warning banner show. Keyed by
   * today's date (not the billing cycle) so each milestone can fire again once the daily
   * allowance resets tomorrow.
   */
  private checkDataUsageThresholds(): void {
    const line = this.account360?.lines?.[0];
    const uid = this.user?.id;
    if (!line?.lineId || !uid) return;

    const pct = this.getDataPercentage();
    const milestones = [
      { t: 50,  msg: "You have used 50% of today's data allowance." },
      { t: 80,  msg: "Alert: you have used 80% of today's data allowance." },
      { t: 100, msg: "You have used 100% of today's data — your daily allowance is exhausted." }
    ];
    const day = this.todayStr();
    for (const m of milestones) {
      const key = `${line.lineId}:${day}:${m.t}`;
      if (pct >= m.t && !this.firedUsageKeys.has(key)) {
        this.firedUsageKeys.add(key);
        this.persistFiredUsageKeys();
        this.pushNotification(uid, m.msg, 'USAGE');
      }
    }
  }

  private usageKeysStorageKey(): string { return `usageNotified:${this.user?.id}`; }

  private loadFiredUsageKeys(): void {
    try {
      const raw = localStorage.getItem(this.usageKeysStorageKey());
      if (raw) this.firedUsageKeys = new Set<string>(JSON.parse(raw));
    } catch { /* ignore */ }
  }

  private persistFiredUsageKeys(): void {
    try { localStorage.setItem(this.usageKeysStorageKey(), JSON.stringify([...this.firedUsageKeys])); } catch { /* ignore */ }
  }

  private dailyDataHistoryStorageKey(): string { return `dailyDataHistory:${this.user?.id}`; }

  /** Restore the simulated day-by-day usage history on load. */
  private loadDailyDataHistory(): void {
    try {
      const raw = localStorage.getItem(this.dailyDataHistoryStorageKey());
      if (raw) this.dailyDataHistory = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  private persistDailyDataHistory(): void {
    try { localStorage.setItem(this.dailyDataHistoryStorageKey(), JSON.stringify(this.dailyDataHistory)); } catch { /* ignore */ }
  }

  /** Upsert today's entry in the history (keeping only the last 30 days) and persist it. */
  private recordTodayDataUsage(usedMb: number): void {
    const today = this.todayStr();
    const idx = this.dailyDataHistory.findIndex(d => d.date === today);
    if (idx >= 0) this.dailyDataHistory[idx] = { date: today, usedMb };
    else this.dailyDataHistory.push({ date: today, usedMb });
    this.dailyDataHistory = this.dailyDataHistory.slice(-30);
    this.persistDailyDataHistory();
  }

  renderUsageChart(): void {
    const ctx = document.getElementById('usageChart') as HTMLCanvasElement;
    if (!ctx) return;
    if (this.usageChart) this.usageChart.destroy();

    // Build the daily data trend from our own simulated history rather than the backend's
    // usage records, which are seeded in large lump sums (see dailyDataHistory).
    const history = [...this.dailyDataHistory].sort((a, b) => a.date.localeCompare(b.date));
    const labels = history.map(d => d.date.substring(5));                    // MM-DD
    const data = history.map(d => +((d.usedMb ?? 0) / 1024).toFixed(3));     // GB

    this.drawUsageChart(ctx, labels, data, this.dataPerDayLimitGb);
  }

  // ── Usage forecast / insights ────────────────────────────────────────────────
  get dataUsedGb(): number { return (this.usageSummary?.dataUsedMb ?? 0) / 1024; }
  /** Remaining = today's per-day data allowance minus what's been used today. */
  get dataRemainingGb(): number {
    const remMb = Math.max(0, this.planDataPerDayLimitMb - this.todayDataUsedMb);
    return remMb / 1024;
  }

  /** Hours remaining until the daily data allowance resets at midnight. */
  get dataRenewsInHours(): number {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1, Math.ceil((nextMidnight.getTime() - now.getTime()) / 3600000));
  }

  /** One bar per day, colored red when that day went over the daily cap, plus a dashed reference line at the cap. */
  private drawUsageChart(ctx: HTMLCanvasElement, labels: string[], data: number[], dailyCapGb: number): void {
    const barColors = data.map(v => (dailyCapGb > 0 && v > dailyCapGb) ? '#f43f5e' : '#3B4FE0');
    const datasets: any[] = [{
      type: 'bar',
      label: 'Data Used (GB)',
      data,
      backgroundColor: barColors,
      borderRadius: 6,
      maxBarThickness: 40
    }];
    if (dailyCapGb > 0) {
      datasets.push({
        type: 'line',
        label: 'Daily Limit (GB)',
        data: labels.map(() => dailyCapGb),
        borderColor: '#f59e0b',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0
      });
    }

    this.usageChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: {
            grid: { display: false },
            title: { display: true, text: 'Date (MM-DD)', font: { weight: 'bold' } }
          },
          y: {
            grid: { color: '#e2e8f0' },
            beginAtZero: true,
            title: { display: true, text: 'Data Used (GB)', font: { weight: 'bold' } }
          }
        }
      }
    });
  }
}
