import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;

if (!GEMINI_API_KEY) {
  console.log("GEMINI_KEY is not set. Skipping AI review.");
  process.exit(0);
}

if (!GITHUB_TOKEN) {
  console.log("GITHUB_TOKEN is not set. Skipping AI review.");
  process.exit(0);
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
});

const tools: Interactions.Tool[] = [
    {
        type: 'google_search',
    },
];

const generationConfig = {
    max_output_tokens: 65536,
    thinkingLevel: 'medium',
};

async function run() {
  try {
    // 1. Get the diff
    console.log(`Getting diff between ${BASE_SHA} and ${HEAD_SHA}`);
    const diff = execSync(`git diff ${BASE_SHA} ${HEAD_SHA}`).toString();

    if (!diff.trim()) {
      console.log("No diff found. Skipping review.");
      return;
    }

    if (diff.length > 50000) {
      console.log("Diff is too large for AI review (max 50,000 characters). Skipping.");
      return;
    }

    // 2. Call Gemini API
    console.log("Requesting review from Gemini 3.5 Flash...");
    const prompt = `You are a senior software engineer conducting a code review on a pull request.
Review the following git diff and provide constructive, human-like, and professional feedback.
Focus on identifying logic errors, security issues, performance bottlenecks, and best practice violations.
If the code looks perfect, say so in a friendly way.

Important constraints:
- Do NOT output any internal reasoning, thoughts, or <think> tags.
- Output ONLY the final review in markdown format.
- Be concise but thorough.

Diff:
\`\`\`diff
${diff}
\`\`\`
`;

    const interaction = await ai.interactions.create({
        model: 'models/gemini-3.5-flash',
        input: prompt,
        tools: tools,
        generation_config: generationConfig,
    });

    const step = interaction.steps?.at(-1);
    let reviewComment = step?.text || step?.parts?.[0]?.text;

    if (!reviewComment) {
      console.error("No content received from Gemini.", JSON.stringify(step));
      process.exit(1);
    }
    
    // Add a signature
    reviewComment += "\n\n— *AI Code Review (Powered by Gemini)*";

    // 3. Post to GitHub
    console.log("Posting review to GitHub PR...");
    const ghResponse = await fetch(`https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        body: reviewComment,
        event: 'COMMENT'
      })
    });

    if (!ghResponse.ok) {
      const ghError = await ghResponse.text();
      console.error(`GitHub API Error: ${ghResponse.status} - ${ghError}`);
      process.exit(1);
    }

    console.log("Review successfully posted!");

  } catch (error) {
    console.error("Error during AI review:", error);
    process.exit(1);
  }
}

run();
