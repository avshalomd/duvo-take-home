import type { FileMeta } from "@/contracts/run";
import { Empty, Section } from "./section";

// The run's outputs. Download goes through the route so the file is served with its own mime and a filename.
export function FilesSection({ runId, files }: { runId: string; files: FileMeta[] }) {
  return (
    <Section title="Files">
      <div data-testid="files">
        {files.length === 0 ? (
          <Empty>No files were written by this run.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.name} className="flex items-center gap-2">
                <a
                  className="font-mono text-emerald-700 underline underline-offset-2"
                  href={`/api/runs/${runId}/files/${encodeURIComponent(f.name)}`}
                  download
                >
                  {f.name}
                </a>
                <span className="text-xs text-muted-foreground">
                  {f.mime} - {(f.bytes / 1024).toFixed(1)} kB
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
