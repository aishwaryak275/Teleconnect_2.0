import { Component, OnInit, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, User } from '../../core/services/auth.service';
import { AccountService } from '../../core/services/account.service';
import { IamService } from '../../core/services/iam.service';
import { PlanService } from '../../core/services/plan.service';
import { BillingService } from '../../core/services/billing.service';
import { TicketService } from '../../core/services/ticket.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { fadeInUp, staggerFadeIn, shake, scaleIn, slideHorizontal } from '../../shared/animations';
import { MyAccountModalComponent } from '../../shared/my-account-modal/my-account-modal.component';
import { PaginatePipe } from '../../shared/pagination/paginate.pipe';
import { PaginatorComponent } from '../../shared/pagination/paginator.component';

@Component({
  selector: 'app-agent-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MyAccountModalComponent, PaginatePipe, PaginatorComponent],
  templateUrl: './agent-portal.component.html',
  styleUrls: ['./agent-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, shake, scaleIn, slideHorizontal]
})
export class AgentPortalComponent implements OnInit {
  activeTab = signal<string>('search');
  isSidebarCollapsed = signal<boolean>(false);
  isNotificationOpen = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isProfileDropdownOpen = false;
  }

  toggleProfileDropdown(event: Event): void {
    event.stopPropagation();
    this.isProfileDropdownOpen = !this.isProfileDropdownOpen;
  }

  // User session
  user!: User;

  // Client-side pagination
  readonly pageSize = 8;
  searchResultsPage = 1;
  requestsPage = 1;
  catalogSubTab = 'plans';
  plansPage = 1;
  addOnsPage = 1;

  // Search Screen
  searchQuery = '';
  searchResults: any[] = [];
  selectedAccount360: any = null;
  isSearching = false;

  /** True when the selected account already has at least one Active SIM line. */
  get hasActiveLine(): boolean {
    return !!this.selectedAccount360?.lines?.some((l: any) => l?.status === 'Active');
  }

  // Request Handler Queue
  requestsQueue: any[] = [];
  filterStatus = 'All';

  // Fault Ticket Form
  faultForm!: FormGroup;
  isSubmittingFault = false;

  // User Directory
  iamUsers: any[] = [];
  userPage = 0;
  readonly userPageSize = 10;
  searchName = '';
  searchEmail = '';
  searchPhone = '';
  searchRole = '';
  searchStatus = '';

  // Register New User Modal
  showRegisterModal = false;
  registerForm!: FormGroup;
  isRegisteringUser = false;

  // Create Subscriber Account & Add SIM Modals
  showCreateAccountModal = false;
  selectedSubscriberUser: any = null;
  createAccountForm!: FormGroup;
  isCreatingAccount = false;

  showAccountCreatedSuccessModal = false;
  createdAccountId: number | null = null;

  showAddSimModal = false;
  simForm!: FormGroup;
  isActivatingSim = false;

  // Plan Change Wizard
  wizardStep = signal<number>(1); // 1: Select Line, 2: Compare Plans, 3: Select Date, 4: Confirm
  wizardForm!: FormGroup;
  availablePlans: any[] = [];
  selectedWizardLine: any = null;
  selectedWizardPlan: any = null;

  // Plan Provision Modal
  isPlanProvisionOpen = signal(false);
  provisionLine: any = null;
  provisionSelectedPlan: any = null;
  provisionSelectedAddOn: any = null;
  provisionAddOns: any[] = [];
  provisionPlans: any[] = [];
  account360Invoices: any[] = [];

  // Plan Catalog (read-only reference)
  catalogPlans: any[] = [];
  catalogAddOns: any[] = [];

  constructor(
    public authService: AuthService,
    private accountService: AccountService,
    private iamService: IamService,
    private planService: PlanService,
    private billingService: BillingService,
    private ticketService: TicketService,
    public notificationService: NotificationService,
    private toastService: ToastService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.user = this.authService.currentUser()!;
    this.initForms();
    this.loadRequests();
    this.loadPlans();
    // Preload add-ons so Customer 360 can resolve an attached add-on's name.
    this.planService.getAddOns().subscribe({ next: (d) => this.catalogAddOns = d, error: () => {} });
  }

  initForms(): void {
    this.faultForm = this.fb.group({
      accountId: ['', Validators.required],
      lineId: ['', Validators.required],
      faultType: ['NoCoverage', Validators.required],
      priority: ['Medium', Validators.required],
      description: ['', [Validators.required, Validators.minLength(10)]]
    });

    this.wizardForm = this.fb.group({
      effectiveDate: ['', Validators.required]
    });

    this.registerForm = this.fb.group({
      name:     ['', [Validators.required, Validators.minLength(2)]],
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      phone:    ['', Validators.pattern('^[0-9]{10}$')],
      regionId: [null]
    });

    this.createAccountForm = this.fb.group({
      accountType: ['Prepaid', Validators.required],
      kycStatus:   ['Pending', Validators.required]
    });

    this.simForm = this.fb.group({
      msisdn:      [{ value: '', disabled: true }, Validators.required],
      serviceType: ['VoiceData', Validators.required],
      iccid:       ['', [Validators.required, Validators.maxLength(22)]]
    });
  }

  loadRequests(): void {
    this.ticketService.getRequests().subscribe({
      next: (data) => this.requestsQueue = data,
      error: () => this.toastService.error('Failed to load service requests queue.')
    });
  }

  loadPlans(): void {
    this.planService.getPlans(true).subscribe(data => {
      this.availablePlans = data;
    });
  }

  // ==========================================
  // Layout Handlers
  // ==========================================
  setTab(tab: string): void {
    this.activeTab.set(tab);
    this.isNotificationOpen.set(false);
    if (tab === 'users') this.loadIamUsers();
    if (tab === 'catalog') this.loadCatalog();
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

  logout(): void {
    this.authService.logout();
  }

  // ── Register New User Modal ────────────────────────────────────────────────
  openRegisterModal(): void {
    this.registerForm.reset();
    this.showRegisterModal = true;
  }

  closeRegisterModal(): void {
    this.showRegisterModal = false;
    this.registerForm.reset();
  }

  submitRegisterUser(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.toastService.error('Please fill in all required fields correctly.');
      return;
    }
    this.isRegisteringUser = true;
    const { name, email, password, phone, regionId } = this.registerForm.value;
    this.authService.register({
      name,
      email,
      password,
      phone: phone || undefined,
      regionId: regionId ? Number(regionId) : undefined
    }).subscribe({
      next: () => {
        this.isRegisteringUser = false;
        this.iamService.recordAudit('USER_REGISTERED', 'IAM');
        this.toastService.success(`Subscriber "${name}" registered successfully.`);
        this.closeRegisterModal();
        this.loadIamUsers();
      },
      error: (err) => {
        this.isRegisteringUser = false;
        const msg = err?.error?.message || 'Registration failed. Email or phone number may already be in use.';
        this.toastService.error(msg);
      }
    });
  }

  // ── User Directory ─────────────────────────────────────────────────────────
  loadIamUsers(): void {
    this.userPage = 0;
    this.iamService.searchUsers({}).subscribe({
      next: (users) => { this.iamUsers = users; this.enrichUsersWithAccountStatus(); },
      error: () => this.toastService.error('Failed to load users.')
    });
  }

  private enrichUsersWithAccountStatus(): void {
    this.accountService.getAllAccounts().subscribe({
      next: (accounts) => {
        const activeIds = new Set<number>(
          accounts.filter((a: any) => a.status === 'Active').map((a: any) => Number(a.subscriberId))
        );
        this.iamUsers = this.iamUsers.map((u: any) => ({
          ...u,
          hasActiveAccount: activeIds.has(Number(u.userId))
        }));
      },
      error: () => {}
    });
  }

  searchUsers(): void {
    this.userPage = 0;
    this.iamService.searchUsers({
      name: this.searchName || undefined,
      email: this.searchEmail || undefined,
      phone: this.searchPhone || undefined,
      role: this.searchRole || undefined,
      status: this.searchStatus || undefined
    }).subscribe({
      next: (users) => { this.iamUsers = users; this.enrichUsersWithAccountStatus(); },
      error: () => this.toastService.error('User search failed.')
    });
  }

  clearUserSearch(): void {
    this.searchName = ''; this.searchEmail = ''; this.searchPhone = '';
    this.searchRole = ''; this.searchStatus = '';
    this.userPage = 0;
    this.loadIamUsers();
  }

  get paginatedUsers(): any[] {
    const start = this.userPage * this.userPageSize;
    return this.iamUsers.slice(start, start + this.userPageSize);
  }

  get userTotalPages(): number {
    return Math.ceil(this.iamUsers.length / this.userPageSize);
  }

  userNextPage(): void { if (this.userPage < this.userTotalPages - 1) this.userPage++; }
  userPrevPage(): void { if (this.userPage > 0) this.userPage--; }

  getRoleBadgeClasses(role: string): string {
    const map: Record<string, string> = {
      A: 'bg-rose-600', CS: 'bg-blue-600', B: 'bg-amber-600',
      N: 'bg-emerald-600', C: 'bg-purple-600', S: 'bg-slate-500'
    };
    return `${map[role] ?? 'bg-slate-500'} text-white text-[10px] font-bold w-7 h-7 rounded-full flex items-center justify-center`;
  }

  getStatusBadgeClasses(status: string): string {
    const map: Record<string, string> = {
      A: 'bg-emerald-100 text-emerald-700', S: 'bg-amber-100 text-amber-700', I: 'bg-rose-100 text-rose-700'
    };
    return `${map[status] ?? 'bg-slate-100 text-slate-600'} px-2.5 py-0.5 rounded-full text-xs font-semibold`;
  }

  getStatusLabel(status: string): string {
    return ({ A: 'Active', S: 'Suspended', I: 'Inactive' } as Record<string, string>)[status] ?? status;
  }

  getRoleLabel(role: string): string {
    return ({ A: 'Admin', CS: 'Customer Service Agent', B: 'Billing Executive', N: 'Network Operations Engineer', C: 'Compliance Officer', S: 'Subscriber' } as Record<string, string>)[role] ?? role;
  }

  // Replace SIM Modal
  showReplaceSimModal = false;
  selectedLineForReplace: any = null;
  replaceIccid = '';
  isReplacingSim = false;

  // Service Type Modal
  showServiceTypeModal = false;
  selectedLineForServiceType: any = null;
  newServiceType = 'VoiceData';
  isUpdatingServiceType = false;

  // MSISDN Lookup
  msisdnLookupQuery = '';
  isLookingUpMsisdn = false;

  // ==========================================
  // Account Search & 360 View
  // ==========================================
  onSearch(): void {
    const query = this.searchQuery.trim();
    if (!query) {
      this.toastService.error('Please enter a search query.');
      return;
    }
    // Detect MSISDN: starts with + and digits, or 10-15 pure digits
    const isMsisdn = /^\+\d{8,15}$/.test(query) || /^\d{10,15}$/.test(query);
    if (isMsisdn) {
      this.isSearching = true;
      this.accountService.lookupByMsisdn(query).subscribe({
        next: (line) => {
          this.isSearching = false;
          this.searchResults = [];
          if (line?.accountId) {
            this.selectAccount(line.accountId);
          } else {
            this.toastService.error('No subscriber found for that phone number.');
          }
        },
        error: () => {
          this.iamService.searchUsers({ phone: query }).subscribe({
            next: (users) => {
              const sub = users.find((u: any) => u.roleName === 'S' || u.roleName === 'Subscriber');
              if (sub) {
                this.accountService.getAccountsBySubscriberId(sub.userId).subscribe({
                  next: (accounts) => {
                    this.isSearching = false;
                    this.searchResults = [];
                    if (accounts?.length > 0) { this.selectAccount(accounts[0].accountId); }
                    else { this.toastService.error('No subscriber account found for that phone number.'); }
                  },
                  error: () => { this.isSearching = false; this.toastService.error('No subscriber found for that phone number.'); }
                });
              } else {
                this.isSearching = false;
                this.toastService.error('No subscriber found for that phone number.');
              }
            },
            error: () => { this.isSearching = false; this.toastService.error('No subscriber found for that phone number.'); }
          });
        }
      });
      return;
    }
    // Pure integer (1-9 digits) → try Account ID first, then Line ID
    const isId = /^\d{1,9}$/.test(query);
    if (isId) {
      const id = parseInt(query, 10);
      this.isSearching = true;
      this.accountService.getAccount360(id).subscribe({
        next: (account) => {
          this.isSearching = false;
          this.searchResults = [];
          if (account?.accountId) {
            this.selectAccount(account.accountId);
          } else {
            this.toastService.error('No account found for that ID.');
          }
        },
        error: () => {
          // Account ID not found — try as Line ID
          this.accountService.lookupByLineId(id).subscribe({
            next: (line) => {
              this.isSearching = false;
              this.searchResults = [];
              if (line?.accountId) {
                this.selectAccount(line.accountId);
              } else {
                this.toastService.error('No subscriber found for that ID.');
              }
            },
            error: () => {
              this.isSearching = false;
              this.toastService.error('No account or SIM line found for that ID.');
            }
          });
        }
      });
      return;
    }
    this.isSearching = true;
    this.accountService.searchAccounts(query).subscribe({
      next: (data) => {
        this.searchResults = data;
        this.searchResultsPage = 1;
        this.isSearching = false;
        this.selectedAccount360 = null;
        if (data.length === 0) {
          this.toastService.success('No records found.');
        }
      },
      error: () => {
        this.isSearching = false;
        this.toastService.error('Account lookup failed.');
      }
    });
  }

  lookupMsisdn(): void {
    if (!this.msisdnLookupQuery.trim()) {
      this.toastService.error('Please enter MSISDN / mobile number.');
      return;
    }
    this.isLookingUpMsisdn = true;
    this.accountService.lookupByMsisdn(this.msisdnLookupQuery.trim()).subscribe({
      next: (line) => {
        this.isLookingUpMsisdn = false;
        if (line && line.accountId) {
          this.toastService.success(`Found SIM line for MSISDN ${line.msisdn} on Account #${line.accountId}.`);
          this.selectAccount(line.accountId);
        } else {
          this.toastService.error('No SIM line found matching MSISDN.');
        }
      },
      error: () => {
        this.isLookingUpMsisdn = false;
        this.toastService.error('MSISDN lookup failed.');
      }
    });
  }

  selectAccount(id: number): void {
    this.billingService.getInvoicesByAccount(id).subscribe({
      next: (invoices) => this.account360Invoices = invoices ?? [],
      error: () => this.account360Invoices = []
    });
    this.accountService.getAccount360(id).subscribe({
      next: (account) => {
        this.accountService.getSimLines(id).subscribe({
          next: (lines) => {
            // Enrich lines with activeSubscription + plan (same as subscriber portal)
            this.planService.getAllSubscriptions().subscribe({
              next: (subs: any[]) => {
                const enrichedLines = lines.map((line: any) => {
                  const sub = subs.find((s: any) => s.lineId === line.lineId && s.status === 'A');
                  if (!sub) return line;
                  const plan = this.availablePlans.find((p: any) => p.planId === sub.planId) ?? { planId: sub.planId };
                  const addOn = sub.addOnId ? (this.catalogAddOns.find((a: any) => a.addOnId === sub.addOnId) ?? null) : null;
                  return { ...line, activeSubscription: { ...sub, plan, addOn } };
                });
                this.iamService.getUser(account.subscriberId).subscribe({
                  next: (user) => {
                    this.selectedAccount360 = { ...account, subscriber: user, lines: enrichedLines, tickets: [] };
                    this.faultForm.patchValue({ accountId: account.accountId, lineId: enrichedLines?.[0]?.lineId || '' });
                  },
                  error: () => {
                    this.selectedAccount360 = { ...account, subscriber: null, lines: enrichedLines, tickets: [] };
                    this.faultForm.patchValue({ accountId: account.accountId });
                  }
                });
              },
              error: () => {
                // Fallback: use lines without subscription enrichment
                this.iamService.getUser(account.subscriberId).subscribe({
                  next: (user) => {
                    this.selectedAccount360 = { ...account, subscriber: user, lines, tickets: [] };
                    this.faultForm.patchValue({ accountId: account.accountId, lineId: lines?.[0]?.lineId || '' });
                  },
                  error: () => {
                    this.selectedAccount360 = { ...account, subscriber: null, lines, tickets: [] };
                    this.faultForm.patchValue({ accountId: account.accountId });
                  }
                });
              }
            });
          },
          error: () => {
            this.selectedAccount360 = { ...account, subscriber: null, lines: [], tickets: [] };
            this.faultForm.patchValue({ accountId: account.accountId });
          }
        });
      },
      error: () => this.toastService.error('Failed to load 360-degree profile details.')
    });
  }

  updateAccountStatus(accountId: number, status: string): void {
    this.accountService.updateAccountStatus(accountId, status).subscribe({
      next: () => {
        this.iamService.recordAudit('ACCOUNT_STATUS_UPDATED', 'SUBSCRIBER');
        const uid = this.selectedAccount360?.subscriberId ?? this.selectedAccount360?.subscriber?.userId;
        const msg = status === 'Suspended' ? 'Your account has been suspended. Please contact support.'
          : (status === 'Active' ? 'Your account is active again.'
          : `Your account status is now ${status}.`);
        this.pushNotification(uid, msg, 'COMPLIANCE');
        this.toastService.success(`Account #${accountId} status updated to ${status}.`);
        if (this.selectedAccount360?.accountId === accountId) {
          this.selectAccount(accountId);
        }
      },
      error: () => this.toastService.error('Failed to update account status.')
    });
  }

  updateAccountKyc(accountId: number, kycStatus: string): void {
    this.accountService.updateKycStatus(accountId, kycStatus).subscribe({
      next: () => {
        this.iamService.recordAudit('ACCOUNT_KYC_UPDATED', 'SUBSCRIBER');
        const uid = this.selectedAccount360?.subscriberId ?? this.selectedAccount360?.subscriber?.userId;
        const msg = kycStatus === 'Verified' ? 'Your KYC has been verified.'
          : (kycStatus === 'Expired' ? 'Your KYC expired — please re-submit documents.'
          : `Your KYC status is now ${kycStatus}.`);
        this.pushNotification(uid, msg, 'COMPLIANCE');
        this.toastService.success(`Account #${accountId} KYC status updated to ${kycStatus}.`);
        if (this.selectedAccount360?.accountId === accountId) {
          this.selectAccount(accountId);
        }
      },
      error: () => this.toastService.error('Failed to update KYC status.')
    });
  }

  updateSimStatus(accountId: number, lineId: number, newStatus: string): void {
    this.accountService.updateSimStatus(accountId, lineId, newStatus).subscribe({
      next: () => {
        this.iamService.recordAudit('SIM_STATUS_UPDATED', 'SUBSCRIBER');
        this.toastService.success(`SIM Line #${lineId} status updated to ${newStatus}.`);
        if (this.selectedAccount360?.accountId === accountId) {
          this.selectAccount(accountId);
        }
      },
      error: () => this.toastService.error('Failed to update SIM line status.')
    });
  }

  openReplaceSimModal(line: any): void {
    this.selectedLineForReplace = line;
    this.replaceIccid = '';
    this.showReplaceSimModal = true;
  }

  closeReplaceSimModal(): void {
    this.showReplaceSimModal = false;
    this.selectedLineForReplace = null;
  }

  submitReplaceSim(): void {
    if (!this.selectedLineForReplace || !this.replaceIccid.trim() || !this.selectedAccount360) return;
    this.isReplacingSim = true;
    const accountId = this.selectedAccount360.accountId;
    const lineId = this.selectedLineForReplace.lineId;

    this.accountService.replaceSim(accountId, lineId, this.replaceIccid.trim()).subscribe({
      next: () => {
        this.isReplacingSim = false;
        this.iamService.recordAudit('SIM_REPLACED', 'SUBSCRIBER');
        this.toastService.success(`SIM line #${lineId} chip replaced successfully.`);
        this.closeReplaceSimModal();
        this.selectAccount(accountId);
      },
      error: (err) => {
        this.isReplacingSim = false;
        this.toastService.error(err.error?.message ?? 'Failed to replace SIM line chip.');
      }
    });
  }

  openChangeServiceTypeModal(line: any): void {
    this.selectedLineForServiceType = line;
    this.newServiceType = line.serviceType || 'VoiceData';
    this.showServiceTypeModal = true;
  }

  closeChangeServiceTypeModal(): void {
    this.showServiceTypeModal = false;
    this.selectedLineForServiceType = null;
  }

  submitChangeServiceType(): void {
    if (!this.selectedLineForServiceType || !this.selectedAccount360) return;
    this.isUpdatingServiceType = true;
    const accountId = this.selectedAccount360.accountId;
    const lineId = this.selectedLineForServiceType.lineId;

    this.accountService.updateServiceType(accountId, lineId, this.newServiceType).subscribe({
      next: () => {
        this.isUpdatingServiceType = false;
        this.iamService.recordAudit('SIM_SERVICE_TYPE_UPDATED', 'SUBSCRIBER');
        this.toastService.success(`SIM line #${lineId} service type updated to ${this.newServiceType}.`);
        this.closeChangeServiceTypeModal();
        this.selectAccount(accountId);
      },
      error: (err) => {
        this.isUpdatingServiceType = false;
        this.toastService.error(err.error?.message ?? 'Failed to update service type.');
      }
    });
  }

  // Masking helper
  maskMsisdn(msisdn: string): string {
    if (!msisdn) return '';
    return msisdn.substring(0, 2) + 'XXXXXX' + msisdn.substring(msisdn.length - 2);
  }

  // ==========================================
  // Service Request Handler
  // ==========================================
  getFilteredRequests(): any[] {
    if (this.filterStatus === 'All') return this.requestsQueue;
    // Chips use words; backend stores status codes (O/P/C/X). Match either.
    const codeMap: Record<string, string> = { Open: 'O', InProgress: 'P', Completed: 'C', Cancelled: 'X' };
    const target = codeMap[this.filterStatus] ?? this.filterStatus;
    return this.requestsQueue.filter(r => r.status === target || r.status === this.filterStatus);
  }

  setRequestFilter(status: string): void {
    this.filterStatus = status;
    this.requestsPage = 1;
  }

  approvingRequestId: number | null = null;

  updateRequest(id: number, status: string): void {
    this.ticketService.updateRequestStatus(id, status).subscribe({
      next: () => {
        this.toastService.success(`Request #${id} status updated to ${status}.`);
        this.loadRequests();
      },
      error: () => this.toastService.error('Failed to update service request status.')
    });
  }

  approveConnectionRequest(requestId: number): void {
    this.approvingRequestId = requestId;
    this.ticketService.approveConnection(requestId).subscribe({
      next: (res) => {
        this.approvingRequestId = null;
        this.toastService.success(res?.message || `Request #${requestId} connection approved and provisioned successfully.`);
        this.loadRequests();
      },
      error: (err) => {
        this.approvingRequestId = null;
        const msg = err?.error?.message || err?.message || 'Connection approval failed during provisioning.';
        this.toastService.error(msg);
      }
    });
  }

  rejectConnectionRequest(requestId: number): void {
    const reason = prompt('Please enter rejection reason:', 'Document / KYC verification failed');
    if (reason === null) return;
    this.ticketService.updateRequestStatus(requestId, 'X').subscribe({
      next: () => {
        this.toastService.success(`Request #${requestId} rejected.`);
        this.loadRequests();
      },
      error: () => this.toastService.error('Failed to reject connection request.')
    });
  }

  // ==========================================
  // Fault Ticket Creation
  // ==========================================
  submitFaultTicket(): void {
    if (this.faultForm.invalid) {
      this.toastService.error('Please fill in all mandatory fault parameters.');
      return;
    }
    this.isSubmittingFault = true;
    const v = this.faultForm.value;
    // Backend needs a LocalDate raisedDate and the priority CODE (L/M/H/C).
    const priorityCode: Record<string, string> = { Low: 'L', Medium: 'M', High: 'H', Critical: 'C' };
    this.ticketService.createFaultTicket({
      accountId: Number(v.accountId),
      lineId: v.lineId ? Number(v.lineId) : null,
      faultType: v.faultType,
      description: v.description,
      priority: priorityCode[v.priority] ?? v.priority ?? 'M',
      raisedDate: new Date().toISOString().split('T')[0]
    }).subscribe({
      next: () => {
        this.isSubmittingFault = false;
        this.iamService.recordAudit('FAULT_TICKET_RAISED', 'AGENT');
        this.toastService.success('Fault ticket raised and routed to Network Ops (NOC).');
        this.faultForm.reset({ faultType: 'NoCoverage', priority: 'Medium', accountId: '', lineId: '', description: '' });
      },
      error: (err) => {
        this.isSubmittingFault = false;
        this.toastService.error(err?.error?.message || 'Failed to create fault ticket.');
      }
    });
  }

  // ==========================================
  // Plan Change Wizard Logic
  // ==========================================
  startWizardFlow(line: any): void {
    this.selectedWizardLine = line;
    this.wizardStep.set(1);
    this.setTab('wizard');
  }

  nextWizardStep(): void {
    const step = this.wizardStep();
    if (step === 1) {
      if (!this.selectedWizardLine) {
        this.toastService.error('Please select a line.');
        return;
      }
      this.wizardStep.set(2);
    } else if (step === 2) {
      if (!this.selectedWizardPlan) {
        this.toastService.error('Please compare and select a target plan.');
        return;
      }
      this.wizardStep.set(3);
    } else if (step === 3) {
      if (this.wizardForm.invalid) {
        this.toastService.error('Please choose a valid activation date.');
        return;
      }
      this.wizardStep.set(4);
    }
  }

  prevWizardStep(): void {
    const step = this.wizardStep();
    if (step > 1) {
      this.wizardStep.set(step - 1);
    }
  }

  selectWizardPlan(plan: any): void {
    this.selectedWizardPlan = plan;
  }

  confirmWizardChange(): void {
    if (!this.selectedWizardLine || !this.selectedWizardPlan) return;

    const plan = this.selectedWizardPlan;
    const planId: number = plan.planId ?? plan.id;
    const lineId: number = this.selectedWizardLine.lineId;

    const activationDate: string = this.wizardForm.value.effectiveDate;
    const validityDays: number = plan.validityDays ?? 28;
    const expiryDate = this.addDaysToDate(activationDate, validityDays);

    // A mid-cycle change never spawns a second bill — the new plan applies from the next cycle.
    const finish = () => {
      this.toastService.success(`Plan changed successfully to ${plan.name}!`);
      this.resetWizard();
      this.setTab('search');
      if (this.selectedAccount360?.accountId) {
        this.selectAccount(this.selectedAccount360.accountId);
      }
    };

    const createNew = () => this.planService.createSubscription({ lineId, planId, activationDate, expiryDate, renewalType: 'AutoRenew', status: 'A' }).subscribe({
      next: finish,
      error: (err: any) => this.toastService.error('Failed to change plan: ' + (err?.error?.message ?? `HTTP ${err?.status ?? 'error'}`))
    });

    // Backend update ignores planId, so expire the current subscription and create a fresh one.
    const existingSubId = this.selectedWizardLine?.activeSubscription?.subscriptionId ?? this.selectedWizardLine?.activeSubscription?.id;
    if (existingSubId) {
      this.planService.updateSubscription(existingSubId, { status: 'E' }).subscribe({
        next: createNew,
        error: (err: any) => this.toastService.error('Failed to change plan: ' + (err?.error?.message ?? `HTTP ${err?.status ?? 'error'}`))
      });
    } else {
      createNew();
    }
  }

  private addDaysToDate(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /** Creates (or reuses an open) billing cycle then a plan-charge invoice for the given account. */
  private autoCreateInvoice(
    accountId: number,
    planPrice: number,
    addOnPrice: number,
    cycleStart: string,
    cycleEnd: string
  ): void {
    const taxes = Math.round((planPrice + addOnPrice) * 0.18 * 100) / 100;

    const generate = (cycleId: number) => {
      this.billingService.generateInvoice({ accountId, cycleId, planCharges: planPrice, excessCharges: 0, addOnCharges: addOnPrice, taxes }).subscribe({
        next: () => this.toastService.success('Invoice generated and sent to the Billing Executive queue.'),
        error: (err: any) => {
          const msg: string = err?.error?.message ?? '';
          if (msg.toLowerCase().includes('already exists')) {
            this.toastService.success('Invoice already present for the current billing cycle.');
          } else {
            this.toastService.error('Invoice generation failed: ' + (msg || `HTTP ${err?.status ?? 'error'}`));
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
        error: (err: any) => this.toastService.error('Billing cycle creation failed: ' + (err?.error?.message ?? `HTTP ${err?.status ?? 'error'}`))
      });
    };

    const reuseOrCreateCycle = () => {
      // Reuse an existing OPEN cycle if present (the backend rejects a second open cycle per account).
      this.billingService.getCyclesByAccount(accountId).subscribe({
        next: (cycles: any[]) => {
          const open = (cycles ?? []).find((c: any) => (c?.status ?? '').toString().toUpperCase() === 'OPEN');
          if (open) generate(open.cycleId ?? open.id);
          else createCycleThenGenerate();
        },
        error: () => createCycleThenGenerate()
      });
    };

    // One active bill per account: skip generation if an unpaid invoice already exists.
    this.billingService.getInvoicesByAccount(accountId).subscribe({
      next: (invoices: any[]) => {
        const hasUnpaid = (invoices ?? []).some((i: any) => (i?.status ?? '').toString().toUpperCase() !== 'PAID');
        if (hasUnpaid) { this.toastService.success('Plan updated — existing unpaid invoice retained (one active bill per account).'); return; }
        reuseOrCreateCycle();
      },
      error: () => reuseOrCreateCycle()
    });
  }

  resetWizard(): void {
    this.wizardStep.set(1);
    this.selectedWizardLine = null;
    this.selectedWizardPlan = null;
    this.wizardForm.reset();
  }

  hasPaidInvoice(): boolean {
    return this.account360Invoices.some((inv: any) => (inv.status ?? '').toUpperCase() === 'PAID');
  }

  // ==========================================
  // Plan Provision Modal
  // ==========================================
  openPlanProvision(line: any): void {
    this.provisionLine = line;
    this.provisionSelectedPlan = null;
    this.provisionSelectedAddOn = null;
    this.provisionPlans = [];
    this.provisionAddOns = [];
    const acctType: string = (this.selectedAccount360?.accountType ?? '').toLowerCase();
    this.planService.getPlans(true).subscribe({
      next: (d) => this.provisionPlans = acctType ? d.filter((p: any) => (p.type ?? '').toLowerCase() === acctType) : d,
      error: () => {}
    });
    this.planService.getAddOns().subscribe({
      next: (d) => this.provisionAddOns = d.filter((a: any) => a.status === 'A'),
      error: () => {}
    });
    this.isPlanProvisionOpen.set(true);
  }

  closePlanProvision(): void {
    this.isPlanProvisionOpen.set(false);
    this.provisionLine = null;
    this.provisionSelectedPlan = null;
    this.provisionSelectedAddOn = null;
  }

  confirmPlanProvision(): void {
    if (!this.provisionLine || !this.provisionSelectedPlan) return;
    const planId = this.provisionSelectedPlan.planId;
    const lineId = this.provisionLine.lineId;
    const accountId = this.provisionLine.accountId ?? this.selectedAccount360?.accountId;
    const today = new Date();
    const activationDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const validityDays: number = this.provisionSelectedPlan.validityDays ?? 28;
    const expiryDate = this.addDaysToDate(activationDate, validityDays);
    const planPrice: number = this.provisionSelectedPlan.planPrice ?? 0;
    const addOnId: number | undefined = this.provisionSelectedAddOn?.addOnId;
    const addOnPrice: number = this.provisionSelectedAddOn?.price ?? 0;

    // createSubscription persists addOnId directly, so no follow-up call is needed.
    this.planService.createSubscription({ lineId, planId, addOnId, activationDate, expiryDate, renewalType: 'AutoRenew', status: 'A' }).subscribe({
      next: () => {
        this.iamService.recordAudit('PLAN_PROVISIONED', 'AGENT');
        this.pushNotification(this.selectedAccount360?.subscriberId ?? this.selectedAccount360?.subscriber?.userId, `Your plan "${this.provisionSelectedPlan.name}"${addOnId ? ' with an add-on' : ''} is now active.`, 'PLAN');
        this.toastService.success(`Plan "${this.provisionSelectedPlan.name}" provisioned successfully!`);
        if (accountId) this.autoCreateInvoice(accountId, planPrice, addOnPrice, activationDate, expiryDate);
        this.closePlanProvision();
        if (this.selectedAccount360?.accountId) this.selectAccount(this.selectedAccount360.accountId);
      },
      error: (err: any) => {
        this.toastService.error('Plan provision failed: ' + (err?.error?.message ?? `HTTP ${err?.status ?? 'error'}`));
      }
    });
  }

  // ── Create Account & SIM Line Modal Handlers ──────────────────────────────
  openCreateAccountModal(u: any): void {
    this.selectedSubscriberUser = u;
    this.createAccountForm.reset({
      accountType: 'Prepaid',
      kycStatus: 'Pending'
    });
    this.showCreateAccountModal = true;
  }

  closeCreateAccountModal(): void {
    this.showCreateAccountModal = false;
  }

  submitCreateAccount(): void {
    if (this.createAccountForm.invalid || !this.selectedSubscriberUser) return;
    this.isCreatingAccount = true;
    const payload = {
      subscriberId: this.selectedSubscriberUser.userId,
      accountType: this.createAccountForm.value.accountType,
      kycStatus: this.createAccountForm.value.kycStatus
    };

    this.accountService.createAccount(payload).subscribe({
      next: (res) => {
        this.isCreatingAccount = false;
        this.closeCreateAccountModal();
        this.createdAccountId = res?.accountId ?? res?.id ?? null;
        this.showAccountCreatedSuccessModal = true;
        this.iamService.recordAudit('SUBSCRIBER_ACCOUNT_CREATED', 'SUBSCRIBER');
        this.pushNotification(this.selectedSubscriberUser?.userId, 'Welcome to TeleConnect — your subscriber account has been created.', 'COMPLIANCE');
        this.enrichUsersWithAccountStatus();
        this.toastService.success('Subscriber account created successfully.');
      },
      error: (err) => {
        this.isCreatingAccount = false;
        this.toastService.error(err.error?.message ?? 'Failed to create subscriber account.');
      }
    });
  }

  /** Fire-and-forget: raise a notification for the subscriber (recipient userId). */
  private pushNotification(userId: number | null | undefined, message: string, category: string): void {
    if (!userId) return;
    this.notificationService.createNotification({ userId, message, category }).subscribe({ next: () => {}, error: () => {} });
  }

  closeSuccessModal(): void {
    this.showAccountCreatedSuccessModal = false;
  }

  openAddSimModalFromSuccess(): void {
    this.showAccountCreatedSuccessModal = false;
    this.simForm.patchValue({
      msisdn: this.selectedSubscriberUser?.phone || '',
      serviceType: 'VoiceData',
      iccid: ''
    });
    this.showAddSimModal = true;
  }

  openAddSimModalFrom360(): void {
    this.createdAccountId = this.selectedAccount360.accountId;
    this.simForm.patchValue({
      msisdn: this.selectedAccount360.subscriber?.phone || '',
      serviceType: 'VoiceData',
      iccid: ''
    });
    this.showAddSimModal = true;
  }

  closeAddSimModal(): void {
    this.showAddSimModal = false;
  }

  submitAddSimLine(): void {
    if (this.simForm.invalid || !this.createdAccountId) return;
    this.isActivatingSim = true;
    const payload = {
      msisdn: this.simForm.getRawValue().msisdn || '',
      serviceType: this.simForm.value.serviceType,
      iccid: this.simForm.value.iccid
    };

    this.accountService.addLine(this.createdAccountId, payload).subscribe({
      next: () => {
        this.isActivatingSim = false;
        this.iamService.recordAudit('SIM_LINE_ACTIVATED', 'SUBSCRIBER');
        this.pushNotification(this.selectedSubscriberUser?.userId ?? this.selectedAccount360?.subscriberId, `A new SIM line (${payload.msisdn}) has been added to your account.`, 'PLAN');
        this.toastService.success(`SIM line activated successfully for Account #${this.createdAccountId}.`);
        this.closeAddSimModal();
        if (this.selectedAccount360) {
          this.selectAccount(this.selectedAccount360.accountId);
        } else if (this.activeTab() === 'users') {
          this.loadIamUsers();
        }
      },
      error: (err) => {
        this.isActivatingSim = false;
        this.toastService.error(err.error?.message ?? 'Failed to activate SIM line.');
      }
    });
  }
}
