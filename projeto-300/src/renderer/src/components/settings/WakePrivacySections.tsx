/** Seções Ativação, Privacidade, Permissões e Pesquisa. */
import { useState } from 'react';
import type { Settings } from '../../../../core/settings';
import { call } from '../../api';
import { errorText, percent } from '../../lib/format';
import { useDialog } from '../Dialog';
import { Field, Group, Notice, Select, Slider, TextInput, Toggle } from '../controls';
import { IconPlus, IconTrash } from '../icons';
import { prettyHotkey } from '../CenterStage';
import { isAbsolutePath, isBroadPath, isHttpUrl, type SectionProps } from './common';
import { useSecretNames } from './KeysSection';
import { SECRET_NAMES } from '../../../../core/types';

const ACCEL_RE = /^((CommandOrControl|CmdOrCtrl|Control|Ctrl|Alt|Option|Shift|Super|Meta)\+)+([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Tab|Enter|Return|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Escape|Esc|Plus|[`\-=[\];',./\\])$/i;

export function WakeSection({ settings, update, setWake, notify }: SectionProps) {
  const w = settings.wake;
  const { names } = useSecretNames(notify);
  const needsKey = w.engine === 'porcupine' && names !== null && !names.has(SECRET_NAMES.picovoice);
  return (
    <>
      <Group title="Palavra de ativação" description="Com isto ligado, o microfone fica aberto o tempo todo esperando você dizer “300”. O áudio é analisado neste computador.">
        <Field label="Ouvir a palavra “300”">
          <Toggle label="Ouvir a palavra de ativação" checked={w.enabled} onChange={(x) => void setWake(x)} disabled={!settings.voice.enabled} />
        </Field>
        <Field label="Motor de detecção" hint="Local: gratuito e privado. Porcupine: mais preciso, precisa de chave Picovoice.">
          <Select
            label="Motor de detecção"
            value={w.engine}
            options={[
              { value: 'local', label: 'Local' },
              { value: 'porcupine', label: 'Porcupine (Picovoice)' },
            ]}
            onChange={(x) => void update({ wake: { engine: x } })}
          />
        </Field>
        {needsKey && <Notice tone="amber">Configure a chave da Picovoice na seção Chaves para usar o Porcupine.</Notice>}
        <Field label="Sensibilidade" hint="Mais alta dispara com mais facilidade, mas pode ativar sem querer.">
          <Slider label="Sensibilidade da ativação" value={w.sensitivity} min={0} max={1} step={0.05} format={percent} onCommit={(x) => void update({ wake: { sensitivity: x } })} />
        </Field>
        {w.engine === 'porcupine' && (
          <>
            <Field label="Arquivo da palavra (.ppn)" hint="Caminho do arquivo gerado no console da Picovoice.">
              <TextInput label="Arquivo da palavra de ativação" mono value={w.porcupineKeywordPath} placeholder="C:\\Users\\voce\\300_pt_windows.ppn" onCommit={(x) => void update({ wake: { porcupineKeywordPath: x } })} validate={(x) => (!x || isAbsolutePath(x) ? null : 'Use o caminho completo do arquivo.')} />
            </Field>
            <Field label="Modelo de idioma (.pv)" hint="Opcional: modelo em português.">
              <TextInput label="Modelo de idioma do Porcupine" mono value={w.porcupineModelPath} onCommit={(x) => void update({ wake: { porcupineModelPath: x } })} validate={(x) => (!x || isAbsolutePath(x) ? null : 'Use o caminho completo do arquivo.')} />
            </Field>
          </>
        )}
        <Field label="Som ao ativar" hint="Toca um aviso curto quando o 300 começa a ouvir.">
          <Toggle label="Som ao ativar" checked={w.chime} onChange={(x) => void update({ wake: { chime: x } })} />
        </Field>
      </Group>
      <Group title="Atalho de teclado" description="Funciona mesmo com o 300 minimizado.">
        <Field label="Atalho para falar" hint={`Atual: ${prettyHotkey(w.hotkey)}. Formato: CommandOrControl+Shift+Space`}>
          <TextInput label="Atalho para falar" mono value={w.hotkey} onCommit={(x) => void update({ wake: { hotkey: x } })} validate={(x) => (ACCEL_RE.test(x) ? null : 'Atalho inválido. Ex.: CommandOrControl+Shift+Space')} />
        </Field>
      </Group>
    </>
  );
}

export function PrivacySection({ settings, update, notify, reloadSettings }: SectionProps) {
  const p = settings.privacy;
  const [autoBusy, setAutoBusy] = useState(false);
  const ask = useDialog();

  const setAutoStart = async (enabled: boolean) => {
    setAutoBusy(true);
    try {
      await call('system:setAutoStart', { enabled });
      // o processo principal pode já ter salvo; só grava se ainda estiver diferente
      const s = await call('settings:get');
      if (s.privacy.autoStart !== enabled) await update({ privacy: { autoStart: enabled } });
      else await reloadSettings();
    } catch (e) {
      notify('erro', 'Não foi possível alterar a inicialização', errorText(e));
    } finally {
      setAutoBusy(false);
    }
  };

  const setStore = async (v: boolean) => {
    if (!v) {
      const ok = await ask({ title: 'Parar de guardar conversas?', message: 'As próximas conversas não serão salvas. As já salvas continuam até você apagá-las.', confirmLabel: 'Parar de guardar' });
      if (!ok) return;
    }
    void update({ privacy: { storeConversations: v } });
  };

  return (
    <>
      <Group title="Inicialização">
        <Field label="Iniciar com o Windows">
          <Toggle label="Iniciar com o Windows" checked={p.autoStart} onChange={(x) => void setAutoStart(x)} disabled={autoBusy} />
        </Field>
        <Field label="Continuar em segundo plano" hint="Fechar a janela deixa o 300 na bandeja do sistema.">
          <Toggle label="Continuar em segundo plano" checked={p.backgroundMode} onChange={(x) => void update({ privacy: { backgroundMode: x } })} />
        </Field>
        <Field label="Começar minimizado">
          <Toggle label="Começar minimizado" checked={settings.ui.startMinimized} onChange={(x) => void update({ ui: { startMinimized: x } })} />
        </Field>
      </Group>
      <Group title="Dados">
        <Field label="Guardar conversas" hint="Histórico salvo e criptografado neste computador.">
          <Toggle label="Guardar conversas" checked={p.storeConversations} onChange={(x) => void setStore(x)} />
        </Field>
        <Field label="Aprender com as conversas" hint="Extrai fatos e preferências importantes para a memória.">
          <Toggle label="Aprender com as conversas" checked={p.memoryAutoExtract} onChange={(x) => void update({ privacy: { memoryAutoExtract: x } })} />
        </Field>
        <Field label="Proteger assuntos sensíveis" hint="Saúde, finanças e documentos só são memorizados quando você pedir.">
          <Toggle label="Proteger assuntos sensíveis" checked={p.sensitiveRequiresExplicit} onChange={(x) => void update({ privacy: { sensitiveRequiresExplicit: x } })} />
        </Field>
      </Group>
      <Group title="Sensores">
        <Field label="Câmera" hint="Permite que o 300 use a câmera quando você pedir.">
          <Toggle label="Permitir câmera" checked={p.cameraAllowed} onChange={(x) => void update({ privacy: { cameraAllowed: x } })} />
        </Field>
        <Field label="Captura de tela" hint="Permite que o 300 veja a tela para ajudar.">
          <Toggle label="Permitir captura de tela" checked={p.screenCaptureAllowed} onChange={(x) => void update({ privacy: { screenCaptureAllowed: x } })} />
        </Field>
      </Group>
    </>
  );
}

export function PermissionsSection({ settings, update }: SectionProps) {
  const pm = settings.permissions;
  const [path, setPath] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ask = useDialog();

  const addRoot = async () => {
    const v = path.trim().replace(/^"(.*)"$/, '$1');
    if (!v) return;
    if (!isAbsolutePath(v)) {
      setErr('Use o caminho completo da pasta (ex.: C:\\Users\\voce\\Projetos).');
      return;
    }
    if (pm.fileRoots.some((r) => r.toLowerCase() === v.toLowerCase())) {
      setErr('Essa pasta já está na lista.');
      return;
    }
    if (isBroadPath(v)) {
      const ok = await ask({ title: 'Acesso amplo', message: <>“{v}” dá acesso a muitos arquivos de uma vez (disco ou pasta pessoal inteira). Prefira pastas específicas. Adicionar mesmo assim?</>, confirmLabel: 'Adicionar', danger: true });
      if (!ok) return;
    }
    setErr(null);
    const res = await update({ permissions: { fileRoots: [...pm.fileRoots, v] } });
    if (res) setPath('');
  };

  const removeRoot = (r: string) => void update({ permissions: { fileRoots: pm.fileRoots.filter((x) => x !== r) } });

  const setAutoWrites = async (v: boolean) => {
    if (v) {
      const ok = await ask({ title: 'Aprovar escritas automaticamente?', message: 'O 300 poderá criar e alterar arquivos nas pastas permitidas sem perguntar. Ações destrutivas, envios e comandos continuam pedindo confirmação.', confirmLabel: 'Ativar' });
      if (!ok) return;
    }
    void update({ permissions: { autoApproveWrites: v } });
  };

  return (
    <>
      <Group title="Pastas permitidas" description="Onde o 300 pode ler e salvar arquivos. Lista vazia = Documentos, Área de Trabalho e Downloads.">
        <ul className="root-list">
          {pm.fileRoots.length === 0 && <li className="muted small">Usando as pastas padrão.</li>}
          {pm.fileRoots.map((r) => (
            <li key={r} className="root-item">
              <span className="mono">{r}</span>
              <button type="button" className="icon-btn danger" onClick={() => removeRoot(r)} aria-label={`Remover pasta ${r}`}>
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void addRoot();
          }}
        >
          <input className={'input mono' + (err ? ' has-error' : '')} value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\Users\voce\Projetos" aria-label="Caminho da pasta" spellCheck={false} />
          <button type="submit" className="btn btn-sm" disabled={!path.trim()}>
            <IconPlus size={14} /> Adicionar
          </button>
        </form>
        {err && <span className="field-error">{err}</span>}
      </Group>
      <Group title="Ações">
        <Field label="Aprovar escritas automaticamente" hint="Só para alterações locais reversíveis. O resto sempre pergunta.">
          <Toggle label="Aprovar escritas automaticamente" checked={pm.autoApproveWrites} onChange={(x) => void setAutoWrites(x)} />
        </Field>
        <Field label="Comandos do sistema" hint="Executar comandos e programas (sempre com confirmação).">
          <Toggle label="Permitir comandos do sistema" checked={pm.shellEnabled} onChange={(x) => void update({ permissions: { shellEnabled: x } })} />
        </Field>
        <Field label="Controle de mouse e teclado" hint="Clicar e digitar por você (sempre com confirmação).">
          <Toggle label="Permitir controle de mouse e teclado" checked={pm.computerControlEnabled} onChange={(x) => void update({ permissions: { computerControlEnabled: x } })} />
        </Field>
        <Field label="Automação do navegador" hint="Abrir e operar páginas num navegador controlado.">
          <Toggle label="Permitir automação do navegador" checked={pm.browserAutomationEnabled} onChange={(x) => void update({ permissions: { browserAutomationEnabled: x } })} />
        </Field>
        <Field label="Tempo para confirmar" hint="Depois disso, o pedido é negado automaticamente.">
          <Slider label="Tempo para confirmar" value={pm.confirmationTimeoutSec} min={10} max={600} step={10} format={(x) => (x < 60 ? `${x} s` : `${Math.floor(x / 60)} min${x % 60 ? ` ${x % 60} s` : ''}`)} onCommit={(x) => void update({ permissions: { confirmationTimeoutSec: x } })} />
        </Field>
      </Group>
    </>
  );
}

type SearchProvider = Settings['search']['provider'];
const SEARCH: { value: SearchProvider; label: string }[] = [
  { value: 'auto', label: 'Automático (melhor disponível)' },
  { value: 'anthropic', label: 'Pesquisa nativa do Claude' },
  { value: 'brave', label: 'Brave Search' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'searxng', label: 'SearXNG (servidor próprio)' },
];

export function SearchSection({ settings, update }: SectionProps) {
  const s = settings.search;
  return (
    <Group title="Pesquisa na internet" description="Resultados da web são tratados como conteúdo externo: o 300 não obedece instruções escritas neles.">
      <Field label="Provedor">
        <Select label="Provedor de pesquisa" value={s.provider} options={SEARCH} onChange={(x) => void update({ search: { provider: x } })} />
      </Field>
      {s.provider === 'searxng' && (
        <Field label="Endereço do SearXNG">
          <TextInput label="Endereço do SearXNG" mono type="url" value={s.searxngUrl} placeholder="https://searx.exemplo.com" onCommit={(x) => void update({ search: { searxngUrl: x } })} validate={(x) => (!x || isHttpUrl(x) ? null : 'Use um endereço http:// ou https://')} />
        </Field>
      )}
      <Field label="Resultados por pesquisa">
        <Slider label="Resultados por pesquisa" value={s.maxResults} min={1} max={20} step={1} format={(x) => String(x)} onCommit={(x) => void update({ search: { maxResults: x } })} />
      </Field>
      <Field label="Pesquisa segura" hint="Filtra conteúdo adulto.">
        <Toggle label="Pesquisa segura" checked={s.safeSearch} onChange={(x) => void update({ search: { safeSearch: x } })} />
      </Field>
    </Group>
  );
}
