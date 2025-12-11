
/**
 * OpenCodeHub Self-Hosted Runner
 * Usage: 
 *   node runner.js register --url <url> --token <token>
 *   node runner.js run
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const path = require('path');

const CONFIG_FILE = '.runner-config.json';

function request(method, url, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = client.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        resolve(body);
                    }
                } else {
                    reject({ statusCode: res.statusCode, body });
                }
            });
        });

        req.on('error', (err) => reject(err));

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'register') {
    const urlIdx = args.indexOf('--url');
    const tokenIdx = args.indexOf('--token');

    if (urlIdx === -1 || tokenIdx === -1) {
        console.error('Usage: node runner.js register --url <url> --token <token>');
        process.exit(1);
    }

    const baseUrl = args[urlIdx + 1];
    const token = args[tokenIdx + 1];
    const name = require('os').hostname();
    const os = require('os').platform();
    const arch = require('os').arch();

    console.log(`Registering runner ${name}...`);

    request('POST', `${baseUrl}/api/actions/runners/register`, {
        token,
        name,
        os,
        arch,
        version: '1.0.0'
    })
        .then(config => {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...config, baseUrl }, null, 2));
            console.log('Runner registered successfully! Configuration saved to', CONFIG_FILE);
        })
        .catch(err => {
            console.error('Registration failed:', err);
        });

} else if (command === 'run') {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('Runner not configured. Run "register" first.');
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log(`Starting runner ${config.name} connected to ${config.baseUrl}`);

    const poll = async () => {
        try {
            // console.log('Polling for jobs...');
            const job = await request('POST', `${config.baseUrl}/api/actions/runners/poll`, {
                runnerId: config.id,
                secret: config.secret
            });

            if (job && job.id) {
                console.log(`Received job: ${job.name} (${job.id})`);
                await processJob(job, config);
            }
        } catch (err) {
            if (err.statusCode !== 404) { // 404 means no job
                console.error('Poll error:', err);
            }
        }

        setTimeout(poll, 5000);
    };

    poll();

} else {
    console.log('Unknown command. Use "register" or "run".');
}

async function processJob(job, config) {
    // Acknowledge job
    // await updateJobStatus(job.id, 'in_progress', config);

    console.log(`Executing step: ${job.stepName}`);
    console.log(`Command: ${job.run}`);

    return new Promise((resolve) => {
        const child = exec(job.run, { cwd: process.cwd() });

        child.stdout.on('data', (data) => {
            console.log(`[LOG] ${data}`);
            // Stream logs to server in real-time (omitted for MVP)
        });

        child.stderr.on('data', (data) => {
            console.error(`[ERR] ${data}`);
        });

        child.on('close', async (code) => {
            const status = code === 0 ? 'success' : 'failure';
            console.log(`Job completed with status: ${status}`);

            try {
                await request('POST', `${config.baseUrl}/api/actions/runners/job/${job.id}/complete`, {
                    runnerId: config.id,
                    secret: config.secret,
                    status,
                    exitCode: code
                });
            } catch (e) {
                console.error('Failed to report job status', e);
            }
            resolve();
        });
    });
}
