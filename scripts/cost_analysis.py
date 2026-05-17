"""
FinOps Portfolio - AcmeCo Cost Analysis
Scenario: AcmeCo is a 200-person SaaS company spending ~$80k/month on AWS
across 4 teams: engineering, data, staging, and infra.

Goal: Identify waste, anomalies, and savings opportunities.
"""

import pandas as pd
import json

# ── Load data ──────────────────────────────────────────────────────────────
df = pd.read_csv('../data/mock_billing.csv')
df['month'] = pd.to_datetime(df['month'])

print("=" * 60)
print("ACMECO FINOPS ANALYSIS REPORT")
print("=" * 60)

# ── 1. Total annual spend ──────────────────────────────────────────────────
total = df['cost_usd'].sum()
print(f"\n📊 Total Annual Spend: ${total:,.0f}")
print(f"   Monthly Average:     ${total/12:,.0f}")

# ── 2. Spend by team ──────────────────────────────────────────────────────
print("\n📁 Annual Spend by Team:")
team_spend = df.groupby('team')['cost_usd'].sum().sort_values(ascending=False)
for team, cost in team_spend.items():
    pct = cost / total * 100
    print(f"   {team:<15} ${cost:>10,.0f}  ({pct:.1f}%)")

# ── 3. Spend by service ────────────────────────────────────────────────────
print("\n⚙️  Annual Spend by Service:")
svc_spend = df.groupby('service')['cost_usd'].sum().sort_values(ascending=False)
for svc, cost in svc_spend.items():
    pct = cost / total * 100
    print(f"   {svc:<15} ${cost:>10,.0f}  ({pct:.1f}%)")

# ── 4. Environment waste analysis ─────────────────────────────────────────
print("\n🚨 Waste Analysis — Non-Production Spend:")
env_spend = df.groupby('environment')['cost_usd'].sum()
non_prod = env_spend.get('staging', 0) + env_spend.get('dev', 0)
prod = env_spend.get('production', 0)
print(f"   Production:  ${prod:>10,.0f}")
print(f"   Staging:     ${env_spend.get('staging',0):>10,.0f}")
print(f"   Dev:         ${env_spend.get('dev',0):>10,.0f}")
print(f"   Non-prod %:  {non_prod/(non_prod+prod)*100:.1f}% of total")

# ── 5. Month-over-month growth ────────────────────────────────────────────
print("\n📈 Month-over-Month Spend Trend:")
monthly = df.groupby('month')['cost_usd'].sum()
for i, (month, cost) in enumerate(monthly.items()):
    if i == 0:
        print(f"   {month.strftime('%Y-%m')}  ${cost:>8,.0f}")
    else:
        prev = monthly.iloc[i-1]
        delta = (cost - prev) / prev * 100
        arrow = "↑" if delta > 0 else "↓"
        print(f"   {month.strftime('%Y-%m')}  ${cost:>8,.0f}  {arrow} {abs(delta):.1f}%")

# ── 6. Savings recommendations ────────────────────────────────────────────
print("\n💡 Optimization Recommendations:")

# Staging EC2/EKS running 24/7
staging_compute = df[
    (df['environment'] == 'staging') &
    (df['service'].isin(['EC2', 'EKS']))
]['cost_usd'].sum()
savings_schedule = staging_compute * 0.65  # off overnight + weekends
print(f"\n   [1] Schedule staging compute (nights + weekends off)")
print(f"       Current staging EC2/EKS: ${staging_compute:,.0f}/year")
print(f"       Estimated savings:        ${savings_schedule:,.0f}/year (~65%)")

# Dev environment rightsizing
dev_spend = df[df['environment'] == 'dev']['cost_usd'].sum()
savings_dev = dev_spend * 0.40
print(f"\n   [2] Rightsize dev instances (over-provisioned)")
print(f"       Current dev spend:        ${dev_spend:,.0f}/year")
print(f"       Estimated savings:        ${savings_dev:,.0f}/year (~40%)")

# Reserved Instances for production EC2
prod_ec2 = df[
    (df['environment'] == 'production') &
    (df['service'] == 'EC2')
]['cost_usd'].sum()
savings_ri = prod_ec2 * 0.30
print(f"\n   [3] Purchase 1-yr Reserved Instances for prod EC2")
print(f"       Current on-demand EC2:    ${prod_ec2:,.0f}/year")
print(f"       Estimated savings:        ${savings_ri:,.0f}/year (~30%)")

total_savings = savings_schedule + savings_dev + savings_ri
print(f"\n   ─────────────────────────────────────────")
print(f"   TOTAL POTENTIAL SAVINGS: ${total_savings:,.0f}/year")
print(f"   ({total_savings/total*100:.1f}% of current spend)")

# ── 7. Export summary JSON ────────────────────────────────────────────────
summary = {
    "total_annual_spend": round(total, 2),
    "monthly_average": round(total / 12, 2),
    "by_team": team_spend.round(2).to_dict(),
    "by_service": svc_spend.round(2).to_dict(),
    "by_environment": env_spend.round(2).to_dict(),
    "total_potential_savings": round(total_savings, 2),
    "savings_pct": round(total_savings / total * 100, 1)
}

with open('../reports/summary.json', 'w') as f:
    json.dump(summary, f, indent=2)

print("\n✅ Summary exported to reports/summary.json")
print("=" * 60)
