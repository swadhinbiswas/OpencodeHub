# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-17

### Added
- Initial release of OpenCodeHub CLI
- `och auth` - Authentication commands (login, logout, whoami)
- `och stack` - Stack management (create, view, submit, sync, reorder)
- `och init` - Repository initialization
- `och status` - Stack status display
- `och config` - Configuration management
- Support for stacked pull requests
- Interactive prompts with Inquirer.js
- Progress spinners with Ora
- Colorful output with Chalk

### Features
- Stack-first PR workflow
- Automatic PR dependency linking
- Smart stack rebasing
- Token-based authentication for CI/CD
- Cross-platform support (Windows, macOS, Linux)
