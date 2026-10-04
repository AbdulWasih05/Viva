/** One file in the candidate's repo. */
export type RepoFile = { path: string; size: number };

/**
 * A repo Viva can read, wherever it comes from (GitHub, a local folder, or a test fixture).
 * `files` is the complete list of real paths; everything the model says is checked against it.
 */
export type RepoSource = {
  /** Stable id for this repo, used as the memory key (for example "github:owner/name"). */
  id: string;
  /** Human-readable name shown in the UI. */
  label: string;
  files: RepoFile[];
  /** Reads one file. Throws if the path is not in `files`. */
  readFile(path: string): Promise<string>;
};

/** A file chosen for the model to read, with the reason it was chosen. */
export type SelectedFile = RepoFile & { score: number; reason: string };

/** A file's text as given to the model (possibly cut to the per-file limit). */
export type FileContent = { path: string; content: string; truncated: boolean };
