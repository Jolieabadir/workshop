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
- **Next.js 16** (App Router, TypeScript)
- **React Three Fiber + drei** — 3D canvas
- **Zustand** — State management
- **Anthropic Claude API** — Agent brains (Sonnet for Builder/Cat/Safety, Haiku for Owl/Manager)
- **Deepgram** — STT (Nova-2 streaming) + TTS (Aura streaming)
- **MediaPipe Hands** — Gesture/hand tracking (two-hand: right=interact, left=navigate)

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main page — composes 3D canvas + HUD + hand trackers
│   ├── globals.css
│   ├── layout.tsx
│   └── api/
│       ├── agent/route.ts    # Builder agent API (multi-round tool calling)
│       ├── mesh/route.ts     # Meshy API proxy for 3D mesh generation (planned)
│       ├── agents/owl/       # Owl analysis API
│       └── speech/           # Deepgram proxy routes (stream, audio, tts, close)
├── agents/
│   ├── builder/
│   │   ├── prompt.ts         # BUILDER_SYSTEM_PROMPT
│   │   ├── tools.ts          # BUILDER_TOOLS array (sent to Claude API)
│   │   └── action-parser.ts  # parseToolCallToAction, formatCanvasStateForLLM, SpatialContext
│   ├── owl/
│   │   ├── prompt.ts         # OWL_SYSTEM_PROMPT
│   │   ├── tools.ts          # OWL_TOOLS array
│   │   └── analyzer.ts       # OwlBadge, OwlConnectionSuggestion types
│   ├── safety/
│   │   ├── logger.ts         # logBuilderActions, getActionSummary
│   │   └── synthesizer.ts    # (planned) combine Owl + Cat findings
│   ├── cat/prompt.ts         # (planned)
│   └── manager/prompt.ts     # (planned)
├── components/
│   ├── canvas/
│   │   ├── Workshop3DCanvas.tsx   # Main R3F Canvas + SceneContent
│   │   ├── IdeaNode.tsx           # Renders nodes: components, GLB meshes, or primitives
│   │   ├── ConnectionLine.tsx     # Port-based connection rendering
│   │   ├── BuilderAvatar.tsx      # Pink orb that moves to active work
│   │   ├── HandCursor.tsx         # 3D cursor from right hand + raycasting
│   │   ├── HandRaycaster.tsx      # Raycaster for node intersection
│   │   ├── SpatialEngine.tsx      # Collision avoidance + connection attraction
│   │   ├── HandTracker.tsx        # Right hand MediaPipe tracker (with calibration)
│   │   ├── LeftHandTracker.tsx    # Left hand MediaPipe tracker (camera navigation)
│   │   ├── SharedWebcam.tsx       # Shared webcam provider for both hand trackers
│   │   └── generators/           # Parametric 3D component system
│   │       ├── ComponentGenerator.tsx  # Routes componentType to renderer
│   │       ├── index.ts               # Exports + getConnectorPointsForComponent
│   │       ├── Housing.tsx, Plate.tsx, Shaft.tsx, Bearing.tsx, Gear.tsx
│   │       ├── Joint.tsx, Link.tsx, Bracket.tsx
│   │       └── Resistor.tsx, Capacitor.tsx, IC.tsx, LED.tsx, Connector.tsx
│   └── hud/
│       ├── TranscriptBar.tsx      # Bottom HUD with mic/hand controls
│       └── SafetyLogPanel.tsx     # Top-left audit log drawer
├── core/
│   ├── types/
│   │   ├── canvas.ts          # CanvasNode, CanvasConnection, Vec3, ComponentData, ComponentType
│   │   ├── agents.ts          # BuilderAction union type, SafetyLogEntry
│   │   ├── input.ts           # HandGesture, UnifiedIntent, SingleHandState, TwoHandState
│   │   └── index.ts           # Re-exports all types
│   └── config/
│       ├── agent-models.ts    # Which Claude model per agent
│       ├── gesture-thresholds.ts  # Pinch/palm detection thresholds
│       └── scene-defaults.ts  # Camera, spacing, position defaults
├── store/
│   ├── canvas-store.ts        # Main store: nodes, connections, groups, executeAction, addComponent
│   ├── hand-store.ts          # Two-hand tracking state
│   ├── input-store.ts         # Unified input state (voice + gesture + mouse)
│   └── safety-store.ts        # Audit log entries
├── speech/
│   ├── deepgram-client.ts     # Browser-side Deepgram STT client
│   ├── deepgram-server.ts     # Server-side Deepgram WebSocket manager
│   └── tts-player.ts          # Web Speech API TTS player
├── input/
│   ├── input-manager.ts       # Merges voice + gesture + mouse into unified intents
│   └── gesture-detector.ts    # Gesture classification functions
└── hooks/
    ├── useVoicePipeline.ts    # Deepgram lifecycle + mic handling
    ├── useIntentDispatch.ts   # Intent queue → Builder API call
    └── useOwlAnalysis.ts      # Background Owl analysis trigger
