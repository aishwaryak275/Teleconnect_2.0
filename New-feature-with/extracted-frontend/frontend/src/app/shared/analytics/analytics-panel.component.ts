import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart } from 'chart.js/auto';
import { User } from '../../core/services/auth.service';
import { AnalyticsService, ExportFormat } from '../../core/services/analytics.service';
import { ToastService } from '../../core/services/toast.service';

type MetricKey = 'arpu' | 'churn' | 'network' | 'sla' | 'collection' | 'growth';

interface MetricMeta {
  key: MetricKey;
  title: string;
  description: string;
  /** Endpoint slug for export. */
  slug: 'arpu' | 'churn' | 'network-utilisation' | 'sla-compliance' | 'collection-efficiency' | 'subscriber-growth';
  /** Which control set the endpoint needs. */
  driver: 'cycle' | 'period';
}

/** Canonical role → visible-metrics map — mirrors IAM DataLoader VIEW_REPORT_* seed. */
const METRIC_ACCESS: Record<User['role'], MetricKey[]> = {
  Admin:      ['arpu', 'churn', 'network', 'sla', 'collection', 'growth'],
  Billing:    ['arpu', 'collection'],
  NetworkOps: ['network', 'sla'],
  Compliance: ['churn', 'sla', 'growth'],
  CSAgent:    [],
  Subscriber: []
};

const METRIC_META: Record<MetricKey, MetricMeta> = {
  arpu:       { key: 'arpu',       title: 'ARPU',                  description: 'Average revenue per user, by segment & region.', slug: 'arpu',                  driver: 'cycle'  },
  churn:      { key: 'churn',      title: 'Churn Rate',            description: 'Subscriber attrition & at-risk accounts.',       slug: 'churn',                 driver: 'period' },
  network:    { key: 'network',    title: 'Network Utilisation',   description: 'Data, voice & SMS consumption trends.',          slug: 'network-utilisation',   driver: 'cycle'  },
  sla:        { key: 'sla',        title: 'Fault Resolution SLA',  description: 'SLA compliance & breaches by priority.',         slug: 'sla-compliance',        driver: 'period' },
  collection: { key: 'collection', title: 'Collection Efficiency', description: 'Billing collection & overdue ageing.',           slug: 'collection-efficiency', driver: 'cycle'  },
  growth:     { key: 'growth',     title: 'Subscriber Growth',     description: 'Gross adds, terminations & net growth.',         slug: 'subscriber-growth',     driver: 'period' }
};

