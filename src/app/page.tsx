import { listConnections } from "@/lib/connections/store";
import { getRun, listRuns } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";

// WP0 placeholder: fixture data through the stubs, so the seams render before the UI package lands.
export default async function Home() {
  const [runs, connections] = await Promise.all([listRuns(), listConnections()]);
  const first = runs[0] ? await getRun(runs[0].id) : null;
  const state = first ? deriveState(first.run, first.events) : null;
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-xl font-semibold">Automations</h1>
      <section>
        <h2 className="font-medium">Connections</h2>
        <ul className="text-sm">{connections.map((c) => <li key={c.id}>{c.name} - {c.enabled ? "on" : "off"} - {c.url}</li>)}</ul>
      </section>
      <section>
        <h2 className="font-medium">Runs</h2>
        <ul className="text-sm">{runs.map((r) => <li key={r.id}>{r.status} - {r.prompt.slice(0, 80)}</li>)}</ul>
      </section>
      {first && state && (
        <section className="text-sm">
          <h2 className="font-medium">Run {first.run.id}</h2>
          <pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(state, null, 2)}</pre>
          <p>{first.events.length} events, {first.files.length} files</p>
        </section>
      )}
    </main>
  );
}
