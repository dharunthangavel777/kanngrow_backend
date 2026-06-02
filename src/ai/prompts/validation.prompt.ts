export const VALIDATION_PROMPT = (productName: string, context: string) => `You are an expert e-commerce market analyst. Validate this product idea rigorously.

Product: ${productName}

User Context:
${context}

Analyze this product across 5 dimensions and respond ONLY with valid JSON:
{
  "overallScore": 78,
  "verdict": "Strong Opportunity",
  "dimensions": {
    "marketDemand": {
      "score": 85,
      "insight": "Growing demand driven by..."
    },
    "competition": {
      "score": 60,
      "insight": "Moderate competition with..."
    },
    "profitPotential": {
      "score": 80,
      "estimatedMargin": "40-55%",
      "insight": "Strong margins due to..."
    },
    "executionDifficulty": {
      "score": 70,
      "insight": "Relatively easy to start because..."
    },
    "riskLevel": {
      "score": 75,
      "insight": "Main risk is..."
    }
  },
  "topRisks": ["Risk 1", "Risk 2"],
  "quickWins": ["Action 1 this week", "Action 2 next week"],
  "verdict_detail": "Full explanation of recommendation"
}`;

export const COMPETITOR_ANALYSIS_PROMPT = (niche: string, context: string) => `You are a competitive intelligence expert for e-commerce.

Niche: ${niche}
User Context: ${context}

Identify the competitive landscape and respond ONLY with valid JSON:
{
  "topCompetitors": [
    {
      "name": "Competitor name",
      "platform": "Shopify / Amazon / etc",
      "estimatedRevenue": "$1M-$5M/month",
      "strengths": ["strength 1"],
      "weaknesses": ["weakness 1"],
      "priceRange": "$20-$80"
    }
  ],
  "marketGaps": ["Gap 1 you can exploit", "Gap 2"],
  "differentiationStrategy": "How to stand out",
  "entryDifficulty": "Medium"
}`;
