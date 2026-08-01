/**
 * Optional dependency: `open` is not installed; it is loaded lazily at
 * runtime (in `login`) and only used if the user has it available.
 */
declare module "open" {
  export interface Options {
    wait?: boolean;
    app?: string | string[];
  }
  const open: (target: string, options?: Options) => Promise<unknown>;
  export default open;
}
