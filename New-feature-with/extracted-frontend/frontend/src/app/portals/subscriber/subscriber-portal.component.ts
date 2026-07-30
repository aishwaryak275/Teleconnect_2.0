import { Component, OnInit, AfterViewInit, signal, computed, effect, HostListener } from '@angular/core';
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

@Component({
  selector: 'app-subscriber-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MyAccountModalComponent, PaginatePipe, PaginatorComponent],
  templateUrl: './subscriber-portal.component.html',
  styleUrls: ['./subscriber-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, shake, scaleIn]
})
export class SubscriberPortalComponent implements OnInit, AfterViewInit {
  // Pagination
  readonly pageSize = 8;
  invoicesPage = 1;
  requestsPage = 1;

  // Navigation
  activeTab = signal<string>('plan');
  isSidebarCollapsed = signal<boolean>(false);
  isNotificationOpen = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;
  isNewConnModalOpen = false;

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
  targetPlan: any = null;
  changeRequestForm!: FormGroup;
  isUpgradeModalOpen = false;

  // Usage tracking
  usageSummary: any = null;
  usageRecords: any[] = [];
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
  isDisputeModalOpen = false;
  disputeForm!: FormGroup;
  disputingInvoiceId: number | null = null;
  disputingInvoiceTotal = 0;

  // Service Requests & Tickets
  serviceRequests: any[] = [];
  newRequestForm!: FormGroup;
  isRequestModalOpen = false;
  newTicketForm!: FormGroup;
  isTicketModalOpen = false;

  // Chart reference
  private usageChart: Chart | null = null;

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
    this.loadData();
    this.initForms();
  }

  ngAfterViewInit(): void {
    this.notificationService.refreshNotifications();
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
      additionalDetails: ['', Validators.required]
    });

    this.newConnectionForm = this.fb.group({
      accountType: ['Prepaid', Validators.required],
      idProofReference: ['', [Validators.required, Validators.minLength(4)]],
      preferredPlanId: [1, Validators.required]
    });

    this.newTicketForm = this.fb.group({
      faultType: ['NoCoverage', Validators.required],
      description: ['', [Validators.required, Validators.minLength(10)]],
      priority: ['Medium', Validators.required]
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
      next: data => { this.myInvoices = data; },
      error: () => {}
    });
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
        if (list.length) {
          const latest = list.reduce((a, b) => ((b?.cycleId ?? 0) > (a?.cycleId ?? 0) ? b : a));
          const cycleId = latest?.cycleId ?? null;
          if (cycleId) { this.activeBillingCycleId = cycleId; this.loadSummaryForCycle(line, cycleId); return; }
        }
        // No invoice yet — fall back to the latest cycle the line already has usage for.
        this.deriveCycleFromUsageRecords(line);
      },
      error: () => this.deriveCycleFromUsageRecords(line)
    });
  }

  /** Fallback cycle resolution for lines without an invoice: use the newest cycle
   *  that already has usage records so the dashboard still renders. */
  private deriveCycleFromUsageRecords(line: any): void {
    this.usageService.getRecordsByLine(line.lineId).subscribe({
      next: (res: any) => {
        const records = Array.isArray(res?.records) ? res.records : (Array.isArray(res) ? res : []);
        const cycleId = records.reduce((m: number, r: any) => Math.max(m, Number(r?.billingCycleId ?? 0)), 0);
        if (cycleId > 0) { this.activeBillingCycleId = cycleId; this.loadSummaryForCycle(line, cycleId); }
      },
      error: () => {}
    });
  }

  /** Load the usage summary + records for a resolved line + cycle, seeding the
   *  summary if the active plan has none yet. */
  private loadSummaryForCycle(line: any, cycleId: number): void {
    this.usageService.getSummary(line.lineId, cycleId).subscribe({
      next: (summary) => {
        this.usageSummary = summary;
        if (this.activeTab() === 'usage') setTimeout(() => this.renderUsageChart(), 100);
      },
      error: () => {
        // No summary for this cycle yet. If the line has an active plan with real
        // entitlements, bootstrap usage tracking so the backend simulator starts
        // growing it (every 2 minutes).
        this.bootstrapUsageSummaryIfActivePlan(line, cycleId);
      }
    });
    this.loadUsageRecords(line.lineId, cycleId);
  }

  private loadUsageRecords(lineId: number, cycleId: number): void {
    this.usageService.getRecordsByCycle(lineId, cycleId).subscribe({
      next: (res: any) => {
        this.usageRecords = Array.isArray(res?.records) ? res.records
                          : (Array.isArray(res) ? res : []);
        if (this.activeTab() === 'usage') setTimeout(() => this.renderUsageChart(), 100);
      },
      error: () => { this.usageRecords = []; }
    });
  }

  loadServiceRequests(): void {
    this.ticketService.getRequests().subscribe(data => {
      this.serviceRequests = Array.isArray(data) ? data : [];
      const completedConnReq = this.serviceRequests.find((r: any) =>
        r.requestType === 'NewConnection' &&
        (r.requestedBy === this.user?.id || r.requestedBy === Number(this.user?.id)) &&
        r.status === 'C'
      );
      if (completedConnReq && (!this.account360 || !this.account360.accountId)) {
        this.loadData();
      }
    });
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
    // Re-pull the latest usage summary each time the dashboard is opened so it
    // stays in sync with the 10-minute simulator without a full page reload.
    if (tab === 'usage') this.loadUsage();
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
      ? `+91${this.user.phone.replace(/\D/g, '').slice(-10)}`
      : `+9198${String(accountId).padStart(4, '0')}${String(Date.now()).slice(-4)}`;
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
        this.iamService.recordAudit('PLAN_ACTIVATED', 'SUBSCRIBER');
        this.toastService.success(
          `${this.targetPlan.name} activated! ₹${totalAmount.toFixed(0)} paid via ${paymentMethod}.`
        );
        const accountId: number = this.account360?.accountId;
        if (accountId) {
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
    this.billingService.createBillingCycle(accountId, cycleStart, cycleEnd).subscribe({
      next: (cycle: any) => {
        const cycleId: number = cycle?.cycleId ?? cycle?.id;
        if (!cycleId) {
          this.toastService.error('Invoice not created: billing cycle ID missing.');
          return;
        }
        this.billingService.generateInvoice({
          accountId,
          cycleId,
          planCharges: planPrice,
          excessCharges: 0,
          addOnCharges: 0,
          taxes
        }).subscribe({
          next: () => {
            this.toastService.success('Invoice generated successfully.');
            // Bootstrap usage tracking for this line+cycle so it starts accumulating.
            this.seedUsageTracking(lineId, cycleId, plan);
            setTimeout(() => this.loadInvoices(), 500);
          },
          error: (err: any) => {
            const msg = err.error?.message ?? `HTTP ${err.status}`;
            this.toastService.error('Invoice generation failed: ' + msg);
          }
        });
      },
      error: (err: any) => {
        const msg = err.error?.message ?? `HTTP ${err.status}`;
        this.toastService.error('Billing cycle creation failed: ' + msg);
      }
    });
  }

  /**
   * Create a zero-usage record so the backend seeds a UsageSummary (with this plan's
   * limits) for the line+cycle. Once the summary exists the scheduled usage simulator
   * grows it over time, so a newly activated plan starts tracking immediately.
   */
  /**
   * When the active cycle has no usage summary yet, seed one (only if the line
   * carries an active plan with real entitlements) and then reload it. The backend
   * upserts the summary, so this is safe to call once whenever the summary is missing.
   * The usage simulator takes over from there, updating the values every 10 minutes.
   */
  private bootstrapUsageSummaryIfActivePlan(line: any, cycleId: number): void {
    const sub = line?.activeSubscription;
    if (!sub || sub.status !== 'A') return;

    // Resolve the plan's entitlements. The enriched subscription plan may be a bare
    // stub if the plan catalogue hadn't loaded during account enrichment, so fall
    // back to looking the plan up by planId from the (now-loaded) catalogue.
    let plan = sub.plan;
    if (!(Number(plan?.dataGb) > 0) && sub.planId) {
      const fromCatalogue = this.availablePlans().find((p: any) => p.planId === sub.planId);
      if (fromCatalogue) plan = fromCatalogue;
    }

    const dataLimitMb = Number(plan?.dataGb ?? 0) * 1024;
    const voiceLimitMin = Number(plan?.voiceMinutes ?? 0);
    const smsLimit = Number(plan?.smsCount ?? 0);
    if (dataLimitMb <= 0 && voiceLimitMin <= 0 && smsLimit <= 0) {
      console.warn('[Usage] Skipping bootstrap — no plan entitlements found for line', line?.lineId);
      return;
    }

    // Seed the summary, then load it *after* the create succeeds (no timing race).
    this.usageService.createRecord({
      lineId: line.lineId,
      billingCycleId: cycleId,
      usageType: 'DATA',
      quantity: 1, // backend requires quantity > 0; 1 MB is a negligible seed
      usageDate: new Date().toISOString().slice(0, 19),
      dataLimitMb,
      voiceLimitMin,
      smsLimit
    }).subscribe({
      next: () => {
        this.usageService.getSummary(line.lineId, cycleId).subscribe({
          next: (summary) => {
            this.usageSummary = summary;
            this.loadUsageRecords(line.lineId, cycleId);
            if (this.activeTab() === 'usage') setTimeout(() => this.renderUsageChart(), 100);
          },
          error: (err) => console.error('[Usage] Seeded record but summary still missing:', err?.status, err?.error)
        });
      },
      error: (err) => console.error('[Usage] Failed to seed usage tracking:', err?.status, err?.error)
    });
  }

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
        this.iamService.recordAudit('ADDON_ACTIVATED', 'SUBSCRIBER');
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
  openRequestModal(): void {
    this.isRequestModalOpen = true;
  }

  closeRequestModal(): void {
    this.isRequestModalOpen = false;
    this.newRequestForm.reset({ requestType: 'PlanChange' });
  }

  submitServiceRequest(): void {
    if (this.newRequestForm.invalid || !this.account360) return;

    const lineId = this.account360.lines[0]?.lineId || null;
    this.ticketService.createRequest({
      accountId: this.account360.accountId,
      lineId,
      requestType: this.newRequestForm.value.requestType,
      additionalDetails: this.newRequestForm.value.additionalDetails
    }).subscribe({
      next: () => {
        this.iamService.recordAudit('SERVICE_REQUEST_SUBMITTED', 'SUBSCRIBER');
        this.toastService.success('Service request raised successfully.');
        this.closeRequestModal();
        this.loadServiceRequests();
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Failed to submit service request.');
      }
    });
  }

  openTicketModal(): void {
    this.isTicketModalOpen = true;
  }

  closeTicketModal(): void {
    this.isTicketModalOpen = false;
    this.newTicketForm.reset({ faultType: 'NoCoverage', priority: 'Medium' });
  }

  submitFaultTicket(): void {
    if (this.newTicketForm.invalid || !this.account360) return;

    const lineId = this.account360.lines[0]?.lineId || null;
    // Backend expects the priority code (L/M/H/C), not the display word.
    const priorityCode: Record<string, string> = { Low: 'L', Medium: 'M', High: 'H', Critical: 'C' };
    const rawPriority = this.newTicketForm.value.priority;
    this.ticketService.createFaultTicket({
      accountId: this.account360.accountId,
      lineId,
      faultType: this.newTicketForm.value.faultType,
      description: this.newTicketForm.value.description,
      priority: priorityCode[rawPriority] ?? rawPriority ?? 'M',
      raisedDate: new Date().toISOString().split('T')[0]   // backend requires a LocalDate; status defaults to O (Open) server-side
    }).subscribe({
      next: () => {
        this.iamService.recordAudit('FAULT_TICKET_SUBMITTED', 'SUBSCRIBER');
        this.toastService.success('Fault ticket registered in NOC tracking queues.');
        this.closeTicketModal();
        this.loadData(); // reload tickets
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Failed to register fault ticket.');
      }
    });
  }

  // ==========================================
  // Usage progress calculators & charts
  // ==========================================
  getDataPerDay(p: any): string {
    if (!p?.dataGb || !p?.validityDays) return 'Unlimited';
    const perDay = (p.dataGb / p.validityDays);
    return perDay >= 1 ? perDay.toFixed(1) + ' GB/Day' : (perDay * 1024).toFixed(0) + ' MB/Day';
  }

  /** True once a usage summary has been loaded for the active cycle. */
  get hasUsageData(): boolean { return !!this.usageSummary; }

  // ── Plan limits (denominators) ────────────────────────────────────────────────
  // The subscribed plan is the single source of truth for entitlements. A limit of
  // 0 (or missing) means the plan is *unlimited* for that metric — e.g. unlimited
  // voice — and must NOT be rendered as "100% used".
  private get plan(): any {
    const sub = this.account360?.lines?.[0]?.activeSubscription;
    if (!sub) return null;
    // If the enriched plan is a stub (no entitlements), resolve it from the loaded
    // plan catalogue by planId so limits/unlimited flags are always accurate.
    if (Number(sub.plan?.dataGb) > 0) return sub.plan;
    return this.availablePlans().find((p: any) => p.planId === sub.planId) ?? sub.plan ?? null;
  }

  get dataLimitGb(): number { return Math.max(0, Number(this.plan?.dataGb ?? 0)); }
  get voiceLimitMin(): number { return Math.max(0, Number(this.plan?.voiceMinutes ?? 0)); }
  get smsLimit(): number { return Math.max(0, Number(this.plan?.smsCount ?? 0)); }

  get isDataUnlimited(): boolean { return this.dataLimitGb <= 0; }
  get isVoiceUnlimited(): boolean { return this.voiceLimitMin <= 0; }
  get isSmsUnlimited(): boolean { return this.smsLimit <= 0; }

  // ── Used values (from the backend summary) ─────────────────────────────────────
  get voiceUsedMin(): number { return Number(this.usageSummary?.voiceUsedMin ?? 0); }
  get smsUsed(): number { return Number(this.usageSummary?.smsUsed ?? 0); }

  // ── Remaining values (derived: limit − used, so cards always stay consistent) ──
  get voiceRemainingMin(): number {
    return this.isVoiceUnlimited ? 0 : Math.max(0, this.voiceLimitMin - this.voiceUsedMin);
  }
  get smsRemaining(): number {
    return this.isSmsUnlimited ? 0 : Math.max(0, this.smsLimit - this.smsUsed);
  }

  // ── Usage percentages (used / limit — matches the reference design) ────────────
  getDataPercentage(): number {
    return this.isDataUnlimited ? 0 : Math.min(100, Math.round((this.dataUsedGb / this.dataLimitGb) * 100));
  }
  getVoicePercentage(): number {
    return this.isVoiceUnlimited ? 0 : Math.min(100, Math.round((this.voiceUsedMin / this.voiceLimitMin) * 100));
  }
  getSmsPercentage(): number {
    return this.isSmsUnlimited ? 0 : Math.min(100, Math.round((this.smsUsed / this.smsLimit) * 100));
  }

  // ── Remaining percentages (remaining / limit — drives the meter widths) ────────
  getDataRemainingPercentage(): number {
    return this.isDataUnlimited ? 100 : Math.max(0, Math.min(100, Math.round((this.dataRemainingGb / this.dataLimitGb) * 100)));
  }
  getVoiceRemainingPercentage(): number {
    return this.isVoiceUnlimited ? 100 : Math.max(0, Math.min(100, Math.round((this.voiceRemainingMin / this.voiceLimitMin) * 100)));
  }
  getSmsRemainingPercentage(): number {
    return this.isSmsUnlimited ? 100 : Math.max(0, Math.min(100, Math.round((this.smsRemaining / this.smsLimit) * 100)));
  }

  /** Status label for the Limit Status Panel — crosses the 90% warning threshold. */
  limitStatusLabel(pct: number): string {
    return pct >= 90 ? `${pct}% · 90% threshold crossed` : `${pct}% · Normal`;
  }
  /** True when the metric has crossed the 90% warning threshold (renders red). */
  limitStatusCritical(pct: number): boolean { return pct >= 90; }

  getDashOffset(percentage: number): number {
    // Ring circumference is 2 * PI * r = 2 * 3.1415 * 40 = 251.2
    const circumference = 251.2;
    return circumference - (percentage / 100) * circumference;
  }

  renderUsageChart(): void {
    const ctx = document.getElementById('usageChart') as HTMLCanvasElement;
    if (!ctx) return;
    if (this.usageChart) this.usageChart.destroy();

    // Build the daily data trend from the subscriber's own usage records
    // (USAGE_RECORDS authority) — the /analytics endpoint needs USAGE_ANALYTICS
    // which subscribers don't have.
    const dataRecords = (this.usageRecords ?? [])
      .filter((r: any) => String(r?.usageType ?? '').toUpperCase() === 'DATA');

    const byDay = new Map<string, number>();
    for (const r of dataRecords) {
      const day = String(r?.usageDate ?? '').substring(0, 10);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + Number(r?.quantity ?? 0));
    }
    const days = [...byDay.keys()].sort();
    const labels = days.map(d => d.substring(5));              // MM-DD
    const data = days.map(d => +(((byDay.get(d) ?? 0)) / 1024).toFixed(3)); // GB

    this.drawUsageChart(ctx, labels, data);
  }

  // ── Usage forecast / insights ────────────────────────────────────────────────
  get dataUsedGb(): number { return (this.usageSummary?.dataUsedMb ?? 0) / 1024; }
  get dataRemainingGb(): number {
    return this.isDataUnlimited ? 0 : Math.max(0, this.dataLimitGb - this.dataUsedGb);
  }

  /** Average data consumed per active day this cycle, in MB. */
  get avgDailyDataMb(): number {
    const dataRecords = (this.usageRecords ?? [])
      .filter((r: any) => String(r?.usageType ?? '').toUpperCase() === 'DATA');
    const days = new Set(dataRecords.map((r: any) => String(r?.usageDate ?? '').substring(0, 10))).size;
    const totalMb = dataRecords.reduce((s: number, r: any) => s + Number(r?.quantity ?? 0), 0);
    return days > 0 ? totalMb / days : 0;
  }

  /** Projected days until data runs out at the current pace (null if unknown). */
  get usageRunwayDays(): number | null {
    const remainingMb = this.usageSummary?.dataRemainingMb ?? 0;
    const avg = this.avgDailyDataMb;
    if (avg <= 0) return null;
    return Math.max(0, Math.round(remainingMb / avg));
  }

  private drawUsageChart(ctx: HTMLCanvasElement, labels: string[], data: number[]): void {
    this.usageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Data (GB)',
          data,
          backgroundColor: '#3b82f6',
          hoverBackgroundColor: '#2563eb',
          borderRadius: 6,
          maxBarThickness: 34
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: any) => `${Number(c.raw).toFixed(2)} GB` } }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#e2e8f0' }, beginAtZero: true }
        }
      }
    });
  }
}
