export declare const AUDITOR_INSTRUCTIONS: string;
export declare const TOOL_TESTER_INSTRUCTIONS: string;

export interface AuditorManifest {
  model: { name: string };
  instructions: string;
  mcpServers: Array<{ name: string; requireApprovalForTools?: string[] }>;
  config: {
    sandbox: { enabled: boolean };
    dynamicSubAgents: { enabled: boolean };
    iterationLimit: number;
  };
}

export declare function buildAuditorManifest(
  env?: Record<string, string | undefined>
): AuditorManifest;
