/** Ferramentas de memória do 300. */
import type { ToolDefinition } from '../../types';
import { conversationSearchTool } from './conversation-search';
import { memoryDeleteTool } from './delete';
import { memoryExportTool } from './export';
import { memorySaveTool } from './save';
import { memorySearchTool } from './search';
import { memoryUpdateTool } from './update';

export { conversationSearchTool, memoryDeleteTool, memoryExportTool, memorySaveTool, memorySearchTool, memoryUpdateTool };
export { exportDir } from './export';

export function memoryTools(): ToolDefinition[] {
  return [memorySearchTool, memorySaveTool, memoryUpdateTool, memoryDeleteTool, memoryExportTool, conversationSearchTool];
}
