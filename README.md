I’ll inspect the repository structure and main files, then create a clear README that presents the project details prominently.I’m inspecting the README and core source files to turn this repository into an accurate, polished project showcase.I couldn’t find a `README.md`, so the repository currently has no dedicated README. I’m also inspecting the frontend structure and metadata to prepare an accurate replacement.I found that the repository is currently **missing a README.md**. I’ll prepare a polished README and also verify the exact setup/build steps before writing it.# DevMind Studio

**DevMind AI** is a Windows-focused desktop software engineering workbench with a VS Code-style interface. It combines repository editing, AI assistance, extensions, debugging, security analysis, and autonomous coding workflows.

**Repository:** [priyan1436ei-lab/DEV-CODE-TEST](https://github.com/priyan1436ei-lab/DEV-CODE-TEST)

## Highlights

- Live code editor and project explorer
- Repository-aware AI chat
- AST-style architecture and dependency visualization
- VS Code-style extensions marketplace
- BYOK support for multiple LLM providers
- Autonomous engineering tasks with approvals
- Security scanning and policy controls
- Offline editing with IndexedDB
- Firebase synchronization
- Progress billing and usage tracking
- PWA support for browser use
- Native Windows desktop builds through Electron
- Real-time updates using Server-Sent Events

## Main Technology

- **React 19** and **TypeScript**
- **Vite 8**
- **Tailwind CSS 4**
- **Electron**
- **Express**
- **Firebase / Firestore**
- **IndexedDB**
- **PWA / Workbox**

## Architecture

```text
src/          React interface and application components
server/       Repository brain, AI gateway, security, policies, and orchestration
electron/     Native Windows desktop integration
public/       Static assets and PWA resources
desktop/      Desktop-specific resources
scripts/      Build and packaging utilities
.github/      GitHub Actions Windows build workflow
```

## Core Modules

| Module | Purpose |
|---|---|
| `CodeEditorView` | VS Code-style code editing |
| `RepoBrainView` | Repository search and architecture visualization |
| `AiWorkspacePanel` | AI interaction workspace |
| `ExtensionsView` | Extension marketplace and runtime |
| `DebuggingCenterView` | Stack trace and error analysis |
| `SecurityCenterView` | Security findings and recommendations |
| `SettingsPolicyView` | Policies, model configuration, and billing |
| `ExecutionHistoryView` | Engineering task history and rollback |
| `DashboardView` | Project overview and activity |

## Backend Services

- Authentication and BYOK session management
- Project and file operations
- Repository indexing and hybrid search
- AI repository chat
- Model provider connections
- Autonomous task orchestration
- Approval and rollback workflows
- Extension installation and command execution
- Security finding generation
- Policy enforcement
- Usage and audit tracking
- Real-time event synchronization

## Local Development

```bash
npm install
npm run dev
```

The application normally runs at `http://localhost:3000`. The default port can be configured in `.env.example`.

## Windows Build

```bash
npm run build:win
```

A Windows executable can also be generated automatically through the GitHub Actions workflow.

## Current Status

- Public repository
- Default branch: `main`
- Primary language: TypeScript — 95.7%
- JavaScript — 2.9%
- Project version: `1.0.0`
- No repository license specified
- No README currently exists in the repository
- No current open issues or pull requests are visible