@Component({
  selector: 'app-analytics-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytics-panel.component.html'
})
export class AnalyticsPanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) role!: User['role'];
  /** When true, show a metric selector dropdown and render only the chosen chart. */
  @Input() singleMetricMode = false;

  metrics: MetricMeta[] = [];
  selectedKey: MetricKey | null = null;

  // Shared query controls
  cycleId = 1;
  periodStart = '';
  periodEnd = '';

  // Per-metric state
  data: Record<string, any> = {};
  loading: Record<string, boolean> = {};
  error: Record<string, string> = {};

  private charts: Record<string, Chart> = {};

  constructor(
    private analytics: AnalyticsService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.metrics = (METRIC_ACCESS[this.role] ?? []).map(k => METRIC_META[k]);
    // Default period: last 90 days → today.
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 90);
    this.periodEnd = this.fmt(today);
    this.periodStart = this.fmt(start);
    if (!this.metrics.length) return;
    if (this.singleMetricMode) {
      this.selectedKey = this.metrics[0].key;
      this.load(this.selectedKey);
    } else {
      this.loadAll();
    }
  }

  onSelectMetric(key: MetricKey): void {
    this.selectedKey = key;
    // Reuse cached data if we've already loaded it, else fetch it now.
    if (this.data[key]) {
      setTimeout(() => this.renderChart(key), 80);
    } else {
      this.load(key);
    }
  }

  get visibleMetrics(): MetricMeta[] {
    if (!this.singleMetricMode) return this.metrics;
    return this.metrics.filter(m => m.key === this.selectedKey);
  }

  ngOnDestroy(): void {
    Object.values(this.charts).forEach(c => c.destroy());
  }

  private fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  loadAll(): void {
    if (this.singleMetricMode && this.selectedKey) {
      this.load(this.selectedKey);
      return;
    }
    this.metrics.forEach(m => this.load(m.key));
  }

  load(key: MetricKey): void {
    this.loading[key] = true;
    this.error[key] = '';
    const done = (val: any) => {
      this.data[key] = val;
      this.loading[key] = false;
      setTimeout(() => this.renderChart(key), 80);
    };
    const fail = (err: any) => {
      this.loading[key] = false;
      this.error[key] = err?.status === 403
        ? 'You do not have permission to view this report.'
        : (err?.error?.message ?? `Could not load (HTTP ${err?.status ?? 'error'}).`);
    };

    switch (key) {
      case 'arpu':       this.analytics.getArpu(this.cycleId).subscribe({ next: done, error: fail }); break;
      case 'churn':      this.analytics.getChurn(this.periodStart, this.periodEnd).subscribe({ next: done, error: fail }); break;
      case 'network':    this.analytics.getNetworkUtilisation(this.cycleId).subscribe({ next: done, error: fail }); break;
      case 'sla':        this.analytics.getSlaCompliance(this.periodStart, this.periodEnd).subscribe({ next: done, error: fail }); break;
      case 'collection': this.analytics.getCollectionEfficiency(this.cycleId).subscribe({ next: done, error: fail }); break;
      case 'growth':     this.analytics.getSubscriberGrowth(this.periodStart, this.periodEnd).subscribe({ next: done, error: fail }); break;
    }
  }

  /** Convenience for the template: total data in GB. */
  toGb(mb: number): number {
    return Math.round(((mb ?? 0) / 1024) * 100) / 100;
  }

  export(m: MetricMeta, format: ExportFormat): void {
    const query = m.driver === 'cycle'
      ? { cycleId: this.cycleId }
      : { periodStart: this.periodStart, periodEnd: this.periodEnd };
    this.analytics.exportMetric(m.slug, format, query).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${m.slug}-report.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success(`${m.title} exported as ${format.toUpperCase()}.`);
      },
      error: (err) => this.toast.error(`Export failed: ${err?.error?.message ?? `HTTP ${err?.status ?? 'error'}`}`)
    });
  }

  // ── Charts ────────────────────────────────────────────────────────────────
  private renderChart(key: MetricKey): void {
    const canvas = document.getElementById(`chart-${key}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    this.charts[key]?.destroy();
    const d = this.data[key];
    if (!d) return;

    const palette = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    switch (key) {
      case 'arpu': {
        const hideEnterprise = this.role === 'Billing';
        const arpuLabels = hideEnterprise ? ['Prepaid', 'Postpaid'] : ['Prepaid', 'Postpaid', 'Enterprise'];
        const arpuData = hideEnterprise ? [d.arpuPrepaid, d.arpuPostpaid] : [d.arpuPrepaid, d.arpuPostpaid, d.arpuEnterprise];
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: arpuLabels,
            datasets: [{ label: 'ARPU (₹)', data: arpuData, backgroundColor: palette.slice(0, arpuLabels.length) }]
          },
          options: this.baseOpts()
        });
        break;
      }
      case 'churn': {
        const retained = Math.max(0, (d.subscribersAtPeriodStart ?? 0) - (d.grossChurned ?? 0));
        this.charts[key] = new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: ['Retained', 'Terminated', 'Ported Out'],
            datasets: [{ data: [retained, d.terminatedAccounts, d.portedOutLines], backgroundColor: ['#10b981', '#ef4444', '#f59e0b'] }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
        break;
      }
      case 'network':
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['Avg Data (MB)', 'Avg Voice (min)'],
            datasets: [{ label: 'Per subscriber', data: [d.avgDataPerSubscriberMb, d.avgVoicePerSubscriberMin], backgroundColor: [palette[0], palette[2]] }]
          },
          options: this.baseOpts()
        });
        break;
      case 'sla': {
        const stats = d.statsByPriority ?? {};
        const labels = Object.keys(stats);
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'Compliance %', data: labels.map(l => stats[l].complianceRate), backgroundColor: palette }]
          },
          options: this.baseOpts(100)
        });
        break;
      }
      case 'collection':
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['0–30 days', '31–60 days', '60+ days'],
            datasets: [{ label: 'Overdue amount (₹)', data: [d.overdueAmount0To30, d.overdueAmount31To60, d.overdueAmount60Plus], backgroundColor: ['#f59e0b', '#f97316', '#ef4444'] }]
          },
          options: this.baseOpts()
        });
        break;
      case 'growth':
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['Prepaid', 'Postpaid', 'Enterprise'],
            datasets: [{ label: 'New adds', data: [d.prepaidAdds, d.postpaidAdds, d.enterpriseAdds], backgroundColor: palette.slice(0, 3) }]
          },
          options: this.baseOpts()
        });
        break;
    }
  }

  private baseOpts(max?: number): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: { y: { beginAtZero: true, ...(max ? { max } : {}) } }
    };
  }
}
