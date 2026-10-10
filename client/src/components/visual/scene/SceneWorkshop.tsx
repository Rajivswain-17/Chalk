"use client";

import { useCallback, useState } from "react";
import type { SceneDefinition } from "@/lib/sceneDefinition";
import type { SceneCallout, SceneShot, SceneStep } from "@/lib/visualize";
import Scene3DStage, { shotWithinEnvelope, type SceneAuthoring } from "./Scene3DStage";
import { VisualExplainer } from "../VisualExplainer";

interface DraftStep {
  shotId: string;
  title: string;
  subtitle: string;
  explanation: string;
  highlights: string[];
  calloutAnchorIds: string[];
}

const EMPTY_DRAFT: DraftStep = {
  shotId: "",
  title: "Hearts",
  subtitle: "",
  explanation: "",
  highlights: [],
  calloutAnchorIds: [],
};

export function SceneWorkshop({ definition }: { definition: SceneDefinition }) {
  const [previewing, setPreviewing] = useState(false);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [capturedShots, setCapturedShots] = useState<SceneShot[]>([]);
  const [capturedAnchors, setCapturedAnchors] = useState<
    { id: string; partId: string; pos: [number, number, number] }[]
  >([]);
  const [draft, setDraft] = useState<DraftStep>(EMPTY_DRAFT);
  const [steps, setSteps] = useState<SceneStep[]>([]);
  const [lastPoint, setLastPoint] = useState<[number, number, number]>([0, 0, 0]);

  const authoring: SceneAuthoring = {
    selectedPart,
    onPickPart: (partId, point) => {
      setSelectedPart(partId);
      setLastPoint(point);
    },
    onCaptureShot: (shot) => {
      if (!shotWithinEnvelope(shot)) {
        window.alert("Shot is outside the validate envelope (|coord|<=100, fov 15-120, distance>=0.1).");
        return;
      }
      setCapturedShots((prev) => [...prev, shot]);
    },
  };

  const dropAnchor = useCallback(
    (point: [number, number, number]) => {
      if (!selectedPart) {
        window.alert("Pick a part first, then drop its anchor.");
        return;
      }
      const n = capturedAnchors.length + 1;
      setCapturedAnchors((prev) => [
        ...prev,
        { id: `a_new_${n}`, partId: selectedPart, pos: point },
      ]);
    },
    [selectedPart, capturedAnchors.length]
  );

  const addStep = () => {
    const shot = definition.shots.find((s) => s.id === draft.shotId);
    if (!shot) {
      window.alert("Choose a shot for this step.");
      return;
    }
    const callouts: SceneCallout[] = draft.calloutAnchorIds
      .map((id) => definition.anchors.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      .map((a) => ({
        anchorId: a.id,
        pos: a.pos,
        text: definition.parts.find((p) => p.id === a.partId)?.label ?? a.id,
      }));
    setSteps((prev) => [
      ...prev,
      {
        kind: "scene",
        stepIndex: prev.length,
        title: draft.title,
        subtitle: draft.subtitle || undefined,
        explanation: draft.explanation,
        sceneId: definition.id,
        shotId: shot.id,
        shot: { pos: shot.pos, target: shot.target, fov: shot.fov },
        assetUrl: definition.assetUrl,
        highlights: draft.highlights,
        callouts,
        notes: [],
      },
    ]);
    setDraft(EMPTY_DRAFT);
  };

  const exportJson = JSON.stringify(
    { shots: capturedShots, anchors: capturedAnchors, sequence: steps },
    null,
    2
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  if (previewing && steps.length > 0) {
    return (
      <div className="p-6">
        <button
          className="mb-4 text-sm text-amber-300 underline"
          onClick={() => setPreviewing(false)}
        >
          ← back to authoring
        </button>
        <VisualExplainer steps={steps} title="Hearts" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 p-4 h-screen">
      <div className="border border-neutral-800 rounded-xl overflow-hidden">
        <Scene3DStage
          step={{
            kind: "scene",
            stepIndex: 0,
            title: "Workshop",
            explanation: "",
            sceneId: definition.id,
            shotId: definition.shots[0].id,
            shot: {
              pos: definition.shots[0].pos,
              target: definition.shots[0].target,
              fov: definition.shots[0].fov,
            },
            assetUrl: definition.assetUrl,
            highlights: selectedPart ? [selectedPart] : [],
            callouts: [],
          }}
          authoring={authoring}
        />
      </div>
      <aside className="border border-neutral-800 rounded-xl p-4 flex flex-col gap-4 overflow-y-auto text-sm">
        <div>
          <div className="text-xs font-semibold text-neutral-400 mb-2">
            Parts (click the model, or pick here)
          </div>
          <div className="flex flex-wrap gap-2">
            {definition.parts.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPart(p.id)}
                className={`px-2 py-1 rounded-md text-xs font-mono border ${
                  selectedPart === p.id
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[#12141c] text-neutral-300 border-neutral-800"
                }`}
              >
                {p.id}
              </button>
            ))}
          </div>
          <button
            className="mt-2 text-xs text-amber-300 underline"
            onClick={() => dropAnchor(lastPoint)}
          >
            Drop anchor for selected part
          </button>
          <div className="text-[11px] text-neutral-500 mt-1">
            Press <span className="font-mono text-amber-300">s</span> in the scene to capture the current camera as a shot.
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-neutral-400">Draft step</div>
          <select
            className="bg-[#12141c] border border-neutral-800 rounded-md px-2 py-1 text-xs"
            value={draft.shotId}
            onChange={(e) => setDraft({ ...draft, shotId: e.target.value })}
          >
            <option value="">Choose shot…</option>
            {definition.shots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            className="bg-[#12141c] border border-neutral-800 rounded-md px-2 py-1 text-xs"
            placeholder="subtitle"
            value={draft.subtitle}
            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          />
          <textarea
            className="bg-[#12141c] border border-neutral-800 rounded-md px-2 py-1 text-xs"
            rows={3}
            placeholder="explanation"
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          />
          <div className="text-xs font-semibold text-neutral-400">Highlights</div>
          <div className="flex flex-wrap gap-1">
            {definition.parts.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  setDraft({ ...draft, highlights: toggle(draft.highlights, p.id) })
                }
                className={`px-2 py-1 rounded-md text-[11px] font-mono border ${
                  draft.highlights.includes(p.id)
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[#12141c] text-neutral-400 border-neutral-800"
                }`}
              >
                {p.id}
              </button>
            ))}
          </div>
          <div className="text-xs font-semibold text-neutral-400">Callouts</div>
          <div className="flex flex-wrap gap-1">
            {definition.anchors.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  setDraft({
                    ...draft,
                    calloutAnchorIds: toggle(draft.calloutAnchorIds, a.id),
                  })
                }
                className={`px-2 py-1 rounded-md text-[11px] font-mono border ${
                  draft.calloutAnchorIds.includes(a.id)
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[#12141c] text-neutral-400 border-neutral-800"
                }`}
              >
                {a.id}
              </button>
            ))}
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold"
            onClick={addStep}
          >
            Add step
          </button>
        </div>

        <div className="text-xs text-neutral-400">
          Captured: {capturedShots.length} shot(s), {capturedAnchors.length} anchor(s) · {steps.length} step(s)
        </div>
        <button
          className="px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-xs font-semibold"
          disabled={steps.length === 0}
          onClick={() => setPreviewing(true)}
        >
          Play sequence
        </button>
        <div className="text-xs font-semibold text-neutral-400">
          Export (paste into catalog.ts / heartSequence.ts)
        </div>
        <textarea
          readOnly
          className="bg-[#0c0d12] border border-neutral-800 rounded-md p-2 text-[11px] font-mono h-48"
          value={exportJson}
        />
      </aside>
    </div>
  );
}
