import { z } from 'zod';
import type { EngineServices, RiskLevel, ToolDefinition, ToolSpec } from '../types';

/** Registro de ferramentas. Módulos registram; o agente consulta. */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(tool.name)) throw new Error(`nome de ferramenta inválido: ${tool.name}`);
    if (this.tools.has(tool.name)) throw new Error(`ferramenta duplicada: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const t of tools) this.register(t);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  /** Remove todas as ferramentas cujo nome começa com o prefixo (ex.: servidores MCP recarregados). */
  unregisterPrefix(prefix: string): void {
    for (const n of [...this.tools.keys()]) if (n.startsWith(prefix)) this.tools.delete(n);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(services?: EngineServices): ToolDefinition[] {
    const all = [...this.tools.values()];
    if (!services) return all;
    return all.filter((t) => {
      try {
        return t.available ? t.available(services) : true;
      } catch {
        return false;
      }
    });
  }

  /** Especificações para o modelo (JSON Schema). Ordem estável (por nome) para não quebrar o cache do prompt. */
  specs(services?: EngineServices): ToolSpec[] {
    return this.list(services)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ name: t.name, description: t.description, inputSchema: t.jsonSchema ?? toJsonSchema(t.inputSchema) }));
  }

  riskOf(tool: ToolDefinition, input: unknown): RiskLevel {
    return typeof tool.risk === 'function' ? tool.risk(input) : tool.risk;
  }
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  if (js.type !== 'object') return { type: 'object', properties: { value: js }, required: ['value'] };
  return js;
}
