import { Component, OnInit, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, User } from '../../core/services/auth.service';
import { AccountService } from '../../core/services/account.service';
import { PlanService } from '../../core/services/plan.service';
import { BillingService } from '../../core/services/billing.service';
import { IamService } from '../../core/services/iam.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { fadeInUp, staggerFadeIn, shake, scaleIn } from '../../shared/animations';
import { MyAccountModalComponent } from '../../shared/my-account-modal/my-account-modal.component';
import { PaginatePipe } from '../../shared/pagination/paginate.pipe';
import { PaginatorComponent } from '../../shared/pagination/paginator.component';

@Component({
  selector: 'app-admin-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MyAccountModalComponent, PaginatePipe, PaginatorComponent],
  templateUrl: './admin-portal.component.html',
  styleUrls: ['./admin-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, shake, scaleIn]
})
export class AdminPortalComponent implements OnInit {
  activeTab = signal<string>('catalog');
  isSidebarCollapsed = signal<boolean>(false);
  isNotificationOpen = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;

  // ── Client-side pagination (shared paginate pipe / app-paginator) ──────────────
  readonly pageSize = 8;
  usersPage = 1;
  search360Page = 1;

  user!: User;

  // ── Plan Catalog ──────────────────────────────────────────────────────────────
  plansList: any[] = [];
  planForm!: FormGroup;
  editingPlanId: number | null = null;
  isPlanModalOpen = false;

  // ── Add-On Catalog ────────────────────────────────────────────────────────────
  addOnsList: any[] = [];
  addOnForm!: FormGroup;
  editingAddOnId: number | null = null;
  isAddOnModalOpen = false;

  // ── System Config ─────────────────────────────────────────────────────────────
  configForm!: FormGroup;

  // ── Region Management ─────────────────────────────────────────────────────────
  regions: any[] = [];
  regionForm!: FormGroup;
  regionsPage = 1;

  // ── User Manager ──────────────────────────────────────────────────────────────
  userManagerTab = signal<string>('directory');
  iamUsers: any[] = [];
  userPage = 0;
  readonly userPageSize = 10;
  searchName = '';
  searchEmail = '';
  searchPhone = '';
  searchRole = '';
  searchStatus = '';
  activeActionDropdownId: number | null = null;

  // Create Staff
  staffForm!: FormGroup;
  isCreatingStaff = false;

  // Roles & Permissions
  roles: any[] = [];
  selectedRoleData: any = null;

  // Change Role Modal
  isChangeRoleModalOpen = false;
  changingRoleUser: any = null;
  selectedNewRole = '';

  // Register New Subscriber Modal
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

  // ── Customer 360 ──────────────────────────────────────────────────────────────
  search360Query = '';
  search360Results: any[] = [];
  selected360Account: any = null;
  isSearching360 = false;

  /** True when the selected account already has at least one Active SIM line. */
  get hasActiveLine(): boolean {
    return !!this.selected360Account?.lines?.some((l: any) => l?.status === 'Active');
  }

  // ── Audit Logs ────────────────────────────────────────────────────────────────
  auditLogs: any[] = [];
  auditPage = 0;
  auditSize = 10;
  auditTotalPages = 0;
  auditTotalElements = 0;
  filterAuditUser: number | null = null;
  filterAuditModule = '';
  filterAuditAction = '';

  constructor(
    public authService: AuthService,
    private accountService: AccountService,
    private planService: PlanService,
    private billingService: BillingService,
    private iamService: IamService,
    public notificationService: NotificationService,
    private toastService: ToastService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.user = this.authService.currentUser()!;
    this.initForms();
    this.loadPlans();
    this.loadAddOns();
    this.loadSystemConfig();
    this.loadIamUsers();
    this.loadRegions();
  }

  initForms(): void {
    this.planForm = this.fb.group({
      name: ['', Validators.required],
      type: ['Prepaid', Validators.required],
      validityDays: [28, [Validators.required, Validators.min(1)]],
      dataGb: [56, [Validators.required, Validators.min(0)]],
      voiceMinutes: [0, [Validators.required, Validators.min(0)]],
      smsCount: [100, [Validators.required, Validators.min(0)]],
      planPrice: [299, [Validators.required, Validators.min(0)]],
      activeStatus: [true]
    });

    this.addOnForm = this.fb.group({
      name:         ['', Validators.required],
      type:         ['DataTopup', Validators.required],
      quota:        [1, [Validators.required, Validators.min(0.1)]],
      validityDays: [28, [Validators.required, Validators.min(1)]],
      price:        [19, [Validators.required, Validators.min(0)]],
      activeStatus: [true]
    });

    this.configForm = this.fb.group({
      excessDataRateMb: [0.50, Validators.required],
      excessVoiceRateMin: [1.00, Validators.required],
      excessSmsRateCount: [0.50, Validators.required],
      taxPercentage: [18.00, Validators.required],
      lateFeeFlat: [100, Validators.required],
      lateFeePercentage: [2.0, Validators.required],
      lateFeeGraceDays: [5, Validators.required],
      autoSuspendDays: [15, Validators.required],
      alertThreshold80: [true],
      alertThreshold100: [true]
    });

    this.staffForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      roleName: ['', Validators.required]
    });

    this.registerForm = this.fb.group({
      name:     ['', [Validators.required, Validators.minLength(2)]],
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      phone:    ['', Validators.pattern('^[0-9]{10}$')],
      regionId: [null]
    });

    this.regionForm = this.fb.group({
      name: ['', Validators.required]
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

  // ── Layout ────────────────────────────────────────────────────────────────────
  setTab(tab: string): void {
    this.activeTab.set(tab);
    this.isNotificationOpen.set(false);
    if (tab === 'users') this.loadIamUsers();
    if (tab === 'auditLogs') this.loadAuditLogs();
    if (tab === 'customer360') { this.search360Query = ''; this.selected360Account = null; this.search360Results = []; }
    if (tab === 'regions') this.loadRegions();
  }

  // ── Region Management ─────────────────────────────────────────────────────────
  loadRegions(): void {
    this.iamService.getRegions().subscribe({
      next: (data) => this.regions = data,
      error: () => this.toastService.error('Failed to load regions.')
    });
  }

  createRegion(): void {
    if (this.regionForm.invalid) return;
    const name = this.regionForm.value.name;
    this.iamService.createRegion(name).subscribe({
      next: () => {
        this.toastService.success(`Region "${name}" created.`);
        this.iamService.recordAudit('CREATE_REGION', 'ADMIN');
        this.regionForm.reset();
        this.loadRegions();
      },
      error: (err) => this.toastService.error(err.error?.message ?? 'Failed to create region.')
    });
  }

  toggleRegionStatus(region: any): void {
    const newStatus = region.status === 'Active' ? 'Inactive' : 'Active';
    this.iamService.updateRegionStatus(region.regionId, newStatus).subscribe({
      next: () => {
        this.toastService.success(`Region "${region.name}" set to ${newStatus}.`);
        this.iamService.recordAudit('UPDATE_REGION_STATUS', 'ADMIN');
        this.loadRegions();
      },
      error: () => this.toastService.error('Failed to update region status.')
    });
  }

  setUserManagerTab(sub: string): void {
    this.userManagerTab.set(sub);
    if (sub === 'roles' && this.roles.length === 0) this.loadRoles();
  }

  toggleSidebar(): void { this.isSidebarCollapsed.set(!this.isSidebarCollapsed()); }

  toggleNotifications(): void {
    this.isNotificationOpen.set(!this.isNotificationOpen());
    if (this.isNotificationOpen()) this.notificationService.refreshNotifications();
  }

  logout(): void { this.authService.logout(); }

  // ── Plan Catalog ──────────────────────────────────────────────────────────────
  loadPlans(): void {
    this.planService.getPlans(false).subscribe({
      next: (data) => this.plansList = data,
      error: () => this.toastService.error('Failed to load plan catalogs.')
    });
  }

  openCreatePlanModal(): void {
    this.editingPlanId = null;
    this.planForm.reset({ type: 'Prepaid', validityDays: 28, dataGb: 56, voiceMinutes: 0, smsCount: 100, planPrice: 299, activeStatus: true });
    this.isPlanModalOpen = true;
  }

  openEditPlanModal(plan: any): void {
    this.editingPlanId = plan.planId;
    this.planForm.patchValue({ name: plan.name, type: plan.type, validityDays: plan.validityDays, dataGb: plan.dataGb, voiceMinutes: plan.voiceMinutes, smsCount: plan.smsCount, planPrice: plan.planPrice, activeStatus: plan.status === 'A' });
    this.isPlanModalOpen = true;
  }

  closePlanModal(): void { this.isPlanModalOpen = false; this.editingPlanId = null; }

  submitPlanForm(): void {
    if (this.planForm.invalid) return;
    const v = this.planForm.value;
    const payload = { name: v.name, type: v.type, validityDays: v.validityDays, dataGb: v.dataGb, voiceMinutes: v.voiceMinutes, smsCount: v.smsCount, planPrice: v.planPrice, status: v.activeStatus ? 'A' : 'I' };
    const obs$ = this.editingPlanId ? this.planService.updatePlan(this.editingPlanId, payload) : this.planService.createPlan(payload);
    obs$.subscribe({
      next: () => { this.toastService.success(this.editingPlanId ? 'Plan updated.' : 'New plan created.'); this.closePlanModal(); this.loadPlans(); },
      error: () => this.toastService.error('Failed to save plan.')
    });
  }

  // ── Add-On Catalog ────────────────────────────────────────────────────────────
  loadAddOns(): void {
    this.planService.getAddOns().subscribe({
      next: (data) => this.addOnsList = data,
      error: () => {}
    });
  }

  openCreateAddOnModal(): void {
    this.editingAddOnId = null;
    this.addOnForm.reset({ type: 'DataTopup', quota: 1, validityDays: 28, price: 19, activeStatus: true });
    this.isAddOnModalOpen = true;
  }

  openEditAddOnModal(addOn: any): void {
    this.editingAddOnId = addOn.addOnId;
    this.addOnForm.patchValue({ name: addOn.name, type: addOn.type, quota: addOn.quota, validityDays: addOn.validityDays, price: addOn.price, activeStatus: addOn.status === 'A' });
    this.isAddOnModalOpen = true;
  }

  closeAddOnModal(): void { this.isAddOnModalOpen = false; this.editingAddOnId = null; }

  submitAddOnForm(): void {
    if (this.addOnForm.invalid) return;
    const v = this.addOnForm.value;
    const payload = { name: v.name, type: v.type, quota: v.quota, validityDays: v.validityDays, price: v.price, status: v.activeStatus ? 'A' : 'I' };
    const obs$ = this.editingAddOnId
      ? this.planService.updateAddOn(this.editingAddOnId, payload)
      : this.planService.createAddOn(payload);
    obs$.subscribe({
      next: () => {
        this.iamService.recordAudit(this.editingAddOnId ? 'ADDON_UPDATED' : 'ADDON_CREATED', 'PLAN');
        this.toastService.success(this.editingAddOnId ? 'Add-on updated.' : 'New add-on created.');
        this.closeAddOnModal();
        this.loadAddOns();
      },
      error: (err: any) => this.toastService.error(err.error?.message ?? 'Failed to save add-on.')
    });
  }

  getAddOnTypeLabel(type: string): string {
    const labels: Record<string, string> = { DataTopup: 'Data Top-Up', ISDPack: 'ISD Pack', RoamingPack: 'Roaming Pack', SMSPack: 'SMS Pack' };
    return labels[type] ?? type;
  }

  // ── System Config ─────────────────────────────────────────────────────────────
  loadSystemConfig(): void {
    this.billingService.getSystemConfig().subscribe({
      next: (config) => this.configForm.patchValue(config),
      error: () => this.toastService.error('Failed to load system config.')
    });
  }

  saveConfig(): void {
    if (this.configForm.invalid) return;
    this.billingService.updateSystemConfig(this.configForm.value).subscribe({
      next: () => this.toastService.success('System configuration updated.'),
      error: () => this.toastService.error('Failed to save config.')
    });
  }

  // ── Register New Subscriber Modal ────────────────────────────────────────────
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

  // ── User Manager ──────────────────────────────────────────────────────────────
  loadIamUsers(): void {
    this.userPage = 0;
    this.usersPage = 1;
    this.iamService.getUsers().subscribe({
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
    this.usersPage = 1;
    const hasFilter = this.searchName || this.searchEmail || this.searchPhone || this.searchRole || this.searchStatus;
    if (!hasFilter) { this.loadIamUsers(); return; }
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

  clearSearch(): void {
    this.searchName = ''; this.searchEmail = ''; this.searchPhone = '';
    this.searchRole = ''; this.searchStatus = '';
    this.userPage = 0;
    this.usersPage = 1;
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

  @HostListener('document:click')
  onDocumentClick(): void {
    this.activeActionDropdownId = null;
    this.isProfileDropdownOpen = false;
  }

  toggleActionDropdown(userId: number, event: Event): void {
    event.stopPropagation();
    this.activeActionDropdownId = this.activeActionDropdownId === userId ? null : userId;
  }

  closeActionDropdown(): void {
    this.activeActionDropdownId = null;
  }

  toggleProfileDropdown(event: Event): void {
    event.stopPropagation();
    this.isProfileDropdownOpen = !this.isProfileDropdownOpen;
  }

  exportUsers(): void {
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Role', 'Status'];
    const rows = this.iamUsers.map(u => [
      u.userId, u.name, u.email, u.phone || '', u.roleName, u.status
    ]);
    const csv = [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  canResetPassword(u: any): boolean {
    if (!u) return false;
    return u.roleName !== 'S' && u.roleName !== 'Subscriber';
  }

  isResetPasswordDisabled(u: any): boolean {
    if (!u) return true;
    return u.mustChangePassword === true || u.mustChangePassword === 1;
  }

  updateUserStatus(userId: number, newStatus: string): void {
    this.closeActionDropdown();
    this.iamService.updateUserStatus(userId, newStatus).subscribe({
      next: () => {
        this.iamService.recordAudit('USER_STATUS_UPDATED', 'IAM');
        this.toastService.success(`User status updated to ${this.getStatusLabel(newStatus)}.`);
        this.loadIamUsers();
      },
      error: () => this.toastService.error('Failed to update user status.')
    });
  }

  openChangeRoleModal(u: any): void {
    this.closeActionDropdown();
    this.changingRoleUser = u;
    this.selectedNewRole = u.roleName;
    this.isChangeRoleModalOpen = true;
    if (this.roles.length === 0) this.loadRoles();
  }

  closeChangeRoleModal(): void { this.isChangeRoleModalOpen = false; this.changingRoleUser = null; }

  confirmChangeRole(): void {
    if (!this.changingRoleUser || !this.selectedNewRole) return;
    this.iamService.changeUserRole(this.changingRoleUser.userId, this.selectedNewRole).subscribe({
      next: () => {
        this.iamService.recordAudit('USER_ROLE_UPDATED', 'IAM');
        this.toastService.success('User role updated.');
        this.closeChangeRoleModal();
        this.loadIamUsers();
      },
      error: () => this.toastService.error('Failed to change role.')
    });
  }

  resetPassword(userId: number): void {
    this.closeActionDropdown();
    this.iamService.resetPassword(userId).subscribe({
      next: (res) => {
        this.iamService.recordAudit('PASSWORD_RESET', 'IAM');
        this.toastService.success(res?.message ?? 'Password has been reset. User will receive new credentials.');
        this.loadIamUsers();
      },
      error: () => this.toastService.error('Failed to reset password.')
    });
  }

  submitStaffForm(): void {
    if (this.staffForm.invalid) return;
    this.isCreatingStaff = true;
    this.iamService.createStaff(this.staffForm.value).subscribe({
      next: () => {
        this.isCreatingStaff = false;
        this.iamService.recordAudit('STAFF_ACCOUNT_CREATED', 'IAM');
        this.toastService.success('Staff account created successfully.');
        this.staffForm.reset();
        this.loadIamUsers();
      },
      error: (err) => {
        this.isCreatingStaff = false;
        this.toastService.error(err.error?.message ?? 'Failed to create staff account.');
      }
    });
  }

  loadRoles(): void {
    this.iamService.getRoles().subscribe({
      next: (roles) => {
        this.roles = roles;
        if (roles.length > 0 && !this.selectedRoleData) this.selectRole(roles[0]);
      },
      error: () => this.toastService.error('Failed to load roles.')
    });
  }

  selectRole(role: any): void {
    this.iamService.getRoleWithPermissions(role.roleId).subscribe({
      next: (r) => this.selectedRoleData = r,
      error: () => { this.selectedRoleData = role; }
    });
  }

  // ── Audit Logs ────────────────────────────────────────────────────────────────
  loadAuditLogs(): void {
    const params = {
      module: this.filterAuditModule || undefined,
      action: this.filterAuditAction || undefined,
      page: this.auditPage,
      size: this.auditSize
    };
    const obs$ = this.filterAuditUser
      ? this.iamService.getAuditLogsByUser(this.filterAuditUser, params)
      : this.iamService.getAuditLogs(params);
    obs$.subscribe({
      next: (data: any) => {
        this.auditLogs = Array.isArray(data) ? data : (data?.content ?? []);
        this.auditTotalPages = data?.totalPages ?? 1;
        this.auditTotalElements = data?.totalElements ?? this.auditLogs.length;
      },
      error: () => this.toastService.error('Failed to load audit logs.')
    });
  }

  applyAuditFilters(): void { this.auditPage = 0; this.loadAuditLogs(); }

  resetAuditFilters(): void {
    this.filterAuditUser = null; this.filterAuditModule = ''; this.filterAuditAction = '';
    this.auditPage = 0; this.loadAuditLogs();
  }

  auditNextPage(): void { if (this.auditPage < this.auditTotalPages - 1) { this.auditPage++; this.loadAuditLogs(); } }
  auditPrevPage(): void { if (this.auditPage > 0) { this.auditPage--; this.loadAuditLogs(); } }

  exportAuditLogs(): void {
    const params = {
      module: this.filterAuditModule || undefined,
      action: this.filterAuditAction || undefined,
      page: 0,
      size: 99999
    };
    const obs$ = this.filterAuditUser
      ? this.iamService.getAuditLogsByUser(this.filterAuditUser, params)
      : this.iamService.getAuditLogs(params);
    obs$.subscribe({
      next: (data: any) => {
        const logs: any[] = Array.isArray(data) ? data : (data?.content ?? []);
        const headers = ['Action', 'User Name', 'Module', 'IP Address', 'Timestamp'];
        const rows = logs.map(log => [
          log.action ?? '',
          this.getUserName(log.userId),
          log.module ?? '',
          log.ipAddress ?? '',
          log.timestamp ? new Date(log.timestamp).toLocaleString() : ''
        ]);
        const csv = [headers, ...rows]
          .map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','))
          .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'audit_logs.csv'; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toastService.error('Failed to export audit logs.')
    });
  }

  getUserName(userId: number | null): string {
    if (!userId) return 'Unknown';
    const found = this.iamUsers.find((u: any) => u.userId === userId || u.userId === Number(userId));
    return found?.name ?? (found?.userName ?? `User ${userId}`);
  }

  // ── Display Helpers ───────────────────────────────────────────────────────────
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
    return ({ A: 'Active', S: 'Suspended', I: 'Inactive' } as Record<string,string>)[status] ?? status;
  }

  getRoleLabel(role: string): string {
    return ({ A: 'Admin', CS: 'CS Agent', B: 'Billing', N: 'Network Ops', C: 'Compliance', S: 'Subscriber' } as Record<string,string>)[role] ?? role;
  }

  // ── Create Account & SIM Line Modal Handlers ──────────────────────────────
  openCreateAccountModal(u: any): void {
    this.closeActionDropdown();
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
        this.enrichUsersWithAccountStatus();
        this.toastService.success('Subscriber account created successfully.');
      },
      error: (err) => {
        this.isCreatingAccount = false;
        this.toastService.error(err.error?.message ?? 'Failed to create subscriber account.');
      }
    });
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
    this.createdAccountId = this.selected360Account.accountId;
    this.simForm.patchValue({
      msisdn: this.selected360Account.subscriber?.phone || '',
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
        this.toastService.success(`SIM line activated successfully for Account #${this.createdAccountId}.`);
        this.closeAddSimModal();
        if (this.selected360Account) {
          this.loadAccount360Profile(this.selected360Account.accountId);
        } else {
          this.loadIamUsers();
        }
      },
      error: (err) => {
        this.isActivatingSim = false;
        this.toastService.error(err.error?.message ?? 'Failed to activate SIM line.');
      }
    });
  }

  // ── Customer 360 Search & Profile ─────────────────────────────────────────
  onSearch360(): void {
    const query = this.search360Query.trim();
    if (!query) { this.toastService.error('Please enter a search query.'); return; }

    const isMsisdn = /^\+\d{8,15}$/.test(query) || /^\d{10,15}$/.test(query);
    if (isMsisdn) {
      this.isSearching360 = true;
      this.accountService.lookupByMsisdn(query).subscribe({
        next: (line) => {
          this.isSearching360 = false;
          if (line?.accountId) { this.loadAccount360Profile(line.accountId); }
          else { this.toastService.error('No subscriber found for that phone number.'); }
        },
        error: () => {
          this.iamService.searchUsers({ phone: query }).subscribe({
            next: (users) => {
              const sub = users.find((u: any) => u.roleName === 'S' || u.roleName === 'Subscriber');
              if (sub) {
                this.accountService.getAccountsBySubscriberId(sub.userId).subscribe({
                  next: (accounts) => {
                    this.isSearching360 = false;
                    if (accounts?.length > 0) { this.loadAccount360Profile(accounts[0].accountId); }
                    else { this.toastService.error('No subscriber account found for that phone number.'); }
                  },
                  error: () => { this.isSearching360 = false; this.toastService.error('No subscriber found for that phone number.'); }
                });
              } else {
                this.isSearching360 = false;
                this.toastService.error('No subscriber found for that phone number.');
              }
            },
            error: () => { this.isSearching360 = false; this.toastService.error('No subscriber found for that phone number.'); }
          });
        }
      });
      return;
    }

    const isId = /^\d{1,9}$/.test(query);
    if (isId) {
      const id = parseInt(query, 10);
      this.isSearching360 = true;
      this.accountService.getAccount360(id).subscribe({
        next: (account) => {
          this.isSearching360 = false;
          if (account?.accountId) { this.loadAccount360Profile(account.accountId); }
          else { this.toastService.error('No account found.'); }
        },
        error: () => {
          this.accountService.lookupByLineId(id).subscribe({
            next: (line) => {
              this.isSearching360 = false;
              if (line?.accountId) { this.loadAccount360Profile(line.accountId); }
              else { this.toastService.error('No subscriber found for that ID.'); }
            },
            error: () => { this.isSearching360 = false; this.toastService.error('No account or SIM line found for that ID.'); }
          });
        }
      });
      return;
    }

    this.isSearching360 = true;
    this.accountService.searchAccounts(query).subscribe({
      next: (users) => {
        this.isSearching360 = false;
        this.search360Results = users;
        this.search360Page = 1;
        this.selected360Account = null;
        if (users.length === 0) { this.toastService.success('No records found.'); }
      },
      error: () => { this.isSearching360 = false; this.toastService.error('Search failed.'); }
    });
  }

  loadAccount360Profile(id: number): void {
    this.accountService.getAccount360(id).subscribe({
      next: (account) => {
        this.accountService.getSimLines(id).subscribe({
          next: (lines) => {
            this.iamService.getUser(account.subscriberId).subscribe({
              next: (user) => { this.selected360Account = { ...account, subscriber: user, lines, tickets: [] }; this.search360Results = []; },
              error: () => { this.selected360Account = { ...account, subscriber: null, lines, tickets: [] }; this.search360Results = []; }
            });
          },
          error: () => { this.selected360Account = { ...account, subscriber: null, lines: [], tickets: [] }; this.search360Results = []; }
        });
      },
      error: () => this.toastService.error('Failed to load account profile.')
    });
  }

  updateKyc360(accountId: number, status: string): void {
    this.accountService.updateKycStatus(accountId, status).subscribe({
      next: () => {
        this.iamService.recordAudit('KYC_STATUS_UPDATED', 'SUBSCRIBER');
        this.toastService.success(`KYC status updated to ${status}.`);
        this.loadAccount360Profile(accountId);
      },
      error: () => this.toastService.error('Failed to update KYC status.')
    });
  }

  updateStatus360(accountId: number, status: string): void {
    this.accountService.updateAccountStatus(accountId, status).subscribe({
      next: () => {
        this.iamService.recordAudit('ACCOUNT_STATUS_UPDATED', 'SUBSCRIBER');
        this.toastService.success(`Account status updated to ${status}.`);
        this.loadAccount360Profile(accountId);
      },
      error: () => this.toastService.error('Failed to update account status.')
    });
  }

  deleteAccount360(accountId: number): void {
    if (!confirm(`Permanently delete Account #${accountId}? This cannot be undone.`)) return;
    this.accountService.deleteAccount(accountId).subscribe({
      next: () => {
        this.iamService.recordAudit('SUBSCRIBER_ACCOUNT_DELETED', 'SUBSCRIBER');
        this.toastService.success(`Account #${accountId} deleted.`);
        this.selected360Account = null;
        this.search360Results = [];
        this.search360Query = '';
      },
      error: () => this.toastService.error('Failed to delete account.')
    });
  }

  deleteSimLine360(accountId: number, lineId: number): void {
    if (!confirm(`Delete SIM Line #${lineId}? This will deactivate the line permanently.`)) return;
    this.accountService.deleteSimLine(accountId, lineId).subscribe({
      next: () => {
        this.iamService.recordAudit('SIM_LINE_DELETED', 'SUBSCRIBER');
        this.toastService.success(`SIM Line #${lineId} deleted.`);
        this.loadAccount360Profile(accountId);
      },
      error: () => this.toastService.error('Failed to delete SIM line.')
    });
  }

  updateSimStatus360(accountId: number, lineId: number, status: string): void {
    this.accountService.updateSimStatus(accountId, lineId, status).subscribe({
      next: () => {
        this.iamService.recordAudit('SIM_STATUS_UPDATED', 'SUBSCRIBER');
        this.toastService.success(`SIM line ${status === 'Active' ? 'reactivated' : 'suspended'}.`);
        this.loadAccount360Profile(accountId);
      },
      error: () => this.toastService.error('Failed to update SIM status.')
    });
  }

  // ── Admin Power Actions ──────────────────────────────────────────────────
  terminateSubscriberAccount(user: any): void {
    if (!confirm(`Terminate subscriber account for "${user.name}"? This will deactivate all their SIM lines.`)) return;
    this.accountService.getAccountsBySubscriberId(user.userId).subscribe({
      next: (accounts: any[]) => {
        if (!accounts || accounts.length === 0) {
          this.toastService.error('No subscriber account found for this user.');
          return;
        }
        const accountId = accounts[0].accountId;
        this.accountService.deleteAccount(accountId).subscribe({
          next: () => {
            this.iamService.recordAudit('SUBSCRIBER_ACCOUNT_DELETED', 'SUBSCRIBER');
            this.toastService.success(`Account #${accountId} for "${user.name}" has been terminated.`);
            this.loadIamUsers();
          },
          error: () => this.toastService.error('Failed to terminate subscriber account.')
        });
      },
      error: () => this.toastService.error('Could not find subscriber account for this user.')
    });
  }

  deleteAccount(accountId: number): void {
    if (!confirm(`Are you sure you want to permanently delete Subscriber Account #${accountId}?`)) return;
    this.accountService.deleteAccount(accountId).subscribe({
      next: () => {
        this.iamService.recordAudit('SUBSCRIBER_ACCOUNT_DELETED', 'SUBSCRIBER');
        this.toastService.success(`Account #${accountId} has been deleted.`);
        this.loadIamUsers();
      },
      error: () => this.toastService.error('Failed to delete account.')
    });
  }

  deleteSimLine(accountId: number, lineId: number): void {
    if (!confirm(`Are you sure you want to delete SIM Line #${lineId} on Account #${accountId}?`)) return;
    this.accountService.deleteSimLine(accountId, lineId).subscribe({
      next: () => {
        this.iamService.recordAudit('SIM_LINE_DELETED', 'SUBSCRIBER');
        this.toastService.success(`SIM Line #${lineId} deleted successfully.`);
        this.loadIamUsers();
      },
      error: () => this.toastService.error('Failed to delete SIM line.')
    });
  }
}
