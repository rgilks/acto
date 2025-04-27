import { z } from 'zod';

// Basic regex for flag conditions (e.g., "HAS_FLAG:X", "NOT HAS_FLAG:Y")
// This could be made more robust if complex conditions arise.
const ConditionSchema = z.string().regex(/^(?:NOT )?HAS_FLAG:\w+$/);

// Schema for the top-level metadata
const MetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  totalPassages: z.number().int(),
  winPathTarget: z.number().int(),
  styleGuideRef: z.string(),
});

// Schema for a single flag definition
const FlagSchema = z.object({
  description: z.string(),
  obtained: z.string(),
  used: z.string(),
  optional: z.boolean().optional(),
  type: z.string().optional(), // e.g., "lore collectible", "utility", "lore"
});

// Schema for the collection of all flags (object with flag names as keys)
const FlagsSchema = z.record(z.string(), FlagSchema);

// Schema for alternative prose based on conditions
const ProseAltSchema = z.object({
  condition: ConditionSchema,
  text: z.string(),
});

// Schema for a single choice within a node
const ChoiceSchema = z.object({
  text: z.string(),
  target: z.string(), // Node ID (string)
  showIf: ConditionSchema.optional(),
  hideIf: ConditionSchema.optional(),
  flagsGained: z.array(z.string()).optional(),
  flagsLost: z.array(z.string()).optional(),
  flagsReset: z.boolean().optional(), // Seen on game over nodes
});

// Schema for a single node definition
const NodeSchema = z.object({
  zone: z.string(),
  image: z.string(),
  audio: z.string(),
  words: z.number().int().optional(),
  altText: z.string(),
  prose: z.string(),
  prose_alt: z.array(ProseAltSchema).optional(),
  flagsGained: z.array(z.string()).optional(), // Direct flags gained upon entering node
  flagsLost: z.array(z.string()).optional(), // Direct flags lost upon entering node
  isWin: z.boolean().optional(), // Indicates a winning end node
  choices: z.array(ChoiceSchema),
});

// Schema for the collection of all nodes (object with node IDs as keys)
// Node IDs are strings, e.g., "1", "82", "217B"
const NodesSchema = z.record(z.string(), NodeSchema);

// Schema for ending buckets (object with bucket names as keys, arrays of node IDs as values)
const EndingBucketsSchema = z.record(z.string(), z.array(z.string()));

// The main schema for the entire adventure JSON file
const AdventureSchema = z.object({
  metadata: MetadataSchema,
  flags: FlagsSchema,
  nodes: NodesSchema,
  endingBuckets: EndingBucketsSchema,
});

// Export the schema and inferred type for use in TypeScript projects
export type Adventure = z.infer<typeof AdventureSchema>;
export default AdventureSchema;

// Example usage (in a different file):
// import AdventureSchema from './cotek_schema';
// const adventureData = JSON.parse(fs.readFileSync('docs/crypt_of_the_ember_king.json', 'utf-8'));
// try {
//   AdventureSchema.parse(adventureData);
//   console.log("Validation successful!");
// } catch (error) {
//   console.error("Validation failed:", error);
// }
