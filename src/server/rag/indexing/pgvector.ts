export function toPgVectorLiteral(values: number[]): string {
  // PostgREST expects pgvector values as a textual vector literal.
  // Sending arrays directly can fail depending on runtime/client serialization.
  return `[${values.join(",")}]`;
}

