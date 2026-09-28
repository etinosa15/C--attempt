// Test-only resolver: lets `node --test` load the app's TypeScript modules, which
// use extensionless relative imports (`./core`) that the Next/Turbopack bundler
// resolves at build time but Node's ESM resolver does not. We append `.ts` to any
// extensionless relative specifier so Node's native type-stripping can load it.
// Not part of the app or the build — only the unit tests register this hook
// (synchronously, via module.registerHooks).
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.\w+$/.test(specifier)) {
    try {
      return nextResolve(specifier + ".ts", context);
    } catch {
      /* Fall through to the default resolution below. */
    }
  }
  return nextResolve(specifier, context);
}
