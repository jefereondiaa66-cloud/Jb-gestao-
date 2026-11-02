/** Configurações do motor: carrega uma vez e grava alterações parciais. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, SettingsPatch } from '../../../core/settings';
import { call } from '../api';
import { errorText } from '../lib/format';

export interface SettingsApi {
  settings: Settings | null;
  loadError: string | null;
  /** Grava e devolve as configurações resultantes (null em caso de erro, já avisado). */
  update(patch: SettingsPatch): Promise<Settings | null>;
  reload(): Promise<Settings | null>;
}

export function useSettings(onError: (title: string, detail: string) => void): SettingsApi {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    try {
      const s = await call('settings:get');
      setSettings(s);
      setLoadError(null);
      return s;
    } catch (e) {
      setLoadError(errorText(e));
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(async (patch: SettingsPatch) => {
    try {
      const s = await call('settings:update', patch);
      setSettings(s);
      return s;
    } catch (e) {
      onErrorRef.current('Não foi possível salvar a configuração', errorText(e));
      return null;
    }
  }, []);

  return { settings, loadError, update, reload };
}
