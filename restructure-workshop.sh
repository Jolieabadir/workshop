#!/bin/bash
# ============================================================
# Workshop Restructure Script
# Reorganizes the codebase to match Dynalytics-style structure
#
# Run from the project root:
#   chmod +x restructure-workshop.sh && ./restructure-workshop.sh
#
# What it does:
#   1. Creates the new directory tree
#   2. Moves files to their new homes
#   3. Leaves a migration map so you can fix imports after
#
# IMPORTANT: Commit your current state first!
#   git add -A && git commit -m "pre-restructure snapshot"
# ============================================================

set -euo pipefail

echo "🔧 Workshop Restructure — Starting..."
echo ""

# --------------------------------------------------
# Safety check
# --------------------------------------------------
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
  echo "❌ Run this from the Workshop project root (where package.json lives)"
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "⚠️  No git repo detected. Strongly recommend: git init && git add -A && git commit -m 'pre-restructure'"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi

# --------------------------------------------------
# 1. Create new directory structure
# --------------------------------------------------
echo "📁 Creating new directory tree..."

mkdir -p src/core/types
mkdir -p src/core/config
mkdir -p src/agents/builder
mkdir -p src/agents/owl
mkdir -p src/agents/cat
mkdir -p src/agents/safety
mkdir -p src/agents/manager
mkdir -p src/speech
mkdir -p src/input
mkdir -p src/hooks
mkdir -p src/components/canvas
mkdir -p src/components/hud
mkdir -p src/components/tracking
mkdir -p src/pipeline
# store/ and app/ already exist, just ensuring
mkdir -p src/store
mkdir -p src/app/api/agent
mkdir -p src/app/api/speech/stream
mkdir -p src/app/api/speech/audio
mkdir -p src/app/api/speech/tts
mkdir -p src/app/api/speech/close

echo "   ✅ Directory tree created"

# --------------------------------------------------
# 2. Move files — Core types & config
# --------------------------------------------------
echo ""
echo "📦 Moving files..."

# Types: split canvas.ts into domain-specific type files
# For now, move the monolith and leave splitting as a Claude Code task
if [ -f "src/types/canvas.ts" ]; then
  cp src/types/canvas.ts src/core/types/canvas.ts
  echo "   → src/types/canvas.ts → src/core/types/canvas.ts"
fi

# Config: extract from hardcoded constants (new files, content TBD)
touch src/core/config/agent-models.ts
touch src/core/config/gesture-thresholds.ts
touch src/core/config/scene-defaults.ts
echo "   → Created config stubs (agent-models, gesture-thresholds, scene-defaults)"

# --------------------------------------------------
# 3. Move files — Agents
# --------------------------------------------------

# Builder agent
if [ -f "src/lib/builder-prompt.ts" ]; then
  cp src/lib/builder-prompt.ts src/agents/builder/prompt.ts
  echo "   → src/lib/builder-prompt.ts → src/agents/builder/prompt.ts"
fi

# We'll split builder tools and action parser out later
touch src/agents/builder/tools.ts
touch src/agents/builder/action-parser.ts
echo "   → Created builder/tools.ts and builder/action-parser.ts stubs"

# Owl agent
if [ -f "src/lib/agents/owl.ts" ]; then
  cp src/lib/agents/owl.ts src/agents/owl/prompt.ts
  echo "   → src/lib/agents/owl.ts → src/agents/owl/prompt.ts"
fi
touch src/agents/owl/tools.ts
touch src/agents/owl/analyzer.ts

# Safety agent
if [ -f "src/lib/agents/safety-log.ts" ]; then
  cp src/lib/agents/safety-log.ts src/agents/safety/logger.ts
  echo "   → src/lib/agents/safety-log.ts → src/agents/safety/logger.ts"
fi
touch src/agents/safety/synthesizer.ts

# Cat & Manager stubs
touch src/agents/cat/prompt.ts
touch src/agents/manager/prompt.ts
echo "   → Created cat/ and manager/ stubs"

# --------------------------------------------------
# 4. Move files — Speech
# --------------------------------------------------

if [ -f "src/lib/deepgram.ts" ]; then
  cp src/lib/deepgram.ts src/speech/deepgram-client.ts
  echo "   → src/lib/deepgram.ts → src/speech/deepgram-client.ts"
fi

