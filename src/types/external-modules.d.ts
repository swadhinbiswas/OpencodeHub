declare module "minimatch" {
  interface MinimatchOptions {
    matchBase?: boolean;
    dot?: boolean;
    nocase?: boolean;
    nocomment?: boolean;
    nonegate?: boolean;
    flipNegate?: boolean;
  }

  function minimatch(
    input: string,
    pattern: string,
    options?: MinimatchOptions
  ): boolean;

  namespace minimatch {
    function makeRe(pattern: string, options?: MinimatchOptions): RegExp | false;
  }

  export = minimatch;
}

declare module "uuid" {
  export function v4(): string;
}
