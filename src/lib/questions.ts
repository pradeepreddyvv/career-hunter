import type { Question } from "@/types/interview";

export const AMAZON_LP_QUESTIONS: Question[] = [
  {
    id: "lp1",
    text: "Tell me about a time you went above and beyond for a customer or end user.",
    lp: "Customer Obsession",
    lpFull: "Leaders start with the customer and work backwards. They work vigorously to earn and keep customer trust.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you measure the impact on the customer?",
      "What would you do differently?",
      "How did you know what the customer really needed?",
    ],
    hint: "Focus on customer-centric metrics and direct impact.",
  },
  {
    id: "lp2",
    text: "Tell me about a time you took on something significant outside your area of responsibility.",
    lp: "Ownership",
    lpFull: 'Leaders are owners. They think long term and don\'t sacrifice long-term value for short-term results. They never say "that\'s not my job."',
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "Why did you feel it was your responsibility?",
      "How did your manager react?",
      "What was the long-term impact?",
    ],
    hint: "Show initiative and long-term thinking beyond your job description.",
  },
  {
    id: "lp3",
    text: "Tell me about a time you found a simple solution to a complex problem.",
    lp: "Invent and Simplify",
    lpFull: "Leaders expect and require innovation and invention from their teams and always find ways to simplify.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "What made the original approach too complex?",
      "How did others react to your simpler solution?",
      "Were there trade-offs?",
    ],
    hint: "Contrast the complex approach with your simplified version.",
  },
  {
    id: "lp4",
    text: "Tell me about a time you made a decision with incomplete data and it turned out to be the right call.",
    lp: "Are Right, A Lot",
    lpFull: "Leaders are right a lot. They have strong judgment and good instincts. They seek diverse perspectives and work to disconfirm their beliefs.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "What data did you have vs. what was missing?",
      "How did you weigh the risks?",
      "What would have happened if you were wrong?",
    ],
    hint: "Show judgment under uncertainty and how you validated your decision.",
  },
  {
    id: "lp5",
    text: "Tell me about a time you taught yourself a new technology or skill to solve a problem.",
    lp: "Learn and Be Curious",
    lpFull: "Leaders are never done learning and always seek to improve themselves. They are curious about new possibilities and act to explore them.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you approach learning it?",
      "What resources did you use?",
      "How long did it take to become productive?",
    ],
    hint: "Show self-directed learning with a concrete outcome.",
  },
  {
    id: "lp6",
    text: "Tell me about a time you mentored someone or helped a team member grow.",
    lp: "Hire and Develop the Best",
    lpFull: "Leaders raise the performance bar with every hire and promotion. They recognize exceptional talent and take seriously their role in coaching others.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you tailor your approach to their learning style?",
      "What was the measurable outcome?",
      "What did you learn from mentoring them?",
    ],
    hint: "Highlight how you identified their needs and measured growth.",
  },
  {
    id: "lp7",
    text: "Tell me about a time you found a defect or quality issue others had missed.",
    lp: "Insist on the Highest Standards",
    lpFull: "Leaders have relentlessly high standards. Leaders are continually raising the bar and drive their teams to deliver high quality products, services, and processes.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you discover it?",
      "What was the potential impact if it had gone unnoticed?",
      "How did you prevent similar issues?",
    ],
    hint: "Show attention to detail and systematic prevention of future issues.",
  },
  {
    id: "lp8",
    text: "Tell me about a time you proposed a bold idea that went beyond the original scope.",
    lp: "Think Big",
    lpFull: "Thinking small is a self-fulfilling prophecy. Leaders create and communicate a bold direction that inspires results.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you convince others?",
      "What was the outcome?",
      "Was there pushback?",
    ],
    hint: "Show vision and ability to rally others around a bigger goal.",
  },
  {
    id: "lp9",
    text: "Tell me about a time you took action without waiting for complete information.",
    lp: "Bias for Action",
    lpFull: "Speed matters in business. Many decisions and actions are reversible and do not need extensive study. We value calculated risk taking.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "What was the urgency?",
      "What risks did you consider?",
      "Would you make the same decision again?",
    ],
    hint: "Show calculated speed and reversible decision-making.",
  },
  {
    id: "lp10",
    text: "Tell me about a time you accomplished something significant with limited resources.",
    lp: "Frugality",
    lpFull: "Accomplish more with less. Constraints breed resourcefulness, self-sufficiency, and invention.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "What constraints were you working with?",
      "What creative alternatives did you consider?",
      "How much did you save?",
    ],
    hint: "Quantify the resource constraints and creative workaround.",
  },
  {
    id: "lp11",
    text: "Tell me about a time you had to earn the trust of a skeptical stakeholder.",
    lp: "Earn Trust",
    lpFull: "Leaders listen attentively, speak candidly, and treat others respectfully. They are vocally self-critical, even when doing so is awkward.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "Why were they skeptical?",
      "How did you demonstrate credibility?",
      "What changed their mind?",
    ],
    hint: "Show empathy, transparency, and consistent follow-through.",
  },
  {
    id: "lp12",
    text: "Tell me about a time you had to dig into the details to find the root cause of a problem.",
    lp: "Dive Deep",
    lpFull: "Leaders operate at all levels, stay connected to the details, audit frequently, and are skeptical when metrics and anecdote differ.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "What was your debugging process?",
      "How deep did you have to go?",
      "What tools or techniques did you use?",
    ],
    hint: "Walk through your systematic investigation step by step.",
  },
  {
    id: "lp13",
    text: "Tell me about a time you disagreed with a team decision but committed to it anyway.",
    lp: "Have Backbone; Disagree and Commit",
    lpFull: "Leaders are obligated to respectfully challenge decisions when they disagree. Once a decision is determined, they commit wholly.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "What was your argument?",
      "How did you show commitment after the decision?",
      "Was the final decision the right one?",
    ],
    hint: "Show respectful disagreement with data, then full commitment.",
  },
  {
    id: "lp14",
    text: "Tell me about a time you delivered an important project under tight deadlines.",
    lp: "Deliver Results",
    lpFull: "Leaders focus on the key inputs for their business and deliver them with the right quality and in a timely fashion.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you prioritize?",
      "What did you sacrifice to meet the deadline?",
      "What was the final outcome?",
    ],
    hint: "Show prioritization, trade-off decisions, and quantified results.",
  },
  {
    id: "lp15",
    text: "Tell me about a time you improved the work environment or process for your team.",
    lp: "Strive to be Earth's Best Employer",
    lpFull: "Leaders work every day to create a safer, more productive, higher performing, more diverse, and more just work environment.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "How did you identify the improvement opportunity?",
      "How did the team respond?",
      "Was it adopted broadly?",
    ],
    hint: "Show initiative in improving team productivity or culture.",
  },
  {
    id: "lp16",
    text: "Tell me about a time you considered the broader impact of your work beyond your immediate team.",
    lp: "Success and Scale Bring Broad Responsibility",
    lpFull: "We are big, we impact the world, and we are far from perfect. We must be humble and thoughtful about even the secondary effects of our actions.",
    type: "behavioral",
    company: "Amazon",
    followUps: [
      "Who else was affected?",
      "What broader consequences did you consider?",
      "How did you balance team needs vs. broader impact?",
    ],
    hint: "Show awareness of downstream effects and cross-team impact.",
  },
];

const COMPANY_QUESTIONS: Record<string, Question[]> = {
  Amazon: AMAZON_LP_QUESTIONS,
};

export function getSessionQuestions(
  count = 5,
  company = "Amazon"
): Question[] {
  const pool = COMPANY_QUESTIONS[company] || AMAZON_LP_QUESTIONS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getQuestionByLp(lp: string): Question | undefined {
  return AMAZON_LP_QUESTIONS.find((q) => q.lp === lp);
}

export function getAllQuestions(company?: string): Question[] {
  if (company && COMPANY_QUESTIONS[company]) {
    return COMPANY_QUESTIONS[company];
  }
  return AMAZON_LP_QUESTIONS;
}
