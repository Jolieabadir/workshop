# Workshop — Spatial Brainstorming Copilot

## What This Is
A 3D spatial brainstorming environment where you **talk and gesture** instead of type and click. Ideas become objects in a 3D space. Your hands are the mouse (MediaPipe). Your voice controls everything (Deepgram + Claude). A multi-agent system builds, researches, and validates in real time.

## Architecture — Direct Mode + Mechanic Crew

### Primary Loop (~1 second, user-facing)
```
User speaks → Deepgram transcribes → Builder agent acts on 3D canvas → done
```
The Builder is always hot. Every utterance goes directly to it. No routing, no pre-validation.

### Background Loop (3-8 seconds behind, async)
```
Canvas changes → Owl detects issues → Cat researches → Safety synthesizes → Manager queues corrections → Builder applies fixes
```
The user never waits for background agents.

## Agents
- **Builder** (pink) — Only agent with canvas write access. Acts immediately. Visible avatar in 3D scene.
- **Owl** (purple) — Watches canvas for contradictions, gaps, missed connections. Runs on every canvas change.
- **Cat** (green) — Researches and validates claims. Triggered by Manager or Owl.
- **Safety Supervisor** (red) — Logs all Builder actions. Synthesizes Owl + Cat findings. Queues corrections.
- **Manager** (orange) — Organizes correction queue. Waits for natural pauses before sending fixes to Builder.

## Tech Stack
- **Next.js** (App Router, TypeScript)
- **React Three Fiber + drei** — 3D canvas
- **Zustand** — State management
- **Anthropic Claude API** — Agent brains (Sonnet for Builder/Cat/Safety, Haiku for Owl/Manager)
- **Deepgram** — STT (Nova-2 streaming) + TTS (Aura streaming)
- **MediaPipe Hands** — Gesture/hand tracking

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main page with 3D canvas + HUD
│   └── api/
│       ├── agent/            # Builder agent API route
│       └── speech/           # Deepgram proxy routes
├── components/
│   ├── canvas/               # 3D scene components
│   ├── agents/               # Agent avatar components (future)
│   └── ui/                   # HUD overlays, transcript bar
├── lib/                      # Utilities (agent prompts, Deepgram client)
├── store/
│   └── canvas-store.ts       # Zustand store — source of truth for 3D scene
└── types/
    └── canvas.ts             # TypeScript types
```

## Key Conventions
- Canvas state lives in Zustand (`useCanvasStore`). Both UI and Builder agent read/write through it.
- Builder tool calls map to store actions: `create_node`, `create_connection`, `move_node`, etc.
- 3D positions use `Vec3 { x, y, z }`. New nodes default to near-camera placement.
- Focus stack tracks recently touched nodes. "This"/"that" resolves to top of stack.
- Builder avatar (pink orb) lerps toward whatever it's working on.
- API keys stay server-side in Next.js API routes. Never in client code.

## Running
```bash
cp .env.example .env.local  # Fill in API keys
npm install
npm run dev                  # http://localhost:3000
```
