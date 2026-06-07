"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ExportModal from "@/components/ExportModal";
import { useSpaceDetail } from "@/lib/hooks/useSpaceDetail";
import { useSpaceEdit } from "@/lib/hooks/useSpaceEdit";
import { UrlsTab } from "./UrlsTab";
import { ContextTab } from "./ContextTab";

type ActiveTab = "urls" | "context";

export default function SpaceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { space, setSpace, fetchState } = useSpaceDetail(params.id);
  const { editing, editName, setEditName, editColor, setEditColor, editError, editSaving, startEdit, cancelEdit, handleEditSave } =
    useSpaceEdit(params.id, space, setSpace);
  const [activeTab, setActiveTab] = useState<ActiveTab>("urls");
  const [showExport, setShowExport] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!window.confirm("Delete this space? Jobs will not be deleted.")) return;
    const res = await fetch(`/api/spaces/${params.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) router.push("/spaces");
  }, [params.id, router]);

  if (fetchState === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
        Loading…
      </div>
    );
  }
  if (fetchState === "not_found") return <div className="text-sm text-gray-400">Space not found. <Link href="/spaces" className="text-blue-400 hover:underline">Back to spaces</Link></div>;
  if (fetchState === "forbidden") return <div className="text-sm text-gray-400">Access denied. <Link href="/spaces" className="text-blue-400 hover:underline">Back to spaces</Link></div>;
  if (fetchState === "error" || !space) return <div className="text-sm text-gray-400">Failed to load space. <Link href="/spaces" className="text-blue-400 hover:underline">Back to spaces</Link></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/spaces" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
        <span aria-hidden="true">&#8592;</span> Back to spaces
      </Link>

      {!editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-block h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: space.color }} />
            <h1 className="text-xl font-semibold text-white">{space.name}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowExport(true)} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-400 hover:text-white transition-colors">Export</button>
            <button onClick={startEdit} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-400 hover:text-white transition-colors">Edit</button>
            <button onClick={handleDelete} className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-400 hover:border-red-500 hover:text-red-300 transition-colors">Delete</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleEditSave} className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">Edit Space</h2>
          {editError && <p className="text-sm text-red-400">{editError}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-400" htmlFor="edit-name">Name</label>
              <input id="edit-name" type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400" htmlFor="edit-color">Color</label>
              <input id="edit-color" type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-gray-700 bg-gray-900 p-0.5" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={editSaving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">{editSaving ? "Saving…" : "Save"}</button>
              <button type="button" onClick={cancelEdit} className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors">Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="flex gap-1 border-b border-gray-700">
        {(["urls", "context"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? "border-b-2 border-indigo-500 text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            {tab === "urls" ? "URLs" : "Context"}
          </button>
        ))}
      </div>

      {activeTab === "urls" && <UrlsTab spaceId={params.id} />}
      {activeTab === "context" && <ContextTab spaceId={params.id} />}

      {showExport && <ExportModal spaceId={params.id} spaceName={space.name} onClose={() => setShowExport(false)} />}
    </div>
  );
}
