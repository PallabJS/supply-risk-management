export const SourceTypes = Object.freeze({
  WEATHER: "WEATHER",
  NEWS: "NEWS",
  SOCIAL: "SOCIAL",
  TRAFFIC: "TRAFFIC"
});

export type SourceType = (typeof SourceTypes)[keyof typeof SourceTypes];

export const VALID_SOURCE_TYPES: ReadonlySet<SourceType> = new Set(
  Object.values(SourceTypes) as SourceType[]
);
