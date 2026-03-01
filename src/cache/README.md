# Cache Module Layout

This folder contains the runtime-independent cache orchestration.

## Files

- `index.ts`: `createCache` entrypoint and prune timer lifecycle.
- `runtime.ts`: resolves global/runtime settings and wires per-namespace Layer 1 plus shared Layer 2.
- `builders.ts`: builds namespace and global APIs (`get`, `getOrSet`, `set`, `delete`, `clear`, stats).
- `layers.ts`: read/write behavior across Layer 1 and Layer 2 with TTL/SWR handling.
- `key.ts`: namespace-local key construction and operation argument parsing.
- `internal-types.ts`: shared internal types for this module.

## Configuration precedence

For each namespace operation, values resolve in this order:
1. Call overrides (`ttl`, `swr`) on the operation.
2. Namespace options (`namespace(...options)`).
3. `globalConfig` defaults.
4. Library defaults.
