<!-- Animated Wave Header -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,50:3b82f6,100:8b5cf6&height=210&section=header&text=DevMind%20Studio&fontSize=62&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=AI-Native%20Cross-Platform%20IDE%20%7C%20Web%20%E2%80%A2%20PWA%20%E2%80%A2%20Windows%20Desktop&descAlignY=62&descSize=18" width="100%" />
</p>

<!-- Animated Typing Showcase -->
<p align="center">
  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&duration=3000&pause=1000&color=38BDF8&center=true&vCenter=true&multiline=true&repeat=true&width=750&height=70&lines=Autonomous+AI+Agent+Orchestrator+%26+Repo+Brain;Isolated+Sandbox+Runner+%2B+Extension+Host;Offline-First+Firebase+Sync+%2B+Electron+Desktop" alt="Typing SVG" />
  </a>
</p>

<!-- Tech Stack Badges -->
<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white" />
  <img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" />
</p>

<!-- Animated Neon Divider -->
<p align="center">
  <img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</p>

## 🎬 Live Animation & UI Showcase

> **Tip:** Record 5–10 second clips of each view using ScreenToGif or ShareX and drop the `.gif` files into `public/assets/demos/` to bring this showcase to life.

| Feature | Motion & Interaction Effect | Preview |
| :--- | :--- | :---: |
| **AI Workspace (`AiWorkspacePanel`)** | Streaming token output, agent step-by-step progress pulses, and live diff highlights | ![AI Workspace Demo](public/assets/demos/ai-workspace.gif) |
| **Command Palette (`CommandPalette`)** | Backdrop blur fade-in, spring scale entrance, and keyboard-driven instant filtering | ![Command Palette Demo](public/assets/demos/command-palette.gif) |
| **Sandbox Drawer (`BottomSandboxPanel`)** | Smooth collapsible slide transitions and live streaming terminal logs | ![Sandbox Demo](public/assets/demos/sandbox-drawer.gif) |
| **Repo Brain (`RepoBrainView`)** | Interactive codebase context mapping and animated node/file focus states | ![Repo Brain Demo](public/assets/demos/repo-brain.gif) |
| **Auth & Offline Sync (`LoginGate` / `OfflineIndicator`)** | Entry transitions, animated status pill slide-ins, and real-time sync indicators | ![Offline Sync Demo](public/assets/demos/offline-sync.gif) |

---

## ✨ Key Features

- **🤖 AI Workspace & Agent Orchestrator:** Multi-step autonomous coding agent (`server/agentOrchestrator.ts`) routed through a unified `server/modelGateway.ts`.
- **🧠 Repo Brain:** Deep repository indexing and semantic context engine (`server/repoBrain.ts` & `src/components/RepoBrainView.tsx`).
- **📦 Isolated Sandbox Runner:** Execute, test, and inspect code safely inside an integrated sandbox with live output (`server/sandboxRunner.ts` & `src/components/BottomSandboxPanel.tsx`).
- **🧩 Extension Ecosystem:** Built-in extension runtime (`server/extensionHost.ts`) and dedicated `ExtensionsView` for managing plugins.
- **🛡️ Security & Policy Center:** Automated code security checks (`server/securityEngine.ts`), configurable workspace policies (`server/policyEngine.ts`), and Firestore security rules (`firestore.rules`).
- **🐞 Debugging & Execution History:** Integrated debugging center (`DebuggingCenterView.tsx`) and full run logs (`ExecutionHistoryView.tsx`).
- **📡 Offline-First & Cloud Sync:** Local persistence (`offlineStore.ts`) with real-time Firebase/Firestore sync (`firestoreSync.ts`) and live connectivity indicators.
- **💻 Cross-Platform Delivery:** Runs as a web app, installable PWA, or native Windows `.exe` via Electron and GitHub Actions.

---

## 🏗️ Interactive System Architecture

```mermaid
flowchart TB
    subgraph Frontend["🖥️ Frontend IDE Shell (React + TypeScript + Vite)"]
        UI[CodeEditor & Dashboard]
        AI[AiWorkspacePanel]
        RB[RepoBrainView]
        EXT[Extensions & Security Views]
        CMD[CommandPalette & BottomWorkbench]
    end

    subgraph Sync["☁️ State & Offline Sync Layer"]
        OFF[(offlineStore.ts)]
        FB[(Firebase / Firestore Sync)]
        API[services/api.ts]
    end

    subgraph Backend["⚙️ Backend Engine (server.ts)"]
        ORCH[agentOrchestrator.ts]
        GW[modelGateway.ts]
        BRAIN[repoBrain.ts]
        SAND[sandboxRunner.ts]
        HOST[extensionHost.ts]
        SEC[securityEngine & policyEngine]
    end

    Frontend <--> API
    Frontend <--> OFF
    OFF <--> FB
    API <--> Backend
    ORCH --> GW
    ORCH --> BRAIN
    ORCH --> SAND
    HOST --> SEC
