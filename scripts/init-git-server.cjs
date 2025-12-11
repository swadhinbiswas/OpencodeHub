
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '../data');
const REPOS_DIR = path.join(DATA_DIR, 'repos');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');
const SSH_DIR = path.join(DATA_DIR, 'ssh');

const dirs = [DATA_DIR, REPOS_DIR, AVATARS_DIR, ARTIFACTS_DIR, SSH_DIR];

console.log('Initializing OpenCodeHub Git Server Environment...');

// Create directories
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    console.log(`Directory exists: ${dir}`);
  }
});

// Generate SSH Host Keys if they don't exist
const hostKeyPath = path.join(SSH_DIR, 'ssh_host_rsa_key');
if (!fs.existsSync(hostKeyPath)) {
  console.log('Generating SSH Host Key...');
  try {
    // Try to use ssh-keygen if available
    execSync(`ssh-keygen -t rsa -b 4096 -f "${hostKeyPath}" -N "" -q`);
    console.log('SSH Host Key generated successfully.');
  } catch (error) {
    console.warn('Warning: Could not generate SSH key using ssh-keygen. Please ensure ssh-keygen is installed or generate keys manually.');
    console.warn('Error:', error.message);
  }
} else {
  console.log('SSH Host Key already exists.');
}

console.log('Initialization complete.');
