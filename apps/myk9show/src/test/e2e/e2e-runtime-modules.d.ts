// These imports are evaluated by the browser against Vite's dev-server URL.
// They are not package-relative TypeScript modules, so keep their runtime-only
// shape explicit without weakening the rest of the E2E project.
declare module '/src/*' {
  // Runtime-only Vite modules are intentionally untyped at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtimeModule: any;
  export = runtimeModule;
}
