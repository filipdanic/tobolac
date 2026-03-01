import type { NamespaceDefinition, NamespaceOptions } from "./types";

type SchemaLike<T = unknown> = { parse(value: unknown): T };

export interface NamespaceFactory {
  <T, Args extends unknown[] = []>(options?: NamespaceOptions<T, Args>): NamespaceDefinition<T, Args>;
  type: <T>() => <Args extends unknown[] = []>(
    options?: NamespaceOptions<T, Args>
  ) => NamespaceDefinition<T, Args>;
  schema: <S extends SchemaLike>(
    schema: S
  ) => <Args extends unknown[] = []>(
    options?: Omit<NamespaceOptions<ReturnType<S["parse"]>, Args>, "schema">
  ) => NamespaceDefinition<ReturnType<S["parse"]>, Args>;
}

const namespaceImpl = <T, Args extends unknown[] = []>(
  options: NamespaceOptions<T, Args> = {}
): NamespaceDefinition<T, Args> => ({
  __kind: "namespace",
  options
});

namespaceImpl.type = function namespaceType<T>() {
  return function defineTypedNamespace<Args extends unknown[] = []>(
    options: NamespaceOptions<T, Args> = {}
  ): NamespaceDefinition<T, Args> {
    return namespaceImpl<T, Args>(options);
  };
};

namespaceImpl.schema = function namespaceSchema<S extends SchemaLike>(schema: S) {
  type Inferred = ReturnType<S["parse"]>;

  return function defineSchemaNamespace<Args extends unknown[] = []>(
    options: Omit<NamespaceOptions<Inferred, Args>, "schema"> = {}
  ): NamespaceDefinition<Inferred, Args> {
    return namespaceImpl<Inferred, Args>({
      ...options,
      schema: schema as SchemaLike<Inferred>
    });
  };
};

export const namespace = namespaceImpl as NamespaceFactory;
