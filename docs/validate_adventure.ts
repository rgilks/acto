import fs from 'fs';
import path from 'path';
import { z } from 'zod'; // Import z
// Add .js extension for ESM compatibility when compiled
import AdventureSchema from './cotek_schema.js';
import { fileURLToPath } from 'url'; // Import necessary function

// Infer the type from the schema
type Adventure = z.infer<typeof AdventureSchema>;
type AdventureNode = z.infer<typeof AdventureSchema>['nodes'][string];
type AdventureChoice = z.infer<typeof AdventureSchema>['nodes'][string]['choices'][number];

// Replicate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path to the adventure JSON file relative to this script
// Go up one level from dist_validate and then into docs
const jsonFilePath = path.join(__dirname, '..', 'docs', 'crypt_of_the_ember_king.json');

console.log(`Attempting to load and validate: ${jsonFilePath}`);

try {
  // Read the JSON file content
  const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');

  // Parse the JSON data and explicitly type it
  const adventureData = JSON.parse(jsonData) as Adventure;

  console.log('JSON file loaded and parsed successfully.');

  // Validate the data against the Zod schema
  AdventureSchema.parse(adventureData);

  console.log('\nValidation successful! The JSON data matches the Zod schema.');

  // --- Start: Additional Validation Checks ---
  let warningCount = 0;

  const definedFlags = new Set(Object.keys(adventureData.flags));
  const definedNodes = new Set(Object.keys(adventureData.nodes));
  const allEndingNodes = new Set(Object.values(adventureData.endingBuckets).flat());
  const winTargetNodeId = String(adventureData.metadata.winPathTarget); // Ensure it's a string

  const reachableNodes = new Set<string>();
  const usedFlags = new Set<string>();
  const targetedNodes = new Set<string>();
  let totalChoices = 0;
  let nodesWithChoicesCount = 0; // Counter for nodes with choices

  // 0. Metadata Check: totalPassages
  const actualNodeCount = definedNodes.size;
  console.log(`\n--- Metrics ---`); // Start Metrics Section
  console.log(`Total Nodes Defined: ${actualNodeCount}`);
  if (adventureData.metadata.totalPassages !== actualNodeCount) {
    console.warn(
      `Warning: metadata.totalPassages (${adventureData.metadata.totalPassages}) does not match actual node count (${actualNodeCount}).`
    );
    warningCount++;
  }

  // --- 1. Full BFS for Reachability, Usage Tracking, and Branching Factor ---
  const fullQueue: string[] = [];
  fullQueue.push('1');
  reachableNodes.add('1');

  let fullBfsIndex = 0;
  while (fullBfsIndex < fullQueue.length) {
    const currentNodeId = fullQueue[fullBfsIndex++];
    const node = adventureData.nodes[currentNodeId];

    node.flagsGained?.forEach((flag) => usedFlags.add(flag));
    node.flagsLost?.forEach((flag) => usedFlags.add(flag));

    // node.choices is guaranteed by schema via AdventureNode type
    const currentChoices = node.choices;
    nodesWithChoicesCount++; // Increment count for every node (even if 0 choices)
    totalChoices += currentChoices.length; // Add to total choices count

    currentChoices.forEach((choice) => {
      choice.flagsGained?.forEach((flag) => usedFlags.add(flag));
      choice.flagsLost?.forEach((flag) => usedFlags.add(flag));

      const extractFlagName = (condition?: string): string | undefined => {
        if (!condition) return undefined;
        const parts = condition.split(':');
        return parts.length > 1 ? parts[parts.length - 1] : undefined;
      };
      const showFlag = extractFlagName(choice.showIf);
      const hideFlag = extractFlagName(choice.hideIf);
      if (showFlag) usedFlags.add(showFlag);
      if (hideFlag) usedFlags.add(hideFlag);

      targetedNodes.add(choice.target);

      if (definedNodes.has(choice.target) && !reachableNodes.has(choice.target)) {
        reachableNodes.add(choice.target);
        fullQueue.push(choice.target);
      }
    });
  }
  // Report Average Branching Factor (Refined)
  if (nodesWithChoicesCount > 0) {
    const avgChoices = (totalChoices / nodesWithChoicesCount).toFixed(2);
    console.log(`Average Choices per Node (Nodes with >=1 choice): ${avgChoices}`);
  }

  // --- 2. BFS for Shortest Path to Win Target ---
  let shortestWinPathNodes: string[] = [];
  if (!definedNodes.has(winTargetNodeId)) {
    console.warn(
      `\nWarning: Win target node "${winTargetNodeId}" defined in metadata is not present in nodes.`
    );
    warningCount++;
  } else {
    // Only run if start node exists and win target exists
    const winQueue: [string, string[]][] = [['1', ['1']]]; // [nodeId, pathSoFar]
    const winVisited = new Set<string>(['1']);
    let foundWinPath = false;

    while (winQueue.length > 0) {
      const dequeuedItem = winQueue.shift();
      // Explicitly check if shift returned an item before destructuring
      if (!dequeuedItem) continue;
      const [currentNodeId, currentPath] = dequeuedItem;

      if (currentNodeId === winTargetNodeId) {
        shortestWinPathNodes = currentPath;
        foundWinPath = true;
        break; // Found the shortest path
      }

      const node = adventureData.nodes[currentNodeId];
      // Optional chain removed, node.choices is guaranteed by schema
      node.choices.forEach((choice) => {
        if (definedNodes.has(choice.target) && !winVisited.has(choice.target)) {
          winVisited.add(choice.target);
          const newPath = [...currentPath, choice.target];
          winQueue.push([choice.target, newPath]);
        }
      });
    }

    // Report Shortest Win Path Metrics
    if (foundWinPath) {
      console.log(
        `Shortest Path to Win Node ("${winTargetNodeId}"): ${shortestWinPathNodes.length} nodes`
      );
      const winPathPercentage = ((shortestWinPathNodes.length / actualNodeCount) * 100).toFixed(1);
      console.log(`Win Path Nodes as % of Total: ${winPathPercentage}%`);
      console.log(`Shortest Win Path Nodes: ${shortestWinPathNodes.join(' -> ')}`); // Log the actual path
    } else {
      console.warn(
        `\nWarning: Win target node "${winTargetNodeId}" is unreachable from start node "1".`
      );
      warningCount++;
    }
  }

  // --- 3. Individual Node and Choice Checks ---
  console.log(`\n--- Validation Checks ---`); // Start Validation Section
  let untargetedNodeCount = 0;
  Object.entries(adventureData.nodes).forEach(([nodeId, node]: [string, AdventureNode]) => {
    // 3a. Check if node is reachable (Warning)
    const isEndingNode = allEndingNodes.has(nodeId);
    if (!reachableNodes.has(nodeId) && !isEndingNode) {
      console.warn(`Warning: Node "${nodeId}" appears to be unreachable.`);
      warningCount++;
    }

    // 3b. Check Image/Audio Naming Convention (Error)
    if (!/^IMG_\d{3}[A-Za-z_]*$/.test(node.image)) {
      console.error(`\nError: Node "${nodeId}" has invalid image format: ${node.image}`);
    }
    if (!/^AUD_\d{3}[A-Za-z_]*$/.test(node.audio)) {
      console.error(`\nError: Node "${nodeId}" has invalid audio format: ${node.audio}`);
    }

    // 3c. Check flagsGained/flagsLost in the node itself refer to defined flags (Error)
    node.flagsGained?.forEach((flag: string) => {
      if (!definedFlags.has(flag)) {
        console.error(`\nError: Node "${nodeId}" gains undefined flag: ${flag}`);
      }
    });
    node.flagsLost?.forEach((flag: string) => {
      if (!definedFlags.has(flag)) {
        console.error(`\nError: Node "${nodeId}" loses undefined flag: ${flag}`);
      }
    });

    // 3d. Check choices within the node
    node.choices.forEach((choice: AdventureChoice, index: number) => {
      // Check target validity (Error)
      if (!definedNodes.has(choice.target)) {
        console.error(
          `\nError: Node "${nodeId}", choice ${index} targets undefined node: ${choice.target}`
        );
      } else {
        // Simple Loop Check (Warning)
        if (choice.target === nodeId) {
          console.warn(
            `Warning: Node "${nodeId}", choice ${index} targets itself (potential loop).`
          );
          warningCount++;
        }
      }

      // Check flagsGained/flagsLost in the choice refer to defined flags (Error)
      choice.flagsGained?.forEach((flag: string) => {
        if (!definedFlags.has(flag)) {
          console.error(`\nError: Node "${nodeId}", choice ${index} gains undefined flag: ${flag}`);
        }
        // Flag Logic Sanity Check (Warning)
        if (choice.showIf === `HAS_FLAG:${flag}`) {
          console.warn(
            `Warning: Node "${nodeId}", choice ${index} shows if it HAS_FLAG:${flag} which it also gains in the same choice.`
          );
          warningCount++;
        }
      });
      choice.flagsLost?.forEach((flag: string) => {
        if (!definedFlags.has(flag)) {
          console.error(`\nError: Node "${nodeId}", choice ${index} loses undefined flag: ${flag}`);
        }
        // Flag Logic Sanity Check (Warning)
        if (choice.hideIf === `HAS_FLAG:${flag}`) {
          console.warn(
            `Warning: Node "${nodeId}", choice ${index} hides if it HAS_FLAG:${flag} which it also loses in the same choice.`
          );
          warningCount++;
        }
      });

      // Check showIf/hideIf flags are defined (Error)
      const checkConditionFlag = (condition?: string, type?: string) => {
        if (!condition) return;
        const flagName = condition.split(':').pop(); // Get the part after the last ':'

        if (flagName && !definedFlags.has(flagName)) {
          console.error(
            `\nError: Node "${nodeId}", choice ${index} ${type} condition references undefined flag: ${flagName}`
          );
        }
      };
      checkConditionFlag(choice.showIf, 'showIf');
      checkConditionFlag(choice.hideIf, 'hideIf');
    });

    // Check if node is untargeted (part of Metric 4)
    if (!targetedNodes.has(nodeId) && nodeId !== '1' && !isEndingNode) {
      untargetedNodeCount++;
    }
  });

  // --- 4. Report Aggregate Checks/Warnings ---

  // Report Untargeted Nodes
  if (untargetedNodeCount > 0) {
    console.warn(
      `Warning: Found ${untargetedNodeCount} node(s) that are defined but never targeted by any choice (excluding start and endings).`
    );
    warningCount++; // Increment overall warning count for this category
  }

  // Check for Unused Flags (Warning)
  definedFlags.forEach((flag) => {
    if (!usedFlags.has(flag)) {
      console.warn(`Warning: Flag "${flag}" is defined but never used (gained, lost, or checked).`);
      warningCount++;
    }
  });

  // Check if all ending nodes are reachable (Warning)
  allEndingNodes.forEach((endingNodeId) => {
    if (!reachableNodes.has(endingNodeId)) {
      console.warn(
        `Warning: Ending node "${endingNodeId}" defined in endingBuckets is unreachable.`
      );
      warningCount++;
    }
  });

  // --- 5. Final Result ---
  console.log(`\n--- Final Result ---`);
  console.log(`Validation PASSED with ${warningCount} warning(s).`);

  // --- End: Additional Validation Checks ---
} catch (error: unknown) {
  // Handle potential errors during file reading, JSON parsing, or Zod validation
  // Check for file not found error
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'ENOENT'
  ) {
    console.error(`\nError: JSON file not found at ${jsonFilePath}`);
  } else if (error instanceof SyntaxError) {
    console.error('\nError: Failed to parse JSON file. Check for syntax errors.');
    console.error(error.message);
    // Check if it's a Zod validation error (Zod errors have an 'errors' property which is an array)
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray((error as { errors: unknown[] }).errors)
  ) {
    console.error('\nValidation failed! The JSON data does not match the Zod schema:');
    // Log Zod-specific errors for more detail
    console.error(JSON.stringify((error as { errors: unknown[] }).errors, null, 2));
  } else {
    // Catch any other unexpected errors
    console.error('\nAn unexpected error occurred:', error);
  }
  // Exit with a non-zero code to indicate failure in scripts
  process.exit(1);
}
