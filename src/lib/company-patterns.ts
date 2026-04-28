export interface CompanyPattern {
  name: string;
  style: string;
  focusAreas: string[];
  questionTypes: string[];
  tips: string[];
  leadership_principles?: string[];
}

export const companyPatterns: Record<string, CompanyPattern> = {
  amazon: {
    name: "Amazon",
    style: "Leadership Principle (LP) focused behavioral interviews",
    focusAreas: ["Leadership Principles", "Data-driven decisions", "Customer obsession", "Ownership"],
    questionTypes: ["behavioral", "system-design", "coding"],
    tips: [
      "Every answer should map to 1-2 Leadership Principles",
      "Use STAR format strictly — quantify results",
      "Show bias for action and ownership",
      "Demonstrate customer-centric thinking",
    ],
    leadership_principles: [
      "Customer Obsession", "Ownership", "Invent and Simplify", "Are Right, A Lot",
      "Learn and Be Curious", "Hire and Develop the Best", "Insist on the Highest Standards",
      "Think Big", "Bias for Action", "Frugality", "Earn Trust", "Dive Deep",
      "Have Backbone; Disagree and Commit", "Deliver Results", "Strive to be Earth's Best Employer",
      "Success and Scale Bring Broad Responsibility",
    ],
  },
  google: {
    name: "Google",
    style: "Googleyness + general cognitive ability + role-related knowledge",
    focusAreas: ["Problem solving", "Cognitive ability", "Leadership", "Googleyness"],
    questionTypes: ["coding", "system-design", "behavioral"],
    tips: [
      "Demonstrate intellectual curiosity and humility",
      "Show collaborative problem-solving approach",
      "Explain thought process clearly while coding",
      "Show ambiguity tolerance — ask clarifying questions",
    ],
  },
  meta: {
    name: "Meta",
    style: "Move fast, impact-driven behavioral + strong coding",
    focusAreas: ["Impact", "Moving fast", "Building for scale", "Openness"],
    questionTypes: ["coding", "system-design", "behavioral"],
    tips: [
      "Emphasize speed of execution and iteration",
      "Show measurable impact in your stories",
      "Demonstrate comfort with ambiguity and change",
      "Focus on scale — billions of users mindset",
    ],
  },
  microsoft: {
    name: "Microsoft",
    style: "Growth mindset + collaboration + technical depth",
    focusAreas: ["Growth mindset", "Collaboration", "Customer empathy", "Diversity & inclusion"],
    questionTypes: ["coding", "system-design", "behavioral"],
    tips: [
      "Show learning from failures (growth mindset)",
      "Emphasize cross-team collaboration",
      "Demonstrate customer empathy",
      "Show how you helped others grow",
    ],
  },
  apple: {
    name: "Apple",
    style: "Craft-focused, attention to detail, passion for products",
    focusAreas: ["Craft quality", "Attention to detail", "Innovation", "User experience"],
    questionTypes: ["coding", "system-design", "behavioral"],
    tips: [
      "Show passion for Apple products and their design philosophy",
      "Emphasize craft and attention to detail",
      "Demonstrate end-to-end ownership",
      "Show how you challenge the status quo",
    ],
  },
  netflix: {
    name: "Netflix",
    style: "Culture-heavy, values freedom and responsibility",
    focusAreas: ["Judgment", "Communication", "Impact", "Curiosity", "Innovation", "Courage", "Inclusion"],
    questionTypes: ["behavioral", "system-design", "coding"],
    tips: [
      "Show independent judgment and decision-making",
      "Demonstrate candid communication",
      "Show how you challenged popular opinions constructively",
      "Emphasize high-impact, context-driven decisions",
    ],
  },
  startup: {
    name: "Startup (Generic)",
    style: "Scrappy, full-stack, wear-many-hats",
    focusAreas: ["Versatility", "Speed", "Ownership", "Resourcefulness"],
    questionTypes: ["coding", "system-design", "behavioral"],
    tips: [
      "Show you can work across the stack",
      "Emphasize speed and shipping",
      "Demonstrate resourcefulness with constraints",
      "Show comfort with ambiguity and rapid change",
    ],
  },
};

export function getCompanyPattern(company: string): CompanyPattern {
  const key = company.toLowerCase().replace(/[^a-z]/g, "");
  return companyPatterns[key] || companyPatterns.startup;
}

export function getAllCompanyNames(): string[] {
  return Object.values(companyPatterns).map(p => p.name);
}
