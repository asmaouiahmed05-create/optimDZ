type JsonPrimitive = string | number | boolean | null;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function asNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function summarizeKeyResultValues(result: unknown): JsonRecord {
  if (!isRecord(result)) return {};

  const values: JsonRecord = {};
  for (const [key, value] of Object.entries(result)) {
    if (isJsonPrimitive(value)) {
      values[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      values[`${key}Count`] = value.length;
      continue;
    }

    if (isRecord(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (isJsonPrimitive(nestedValue)) {
          values[`${key}.${nestedKey}`] = nestedValue;
        }
      }
    }
  }

  return values;
}

export function buildSharedHistoryRecord(body: Record<string, unknown>) {
  const problemData = isRecord(body.problemData)
    ? body.problemData
    : isRecord(body.content)
      ? body.content
      : {};
  const result = body.result ?? (isRecord(body.content) ? body.content.results : null);

  const moduleName = asNonEmptyString(
    body.moduleName ?? problemData.moduleName ?? problemData.type ?? body.type ?? body.sector,
    "unknown",
  );
  const problemName = asNonEmptyString(
    body.name ?? problemData.problemName ?? problemData.name,
    moduleName,
  );

  return {
    moduleName,
    problemName,
    keyResultValues: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.optimalValue !== undefined ? { optimalValue: body.optimalValue } : {}),
      ...summarizeKeyResultValues(result),
    },
  };
}