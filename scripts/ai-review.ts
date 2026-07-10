import { execSync } from 'child_process';
import { Mistral } from '@mistralai/mistralai';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;

if (!GEMINI_API_KEY && !AGENT_API_KEY) {
  console.log("No AI provider API key found (GEMINI_KEY or AGENT_API_KEY). Skipping AI review.");
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

    let reviewComment = "";

    if (AGENT_API_KEY) {
      console.log("Requesting review from Mistral Agent...");
      const client = new Mistral({ apiKey: AGENT_API_KEY });
      const messages = [{ "role": "user" as const, "content": prompt }];

      const response = await client.beta.conversations.start({
        agentId: 'ag_019f4ae0eb2e764aaa3f1dec318fc748',
        agentVersion: 0,
        inputs: messages as any,
      });

      reviewComment = (response as any)?.choices?.[0]?.message?.content || (response as any)?.message?.content || "";
      
      if (!reviewComment) {
        console.log("Could not find standard content in response. Fallback to full response.");
        process.exit(1);
      }
      reviewComment += "\n\n— *AI Code Review (Powered by Mistral Agent)*";

    } else if (GEMINI_API_KEY) {
      console.log("Requesting review from Gemini 3.5 Flash...");
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const tools: any[] = [{ type: 'google_search' }];
      
      // Fixed config: Using camelCase and nested thinkingConfig
      const generationConfig = {
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 8192 },
      };

      const interaction = await ai.interactions.create({
          model: 'models/gemini-3.5-flash',
          input: prompt,
          tools: tools,
          generation_config: generationConfig as any, // the sdk still expects the property to be named generation_config
      } as any);

      const step = interaction.steps?.at(-1);
      reviewComment = (step as any)?.text || (step as any)?.parts?.[0]?.text || "";

      if (!reviewComment) {
        console.error("No content received from Gemini.");
        process.exit(1);
      }
      reviewComment += "\n\n— *AI Code Review (Powered by Gemini)*";
    }

    // 3. Post to GitHub (and handle deduplication)
    console.log("Fetching existing reviews...");
    const reviewsResponse = await fetch(`https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (reviewsResponse.ok) {
      const reviews = await reviewsResponse.json();
      // Look for a previous review made by our bot
      const previousReview = reviews.find((r: any) => r.body && r.body.includes('AI Code Review (Powered by'));
      
      if (previousReview) {
        console.log(`Updating existing review #${previousReview.id}...`);
        const updateResponse = await fetch(`https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews/${previousReview.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify({ body: reviewComment })
        });
        
        if (!updateResponse.ok) {
          const ghError = await updateResponse.text();
          console.error(`GitHub API Error on update: ${updateResponse.status} - ${ghError}`);
          process.exit(1);
        }
        console.log("Review successfully updated!");
        return;
      }
    }

    console.log("Posting new review to GitHub PR...");
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
      console.error(`GitHub API Error on post: ${ghResponse.status} - ${ghError}`);
      process.exit(1);
    }

    console.log("Review successfully posted!");

  } catch (error) {
    console.error("Error during AI review:", error);
    process.exit(1);
  }
}

run();
