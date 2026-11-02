/** Cérebro: provedor de IA, modelos, esforço, Ollama e personalidade. */
import type { Settings } from '../../../../core/settings';
import type { Effort } from '../../../../core/types';
import { EFFORT_OPTIONS, percent } from '../../lib/format';
import { Field, Group, Notice, Select, Slider, TextArea, TextInput, Toggle, useFieldId } from '../controls';
import { isHttpUrl, type SectionProps } from './common';

type Provider = Settings['brain']['provider'];

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama (local, sem internet)' },
];

export function BrainSection({ settings, update }: SectionProps) {
  const b = settings.brain;
  const idModel = useFieldId();
  const modelKey: 'model' | 'openaiModel' | 'ollamaModel' = b.provider === 'anthropic' ? 'model' : b.provider === 'openai' ? 'openaiModel' : 'ollamaModel';
  const modelValue = b[modelKey];

  return (
    <>
      <Group title="Modelo principal" description="O cérebro que conversa com você e decide quais ferramentas usar.">
        <Field label="Provedor">
          <Select label="Provedor de IA" value={b.provider} options={PROVIDERS} onChange={(v) => void update({ brain: { provider: v } })} />
        </Field>
        <Field label="Modelo" hint={b.provider === 'ollama' ? 'Nome do modelo instalado no Ollama.' : 'Identificador exato do modelo.'} htmlFor={idModel}>
          <TextInput id={idModel} label="Modelo" mono value={modelValue} onCommit={(v) => void update({ brain: modelKey === 'model' ? { model: v } : modelKey === 'openaiModel' ? { openaiModel: v } : { ollamaModel: v } })} validate={(v) => (v ? null : 'Informe o modelo.')} />
        </Field>
        <Field label="Esforço no chat" hint="Mais esforço = respostas mais cuidadosas, porém mais lentas e caras.">
          <Select<Effort> label="Esforço no chat" value={b.effortChat} options={EFFORT_OPTIONS} onChange={(v) => void update({ brain: { effortChat: v } })} />
        </Field>
        <Field label="Esforço na voz" hint="Na voz, respostas rápidas costumam ser melhores.">
          <Select<Effort> label="Esforço na voz" value={b.effortVoice} options={EFFORT_OPTIONS} onChange={(v) => void update({ brain: { effortVoice: v } })} />
        </Field>
        <Field label="Passos máximos por pedido" hint="Limite de ferramentas em sequência numa mesma resposta.">
          <Slider label="Passos máximos" value={b.maxToolSteps} min={1} max={50} step={1} format={(v) => String(v)} onCommit={(v) => void update({ brain: { maxToolSteps: v } })} />
        </Field>
        <Field label="Ferramentas web do provedor" hint="Usa a pesquisa e a leitura de páginas nativas do Claude quando disponíveis.">
          <Toggle label="Ferramentas web do provedor" checked={b.useServerWebTools} onChange={(v) => void update({ brain: { useServerWebTools: v } })} />
        </Field>
        <Field label="Alternativa em caso de recusa" hint="Se o modelo recusar um pedido legítimo, tenta automaticamente outro modelo (Claude).">
          <Toggle label="Alternativa em caso de recusa" checked={b.refusalFallback} onChange={(v) => void update({ brain: { refusalFallback: v } })} />
        </Field>
      </Group>

      <Group title="Modelo utilitário" description="Modelo mais barato para tarefas internas: resumos e extração de memórias.">
        <Field label="Provedor">
          <Select label="Provedor do modelo utilitário" value={b.utilityProvider} options={PROVIDERS} onChange={(v) => void update({ brain: { utilityProvider: v } })} />
        </Field>
        <Field label="Modelo">
          <TextInput label="Modelo utilitário" mono value={b.utilityModel} onCommit={(v) => void update({ brain: { utilityModel: v } })} validate={(v) => (v ? null : 'Informe o modelo.')} />
        </Field>
      </Group>

      <Group title="Ollama (local)" description="Modelos rodando no seu computador, sem enviar dados para a internet.">
        <Field label="Endereço do Ollama">
          <TextInput label="Endereço do Ollama" mono type="url" value={b.ollamaUrl} onCommit={(v) => void update({ brain: { ollamaUrl: v } })} validate={(v) => (isHttpUrl(v) ? null : 'Use um endereço http:// ou https://')} />
        </Field>
        <Field label="Modelo do Ollama">
          <TextInput label="Modelo do Ollama" mono value={b.ollamaModel} onCommit={(v) => void update({ brain: { ollamaModel: v } })} validate={(v) => (v ? null : 'Informe o modelo.')} />
        </Field>
        {b.provider === 'ollama' && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/i.test(b.ollamaUrl) && (
          <Notice tone="amber">O endereço do Ollama não é local. Suas conversas serão enviadas para esse servidor.</Notice>
        )}
      </Group>

      <Group title="Personalidade">
        <Field label="Como o 300 chama você">
          <TextInput label="Seu nome" value={settings.persona.userName} placeholder="Ex.: Jeferson" onCommit={(v) => void update({ persona: { userName: v } })} />
        </Field>
        <Field label="Humor" hint="De sério a bem-humorado.">
          <Slider label="Humor" value={settings.persona.humor} min={0} max={1} step={0.05} format={percent} onCommit={(v) => void update({ persona: { humor: v } })} />
        </Field>
        <Field label="Instruções extras" hint="Preferências gerais de comportamento (opcional)." wide>
          <TextArea label="Instruções extras" value={settings.persona.extraInstructions} rows={3} placeholder="Ex.: responda de forma curta; use reais (R$) nos valores." onCommit={(v) => void update({ persona: { extraInstructions: v } })} />
        </Field>
      </Group>
    </>
  );
}
