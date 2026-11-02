/**
 * Trabalhador persistente de UI Automation do Windows (PowerShell 5.1 com
 * System.Windows.Automation). Fala por linhas JSON:
 *   pedido:   {"id":1,"op":"list_windows","args":{...}}
 *   resposta: {"id":1,"ok":true,"result":...} | {"id":1,"ok":false,"error":"..."}
 * Os argumentos chegam como JSON e são lidos com ConvertFrom-Json (nunca
 * viram código). O processo é reiniciado se cair e encerrado no dispose().
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { commandLineLength, powershellArgs, powershellPath } from './powershell';
import { killTree } from './process';

export type UiaOp = 'ping' | 'list_windows' | 'focus_window' | 'list_controls' | 'invoke_control' | 'set_text';

/** Tipos de controle aceitos no filtro (nomes de System.Windows.Automation.ControlType). */
export const UIA_CONTROL_TYPES = [
  'Button', 'Calendar', 'CheckBox', 'ComboBox', 'Custom', 'DataGrid', 'DataItem', 'Document', 'Edit', 'Group', 'Header', 'HeaderItem',
  'Hyperlink', 'Image', 'List', 'ListItem', 'Menu', 'MenuBar', 'MenuItem', 'Pane', 'ProgressBar', 'RadioButton', 'ScrollBar', 'Separator',
  'Slider', 'Spinner', 'SplitButton', 'StatusBar', 'Tab', 'TabItem', 'Table', 'Text', 'Thumb', 'TitleBar', 'ToolBar', 'ToolTip', 'Tree',
  'TreeItem', 'Window',
] as const;

