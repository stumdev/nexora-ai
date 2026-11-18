import type { Tool } from './types';
import { ReadTool, WriteTool, EditTool } from './files';
import { BashTool, GlobTool, GrepTool } from './shell';
import { WebFetchTool, TodoWriteTool } from './web';
import { FinanceTool, PosterTool } from './business';

export * from './types';
export { ReadTool, WriteTool, EditTool, applyEdit, makeDiff, diffStats } from './files';
export { BashTool, GlobTool, GrepTool, detectShell } from './shell';
export { WebFetchTool, TodoWriteTool } from './web';
export { FinanceTool, PosterTool } from './business';

export function defaultTools(): Tool[] {
  return [ReadTool, WriteTool, EditTool, BashTool, GlobTool, GrepTool, WebFetchTool, TodoWriteTool, FinanceTool, PosterTool];
}
