/**
 * Dashboard Header Component
 */

export function DashboardHeader() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white">
      <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.5),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(99,102,241,0.45),transparent_55%)]" />
      <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.6)_1px,transparent_1px)] bg-[size:36px_36px]" />

      <div className="relative py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Supply Chain Risk Dashboard
            </h1>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/10 text-white/90 text-xs font-medium">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              India
            </span>
          </div>
          <p className="text-white/70 max-w-3xl">
            A single view of what’s happening right now, what needs attention,
            and how risk is trending.
          </p>
        </div>
      </div>
    </div>
  );
}
