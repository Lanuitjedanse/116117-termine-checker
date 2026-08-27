# GitHub Copilot instructions for this repository

Summary
- This repository currently contains only a Git metadata folder (.git) and no source files were found during discovery. If you (the human) add source files, these instructions will guide AI agents on how to proceed.

Primary goals for AI agents
- Detect project type and entry points by checking for common manifests: `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `Dockerfile`.
- If manifests are absent, report the repository state and ask the user for the project language, desired runtime, and where to find the source code.

Immediate discovery steps (run these first)
- List tracked files: `git ls-tree -r --name-only HEAD` or `git ls-files`
- Show remotes: `git remote -v` and branches: `git branch -a`
- Quick file search for common manifests and language indicators:
  - `find . -maxdepth 3 -type f -name package.json -o -name pyproject.toml -o -name go.mod -o -name Cargo.toml -o -name requirements.txt`

How to proceed when code is found
- Read repository README.md and any top-level docs first for project context.
- Identify the build/test commands from manifests: `npm test`, `npm run build`, `python -m pytest`, `make test`, `go test ./...`, or `cargo test`.
- Run the minimal reproducible build/test commands in a safe environment; if CI config exists (.github/workflows), inspect workflows for exact steps and secrets use.

Conventions for this repository (current state)
- No project-specific conventions were discoverable. When present, prioritize any CONTRIBUTING.md, developer.md, or CI workflow files as the source of truth.

Agent behavior and merge guidance
- If a `.github/copilot-instructions.md` already exists, merge by preserving existing actionable examples and appending new discovery steps.
- Keep recommendations minimal and concrete. When unsure, ask the repository owner one targeted question (e.g., "Is this a Node, Python, or Go project?").

What to include in future updates (when code is available)
- Short architecture summary (components, service/process boundaries, and main data flow).
- Exact commands to build, test, and run locally (copy from CI if necessary).
- Key files to inspect for behavior (e.g., server entrypoint, database migrations, config files).
- Any nonstandard patterns (e.g., vendored dependencies, monorepo layout, custom test runner).

Contact and feedback
- If any instruction is unclear or you want the file expanded with concrete examples from source code, add the source files or tell the agent which directory contains the code and the agent will re-run discovery and update this file.
