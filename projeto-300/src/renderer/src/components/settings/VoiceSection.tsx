/** Voz: provedores de fala/escuta, voz do 300, modo contínuo, modelos locais. */
import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../../../core/settings';
import type { SystemInfo } from '../../../../shared/ipc';
import { call } from '../../api';
import { errorText, percent } from '../../lib/format';
import { Field, Group, Notice, Select, Slider, Spinner, TextInput, Toggle } from '../controls';
import { IconCheck, IconDownload, IconSpeaker } from '../icons';
import type { SectionProps } from './common';

type Voice = Settings['voice'];

const STT: { value: Voice['sttProvider']; label: string }[] = [
  { value: 'local', label: 'Local (privado, sem internet)' },
  { value: 'openai', label: 'OpenAI (mais preciso)' },
];
const TTS: { value: Voice['ttsProvider']; label: string }[] = [
  { value: 'local', label: 'Local (privado, sem internet)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'elevenlabs', label: 'ElevenLabs (mais natural)' },
  { value: 'system', label: 'Voz do Windows' },
];
const LOCAL_STT: { value: Voice['localSttModel']; label: string }[] = [
  { value: 'whisper-tiny', label: 'Whisper tiny (mais rápido)' },
  { value: 'whisper-base', label: 'Whisper base (equilibrado)' },
  { value: 'whisper-small', label: 'Whisper small (mais preciso)' },
];

export function VoiceSection({ settings, update, notify }: SectionProps) {
  const v = settings.voice;
  const [voices, setVoices] = useState<{ id: string; label: string; language: string }[] | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadVoices = useCallback(async () => {
    setVoices(null);
    setVoicesError(null);
    try {
      setVoices(await call('voice:voices'));
    } catch (e) {
      setVoices([]);
      setVoicesError(errorText(e));
    }
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      setInfo(await call('system:info'));
    } catch {
      setInfo(null);
    }
  }, []);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices, v.ttsProvider]);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const test = async () => {
    setTesting(true);
    try {
      await call('voice:test', { text: `Olá${settings.persona.userName ? ', ' + settings.persona.userName : ''}! Eu sou o 300. Esta é a minha voz.` });
    } catch (e) {
      notify('erro', 'Não foi possível testar a voz', errorText(e));
    } finally {
      setTesting(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    notify('info', 'Baixando modelos de voz', 'Isso pode levar alguns minutos. Pode continuar usando o 300.');
    try {
      await call('voice:downloadModels');
      notify('ok', 'Modelos de voz instalados');
    } catch (e) {
      notify('erro', 'Falha ao baixar os modelos', errorText(e));
    } finally {
      setDownloading(false);
      void loadInfo();
    }
  };

  const models = info?.voiceModels ?? [];
  const missing = models.filter((m) => !m.installed);
  const voiceOptions = [{ value: '', label: 'Padrão do provedor' }, ...(voices ?? []).map((x) => ({ value: x.id, label: `${x.label} (${x.language})` }))];

  return (
    <>
      <Group title="Geral">
        <Field label="Voz ligada" hint="Desligada, o 300 não usa microfone nem fala.">
          <Toggle label="Voz ligada" checked={v.enabled} onChange={(x) => void update({ voice: { enabled: x } })} />
        </Field>
      </Group>

      <Group title="Escuta (fala para texto)">
        <Field label="Provedor">
          <Select label="Provedor de escuta" value={v.sttProvider} options={STT} onChange={(x) => void update({ voice: { sttProvider: x } })} />
        </Field>
        {v.sttProvider === 'local' ? (
          <Field label="Modelo local">
            <Select label="Modelo local de escuta" value={v.localSttModel} options={LOCAL_STT} onChange={(x) => void update({ voice: { localSttModel: x } })} />
          </Field>
        ) : (
          <Field label="Modelo OpenAI">
            <TextInput label="Modelo de transcrição" mono value={v.sttModel} onCommit={(x) => void update({ voice: { sttModel: x } })} validate={(x) => (x ? null : 'Informe o modelo.')} />
          </Field>
        )}
        <Field label="Sensibilidade à fala" hint="Mais alto = só considera fala clara (menos ruído).">
          <Slider label="Limiar de detecção de fala" value={v.vadThreshold} min={0.1} max={0.95} step={0.05} format={percent} onCommit={(x) => void update({ voice: { vadThreshold: x } })} />
        </Field>
        <Field label="Redução de ruído">
          <Toggle label="Redução de ruído" checked={v.noiseReduction} onChange={(x) => void update({ voice: { noiseReduction: x } })} />
        </Field>
      </Group>

      <Group title="Fala (texto para voz)">
        <Field label="Provedor">
          <Select label="Provedor de fala" value={v.ttsProvider} options={TTS} onChange={(x) => void update({ voice: { ttsProvider: x, ttsVoice: '' } })} />
        </Field>
        <Field label="Voz do 300" hint={voicesError ? `Não foi possível listar as vozes: ${voicesError}` : undefined}>
          {voices === null ? <Spinner size={14} /> : <Select label="Voz do 300" value={v.ttsVoice} options={voiceOptions} onChange={(x) => void update({ voice: { ttsVoice: x } })} />}
        </Field>
        <Field label="Volume">
          <Slider label="Volume da voz" value={v.volume} min={0} max={1} step={0.05} format={percent} onCommit={(x) => void update({ voice: { volume: x } })} />
        </Field>
        <Field label="Velocidade">
          <Slider label="Velocidade da fala" value={v.speed} min={0.5} max={2} step={0.05} format={(x) => `${x.toFixed(2).replace('.', ',')}×`} onCommit={(x) => void update({ voice: { speed: x } })} />
        </Field>
        <Field label="Testar voz">
          <button type="button" className="btn btn-sm" onClick={() => void test()} disabled={testing || !v.enabled}>
            {testing ? <Spinner size={12} /> : <IconSpeaker size={15} />} Ouvir exemplo
          </button>
        </Field>
      </Group>

      <Group title="Conversa por voz">
        <Field label="Modo contínuo" hint="Depois de responder, continua ouvindo sem precisar chamar de novo.">
          <Toggle label="Modo contínuo" checked={v.continuousMode} onChange={(x) => void update({ voice: { continuousMode: x } })} />
        </Field>
        <Field label="Encerrar após silêncio">
          <Slider label="Tempo de silêncio para encerrar" value={v.continuousTimeoutSec} min={3} max={120} step={1} format={(x) => `${x} s`} onCommit={(x) => void update({ voice: { continuousTimeoutSec: x } })} disabled={!v.continuousMode} />
        </Field>
        <Field label="Interromper com a voz" hint="Se você começar a falar, o 300 para de falar.">
          <Toggle label="Interromper com a voz" checked={v.bargeIn} onChange={(x) => void update({ voice: { bargeIn: x } })} />
        </Field>
      </Group>

      <Group title="Modelos locais" description="Necessários para escuta, fala e ativação sem internet.">
        {info === null ? (
          <p className="muted small">Não foi possível obter o estado dos modelos.</p>
        ) : models.length === 0 ? (
          <p className="muted small">Nenhum modelo local informado.</p>
        ) : (
          <ul className="model-list">
            {models.map((m) => (
              <li key={m.id} className="model-item">
                <span className={'model-status' + (m.installed ? ' is-ok' : '')}>{m.installed ? <IconCheck size={13} /> : <IconDownload size={13} />}</span>
                <span className="model-label">{m.label}</span>
                <span className="model-size mono">{m.sizeMb.toLocaleString('pt-BR')} MB</span>
                <span className={'model-state ' + (m.installed ? 'tone-text-green' : 'muted')}>{m.installed ? 'instalado' : 'não instalado'}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="row-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void download()} disabled={downloading || (info !== null && missing.length === 0)}>
            {downloading ? <Spinner size={12} /> : <IconDownload size={15} />}
            {downloading ? 'Baixando…' : missing.length ? `Baixar modelos que faltam (${missing.reduce((s, m) => s + m.sizeMb, 0).toLocaleString('pt-BR')} MB)` : 'Todos instalados'}
          </button>
        </div>
        {v.sttProvider === 'local' && missing.length > 0 && <Notice tone="amber">A escuta local precisa dos modelos instalados.</Notice>}
      </Group>
    </>
  );
}
