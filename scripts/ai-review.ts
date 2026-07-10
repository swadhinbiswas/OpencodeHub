import { execSync } from 'child_process';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;

if (!GEMINI_API_KEY) {
  console.log("GEMINI_API_KEY is not set. Skipping AI review.");
  process.exit(0);
}

if (!GITHUB_TOKEN) {
  console.log("GITHUB_TOKEN is not set. Skipping AI review.");
  process.exit(0);
}

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
    console.log("Requesting review from Gemini 1.5 Flash...");
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

    // We use the same API endpoint format from your curl command
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API Error: ${response.status} - ${errorText}`);
      process.exit(1);
    }

    const data = await response.json();
    let reviewComment = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reviewComment) {
      console.error("No content received from Gemini.");
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
