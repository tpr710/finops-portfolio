# FinOps Portfolio — AcmeCo Cloud Cost Analysis

A hands-on FinOps portfolio project simulating cloud cost analysis for a fictional 200-person SaaS company (AcmeCo) on AWS.

## 📋 Scenario

**Company:** AcmeCo — a B2B SaaS company, 200 employees, Series B  
**Cloud:** AWS  
**Monthly spend:** ~$67,000/month  
**Teams:** Engineering, Data, Staging, Infra  
**Problem:** Costs growing ~18%/year with no visibility or accountability

## 🗂️ Project Structure

```
finops-portfolio/
├── data/
│   └── mock_billing.csv        # Simulated AWS Cost Explorer export (1,008 rows)
├── scripts/
│   └── cost_analysis.py        # Cost breakdown, anomaly detection, savings analysis
├── reports/
│   ├── AcmeCo_FinOps_Report_2024.md   # Full findings and recommendations
│   └── summary.json            # Machine-readable summary output
└── README.md
```

## 🔍 Key Findings

| Metric | Value |
|--------|-------|
| Total 2024 spend | $805,750 |
| Monthly average | $67,146 |
| Non-prod spend % | 37.2% (above 25% benchmark) |
| YoY growth | +17.8% |
| **Identified savings** | **$166,842/year (20.7%)** |

## 💡 Top Recommendations

1. **Schedule staging compute** — $76,947/year savings (nights + weekends off)
2. **Rightsize dev instances** — $40,427/year savings (over-provisioned)
3. **Reserved Instances for prod EC2** — $49,468/year savings (1-yr commitment)

## 🚀 How to Run

```bash
# Install dependencies
pip install pandas numpy

# Generate mock billing data
python3 scripts/cost_analysis.py
```

## 🌿 Git Workflow

This project follows a feature-branch workflow:

```
main
├── feature/data-generation
├── feature/cost-analysis
├── feature/savings-recommendations
└── feature/reporting
```

Each phase was developed in its own branch, reviewed, and merged to main via pull request.

## 📚 FinOps Concepts Demonstrated

- **Cost allocation** by team, service, and environment
- **Tagging strategy** (team + environment dimensions)
- **Waste identification** (non-prod over-spend)
- **Rightsizing analysis** (utilization-based)
- **Rate optimization** (Reserved Instances)
- **FinOps reporting** (executive summary + detailed findings)

## 🛠️ Tools & Skills

- Python (pandas, numpy) for data analysis
- AWS Cost Explorer (simulated export format)
- Git / GitHub for version control
- Markdown for documentation

---

*Built as a FinOps portfolio project. All data is fictional.*
