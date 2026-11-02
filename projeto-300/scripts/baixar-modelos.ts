/**
 * Baixa os modelos de voz do 300 (detector de fala, reconhecimento pt e voz
 * pt-BR) com conferência de SHA-256.
 *
 * Uso:
 *   npx tsx scripts/baixar-modelos.ts                 → modelos padrão em ./models
 *   npx tsx scripts/baixar-modelos.ts C:\pasta        → em outra pasta
 *   npx tsx scripts/baixar-modelos.ts --todos         → também as vozes opcionais
 *   npx tsx scripts/baixar-modelos.ts --ids pt_BR-cadu-medium,pt_BR-jeff-medium
 *   npx tsx scripts/baixar-modelos.ts --listar        → só mostra o catálogo e o que já está instalado
 */
import { resolve } from 'node:path';
import { DEFAULT_MODEL_IDS, MODEL_REGISTRY, ModelManager } from '../src/core/voice/models';

interface Args {
  dir: string;
  ids: string[];
  list: boolean;
}

function parseArgs(argv: string[]): Args {
  let dir = resolve(process.cwd(), 'models');
  let ids = [...DEFAULT_MODEL_IDS];
  let list = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--todos' || a === '--all') ids = MODEL_REGISTRY.map((m) => m.id);
    else if (a === '--ids') ids = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--ids=')) ids = a.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--listar' || a === '--list') list = true;
    else if (a === '--ajuda' || a === '--help' || a === '-h') {
      process.stdout.write('Uso: npx tsx scripts/baixar-modelos.ts [pasta] [--todos | --ids a,b] [--listar]\n');
      process.exit(0);
    } else if (!a.startsWith('--')) dir = resolve(a);
    else {
      process.stderr.write(`Opção desconhecida: ${a}\n`);
      process.exit(2);
    }
  }
  return { dir, ids, list };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manager = new ModelManager({ dir: args.dir });
  const status = await manager.status();
  process.stdout.write(`Pasta dos modelos: ${manager.dir}\n`);
  if (args.list) {
    for (const s of status) {
      process.stdout.write(`${s.installed ? '[instalado]' : '[ ausente ]'} ${s.id.padEnd(24)} ${String(s.sizeMb).padStart(6)} MB  ${s.label}  — ${s.license}${s.isDefault ? '  (padrão)' : ''}\n`);
    }
    return;
  }
  const unknown = args.ids.filter((id) => !MODEL_REGISTRY.some((m) => m.id === id));
  if (unknown.length) {
    process.stderr.write(`Modelos desconhecidos: ${unknown.join(', ')}\nUse --listar para ver o catálogo.\n`);
    process.exit(2);
  }
  const lastShown = new Map<string, number>();
  const started = Date.now();
  for (const id of args.ids) {
    const s = status.find((x) => x.id === id)!;
    if (manager.isInstalled(id)) {
      process.stdout.write(`✔ ${s.label}: já instalado\n`);
      continue;
    }
    process.stdout.write(`↓ ${s.label} (${s.sizeMb} MB)\n`);
    await manager.ensure([id], (mid, f) => {
      const pct = Math.floor(f * 100);
      const prev = lastShown.get(mid) ?? -10;
      if (pct >= prev + 10 || pct === 100) {
        lastShown.set(mid, pct);
        process.stdout.write(`   ${pct}%\n`);
      }
    });
    process.stdout.write(`✔ ${s.label}: instalado\n`);
  }
  process.stdout.write(`Pronto em ${Math.round((Date.now() - started) / 1000)} s.\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`Erro: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
