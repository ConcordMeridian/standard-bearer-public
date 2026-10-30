export interface OpenClawSnapshot {
  readonly agentId: string;
  readonly deploymentId: string;
  readonly environment?: string;
  readonly capturedAt: string;
  readonly sequenceStart: number;
  readonly configVersions?: Readonly<Record<string, string>>;
  readonly sandbox?: { readonly mode?: string; readonly scope?: string };
  readonly workspaceAccess?: string;
  readonly toolPolicy?: { readonly allow?: readonly string[]; readonly deny?: readonly string[] };
  readonly elevatedExecution?: boolean;
  readonly executionTarget?: string;
  readonly mounts?: readonly { readonly path: string; readonly access?: string }[];
  readonly network?: { readonly mode?: string; readonly destinations?: readonly string[] };
  readonly messaging?: { readonly providers?: readonly string[]; readonly conversationVisibility?: string; readonly crossProvider?: boolean };
}
