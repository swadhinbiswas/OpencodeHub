import { execSync } from 'child_process';
import { Mistral } from '@mistralai/mistralai';
import dotenv from 'dotenv';

dotenv.config();

const AGENT_API_KEY = process.env.AGENT_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;

if (!AGENT_API_KEY) {
  console.log("AGENT_API_KEY is not set. Skipping AI review.");
  process.exit(0);
}

if (!GITHUB_TOKEN) {
  console.log("GITHUB_TOKEN is not set. Skipping AI review.");
  process.exit(0);
}

const client = new Mistral({
  apiKey: AGENT_API_KEY,
});

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

    // 2. Call Mistral API
    console.log("Requesting review from Mistral Agent...");
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

    const messages = [
      {"role":"user","content": prompt}
    ];

    const response = await client.beta.conversations.start({
      agentId: 'ag_019f4ae0eb2e764aaa3f1dec318fc748',
      agentVersion: 0,
      inputs: messages,
    });

    let reviewComment = response?.choices?.[0]?.message?.content || response?.message?.content;

    if (!reviewComment) {
      console.log("Could not find standard content in response. Fallback to full response:", JSON.stringify(response));
      process.exit(1);
    }
    
    // Add a signature
    reviewComment += "\n\n— *AI Code Review (Powered by Mistral Agent)*";

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
