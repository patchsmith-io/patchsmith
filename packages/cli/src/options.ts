/** Values produced by CAC's declared string and boolean command options. */
export interface CliOptions {
  bare?: boolean;
  srcDir?: boolean;
  thread?: string;
  app?: string;
  appId?: string;
  config?: string;
  cwd?: string;
  force?: boolean;
  host?: string;
  install?: boolean;
  interactive?: boolean;
  mode?: string;
  name?: string;
  open?: boolean;
  out?: string;
  outDir?: string;
  packageManager?: string;
  schema?: string;
  timeout?: string | number;
  tooling?: string;
}