if [ -f "src/lib/deepgram-server.ts" ]; then
  cp src/lib/deepgram-server.ts src/speech/deepgram-server.ts
  echo "   → src/lib/deepgram-server.ts → src/speech/deepgram-server.ts"
fi

if [ -f "src/lib/tts-player.ts" ]; then
  cp src/lib/tts-player.ts src/speech/tts-player.ts
  echo "   → src/lib/tts-player.ts → src/speech/tts-player.ts"
fi

# --------------------------------------------------
# 5. Move files — Input
# --------------------------------------------------

if [ -f "src/lib/input-manager.ts" ]; then
  cp src/lib/input-manager.ts src/input/input-manager.ts
  echo "   → src/lib/input-manager.ts → src/input/input-manager.ts"
fi

# New files to extract from input-manager and HandTracker
touch src/input/gesture-detector.ts
touch src/input/reference-resolver.ts
echo "   → Created gesture-detector.ts and reference-resolver.ts stubs"

# --------------------------------------------------
# 6. Move files — Components
# --------------------------------------------------

# Canvas components (these likely already exist here)
for file in Workshop3DCanvas.tsx IdeaNode.tsx ConnectionLine.tsx BuilderAvatar.tsx HandCursor.tsx; do
  if [ -f "src/components/canvas/$file" ]; then
    echo "   → src/components/canvas/$file (stays)"
  fi
done

# Extract HandOrbitControls if it's inside Workshop3DCanvas
touch src/components/canvas/HandOrbitControls.tsx
echo "   → Created HandOrbitControls.tsx stub (extract from Workshop3DCanvas)"

# HandTracker → tracking/
if [ -f "src/components/canvas/HandTracker.tsx" ]; then
  cp src/components/canvas/HandTracker.tsx src/components/tracking/HandTracker.tsx
  echo "   → src/components/canvas/HandTracker.tsx → src/components/tracking/HandTracker.tsx"
fi

# HUD components (extract from page.tsx)
touch src/components/hud/TranscriptBar.tsx
touch src/components/hud/SafetyLogPanel.tsx
touch src/components/hud/GestureIndicator.tsx
touch src/components/hud/AgentStatus.tsx
echo "   → Created HUD component stubs (to extract from page.tsx)"

# --------------------------------------------------
# 7. Move files — Hooks
# --------------------------------------------------

if [ -f "src/hooks/useOwlAnalysis.ts" ]; then
  echo "   → src/hooks/useOwlAnalysis.ts (stays)"
fi

# New hooks to extract from page.tsx
touch src/hooks/useVoicePipeline.ts
touch src/hooks/useIntentDispatch.ts
echo "   → Created useVoicePipeline.ts and useIntentDispatch.ts stubs"

# --------------------------------------------------
# 8. Pipeline
# --------------------------------------------------

touch src/pipeline/agent-loop.ts
echo "   → Created pipeline/agent-loop.ts stub (background agent orchestration)"

# --------------------------------------------------
# 9. Store files stay in place
# --------------------------------------------------
echo ""
echo "   → src/store/ files stay in place (already granular)"

# --------------------------------------------------
# 10. Generate migration map
# --------------------------------------------------
echo ""
echo "📋 Generating migration map..."

cat > RESTRUCTURE_MAP.md << 'MIGRATIONEOF'
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

MIGRATIONEOF

echo "   ✅ RESTRUCTURE_MAP.md written"

# --------------------------------------------------
# Done
# --------------------------------------------------
echo ""
echo "============================================"
echo "✅ Restructure Phase 1 complete!"
echo "============================================"
echo ""
echo "What happened:"
echo "  • New directory tree created"
echo "  • Files COPIED (not moved) to new locations"
echo "  • Old files left in place (imports still work)"
echo "  • RESTRUCTURE_MAP.md has the full migration plan"
echo ""
echo "Next steps — open Claude Code and run these prompts:"
echo ""
echo "  1. Split src/core/types/canvas.ts into domain files"
echo "  2. Extract hardcoded config constants"
echo "  3. Split agent prompt + tools files"
echo "  4. Extract action-parser from route.ts"
echo "  5. Decompose page.tsx into hooks + HUD components"
echo "  6. Fix all imports, delete old dirs, run tsc"
echo ""
echo "See RESTRUCTURE_MAP.md for the full details."
