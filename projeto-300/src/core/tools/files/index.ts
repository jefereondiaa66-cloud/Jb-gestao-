/** Ferramentas de arquivos do 300 (sempre dentro das pastas liberadas pelo dono). */
import type { ToolDefinition } from '../../types';
import { fileListTool, fileReadTool, fileSearchTool } from './tools-read';
import { fileCopyTool, fileDeleteTool, fileMoveTool, fileRenameTool, fileWriteTool, folderCreateTool, openPathTool } from './tools-write';

export { fileListTool, fileReadTool, fileSearchTool, nameMatcher, normalizeExtensions } from './tools-read';
export { fileCopyTool, fileDeleteTool, fileMoveTool, fileRenameTool, fileWriteTool, folderCreateTool, openPathTool, validateFileName, fileWriteRisk, renameRisk } from './tools-write';
export { guardFor, resolveUserPath, allowedRoots, expandKnownFolder, isExecutablePath, extensionOf, isRootPath, EXECUTABLE_EXTENSIONS, PATH_HINT } from './guard';
export { OwnFilesLedger, ownFiles } from './own-files';
export { decodeText, looksBinary, parseCsv, detectDelimiter, imageInfo, kindOfFile, formatSheets, readXlsxSummary, readDocxText, readPdfPages, csvSummary, loadExcelJs } from './readers';
export type { ImageInfo, SheetSummary, FileKind } from './readers';

export function fileTools(): ToolDefinition[] {
  return [fileListTool, fileSearchTool, fileReadTool, fileWriteTool, folderCreateTool, fileMoveTool, fileCopyTool, fileRenameTool, fileDeleteTool, openPathTool];
}
