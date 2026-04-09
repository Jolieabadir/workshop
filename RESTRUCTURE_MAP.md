# Workshop Restructure — Migration Map

## Files Moved (old → new)

| Old Path | New Path | Status |
|----------|----------|--------|
| `src/types/canvas.ts` | `src/core/types/canvas.ts` | Copied — split into canvas.ts, agents.ts, input.ts, speech.ts |
| `src/lib/builder-prompt.ts` | `src/agents/builder/prompt.ts` | Copied — split tools into tools.ts, parser into action-parser.ts |
| `src/lib/agents/owl.ts` | `src/agents/owl/prompt.ts` | Copied — split tools into tools.ts, types into analyzer.ts |
| `src/lib/agents/safety-log.ts` | `src/agents/safety/logger.ts` | Copied |
| `src/lib/deepgram.ts` | `src/speech/deepgram-client.ts` | Copied |
| `src/lib/deepgram-server.ts` | `src/speech/deepgram-server.ts` | Copied |
| `src/lib/tts-player.ts` | `src/speech/tts-player.ts` | Copied |
| `src/lib/input-manager.ts` | `src/input/input-manager.ts` | Copied — extract gesture-detector.ts, reference-resolver.ts |
| `src/components/canvas/HandTracker.tsx` | `src/components/tracking/HandTracker.tsx` | Copied |

## New Files (stubs to fill)

| File | Purpose |
|------|---------|
| `src/core/config/agent-models.ts` | Extract: which Claude model per agent (Sonnet vs Haiku) |
| `src/core/config/gesture-thresholds.ts` | Extract: PINCH_THRESHOLD, OPEN_PALM_THRESHOLD, etc. from HandTracker |
| `src/core/config/scene-defaults.ts` | Extract: MIN_NODE_SPACING, camera defaults from canvas-store |
| `src/core/types/agents.ts` | Extract: BuilderAction, OwlAnalysisResult, SafetyLogEntry from canvas.ts |
| `src/core/types/input.ts` | Extract: HandGesture, UnifiedIntent, Handedness, SingleHandState, TwoHandState from canvas.ts |
| `src/core/types/speech.ts` | Extract: transcript and TTS types |
| `src/agents/builder/tools.ts` | Extract: BUILDER_TOOLS array from builder-prompt.ts |
| `src/agents/builder/action-parser.ts` | Extract: parseToolCallToAction() from api/agent/route.ts |
| `src/agents/owl/tools.ts` | Extract: OWL_TOOLS array from owl.ts |
| `src/agents/owl/analyzer.ts` | Extract: OwlAnalysisResult interface + processing from owl.ts |
| `src/agents/safety/synthesizer.ts` | New: combine Owl + Cat findings into correction queue |
| `src/agents/cat/prompt.ts` | New: Cat agent system prompt + tools |
| `src/agents/manager/prompt.ts` | New: Manager agent system prompt + tools |
| `src/input/gesture-detector.ts` | Extract: gesture classification logic from HandTracker |
| `src/input/reference-resolver.ts` | Extract: "this"/"that"/"here" resolution from input-manager |
| `src/components/canvas/HandOrbitControls.tsx` | Extract: HandControlledOrbitControls from Workshop3DCanvas |
| `src/components/hud/TranscriptBar.tsx` | Extract: transcript display JSX from page.tsx |
| `src/components/hud/SafetyLogPanel.tsx` | Extract: safety log drawer JSX from page.tsx |
| `src/components/hud/GestureIndicator.tsx` | Extract: gesture status badge from page.tsx |
| `src/components/hud/AgentStatus.tsx` | Extract: agent activity indicators from page.tsx |
| `src/hooks/useVoicePipeline.ts` | Extract: Deepgram lifecycle + mic handling from page.tsx |
| `src/hooks/useIntentDispatch.ts` | Extract: intent queue → Builder API call logic from page.tsx |
| `src/pipeline/agent-loop.ts` | New: background loop orchestration (Owl → Cat → Safety → Manager → Builder) |

## Old directories to remove (after imports are fixed)

```
src/types/          → replaced by src/core/types/
src/lib/            → replaced by src/speech/, src/input/, src/agents/
src/lib/agents/     → replaced by src/agents/
```

## Import update pattern

After moving, update all imports project-wide:

```
# Old                                    → New
@/types/canvas                           → @/core/types/canvas (or /agents, /input, /speech)
@/lib/builder-prompt                     → @/agents/builder/prompt
@/lib/agents/owl                         → @/agents/owl/prompt
@/lib/agents/safety-log                  → @/agents/safety/logger
@/lib/deepgram                           → @/speech/deepgram-client
@/lib/deepgram-server                    → @/speech/deepgram-server
@/lib/tts-player                         → @/speech/tts-player
@/lib/input-manager                      → @/input/input-manager
@/components/canvas/HandTracker          → @/components/tracking/HandTracker
```

## Claude Code commands to finish the job

After running the shell script, use Claude Code to:

1. **Split the monolith types file:**
   ```
   Split src/core/types/canvas.ts into four files: canvas.ts (nodes, connections, groups, Vec3),
   agents.ts (BuilderAction, OwlAnalysisResult, SafetyLogEntry, Badge),
   input.ts (HandGesture, UnifiedIntent, Handedness, SingleHandState, TwoHandState),
   speech.ts (transcript and TTS types). Update all imports.
   ```

2. **Extract config constants:**
   ```
   Extract hardcoded constants from HandTracker.tsx (PINCH_THRESHOLD, OPEN_PALM_THRESHOLD,
   GRAB_DISTANCE_3D, CAMERA_*) into src/core/config/gesture-thresholds.ts.
   Extract MIN_NODE_SPACING and camera defaults from canvas-store.ts into
   src/core/config/scene-defaults.ts. Update imports.
   ```

3. **Split builder-prompt.ts:**
   ```
   In src/agents/builder/, split prompt.ts so that BUILDER_TOOLS goes to tools.ts
   and BUILDER_SYSTEM_PROMPT stays in prompt.ts. Do the same for owl: OWL_TOOLS → tools.ts,
   OWL_SYSTEM_PROMPT stays in prompt.ts, interfaces go to analyzer.ts.
   ```

4. **Extract action-parser from route.ts:**
   ```
   Move parseToolCallToAction() and formatCanvasContext() from src/app/api/agent/route.ts
   into src/agents/builder/action-parser.ts. Import them back in route.ts.
   ```

5. **Decompose page.tsx:**
   ```
   Extract from page.tsx:
   - Voice/mic lifecycle → src/hooks/useVoicePipeline.ts
   - Intent dispatch logic → src/hooks/useIntentDispatch.ts
   - Transcript bar JSX → src/components/hud/TranscriptBar.tsx
   - Safety log panel JSX → src/components/hud/SafetyLogPanel.tsx
   - Gesture indicator → src/components/hud/GestureIndicator.tsx
   page.tsx should become a thin shell that composes these.
   ```

6. **Extract gesture detection:**
   ```
   Move gesture classification logic (detectGesture function, pinch/point/palm detection)
   from HandTracker.tsx into src/input/gesture-detector.ts. HandTracker imports it.
   ```

7. **Fix all imports project-wide:**
   ```
   Update all import paths across the project to use the new locations.
   Then delete the old src/types/, src/lib/ directories.
   Verify with: npx tsc --noEmit
   ```

