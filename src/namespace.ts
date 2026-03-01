import type { NamespaceDefinition, NamespaceOptions } from "./types";

type SchemaLike<T = unknown> = { parse(value: unknown): T };

type NamespaceBuilder<T> = {
  <Args extends unknown[] = []>(
    options: NamespaceOptions<T, Args> & { factoryGetter: (...args: Args) => T | Promise<T> }
  ): NamespaceDefinition<T, Args, true>;
  <Args extends unknown[] = []>(
    options?: NamespaceOptions<T, Args>
  ): NamespaceDefinition<T, Args, false>;
};

type SchemaNamespaceBuilder<S extends SchemaLike> = {
  <Args extends unknown[] = []>(
    options: Omit<NamespaceOptions<ReturnType<S["parse"]>, Args>, "schema"> & {
      factoryGetter: (...args: Args) => ReturnType<S["parse"]> | Promise<ReturnType<S["parse"]>>;
    }
  ): NamespaceDefinition<ReturnType<S["parse"]>, Args, true>;
  <Args extends unknown[] = []>(
    options?: Omit<NamespaceOptions<ReturnType<S["parse"]>, Args>, "schema">
  ): NamespaceDefinition<ReturnType<S["parse"]>, Args, false>;
};

export interface NamespaceFactory {
  <T, Args extends unknown[] = []>(
    options: NamespaceOptions<T, Args> & { factoryGetter: (...args: Args) => T | Promise<T> }
  ): NamespaceDefinition<T, Args, true>;
  <T, Args extends unknown[] = []>(
    options?: NamespaceOptions<T, Args>
  ): NamespaceDefinition<T, Args, false>;
  type: <T>() => NamespaceBuilder<T>;
  schema: <S extends SchemaLike>(schema: S) => SchemaNamespaceBuilder<S>;
}

function namespaceImpl<T, Args extends unknown[] = []>(
  options: NamespaceOptions<T, Args> = {}
): NamespaceDefinition<T, Args, boolean> {
  return {
    __kind: "namespace",
    options,
  };
}

namespaceImpl.type = function namespaceType<T>(): NamespaceBuilder<T> {
  return namespaceImpl as NamespaceBuilder<T>;
};

namespaceImpl.schema = function namespaceSchema<S extends SchemaLike>(
  schema: S
): SchemaNamespaceBuilder<S> {
  return function defineSchemaNamespace<Args extends unknown[] = []>(
    options: Omit<NamespaceOptions<ReturnType<S["parse"]>, Args>, "schema"> = {}
  ): NamespaceDefinition<ReturnType<S["parse"]>, Args, boolean> {
    return namespaceImpl<ReturnType<S["parse"]>, Args>({
      ...options,
      schema: schema as SchemaLike<ReturnType<S["parse"]>>,
    });
  } as SchemaNamespaceBuilder<S>;
};

export const namespace = namespaceImpl as NamespaceFactory;
