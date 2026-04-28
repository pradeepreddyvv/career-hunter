"use client";

import { useState, useEffect, useCallback } from "react";
import AppNav from "@/components/AppNav";

type Status = "new" | "applied" | "interview" | "offer" | "rejected";

interface Application {
  id: string;
  job_title: string;
  company: string;
  status: Status;
  applied_at: string | null;
  notes: string;
  updated_at: string;
}

const COLUMNS: { status: Status; label: string; color: string }[] = [
  { status: "new", label: "New", color: "border-gray-600" },
  { status: "applied", label: "Applied", color: "border-blue-600" },
  { status: "interview", label: "Interview", color: "border-yellow-600" },
  { status: "offer", label: "Offer", color: "border-green-600" },
  { status: "rejected", label: "Rejected", color: "border-red-600" },
];

export default function PipelinePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");

  const load = useCallback(() => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((data) => setApplications(data.applications || []))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addApplication() {
    if (!newTitle || !newCompany) return;
    await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitle: newTitle, company: newCompany }),
    });
    setNewTitle("");
    setNewCompany("");
    setShowAdd(false);
    load();
  }

  async function moveApplication(id: string, status: Status) {
    await fetch("/api/pipeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
  }

  async function deleteApplication(id: string) {
    await fetch(`/api/pipeline?id=${id}`, { method: "DELETE" });
    setApplications((prev) => prev.filter((a) => a.id !== id));
  }

  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("applicationId", id);
  }

  function onDrop(e: React.DragEvent, status: Status) {
    e.preventDefault();
    const id = e.dataTransfer.getData("applicationId");
    if (id) moveApplication(id, status);
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-1">Pipeline</h1>
              <p className="text-gray-400 text-sm">Track your applications from discovery to offer</p>
            </div>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Application
            </button>
          </div>

          {showAdd && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Job Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Software Engineer Intern"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Company</label>
                <input
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Google"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={addApplication}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          )}

          <div className="grid grid-cols-5 gap-4">
            {COLUMNS.map((col) => {
              const items = applications.filter((a) => a.status === col.status);
              return (
                <div
                  key={col.status}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, col.status)}
                  className="min-h-[300px]"
                >
                  <div className={`border-t-2 ${col.color} pb-3 mb-3`}>
                    <h3 className="text-sm font-medium mt-2">
                      {col.label}{" "}
                      <span className="text-gray-500 text-xs">({items.length})</span>
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {items.map((app) => (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, app.id)}
                        className="bg-gray-900 border border-gray-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-gray-700 transition-colors group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium">{app.job_title}</p>
                            <p className="text-xs text-gray-500">{app.company}</p>
                          </div>
                          <button
                            onClick={() => deleteApplication(app.id)}
                            className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            x
                          </button>
                        </div>
                        {app.applied_at && (
                          <p className="text-[10px] text-gray-600 mt-1">
                            {new Date(app.applied_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
