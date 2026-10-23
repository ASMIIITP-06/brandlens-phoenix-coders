import { Finding, KnowledgeItem } from '../types/brandlens';

export interface PreflightResult {
  findings: Finding[];
  engineMode: 'Rules-only mode' | 'Source-grounded AI + Rules enabled';
  executionTimeMs: number;
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    supportedCount: number;
    unsupportedCount: number;
  };
}

export function runDeterministicPreflight(
  text: string,
  channel: string,
  knowledgeBase: KnowledgeItem[],
  reviewId: string = 'rev-temp',
  workspaceId: string = 'demo-workspace'
): PreflightResult {
  const startTime = performance.now();
  const findings: Finding[] = [];

  const lowerText = text.toLowerCase();

  // 1. Check Glossary / Prohibited & Preferred Terminology
  const glossaryItems = knowledgeBase.filter((k) => k.type === 'glossary' && k.status === 'active');
  for (const item of glossaryItems) {
    if (item.prohibitedTerms && item.prohibitedTerms.length > 0) {
      for (const prohibited of item.prohibitedTerms) {
        const regex = new RegExp(`\\b${escapeRegExp(prohibited)}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          const excerpt = text.substring(Math.max(0, start - 25), Math.min(text.length, end + 25));
          const replacement = item.preferredTerm || 'preferred brand phrasing';

          findings.push({
            id: `fnd-term-${Date.now()}-${findings.length}`,
            reviewId,
            workspaceId,
            category: 'Terminology',
            severity: 'medium',
            excerpt: match[0],
            startOffset: start,
            endOffset: end,
            ruleId: `rule-term-${item.id}`,
            rationale: `"${match[0]}" is on the brand prohibited terminology list. ${item.body || ''}`,
            evidenceStatus: 'supported',
            evidenceIds: [item.id],
            evidenceSourceName: item.sourceName || 'Brand Terminology Guidelines',
            evidenceSourceText: item.sourceText || `Replace "${prohibited}" with "${replacement}".`,
            suggestedRevision: replacement,
            confidence: 0.99,
            status: 'open',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  // 2. Check Specific Slide 08 Delivery Policy & Absolute Promises
  // "Our platform guarantees delivery in 24 hours for every customer."
  const deliveryFact = knowledgeBase.find((k) => k.id === 'kb-fact-delivery-001' || k.title.toLowerCase().includes('delivery'));
  if (lowerText.includes('guarantee') && (lowerText.includes('delivery') || lowerText.includes('24 hours') || lowerText.includes('every customer'))) {
    const matchStr = 'guarantees delivery in 24 hours for every customer';
    const index = lowerText.indexOf(matchStr);
    const excerpt = index !== -1 ? text.substring(index, index + matchStr.length) : 'guarantees delivery in 24 hours for every customer';

    findings.push({
      id: `fnd-abs-delivery-${Date.now()}`,
      reviewId,
      workspaceId,
      category: 'Promotional Claims',
      severity: 'high',
      excerpt: excerpt,
      startOffset: index !== -1 ? index : 0,
      endOffset: index !== -1 ? index + matchStr.length : text.length,
      ruleId: 'rule-policy-delivery-guarantee',
      rationale: '"Guarantees" and "every customer" create an absolute service promise not supported by the approved policy.',
      evidenceStatus: deliveryFact ? 'conflict' : 'unsupported',
      evidenceIds: deliveryFact ? [deliveryFact.id] : [],
      evidenceSourceName: deliveryFact ? (deliveryFact.sourceName || 'Sample Service Policy v3') : 'No approved evidence found',
      evidenceSourceText: deliveryFact ? (deliveryFact.sourceText || 'Standard delivery: 3–5 business days. Expedited delivery only when confirmed for the order.') : 'No approved policy supports a 24-hour guarantee for all customers.',
      suggestedRevision: 'Standard delivery takes 3–5 business days. Expedited delivery may be available when confirmed for your order.',
      confidence: 0.98,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
  }

  // 3. Stale / Expired Facts Detection (e.g., SLA 2023 99.9% uptime)
  const expiredFacts = knowledgeBase.filter((k) => k.status === 'expired' || (k.expiresAt && new Date(k.expiresAt) < new Date()));
  for (const expFact of expiredFacts) {
    if (expFact.title.toLowerCase().includes('sla') || expFact.title.toLowerCase().includes('uptime')) {
      if (lowerText.includes('99.9%') || lowerText.includes('sla')) {
        const matchIdx = lowerText.indexOf('99.9%');
        const excerpt = matchIdx !== -1 ? text.substring(Math.max(0, matchIdx - 15), Math.min(text.length, matchIdx + 30)) : '99.9% uptime SLA';

        findings.push({
          id: `fnd-stale-sla-${Date.now()}`,
          reviewId,
          workspaceId,
          category: 'Facts & Freshness',
          severity: 'high',
          excerpt: excerpt,
          startOffset: matchIdx !== -1 ? matchIdx : 0,
          endOffset: matchIdx !== -1 ? matchIdx + 15 : text.length,
          ruleId: `rule-expired-${expFact.id}`,
          rationale: `Referenced claim relies on "${expFact.sourceName || expFact.title}" which expired on ${expFact.expiresAt || 'a previous cycle'}. Multi-region infrastructure requires updated SLA verification.`,
          evidenceStatus: 'expired_source',
          evidenceIds: [expFact.id],
          evidenceSourceName: `${expFact.sourceName || 'Legacy Source'} [EXPIRED]`,
          evidenceSourceText: expFact.sourceText || expFact.body || 'Expired fact record.',
          suggestedRevision: 'Our high-availability infrastructure provides verified enterprise-grade uptime under our current service terms.',
          confidence: 0.94,
          status: 'open',
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // 4. Unsupported Extreme / Universal Claims (Strictly "No approved evidence found")
  // e.g. "100% infallible", "best in the world", "eliminates all human error forever", "unbeatable"
  const extremeClaimPatterns = [
    {
      regex: /\b(100%\s+infallible|eliminates?\s+all\s+human\s+error|zero\s+risk\s+guaranteed)\b/gi,
      reason: 'Absolute claim of infallibility without scientific or operational documentation.'
    },
    {
      regex: /\b(the\s+best\s+in\s+the\s+world|unbeatable\s+solution|world's\s+greatest)\b/gi,
      reason: 'Unsubstantiated superlative claim prohibited in promotional copy unless backed by certified third-party benchmark.'
    },
    {
      regex: /\b(guarantees?\s+(revenue|wealth|instant\s+growth|10x))\b/gi,
      reason: 'Financial and performance guarantee violates consumer protection standards and approved commercial rules.'
    }
  ];

  for (const { regex, reason } of extremeClaimPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      findings.push({
        id: `fnd-unsupported-${Date.now()}-${findings.length}`,
        reviewId,
        workspaceId,
        category: 'Promotional Claims',
        severity: 'high',
        excerpt: match[0],
        startOffset: start,
        endOffset: end,
        ruleId: 'rule-unsupported-superlative',
        rationale: reason,
        evidenceStatus: 'unsupported',
        evidenceIds: [],
        evidenceSourceName: 'No approved evidence found',
        evidenceSourceText: 'No approved knowledge item, study, or policy in Phoenix Studio validates this absolute claim.',
        suggestedRevision: 'BrandLens provides high-precision preflight checks designed to assist human reviewers and accelerate quality governance.',
        confidence: 0.96,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    }
  }

  // 5. Accessibility Checks (WCAG 2.4.4 Link Purpose)
  const vagueLinkRegex = /\b(click\s+here|read\s+more|link\s+here|learn\s+more\s+at)\b/gi;
  let linkMatch;
  while ((linkMatch = vagueLinkRegex.exec(text)) !== null) {
    const start = linkMatch.index;
    const end = start + linkMatch[0].length;
    findings.push({
      id: `fnd-a11y-${Date.now()}-${findings.length}`,
      reviewId,
      workspaceId,
      category: 'Accessibility',
      severity: 'medium',
      excerpt: linkMatch[0],
      startOffset: start,
      endOffset: end,
      ruleId: 'rule-wcag-link-purpose',
      rationale: `Vague anchor phrasing "${linkMatch[0]}" fails WCAG 2.4.4. Users using assistive screen readers require descriptive link labels.`,
      evidenceStatus: 'supported',
      evidenceIds: [],
      evidenceSourceName: 'WCAG 2.4.4 Link Purpose (In Context)',
      evidenceSourceText: 'The purpose of each link can be determined from the link text alone or from the link text together with its programmatically determined link context.',
      suggestedRevision: 'review the compliance audit summary',
      confidence: 0.95,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
  }

  // 6. Tone & Voice Principle Warnings
  const aggressivePatterns = [
    /\b(act\s+now\s+or\s+regret|don't\s+be\s+stupid|before\s+it's\s+too\s+late|foolish\s+to\s+ignore)\b/gi,
    /\b(obviously|as\s+any\s+smart\s+person\s+knows)\b/gi
  ];
  for (const regex of aggressivePatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      findings.push({
        id: `fnd-tone-${Date.now()}-${findings.length}`,
        reviewId,
        workspaceId,
        category: 'Tone & Voice',
        severity: 'medium',
        excerpt: match[0],
        startOffset: start,
        endOffset: end,
        ruleId: 'rule-tone-respectful',
        rationale: `Phrasing "${match[0]}" violates Phoenix brand tone principle of calm confidence and respectful audience engagement.`,
        evidenceStatus: 'supported',
        evidenceIds: ['kb-tone-empowerment-005'],
        evidenceSourceName: 'Brand Personality & Voice System',
        evidenceSourceText: 'Our voice is authoritative, transparent, and respectful. Never use artificial scarcity or shaming copy.',
        suggestedRevision: 'Explore how Phoenix Studio supports your quality workflows.',
        confidence: 0.92,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    }
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    findings,
    engineMode: 'Rules-only mode',
    executionTimeMs,
    stats: {
      total: findings.length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      supportedCount: findings.filter((f) => f.evidenceStatus === 'supported').length,
      unsupportedCount: findings.filter((f) => f.evidenceStatus === 'unsupported').length,
    },
  };
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
