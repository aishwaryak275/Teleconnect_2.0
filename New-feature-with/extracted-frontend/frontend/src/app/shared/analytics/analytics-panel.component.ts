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
    const barStyle = { borderRadius: 18, borderSkipped: false, maxBarThickness: 42, barPercentage: 0.72, categoryPercentage: 0.72 };
    const suggestedMax = (values: number[]): number | undefined => {
      const max = Math.max(...values);
      if (!isFinite(max) || max <= 0) return undefined;
      return Math.ceil(max * 1.15);
    };

    switch (key) {
      case 'arpu': {
        const arpuLabels = ['Prepaid', 'Postpaid'];
        const arpuData = [d.arpuPrepaid, d.arpuPostpaid];
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: arpuLabels,
            datasets: [{ label: 'ARPU (₹)', data: arpuData, backgroundColor: palette.slice(0, arpuLabels.length), ...barStyle }]
          },
          options: this.baseOpts(suggestedMax(arpuData), 'Plan Segment', 'ARPU (₹)', value => `₹${value}`)
        });
        break;
      }
      case 'churn': {
        const retained = Math.max(0, (d.subscribersAtPeriodStart ?? 0) - (d.grossChurned ?? 0));
        this.charts[key] = new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: ['Retained', 'Terminated', 'Ported Out'],
            datasets: [{ data: [retained, d.terminatedAccounts, d.portedOutLines], backgroundColor: ['#10b981', '#ef4444', '#f59e0b'], borderWidth: 0 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: { legend: { position: 'bottom' } }
          }
        });
        break;
      }
      case 'network': {
        const networkData = [d.avgDataPerSubscriberMb, d.avgVoicePerSubscriberMin];
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['Avg Data (MB)', 'Avg Voice (min)'],
            datasets: [
              { label: 'Avg Data (MB)', data: [d.avgDataPerSubscriberMb, 0], backgroundColor: palette[0], yAxisID: 'left', ...barStyle },
              { label: 'Avg Voice (min)', data: [0, d.avgVoicePerSubscriberMin], backgroundColor: palette[2], yAxisID: 'right', ...barStyle }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: {
              x: { grid: { display: false } },
              left: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Avg Data (MB)' },
                ticks: { color: '#475569' }
              },
              right: {
                type: 'linear',
                position: 'right',
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Avg Voice (min)' },
                ticks: { color: '#475569' }
              }
            }
          }
        });
        break;
      }
      case 'sla': {
        const stats = d.statsByPriority ?? {};
        const labels = Object.keys(stats);
        const dataValues = labels.map(l => stats[l].complianceRate);
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'Compliance %', data: dataValues, backgroundColor: palette, ...barStyle }]
          },
          options: this.baseOpts(100, 'Priority', 'Compliance %', value => `${value}%`)
        });
        break;
      }
      case 'collection': {
        const collectionValues = [d.overdueAmount0to30, d.overdueAmount31to60, d.overdueAmount60plus];
        this.charts[key] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['0–30 days', '31–60 days', '60+ days'],
            datasets: [{ label: 'Overdue amount (₹)', data: collectionValues, backgroundColor: ['#f59e0b', '#f97316', '#ef4444'], ...barStyle }]
          },
          options: this.baseOpts(suggestedMax(collectionValues), 'Aging bucket', 'Overdue amount (₹)', value => `₹${value}`)
        });
        break;
      }
      case 'growth': {
        const growthValues = [d.prepaidAdds ?? 0, d.postpaidAdds ?? 0];
        this.charts[key] = new Chart(canvas, {
          type: 'line',
          data: {
            labels: ['Prepaid', 'Postpaid'],
            datasets: [{
              label: 'New adds',
              data: growthValues,
              borderColor: palette[0],
              backgroundColor: 'rgba(14,165,233,0.18)',
              fill: true,
              tension: 0.35,
              pointRadius: 6,
              pointBackgroundColor: palette[0],
              pointBorderColor: '#ffffff',
              pointHoverRadius: 8,
              pointHoverBorderWidth: 2
            }]
          },
          options: this.baseOpts(suggestedMax(growthValues), 'Segment', 'New adds', value => String(value))
        });
        break;
      }
    }
  }

  private baseOpts(max?: number, xLabel = 'Category', yLabel = 'Value', formatValue?: (value: any) => string): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 12, boxHeight: 12 } },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label ? `${context.dataset.label}: ` : '';
              const value = context.parsed?.y ?? context.parsed ?? context.raw;
              return `${label}${formatValue ? formatValue(value) : value}`;
            }
          }
        }
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: xLabel, color: '#475569', font: { size: 12, weight: '600' } },
          ticks: { color: '#475569' }
        },
        y: {
          beginAtZero: true,
          ...(max ? { suggestedMax: max } : {}),
          grid: { color: 'rgba(148, 163, 184, 0.16)' },
          title: { display: true, text: yLabel, color: '#475569', font: { size: 12, weight: '600' } },
          ticks: { color: '#475569' }
        }
      }
    };
  }
}