/** Script do trabalhador (ASCII puro; mensagens do sistema vêm em pt-BR do próprio Windows). */
export const UIA_WORKER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$enc = New-Object System.Text.UTF8Encoding($false)
$in = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $enc)
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $enc)
$out.AutoFlush = $true
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$ALLC = [System.Windows.Automation.Condition]::TrueCondition
function Send($o) { $out.WriteLine((ConvertTo-Json -InputObject $o -Compress -Depth 8)) }
function Rect($e) { $r = $e.Current.BoundingRectangle; if ($r.IsEmpty -or [double]::IsInfinity($r.X)) { return $null }; return @{ x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height } }
function CtlType($e) { return ($e.Current.ControlType.ProgrammaticName -replace '^ControlType\.', '') }
function Pats($e) { $p = @(); foreach ($x in $e.GetSupportedPatterns()) { $p += ($x.ProgrammaticName -replace 'PatternIdentifiers\.Pattern$', '') }; return ,$p }
function TopWindows() { return $AE::RootElement.FindAll($TS::Children, $ALLC) }
function FindWin($a) {
  if ($a.janela) {
    $el = $AE::FromHandle([IntPtr][long]$a.janela)
    if ($null -eq $el) { throw 'janela nao encontrada' }
    return $el
  }
  if ($a.titulo) {
    $t = ([string]$a.titulo).ToLowerInvariant()
    foreach ($w in (TopWindows)) { if (([string]$w.Current.Name).ToLowerInvariant().Contains($t)) { return $w } }
    throw ('nenhuma janela aberta com o titulo: ' + [string]$a.titulo)
  }
  throw 'informe a janela (numero de list_windows) ou parte do titulo'
}
function ListWindows($a) {
  $res = New-Object System.Collections.ArrayList
  foreach ($w in (TopWindows)) {
    $c = $w.Current
    if ([string]::IsNullOrWhiteSpace($c.Name)) { continue }
    $pn = ''
    try { $pn = (Get-Process -Id $c.ProcessId -ErrorAction Stop).ProcessName } catch {}
    $min = $false
    try { $wp = $w.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern); $min = ($wp.Current.WindowVisualState -eq [System.Windows.Automation.WindowVisualState]::Minimized) } catch {}
    [void]$res.Add(@{ janela = [long]$c.NativeWindowHandle; titulo = [string]$c.Name; processo = $pn; pid = [int]$c.ProcessId; classe = [string]$c.ClassName; area = (Rect $w); minimizada = $min })
  }
  return ,($res.ToArray())
}
function FocusWin($a) {
  $w = FindWin $a
  try { $wp = $w.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern); if ($wp.Current.WindowVisualState -eq [System.Windows.Automation.WindowVisualState]::Minimized) { $wp.SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Normal) } } catch {}
  try { $w.SetFocus() } catch { $sh = New-Object -ComObject WScript.Shell; [void]$sh.AppActivate([int]$w.Current.ProcessId) }
  return @{ janela = [long]$w.Current.NativeWindowHandle; titulo = [string]$w.Current.Name }
}
function ListControls($a) {
  $w = FindWin $a
  $max = 200; if ($a.max) { $max = [int]$a.max }
  $depthMax = 12; if ($a.profundidade) { $depthMax = [int]$a.profundidade }
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $res = New-Object System.Collections.ArrayList
  $stack = New-Object System.Collections.Stack
  $stack.Push(@($w, 0))
  while ($stack.Count -gt 0 -and $res.Count -lt $max) {
    $item = $stack.Pop(); $el = $item[0]; $d = [int]$item[1]
    if ($d -gt 0) {
      try {
        $c = $el.Current
        [void]$res.Add(@{ nome = [string]$c.Name; tipo = (CtlType $el); automationId = [string]$c.AutomationId; habilitado = [bool]$c.IsEnabled; classe = [string]$c.ClassName; area = (Rect $el); acoes = (Pats $el); nivel = $d })
      } catch { continue }
    }
    if ($d -lt $depthMax) {
      $kids = New-Object System.Collections.ArrayList
      try { $ch = $walker.GetFirstChild($el); while ($null -ne $ch) { [void]$kids.Add($ch); $ch = $walker.GetNextSibling($ch) } } catch {}
      for ($i = $kids.Count - 1; $i -ge 0; $i--) { $stack.Push(@($kids[$i], ($d + 1))) }
    }
  }
  return ,($res.ToArray())
}
function FindCtl($a) {
  $w = FindWin $a
  $conds = New-Object System.Collections.ArrayList
  if ($a.automationId) { [void]$conds.Add((New-Object System.Windows.Automation.PropertyCondition($AE::AutomationIdProperty, [string]$a.automationId))) }
  if ($a.nome) { [void]$conds.Add((New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, [string]$a.nome))) }
  $ct = $null
  if ($a.tipo) {
    $f = [System.Windows.Automation.ControlType].GetField([string]$a.tipo)
    if ($null -eq $f) { throw ('tipo de controle desconhecido: ' + [string]$a.tipo) }
    $ct = $f.GetValue($null)
    [void]$conds.Add((New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $ct)))
  }
  if ($conds.Count -eq 0) { throw 'informe o nome ou o automationId do controle' }
  $cond = $conds[0]
  if ($conds.Count -gt 1) { $cond = [System.Windows.Automation.AndCondition]::new([System.Windows.Automation.Condition[]]$conds.ToArray()) }
  $el = $w.FindFirst($TS::Descendants, $cond)
  if ($null -ne $el) { return $el }
  if ($a.nome) {
    $n = ([string]$a.nome).ToLowerInvariant()
    $all = $w.FindAll($TS::Descendants, $ALLC)
    $k = 0
    foreach ($e in $all) {
      $k++; if ($k -gt 4000) { break }
      try {
        $c = $e.Current
        if (-not ([string]$c.Name).ToLowerInvariant().Contains($n)) { continue }
        if ($a.automationId -and $c.AutomationId -ne [string]$a.automationId) { continue }
        if ($null -ne $ct -and $c.ControlType -ne $ct) { continue }
        return $e
      } catch {}
    }
  }
  throw 'controle nao encontrado nessa janela (use list_controls para ver os nomes)'
}
function InvokeCtl($a) {
  $el = FindCtl $a
  $c = $el.Current
  if (-not $c.IsEnabled) { throw 'o controle esta desabilitado' }
  $o = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$o)) { $o.Invoke(); return @{ feito = 'acionado'; nome = [string]$c.Name; tipo = (CtlType $el) } }
  if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$o)) { $o.Toggle(); return @{ feito = 'alternado'; nome = [string]$c.Name; tipo = (CtlType $el) } }
  if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$o)) { $o.Select(); return @{ feito = 'selecionado'; nome = [string]$c.Name; tipo = (CtlType $el) } }
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$o)) {
    if ($o.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed) { $o.Expand() } else { $o.Collapse() }
    return @{ feito = 'expandido/recolhido'; nome = [string]$c.Name; tipo = (CtlType $el) }
  }
  throw 'esse controle nao aceita acionamento por automacao (tente computer_action)'
}
function SetText($a) {
  $el = FindCtl $a
  $c = $el.Current
  if (-not $c.IsEnabled) { throw 'o controle esta desabilitado' }
  $t = [string]$a.texto
  $o = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$o)) {
    if (-not $o.Current.IsReadOnly) { $o.SetValue($t); return @{ feito = 'texto definido'; nome = [string]$c.Name } }
  }
  $el.SetFocus()
  Start-Sleep -Milliseconds 120
  $esc = [regex]::Replace($t, '[+^%~(){}\[\]]', '{$0}')
  $esc = $esc -replace "\r?\n", '{ENTER}'
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait($esc)
  return @{ feito = 'texto digitado'; nome = [string]$c.Name }
}
Send @{ ready = $true; pid = $PID }
while ($true) {
  $line = $in.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = $null
  try {
    $req = ConvertFrom-Json -InputObject $line
    $id = $req.id
    $a = $req.args
    if ($null -eq $a) { $a = New-Object PSObject }
    $r = $null
    switch ([string]$req.op) {
      'ping' { $r = @{ pong = $true } }
      'list_windows' { $r = ListWindows $a }
      'focus_window' { $r = FocusWin $a }
      'list_controls' { $r = ListControls $a }
      'invoke_control' { $r = InvokeCtl $a }
      'set_text' { $r = SetText $a }
      default { throw ('operacao desconhecida: ' + [string]$req.op) }
    }
    Send @{ id = $id; ok = $true; result = $r }
  } catch {
    Send @{ id = $id; ok = $false; error = [string]$_.Exception.Message }
  }
}
`;

/** JSON só com ASCII (acentos viram \uXXXX), imune à página de código do console. */
export function encodeRequest(id: number, op: UiaOp, args: Record<string, unknown> = {}): string {
  return JSON.stringify({ id, op, args }).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
}

export type WorkerMessage = { ready: true; pid?: number } | { id: number | null; ok: true; result: unknown } | { id: number | null; ok: false; error: string };

export function parseWorkerLine(line: string): WorkerMessage | null {
  const t = line.replace(/^﻿/, '').trim();
  if (!t.startsWith('{')) return null;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    if (j.ready === true) return { ready: true, ...(typeof j.pid === 'number' ? { pid: j.pid } : {}) };
    if (typeof j.ok !== 'boolean') return null;
    const id = typeof j.id === 'number' ? j.id : null;
    return j.ok ? { id, ok: true, result: j.result } : { id, ok: false, error: String(j.error ?? 'erro desconhecido') };
  } catch {
    return null;
  }
}

/** Argumentos de linha de comando do trabalhador. */
export function uiaWorkerArgs(): string[] {
  // Sem indentação nem linhas vazias: a linha de comando do Windows tem limite de tamanho.
  const compact = UIA_WORKER_SCRIPT.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return powershellArgs(compact);
}

export interface UiaWorkerOptions {
  spawnImpl?: typeof spawn;
  exe?: string;
  /** Tempo máximo por pedido (padrão 20 s). */
  requestTimeoutMs?: number;
  /** Tempo para o trabalhador ficar pronto (padrão 30 s). */
  startTimeoutMs?: number;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class UiaWorker {
  private proc: ChildProcess | undefined;
  private ready: Promise<void> | undefined;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private crashes: number[] = [];
  private disposed = false;
  private stderrTail = '';

  constructor(private readonly opts: UiaWorkerOptions = {}) {}

  get running(): boolean {
    return !!this.proc && this.proc.exitCode === null;
  }

  private start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('o trabalhador de automação foi encerrado.'));
    const now = Date.now();
    this.crashes = this.crashes.filter((t) => now - t < 60_000);
    if (this.crashes.length >= 3) return Promise.reject(new Error('a automação do Windows falhou várias vezes seguidas; tente de novo em um minuto.'));
    const exe = this.opts.exe ?? powershellPath();
    const args = uiaWorkerArgs();
    if (commandLineLength(exe, args) > 32_000) return Promise.reject(new Error('script de automação grande demais para a linha de comando.'));
    const spawnImpl = this.opts.spawnImpl ?? spawn;
    const proc = spawnImpl(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    this.buffer = '';
    this.stderrTail = '';
    return new Promise<void>((resolve, reject) => {
      const startTimer = setTimeout(() => {
        reject(new Error('a automação do Windows demorou demais para iniciar.'));
        this.kill();
      }, this.opts.startTimeoutMs ?? 30_000);
      let started = false;
      proc.stdout?.setEncoding('utf8');
      proc.stdout?.on('data', (chunk: string) => {
        this.buffer += chunk;
        let nl: number;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, nl);
          this.buffer = this.buffer.slice(nl + 1);
          const msg = parseWorkerLine(line);
          if (!msg) continue;
          if ('ready' in msg) {
            if (!started) {
              started = true;
              clearTimeout(startTimer);
              resolve();
            }
            continue;
          }
          if (msg.id === null) continue;
          const p = this.pending.get(msg.id);
          if (!p) continue;
          this.pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.ok) p.resolve(msg.result);
          else p.reject(new Error(msg.error));
        }
      });
      proc.stderr?.setEncoding('utf8');
      proc.stderr?.on('data', (c: string) => {
        this.stderrTail = (this.stderrTail + c).slice(-2000);
      });
      const onGone = (why: string): void => {
        if (this.proc !== proc) return;
        this.proc = undefined;
        this.ready = undefined;
        if (!this.disposed) this.crashes.push(Date.now());
        clearTimeout(startTimer);
        if (!started) reject(new Error(`a automação do Windows não iniciou (${why}).`));
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error(`a automação do Windows parou (${why}).`));
          this.pending.delete(id);
        }
      };
      proc.on('error', (e) => onGone(e.message));
      proc.on('exit', (code) => onGone(`código ${code ?? '?'}${this.stderrTail ? `: ${this.stderrTail.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`));
    });
  }

  /** Envia um pedido ao trabalhador (inicia/reinicia se preciso). */
  async request(op: UiaOp, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new Error('cancelado');
    if (!this.running || !this.ready) this.ready = this.start();
    await this.ready;
    const proc = this.proc;
    if (!proc?.stdin) throw new Error('a automação do Windows não está disponível.');
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('a automação do Windows não respondeu a tempo.'));
        this.kill(); // pode estar travada numa janela que não responde
      }, this.opts.requestTimeoutMs ?? 20_000);
      this.pending.set(id, { resolve, reject, timer });
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            const p = this.pending.get(id);
            if (!p) return;
            this.pending.delete(id);
            clearTimeout(p.timer);
            reject(new Error('cancelado'));
            this.kill();
          },
          { once: true },
        );
      }
      proc.stdin!.write(encodeRequest(id, op, args), (err) => {
        if (err) {
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          clearTimeout(p.timer);
          reject(new Error(`falha ao falar com a automação do Windows: ${err.message}`));
        }
      });
    });
  }

  private kill(): void {
    const p = this.proc;
    if (!p) return;
    try {
      p.stdin?.end();
    } catch {
      /* ignora */
    }
    killTree(p, this.opts.spawnImpl ?? spawn);
  }

  /** Encerra o trabalhador (chamar ao fechar o app). */
  dispose(): void {
    this.disposed = true;
    this.kill();
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('encerrado'));
      this.pending.delete(id);
    }
  }
}
