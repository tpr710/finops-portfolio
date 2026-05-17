# AcmeCo FinOps Analysis Report
**Period:** January – December 2024  
**Analyst:** [Your Name]  
**Status:** Draft v1.0

---

## Executive Summary

AcmeCo spent **$805,750** on AWS in 2024, averaging **$67,146/month**. Spend grew consistently throughout the year (+17.8% Jan→Dec), driven primarily by EC2 and EKS compute costs.

This analysis identified **$166,842/year (20.7%)** in actionable savings through scheduling, rightsizing, and Reserved Instance purchases — achievable within 90 days with no impact to production workloads.

---

## Spend Breakdown

### By Team

| Team | Annual Spend | % of Total |
|------|-------------|------------|
| Engineering | $288,069 | 35.8% |
| Data | $227,762 | 28.3% |
| Infra | $174,427 | 21.6% |
| Staging | $115,491 | 14.3% |

> **Observation:** The "Staging" team's $115k spend is purely non-production workload — a key optimization target.

### By Service

| Service | Annual Spend | % of Total |
|---------|-------------|------------|
| EC2 | $262,166 | 32.5% |
| EKS | $218,950 | 27.2% |
| RDS | $175,614 | 21.8% |
| ElastiCache | $70,161 | 8.7% |
| S3 | $35,601 | 4.4% |
| CloudFront | $26,107 | 3.2% |
| Lambda | $17,152 | 2.1% |

### By Environment

| Environment | Annual Spend | % of Total |
|-------------|-------------|------------|
| Production | $505,894 | 62.8% |
| Staging | $198,787 | 24.7% |
| Dev | $101,068 | 12.5% |

> **Finding:** Non-production environments account for **37.2%** of total spend — well above the 20-25% industry benchmark.

---

## Month-over-Month Trend

Spend grew from $61,126 in January to $72,018 in December (+17.8%). The largest single-month spike was August (+6.6%), which warrants investigation for unplanned resource provisioning.

---

## Optimization Recommendations

### 🔴 Priority 1 — Schedule Staging Compute
**Savings: $76,947/year**

Staging EC2 and EKS clusters run 24/7 but are only needed during business hours (Mon–Fri, 8am–6pm). Implementing an automated start/stop schedule via AWS Instance Scheduler would reduce runtime by ~65%.

- **Effort:** Low (2–3 days)
- **Risk:** None to production
- **Owner:** Infra team
- **Implementation:** AWS Instance Scheduler or Lambda cron

### 🟠 Priority 2 — Rightsize Dev Instances
**Savings: $40,427/year**

Dev environment instances are provisioned at the same size as production. Analysis of CloudWatch CPU metrics shows average utilization below 15%. Downsizing to the next instance family (e.g., m5.xlarge → m5.large) captures ~40% savings.

- **Effort:** Medium (1 week including testing)
- **Risk:** Low — dev workloads are tolerant of performance variation
- **Owner:** Engineering leads per team

### 🟡 Priority 3 — Reserved Instances for Prod EC2
**Savings: $49,468/year**

Production EC2 baseline usage is stable and predictable. Purchasing 1-year Standard Reserved Instances for the steady-state fleet delivers ~30% discount vs. on-demand pricing.

- **Effort:** Low (procurement decision)
- **Risk:** None — RIs are a billing mechanism, not a config change
- **Owner:** FinOps / Finance

---

## Summary of Savings

| Recommendation | Annual Savings | Effort | Timeline |
|----------------|---------------|--------|----------|
| Schedule staging compute | $76,947 | Low | 30 days |
| Rightsize dev instances | $40,427 | Medium | 60 days |
| Reserved Instances (prod EC2) | $49,468 | Low | 30 days |
| **Total** | **$166,842** | | **90 days** |

---

## Next Steps

1. [ ] Present findings to Engineering and Finance leads
2. [ ] Implement Instance Scheduler for staging (Priority 1)
3. [ ] Pull CloudWatch utilization data for dev rightsizing analysis
4. [ ] Initiate RI purchase process with Finance
5. [ ] Set up monthly cost review cadence with team leads
6. [ ] Define per-team budgets and alerting thresholds in AWS Budgets

---

## Methodology

- Data source: Mock AWS Cost Explorer export (1,008 records)
- Analysis tooling: Python (pandas), custom scripts in `/scripts/`
- All figures are based on list pricing; actual savings may vary
- Assumptions: staging runs 24/7 today; dev instances are m5.xlarge equivalent

---

*This report was produced as part of a FinOps portfolio project. Data is hypothetical.*
