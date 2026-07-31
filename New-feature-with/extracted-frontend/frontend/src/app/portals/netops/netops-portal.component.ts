import { Component, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../core/services/auth.service';
import { IamService } from '../../core/services/iam.service';
import { PlanService } from '../../core/services/plan.service';
import { TicketService } from '../../core/services/ticket.service';
import { AccountService } from '../../core/services/account.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { ReportService } from '../../core/services/report.service';
import { fadeInUp, staggerFadeIn, shake, scaleIn } from '../../shared/animations';
import { MyAccountModalComponent } from '../../shared/my-account-modal/my-account-modal.component';
import { AnalyticsPanelComponent } from '../../shared/analytics/analytics-panel.component';
import { PaginatePipe } from '../../shared/pagination/paginate.pipe';
import { PaginatorComponent } from '../../shared/pagination/paginator.component';

@Component({
  selector: 'app-netops-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, MyAccountModalComponent, AnalyticsPanelComponent, PaginatePipe, PaginatorComponent],
  templateUrl: './netops-portal.component.html',
  styleUrls: ['./netops-portal.component.css'],
  animations: [fadeInUp, staggerFadeIn, shake, scaleIn]
})
export class NetopsPortalComponent implements OnInit, OnDestroy {
  // Client-side pagination
  readonly pageSize = 8;
  slaPage = 1;
  escalationsPage = 1;
  catalogSubTab = 'plans';
  plansPage = 1;
  addOnsPage = 1;

  activeTab = signal<string>('kanban');
  isSidebarCollapsed = signal<boolean>(false);
  isNotificationOpen = signal<boolean>(false);
  isMyAccountOpen = false;
  isProfileDropdownOpen = false;

  // User details
  user!: User;
  staffMembers: any[] = [];

  // Fault Tickets Kanban Board
  allTickets: any[] = [];
  kanbanColumns = ['Open', 'InProgress', 'Resolved', 'Closed', 'Escalated'];

  // SLA trackers
  slaCompliancePct = 95.8;
  currentTime = new Date();
  private timerInterval: any;

  // Impairment drilldown — grouped by fault category (a real field on every ticket).
  regionsList = [
    { name: 'NoCoverage',   label: 'No Coverage',   status: 'Clear', color: 'bg-emerald-500', border: 'border-emerald-600/30', count: 0 },
    { name: 'CallDrops',    label: 'Call Drops',    status: 'Clear', color: 'bg-emerald-500', border: 'border-emerald-600/30', count: 0 },
    { name: 'SlowData',     label: 'Slow Data',     status: 'Clear', color: 'bg-emerald-500', border: 'border-emerald-600/30', count: 0 },
    { name: 'BillingIssue', label: 'Billing Issue', status: 'Clear', color: 'bg-emerald-500', border: 'border-emerald-600/30', count: 0 },
    { name: 'Activation',   label: 'Activation',    status: 'Clear', color: 'bg-emerald-500', border: 'border-emerald-600/30', count: 0 }
  ];
  selectedRegionFilter: string | null = null;

  // Escalation Queue
  escalatedQueue: any[] = [];
  isEscalateModalOpen = false;
  escalatingTicket: any = null;
  escalationReasonText = '';

  // User Lookup
  lookupUserId: number | null = null;
  lookupResult: any = null;
  isLookingUp = false;
  lookupError = '';

  // Plan Catalog (read-only reference)
  catalogPlans: any[] = [];
  catalogAddOns: any[] = [];

  constructor(
    public authService: AuthService,
    private iamService: IamService,
    private planService: PlanService,
    private ticketService: TicketService,
    private accountService: AccountService,
    public notificationService: NotificationService,
    private toastService: ToastService,
    private reportService: ReportService
  ) {}

  ngOnInit(): void {
    this.user = this.authService.currentUser()!;
    this.loadTickets();
    this.loadStaff();

    // Start SLA countdown timer ticking every second
    this.timerInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // Backend stores ticket status as codes (O/P/R/C/E); the board works in words.
  private readonly statusWord: Record<string, string> = {
    O: 'Open', P: 'InProgress', R: 'Resolved', C: 'Closed', E: 'Escalated'
  };
  private readonly statusCode: Record<string, string> = {
    Open: 'O', InProgress: 'P', Resolved: 'R', Closed: 'C', Escalated: 'E'
  };
  private toStatusWord(s: string): string {
    return this.statusWord[s] ?? s; // pass through if already a word
  }

  loadTickets(): void {
    this.ticketService.getFaultTickets().subscribe({
      next: (data) => {
        this.allTickets = (data ?? []).map((t: any) => ({
          ...t,
          id: t.id ?? t.ticketId,
          status: this.toStatusWord(t.status),
          slaDeadline: t.slaDeadline ?? this.computeSlaDeadline(t.raisedDate, t.priority)
        }));
        this.updateRegionMetrics();
        this.loadEscalatedQueue();
        this.calculateSlaPercentage();
      },
      error: () => this.toastService.error('Failed to retrieve fault tickets.')
    });
  }

  loadStaff(): void {
    // Demo staff members for ticket assignment
    this.staffMembers = [
      { id: 4, name: 'Ned Network Engineer 1', email: 'networkops@teleconnect.com' },
      { id: 2, name: 'Ned Network Engineer 2', email: 'agent@teleconnect.com' }
    ];
  }

  loadEscalatedQueue(): void {
    this.ticketService.getEscalatedTickets().subscribe(data => {
      this.escalatedQueue = (data ?? [])
        .map((t: any) => ({ ...t, id: t.id ?? t.ticketId, status: this.toStatusWord(t.status) }))
        .filter((t: any) => t.status === 'Escalated');
    });
  }

  calculateSlaPercentage(): void {
    const resolved = this.allTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed');
    if (resolved.length === 0) {
      this.slaCompliancePct = 100.0;
      return;
    }
    const complied = resolved.filter(t => {
      if (!t.resolvedDate) return true;
      const resTime = new Date(t.resolvedDate).getTime();
      const deadTime = new Date(t.slaDeadline).getTime();
      return resTime <= deadTime;
    }).length;
    this.slaCompliancePct = Math.round((complied / resolved.length) * 1000) / 10;
  }

  updateRegionMetrics(): void {
    // Reset counts
    this.regionsList.forEach(r => r.count = 0);
    
    // Count active (not Resolved/Closed) tickets per fault category
    this.allTickets.forEach(t => {
      if (t.status !== 'Closed' && t.status !== 'Resolved') {
        const match = this.regionsList.find(r => r.name === t.faultType);
        if (match) match.count++;
      }
    });

    // Update severity colors
    this.regionsList.forEach(r => {
      if (r.count === 0) {
        r.status = 'Clear';
        r.color = 'bg-emerald-500';
        r.border = 'border-emerald-600/20';
      } else if (r.count <= 2) {
        r.status = 'Impaired';
        r.color = 'bg-amber-500';
        r.border = 'border-amber-600/20';
      } else {
        r.status = 'Outage';
        r.color = 'bg-rose-500';
        r.border = 'border-rose-600/20';
      }
    });
  }

  // ==========================================
  // Layout Controls
  // ==========================================
  setTab(tab: string): void {
    this.activeTab.set(tab);
    this.isNotificationOpen.set(false);
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

  // ── User Lookup ────────────────────────────────────────────────────────────────
  lookupUser(): void {
    if (!this.lookupUserId) return;
    this.isLookingUp = true;
    this.lookupResult = null;
    this.lookupError = '';
    this.iamService.getUser(this.lookupUserId).subscribe({
      next: (user) => { this.lookupResult = user; this.isLookingUp = false; },
      error: (err) => {
        this.isLookingUp = false;
        this.lookupError = err.status === 404 ? 'No user found with that ID.' : `Error: ${err.status}`;
      }
    });
  }

  clearLookup(): void {
    this.lookupUserId = null;
    this.lookupResult = null;
    this.lookupError = '';
  }

  getLookupRoleLabel(role: string): string {
    return ({ A: 'Admin', CS: 'Customer Service Agent', B: 'Billing Executive', N: 'Network Operations Engineer', C: 'Compliance Officer', S: 'Subscriber' } as Record<string, string>)[role] ?? role;
  }

  getLookupStatusLabel(status: string): string {
    return ({ A: 'Active', S: 'Suspended', I: 'Inactive' } as Record<string, string>)[status] ?? status;
  }

  // ==========================================
  // Kanban Operations
  // ==========================================
  getTicketsInColumn(col: string): any[] {
    let list = this.allTickets.filter(t => t.status === col);
    if (this.selectedRegionFilter) {
      list = list.filter(t => t.faultType === this.selectedRegionFilter);
    }
    return list;
  }

  moveTicket(ticketId: number, status: string): void {
    if (status === 'Escalated') {
      const ticket = this.allTickets.find(t => t.id === ticketId);
      this.openEscalateModal(ticket);
      return;
    }

    // Backend expects the status code (O/P/R/C/E), not the display word.
    const code = this.statusCode[status] ?? status;
    this.ticketService.updateFaultStatus(ticketId, code).subscribe({
      next: () => {
        this.iamService.recordAudit('TICKET_STATUS_UPDATED', 'NETOPS');
        this.toastService.success(`Ticket #${ticketId} status updated to ${status}.`);
        this.loadTickets();
      },
      error: () => this.toastService.error('Failed to move ticket status.')
    });
  }

  /** True if the assigned engineer id is one of the known staff options. */
  isKnownStaff(id: number): boolean {
    return (this.staffMembers ?? []).some(s => s.id === id);
  }

  assignTicket(ticketId: number, engineerId: number): void {
    const ticket = this.allTickets.find(t => t.id === ticketId);
    const shouldStart = !ticket || ticket.status === 'Open';
    this.ticketService.assignTicket(ticketId, engineerId).subscribe({
      next: () => {
        this.iamService.recordAudit('TICKET_ASSIGNED', 'NETOPS');
        if (shouldStart) {
          // Assigning an open ticket starts work on it → move to the InProgress column.
          this.ticketService.updateFaultStatus(ticketId, this.statusCode['InProgress']).subscribe({
            next: () => { this.toastService.success(`Ticket #${ticketId} assigned — moved to In Progress.`); this.loadTickets(); },
            error: () => { this.toastService.success(`Ticket #${ticketId} assigned.`); this.loadTickets(); }
          });
        } else {
          this.toastService.success(`Ticket #${ticketId} assigned.`);
          this.loadTickets();
        }
      },
      error: () => this.toastService.error('Assign operation failed.')
    });
  }

  // ==========================================
  // SLA Timers & countdown formatting
  // ==========================================
  /** SLA target hours by priority (accepts word or single-letter code). */
  private slaHours(priority: string): number {
    const p = (priority ?? '').toString().toUpperCase();
    if (p === 'CRITICAL' || p === 'C') return 4;
    if (p === 'HIGH'     || p === 'H') return 8;
    if (p === 'MEDIUM'   || p === 'M') return 24;
    if (p === 'LOW'      || p === 'L') return 72;
    return 24;
  }

  /** Deadline = raisedDate + SLA hours for the ticket's priority. */
  private computeSlaDeadline(raisedDate: string, priority: string): string | null {
    if (!raisedDate) return null;
    const base = new Date(raisedDate).getTime();
    if (isNaN(base)) return null;
    return new Date(base + this.slaHours(priority) * 60 * 60 * 1000).toISOString();
  }

  getSlaTimeRemaining(deadlineStr: string): string {
    const deadline = new Date(deadlineStr).getTime();
    const now = this.currentTime.getTime();
    const diff = deadline - now;

    if (diff <= 0) return 'BREACHED';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${mins}m`;
  }

  getSlaState(deadlineStr: string, status: string): 'breached' | 'risk' | 'normal' | 'resolved' {
    if (status === 'Resolved' || status === 'Closed') return 'resolved';
    
    const deadline = new Date(deadlineStr).getTime();
    const now = this.currentTime.getTime();
    const diff = deadline - now;

    if (diff <= 0) return 'breached';
    if (diff <= 2 * 60 * 60 * 1000) return 'risk'; // less than 2 hours left -> At Risk
    return 'normal';
  }

  // ==========================================
  // Regional Impairment Filters
  // ==========================================
  filterByRegion(region: string): void {
    if (this.selectedRegionFilter === region) {
      this.selectedRegionFilter = null; // toggle filter off
    } else {
      this.selectedRegionFilter = region;
      this.setTab('kanban'); // switch to kanban to view filtered list
    }
  }

  // ==========================================
  // Escalations
  // ==========================================
  openEscalateModal(ticket: any): void {
    this.escalatingTicket = ticket;
    this.escalationReasonText = '';
    this.isEscalateModalOpen = true;
  }

  closeEscalateModal(): void {
    this.isEscalateModalOpen = false;
    this.escalatingTicket = null;
    this.escalationReasonText = '';
  }

  // ==========================================
  // SLA Report Generation
  // ==========================================
  generateSlaReport(): void {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const end = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const endStr = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
    const uid = this.authService.currentUser()?.id;
    this.reportService.generateReport({ scope: 'PERIOD', scopeValue: 'Network SLA', periodStart: start, periodEnd: endStr, generatedBy: uid }).subscribe({
      next: () => { this.iamService.recordAudit('SLA_REPORT_GENERATED','NETOPS'); this.toastService.success('SLA report sent to Compliance for review.'); },
      error: () => this.toastService.error('Failed to generate SLA report.')
    });
  }

  submitEscalation(): void {
    if (!this.escalationReasonText.trim() || !this.escalatingTicket) return;

    this.ticketService.updateFaultStatus(this.escalatingTicket.id, 'Escalated', this.escalationReasonText).subscribe({
      next: () => {
        this.iamService.recordAudit('TICKET_ESCALATED', 'NETOPS');
        this.toastService.success(`Ticket #${this.escalatingTicket.id} escalated successfully.`);
        this.closeEscalateModal();
        this.loadTickets();
      },
      error: () => this.toastService.error('Failed to escalate ticket.')
    });
  }
}
