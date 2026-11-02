/**
 * Classificação de comandos de shell antes de executar.
 *
 * - `bloqueado`: nunca executar (apaga disco, rouba senhas, desliga proteção,
 *   baixa-e-executa, cria admin, persistência, destrói o sistema…).
 * - `perigoso`: executar só com confirmação explícita do dono (apaga/move,
 *   instala, mexe em registro/serviço, baixa arquivo, desliga/reinicia…).
 * - `normal`: comandos comuns de leitura/consulta.
 *
 * A detecção é robusta a maiúsculas, espaços extras, apelidos (rm/del/ri/rd),
 * aspas e escapes (crase do PowerShell, circunflexo do cmd).
 */
export type CommandLevel = 'bloqueado' | 'perigoso' | 'normal';
export type ShellKind = 'powershell' | 'cmd' | 'sh';

export interface CommandClassification {
  level: CommandLevel;
  reasons: string[];
}

/** Remove escapes/aspas e normaliza espaços e maiúsculas para a detecção. */
function normalize(raw: string): string {
  return String(raw ?? '')
    .replace(/[`^]/g, '') // crase (PowerShell) e circunflexo (cmd) usados para ofuscar
    .replace(/["']/g, '') // aspas
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // Remove a extensão de executável no fim de cada palavra ("reg.exe" -> "reg",
    // "netsh.exe" -> "netsh") para que a detecção não seja driblada com ".exe".
    .replace(/\.(exe|com|cmd|bat|ps1|scr|pif|vbs|vbe|wsf|wsh|msc)(?=$|[\s\\/)\];,|&])/g, '');
}

/** Verbos de remoção (inclui apelidos de PowerShell e cmd). */
const DEL_VERB = /(^|[;&|({]\s*|\s)(remove-item|ri|rm|del|erase|rd|rmdir|unlink|rimraf|shred|clear-content)\b/;

/** Alvos críticos: se um verbo de remoção mira aqui, é bloqueado. */
const DANGER_TARGET: RegExp[] = [
  /\b[a-z]:[\\/]?(\s|$)/, // raiz de drive: c:\  c:/  ou c:
  /\b[a-z]:[\\/]\*/, // c:\*  ou c:/*
  /\b[a-z]:[\\/]windows\b/, // aceita barra normal ou invertida
  /\b[a-z]:[\\/]program files( \(x86\))?\b/,
  /\b[a-z]:[\\/]programdata\b/,
  /%systemroot%|%windir%|%programfiles%|%programdata%|%systemdrive%|%userprofile%|%homepath%|%appdata%|%localappdata%/,
  /\$env:(userprofile|systemroot|windir|programfiles|programdata|systemdrive|homepath|appdata|localappdata)\b/,
  /\b[a-z]:[\\/]users[\\/][^\\/]+[\\/]?(\s|$)/, // raiz do perfil do usuário
  /(^|\s)\/(\s|$)/, // raiz /
  /(^|\s)\/\*/, // /*
  /(^|\s)\/(bin|boot|dev|etc|lib|lib64|proc|root|sbin|sys|usr|var|home|opt)(\/|\s|$)/,
  /\$home\b|\$\{home\}|\$env:home\b/,
  /(^|\s)~([\\/]\*?)?(\s|$)/, // ~  ~/  ~\  ~/*  ~\*
];

interface Rule {
  re: RegExp;
  reason: string;
}

/** Comandos sempre bloqueados. */
const BLOCK: Rule[] = [
  { re: /\bformat\b\s+\/?[a-z]:/, reason: 'formatação de disco' },
  { re: /\bformat-volume\b/, reason: 'formatação de volume' },
  { re: /\bmkfs(\.[a-z0-9]+)?\b/, reason: 'formatação de sistema de arquivos (mkfs)' },
  { re: /\bdiskpart\b/, reason: 'particionamento de disco (diskpart)' },
  { re: /\bbcdedit\b/, reason: 'alteração do carregador de inicialização (bcdedit)' },
  { re: /\bvssadmin\b[^\n]*\bdelete\b[^\n]*\bshadows\b/, reason: 'apagar cópias de sombra/backup do sistema' },
  { re: /\bwmic\b[^\n]*\bshadowcopy\b[^\n]*\bdelete\b/, reason: 'apagar cópias de sombra/backup do sistema' },
  { re: /\bwbadmin\b[^\n]*\bdelete\b/, reason: 'apagar backups do sistema (wbadmin)' },
  { re: /\bcipher\b\s+\/w/, reason: 'apagamento seguro de espaço livre (cipher /w)' },
  { re: /\breg\b\s+delete\s+(hklm|hkey_local_machine)\b/, reason: 'apagar chaves críticas do registro (HKLM)' },
  // Desativar proteções
  { re: /\bset-mppreference\b/, reason: 'desativar/alterar a proteção do Windows Defender' },
  { re: /\badd-mppreference\b[^;|]*-exclusion/, reason: 'criar exclusão no antivírus (burlar o Defender)' },
  { re: /\bnetsh\b\s+advfirewall\b[^;|]*\bset\b[^;|]*\boff\b/, reason: 'desligar o firewall do Windows' },
  { re: /\bnetsh\b\s+firewall\b[^;|]*\bdisable\b/, reason: 'desligar o firewall do Windows' },
  { re: /\bset-netfirewallprofile\b[^;|]*-enabled\s+(false|0|\$false)\b/, reason: 'desligar o firewall do Windows' },
  { re: /\b(disable|stop)-(mpscanning|windefend)\b|\bset-mppreference\b[^;|]*-disable/, reason: 'desativar a proteção do Windows Defender' },
  { re: /\b(sc|net)\b[^\n]*\b(windefend|mpssvc|wscsvc)\b/, reason: 'desativar serviço de segurança do Windows' },
  // Baixar e executar
  { re: /\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^|]*\|\s*(iex|invoke-expression|sh|bash|cmd|powershell|pwsh)\b/, reason: 'baixar e executar código da internet' },
  { re: /\b(iex|invoke-expression)\b[^\n]*\b(downloadstring|downloaddata|downloadfile|http|https|iwr|irm|invoke-webrequest|invoke-restmethod|net\.webclient)\b/, reason: 'executar código baixado da internet (Invoke-Expression)' },
  { re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|perl)\b/, reason: 'baixar e executar código da internet' },
  { re: /(^|\s)-(e|en|enc|enco|encod|encode|encoded|encodedcommand)\s+[a-z0-9+/=]{6,}={0,2}(\s|$|[;|&])/, reason: 'comando PowerShell codificado (ofuscado)' },
  { re: /-encodedcommand\b/, reason: 'comando PowerShell codificado (ofuscado)' },
  // Roubo de credenciais
  { re: /\bmimikatz\b|\bsekurlsa\b|\blogonpasswords\b/, reason: 'ferramenta de roubo de credenciais (mimikatz)' },
  { re: /\breg\b\s+save\s+(hklm|hkey_local_machine)\\?(sam|system|security)\b/, reason: 'extrair o banco de senhas do Windows (SAM/SYSTEM)' },
  { re: /\bprocdump\b[^\n]*\blsass\b|\blsass\b[^\n]*\bprocdump\b|\blsass\.dmp\b|\b(out-minidump|miniDumpWriteDump)\b/, reason: 'despejar a memória do LSASS (roubo de credenciais)' },
  // Criar usuários/admins
  { re: /\bnet\b\s+user\b[^\n]*\/add\b/, reason: 'criar conta de usuário' },
  { re: /\bnet\b\s+localgroup\b[^\n]*administrators?\b[^\n]*\/add\b/, reason: 'adicionar usuário ao grupo de administradores' },
  { re: /\bnew-localuser\b/, reason: 'criar conta de usuário' },
  { re: /\badd-localgroupmember\b[^\n]*administ/, reason: 'adicionar usuário ao grupo de administradores' },
  { re: /\buseradd\b|\badduser\b/, reason: 'criar conta de usuário' },
  // Política de execução
  { re: /\bset-executionpolicy\b[^\n]*\b(unrestricted|bypass)\b/, reason: 'liberar execução irrestrita de scripts (Set-ExecutionPolicy)' },
  // Persistência
  { re: /\bschtasks\b[^\n]*\/create\b/, reason: 'criar tarefa agendada (persistência)' },
  { re: /\b(register-scheduledtask|new-scheduledtask)\b/, reason: 'criar tarefa agendada (persistência)' },
  { re: /\breg\b\s+add\b[^\n]*\\run(once)?\b/, reason: 'gravar chave de inicialização automática (persistência)' },
  { re: /\\currentversion\\run(once)?\b/, reason: 'gravar chave de inicialização automática (persistência)' },
  // Destruição no Linux/macOS
  { re: /:\s*\(\s*\)\s*\{\s*:?\s*\|\s*:?\s*&?\s*\}\s*;?\s*:/, reason: 'fork bomb (trava o computador)' },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|disk|hd|rdisk|vd|mmcblk|loop)/, reason: 'escrever direto no disco (dd)' },
  { re: /\bdd\b[^\n]*of=\\\\\.\\physicaldrive/, reason: 'escrever direto no disco (dd)' },
  { re: /\bchmod\b\s+(-[a-z]*\s+)*-?[a-z]*r[a-z]*\s+777\s+\//, reason: 'permissões abertas recursivas na raiz (chmod -R 777 /)' },
  { re: /\bchown\b\s+-[a-z]*r[a-z]*\b[^\n]*\s\/(\s|$)/, reason: 'troca de dono recursiva na raiz' },
  { re: />\s*\/dev\/(sd|nvme|disk|hd|mmcblk)/, reason: 'escrever direto no disco' },
];

/** Comandos perigosos: precisam de confirmação. */
const DANGER: Rule[] = [
  { re: /\b(winget|choco|scoop)\b\s+install\b/, reason: 'instalação de software' },
  { re: /\bpip3?\b\s+install\b/, reason: 'instalação de pacote (pip)' },
  { re: /\bnpm\b\s+(install|i|add)\b[^\n]*\s-g\b|\bnpm\b\s+(install|i)\s+-g\b|\byarn\b\s+global\s+add\b|\bpnpm\b\s+(add|install)\b[^\n]*-g\b/, reason: 'instalação global de pacote' },
  { re: /\b(apt|apt-get|dnf|yum|zypper|brew)\b[^\n]*\binstall\b|\bpacman\b\s+-s/, reason: 'instalação de software' },
  { re: /\b(gem|cargo|go)\b\s+install\b/, reason: 'instalação de software' },
  { re: /\bmsiexec\b|\s\S+\.msi\b/, reason: 'instalação de software (MSI)' },
  { re: /\breg\b\s+(add|import|copy)\b/, reason: 'alteração no registro do Windows' },
  { re: /\b(set|new|remove)-itemproperty\b[^\n]*\bhk(lm|cu|cr|u|ey)/, reason: 'alteração no registro do Windows' },
  { re: /\b(stop|start|restart|set|new|remove)-service\b/, reason: 'alteração de serviço do Windows' },
  { re: /\bsc\b\s+(stop|start|config|delete|create)\b/, reason: 'alteração de serviço do Windows' },
  { re: /\bnet\b\s+(stop|start)\b/, reason: 'parar/iniciar serviço do Windows' },
  { re: /\btaskkill\b|\bstop-process\b|\bpkill\b|\bkillall\b|\bkill\b\s+-?\d/, reason: 'encerrar processos' },
  { re: /\bsystemctl\b\s+(stop|disable|mask)\b/, reason: 'parar/desativar serviço do sistema' },
  { re: /\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget|start-bitstransfer)\b/, reason: 'baixar arquivo da internet' },
  { re: /\bshutdown\b|\brestart-computer\b|\bstop-computer\b|\blogoff\b|\breboot\b|\bpoweroff\b|\bhalt\b|\binit\s+[06]\b/, reason: 'desligar ou reiniciar o computador' },
  { re: /\b(move-item|mv|rename-item|ren|robocopy|xcopy)\b|\bmove\b\s+\S+\s+\S+/, reason: 'mover ou renomear arquivos' },
  { re: /\b(out-file|set-content|add-content)\b/, reason: 'sobrescrever conteúdo de arquivo' },
  { re: /(^|[^>\d])>>?\s*[^>&\s]/, reason: 'redirecionar e sobrescrever arquivo' },
  { re: /\bchmod\b|\bchown\b|\bicacls\b|\battrib\b/, reason: 'alteração de permissões de arquivo' },
];

export function classifyCommand(command: string, shell: ShellKind): CommandClassification {
  const n = normalize(command);
  void shell; // a detecção cobre os três shells; o parâmetro fica para regras futuras específicas
  const blocked = new Set<string>();
  const dangerous = new Set<string>();

  if (n === '') return { level: 'normal', reasons: [] };

  for (const r of BLOCK) if (r.re.test(n)) blocked.add(r.reason);

  // Remoção mirando alvo crítico => bloqueado; remoção comum => perigoso.
  if (DEL_VERB.test(n)) {
    if (DANGER_TARGET.some((re) => re.test(n))) blocked.add('apagar arquivos em local crítico do sistema');
    else dangerous.add('apagar arquivos');
  }

  for (const r of DANGER) if (r.re.test(n)) dangerous.add(r.reason);

  const level: CommandLevel = blocked.size ? 'bloqueado' : dangerous.size ? 'perigoso' : 'normal';
  const reasons = level === 'bloqueado' ? [...blocked, ...dangerous] : level === 'perigoso' ? [...dangerous] : [];
  return { level, reasons };
}

/** Nomes de variável de ambiente que carregam segredos. */
function isSecretEnvKey(name: string): boolean {
  const u = name.toUpperCase();
  // Termos sensíveis em QUALQUER posição do nome (pega PGPASSWORD, MYSQL_PWD, VAULT_TOKEN...).
  if (/(PASSWORD|PASSWD|PASSPHRASE|PWD|SECRET|TOKEN|APIKEY|CREDENTIAL|PRIVATEKEY|SENHA|BEARER)/.test(u)) return true;
  if (/(^|_)(API[_]?KEY|ACCESS[_]?KEY|SECRET[_]?KEY|CLIENT[_]?SECRET|AUTH[_]?TOKEN|PRIVATE[_]?KEY|PAT|KEY)($|_)/.test(u)) return true;
  if (/_(KEY|TOKEN|SECRET|PWD|PASS|PASSWORD|CREDENTIALS?)$/.test(u)) return true;
  // Strings de conexão de bancos/filas costumam embutir usuário e senha.
  if (/(CONNECTION[_]?STRING|CONNSTR|DATABASE[_]?URL|DB[_]?URL|DSN)/.test(u)) return true;
  if (/^(DATABASE|DB|POSTGRES(QL)?|PG|MYSQL|MARIADB|MONGO(DB)?|REDIS|AMQP|RABBITMQ|KAFKA|ELASTIC(SEARCH)?|CLICKHOUSE|SNOWFLAKE)_(URL|URI|DSN)$/.test(u)) return true;
  if (/^(AWS|AZURE|GCP|GOOGLE|GITHUB|GH|GITLAB|OPENAI|ANTHROPIC|ELEVENLABS|PICOVOICE|BRAVE|TAVILY|SLACK|STRIPE|TWILIO|SENDGRID|DIGITALOCEAN|HEROKU|NPM|PYPI|DOCKER|CLOUDFLARE|VERCEL|NETLIFY|SUPABASE|HF|HUGGINGFACE|REPLICATE|COHERE|MISTRAL|GROQ|PERPLEXITY)_/.test(u)) return true;
  return false;
}

/** Cópia do ambiente sem variáveis que contenham segredos. */
export function buildSafeEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    if (v === undefined) continue;
    if (isSecretEnvKey(k)) continue;
    out[k] = String(v);
  }
  return out;
}
