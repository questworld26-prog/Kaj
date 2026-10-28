// [spec: UI-001]
import { h } from "preact";
import { useState } from "preact/hooks";
import type { Project } from "../../shared/types.js";

interface ProjectReorderModalProps {
  isOpen: boolean;
  projects: Project[];
  onClose: () => void;
  onReorder: (projectIds: string[]) => void;
  onCreateProject: (name: string, color: string) => void;
}

const PALETTE = [
  "#10B981",
  "#38BDF8",
  "#818CF8",
  "#F43F5E",
  "#F59E0B",
  "#A855F7",
  "#EC4899",
];

export function ProjectReorderModal({
  isOpen,
  projects,
  onClose,
  onReorder,
  onCreateProject,
}: ProjectReorderModalProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PALETTE[0]);

  if (!isOpen) return null;

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= projects.length) return;

    const reordered = [...projects];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    onReorder(reordered.map((p) => p.id));
  };

  const handleAddProject = (e: h.JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim(), selectedColor);
    setNewProjectName("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        data-testid="project-reorder-modal"
        className="w-full max-w-lg bg-[#121718] border border-[#2A3235] rounded-2xl shadow-2xl flex flex-col p-6 text-gray-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2A3235]">
          <h3 className="text-base font-bold text-white">
            Manage Projects & Swimlanes
          </h3>
          <button
            type="button"
            data-testid="close-modal-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#1C2224] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Project List for Reordering */}
        <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
          {projects.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-4">
              No custom projects created yet.
            </p>
          ) : (
            projects.map((proj, idx) => (
              <div
                key={proj.id}
                data-project-id={proj.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#1C2224] border border-[#2A3235]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: proj.color }}
                  />
                  <span className="text-xs font-semibold text-gray-200">
                    {proj.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="move-up-btn"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, "up")}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 hover:bg-[#121718] transition-colors"
                    title="Move Up"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    data-testid="move-down-btn"
                    disabled={idx === projects.length - 1}
                    onClick={() => handleMove(idx, "down")}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 hover:bg-[#121718] transition-colors"
                    title="Move Down"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Project Form */}
        <form
          onSubmit={handleAddProject}
          className="pt-4 border-t border-[#2A3235] space-y-3"
        >
          <label className="block text-xs font-semibold text-gray-300">
            Create New Project Swimlane
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Mobile Client, Marketing"
              value={newProjectName}
              onInput={(e) =>
                setNewProjectName((e.target as HTMLInputElement).value)
              }
              className="flex-1 px-3 py-1.5 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#10B981] hover:bg-[#34D399] text-[#0E1111] transition-colors"
            >
              Add Project
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-gray-400">Color Token:</span>
            <div className="flex items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    selectedColor === c
                      ? "scale-125 ring-2 ring-white"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
