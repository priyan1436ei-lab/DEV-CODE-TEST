.
├── .github/workflows/
│   └── build-windows-exe.yml   # Automated Windows Electron build CI
├── electron/                   # Electron main/preload processes & app icons
├── desktop/                    # Additional desktop wrapper scripts
├── public/                     # PWA icons, manifest assets, and demo GIFs
├── scripts/
│   ├── build-win-exe.ps1       # PowerShell Windows build script
│   └── ensure-win-icon.mjs     # Automated Windows .ico generator/validator
├── server/
│   ├── agentOrchestrator.ts    # Multi-step AI agent loop & tool execution
│   ├── extensionHost.ts        # Plugin/extension runtime
│   ├── modelGateway.ts         # LLM provider routing
│   ├── policyEngine.ts         # Workspace governance & rules
│   ├── repoBrain.ts            # Codebase indexing & semantic context
│   ├── sampleRepo.ts           # Built-in starter repository
│   ├── sandboxRunner.ts        # Code execution sandbox
│   └── securityEngine.ts       # Static/runtime security analyzer
├── src/
│   ├── components/             # Modular IDE views, modals, and panels
│   ├── hooks/                  # useOnlineStatus, usePWAInstall
│   ├── services/               # api.ts, firestoreSync.ts, offlineStore.ts
│   ├── types/                  # devmind.ts, desktop.d.ts
│   ├── App.tsx                 # Main application shell
│   ├── firebase.ts             # Firebase client initialization
│   └── index.css               # Global styles & UI animations
├── server.ts                   # Backend server entrypoint
├── firestore.rules             # Firestore database security rules
├── firebase-blueprint.json     # Firebase schema/blueprint definition
├── security_spec.md            # Security architecture specification
├── electron-builder.yml        # Electron packaging configuration
├── build-windows-exe.bat       # One-click Windows .exe build script
└── vite.config.ts              # Vite & PWA build configuration
