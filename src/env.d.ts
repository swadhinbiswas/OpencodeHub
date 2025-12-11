/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: import("./db/schema").User | null;
    session: import("./db/schema").Session | null;
  }
}
