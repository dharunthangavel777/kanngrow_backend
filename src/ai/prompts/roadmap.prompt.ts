export const ROADMAP_PROMPT = (context: string, goal: string) => `You are a startup coach specializing in e-commerce launch strategies.

User Context:
${context}
Primary Goal: ${goal}

Create a realistic 90-day e-commerce launch roadmap and respond ONLY with valid JSON:
{
  "title": "Your 90-Day E-commerce Launch Roadmap",
  "phases": [
    {
      "phase": 1,
      "title": "Foundation (Days 1-30)",
      "description": "Phase overview",
      "tasks": [
        {
          "week": 1,
          "task": "Task description",
          "priority": "High",
          "timeEstimate": "3 hours"
        }
      ]
    }
  ],
  "keyMilestones": [
    { "day": 30, "milestone": "First product sourced and validated" },
    { "day": 60, "milestone": "Store live with 10 orders" },
    { "day": 90, "milestone": "Profitable month achieved" }
  ],
  "successMetrics": ["Metric 1", "Metric 2"]
}`;

export const BUSINESS_PLAN_PROMPT = (context: string) => `You are an expert business plan writer for e-commerce startups.

User Context:
${context}

Generate a comprehensive e-commerce business plan and respond ONLY with valid JSON:
{
  "executiveSummary": "2-3 sentence overview",
  "productStrategy": "What you sell and why",
  "marketAnalysis": {
    "targetMarketSize": "$X billion",
    "targetCustomer": "Description",
    "marketTrends": ["Trend 1", "Trend 2"]
  },
  "revenueModel": {
    "primaryStream": "How you make money",
    "pricingStrategy": "How you price",
    "projectedYear1Revenue": "$X",
    "breakEvenMonths": 4
  },
  "operationsplan": "How you run the business",
  "marketingStrategy": {
    "channels": ["Channel 1", "Channel 2"],
    "budget": "Monthly ad spend allocation",
    "cac": "Estimated customer acquisition cost"
  },
  "financialHighlights": {
    "startupCost": "$X",
    "monthlyOperatingCost": "$X",
    "expectedGrossMargin": "X%"
  }
}`;
