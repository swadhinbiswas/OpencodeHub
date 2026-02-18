declare module "minimatch" {
  export interface MinimatchOptions {
    matchBase?: boolean;
    dot?: boolean;
    nocase?: boolean;
    nocomment?: boolean;
    nonegate?: boolean;
    flipNegate?: boolean;
  }

  export function minimatch(
    input: string,
    pattern: string,
    options?: MinimatchOptions
  ): boolean;

  export namespace minimatch {
    function makeRe(pattern: string, options?: MinimatchOptions): RegExp | false;
  }
}

declare module "uuid" {
  export function v4(): string;
}