```

## Key Conventions

### Canvas State
- Canvas state lives in Zustand (`useCanvasStore`). Both UI and Builder agent read/write through it.
- Builder tool calls map to store actions: `create_component`, `generate_mesh`, `create_connection`, `move_node`, etc.
- 3D positions use `Vec3 { x, y, z }`. Typical range: x,z from -5 to 5, y from 0 to 4.
- Focus stack tracks recently touched nodes. "This"/"that" resolves to top of stack.
- Builder avatar (pink orb) lerps toward whatever it's working on.
- API keys stay server-side in Next.js API routes. Never in client code.

### Two-Tier 3D Generation

**Tier 1: AI Mesh Generation (`generate_mesh`) — PLANNED**
- For complex realistic objects (full vehicles, characters, buildings, furniture)
- Outsourced to Meshy API (meshy.ai) — text prompt → GLB model
- Loaded in scene via drei `useGLTF`
- Placeholder node shown while generating (15-30 seconds)
- Cost: ~$0.01-0.05 per generation

**Tier 2: Parametric Components (`create_component`) — IMPLEMENTED**
- For mechanical assemblies where connector points matter
- 13 component types: housing, plate, shaft, bearing, gear, joint, link, bracket, resistor, capacitor, ic, led, connector
- Each has typed connector points for port-based wiring
- Auto-alignment: when `create_connection` specifies `fromPort`/`toPort`, target component auto-repositions so ports align
- Cost: ~$0.02-0.05 per assembly

### Auto-Assembly System
The LLM cannot reliably calculate 3D positions. Instead:
1. Agent creates all parts at `{x:0, y:0, z:0}` (position doesn't matter)
2. Agent calls `create_connection` with `fromPort` and `toPort`
3. Store's `addConnection` automatically repositions target component via `alignComponentToPort()`
4. Connection ORDER determines the final shape — chain outward from anchor part
5. `group_nodes` at the end makes the assembly grabbable as one unit

### Connector Port Reference
- **housing:** top, bottom, front, back, left, right, interior
- **plate:** top, bottom (+ hole1, hole2...)
- **shaft:** end1, end2
- **bearing:** inner (shaft side), outer (housing side), face1, face2
- **gear:** bore (center/shaft), teeth (meshing), face1, face2
- **joint:** input, output, axle (revolute) or input, output, slider (prismatic)
- **link:** start, end, pin1, pin2
- **bracket:** face1, face2 (+ hole connectors)
- **ic:** pin1 through pinN
- **led:** anode, cathode
- **resistor:** lead1, lead2
- **capacitor:** positive, negative (electrolytic) or lead1, lead2 (ceramic)
- **connector:** pin1 through pinN

### Component Scale
Components use mm dimensions internally (40mm plate = 0.4 units), wrapped in 10x scale group (`COMPONENT_SCALE = 10` in ComponentGenerator.tsx). ConnectionLine.tsx multiplies connector positions by COMPONENT_SCALE when computing world positions.

### Color Chain
Always specify colors — default material grays are invisible on the light background.
`node.color → IdeaNode passes color={node.color} → ComponentGenerator receives color prop → Each component uses colorOverride (priority over params.color and material defaults)`

### Builder Agent Pipeline
```
page.tsx: speech_final → pause mic → POST /api/agent with {transcript, canvasState, spatialContext}
  → route.ts: multi-round tool calling loop (up to 5 iterations, 4096 max_tokens)
  → parseToolCallToAction maps each tool_use block to BuilderAction
  → returns {actions: BuilderAction[]}
page.tsx: executeAction for each action → TTS for respond_verbally → resume mic
```

### Hand Tracking (Two-Hand)
- **Right hand** (pink, HandTracker.tsx): Object interaction. Gestures: pinch (grab/drag), resize (scale nodes), none (passive hover). Uses calibration.
- **Left hand** (blue, LeftHandTracker.tsx): Camera navigation. Gestures: L-shape/open_palm (orbit), pinch (zoom out), none (orbit camera joystick-style). Uses calibration.
- Both share a single webcam stream via SharedWebcamProvider.
- MediaPipe handedness is anatomical (not screen-based). X coords flipped for mirror display.

## Running
```bash
cp .env.example .env.local  # Fill in API keys
npm install
npm run dev                  # http://localhost:3000
```

## Environment Variables
```
ANTHROPIC_API_KEY=           # Required — Claude API for all agents
DEEPGRAM_API_KEY=            # Required — STT and TTS
MESHY_API_KEY=               # Optional — AI mesh generation (meshy.ai free tier)
```
