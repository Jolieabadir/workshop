# Feedback Loop Tuning Branch

## Purpose
Isolate experimentation on the visual feedback loop (Owl + Mechanic
correction system) from main. Main stays demo-able; this branch is
where prompt tuning, ablation studies, randomized initial state tests,
and any speculative architectural changes happen.

## Open Issues This Branch Will Address
1. Builder produces only 1 connection for a 4-part rocket — Fins and
   Engine never connected (logged in Build Process Log)
2. userRequest is not being passed at the trigger call site
   (Passed: NO in diagnostic output)
3. CV detecting 0 parts — three of four perception channels are silent
   because OpenCV returns no data
4. Owl/Mechanic prompts biased toward fault-finding regardless of
   assembly correctness — needs calibration after the data-layer
   issues above are resolved

## Success Criteria
The feedback loop converges to APPROVED on a Builder-built rocket in
≤2 iterations with no incorrect corrections applied. Convergence on
randomized initial states (when added) reaches APPROVED in ≤5
iterations across at least 8/10 trials.

## Diagnostic Trace
The [FEEDBACK LOOP DIAGNOSTIC — Iteration N] block in
useVisualFeedbackLoop.ts is the eval harness. Every trial run
produces a structured trace. Compare across configurations.

## Merge Criteria
Squash-merge to main when success criteria are met AND the changes
are reviewable in a single PR. Do not let this branch accumulate
noise — periodic rebases on main are fine.

## Scatter Mode
Set NEXT_PUBLIC_SCATTER_INITIAL=true in .env.local to spawn parts at
scattered positions on the x/z plane instead of the Builder's
semantic positions. Used for testing whether the feedback loop can
assemble parts from disordered initial states. Each part's scatter
position is deterministic — same title hashes to same position
across trials.
