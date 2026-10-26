import type { HarnessAgentSkill } from "@ai-sdk/harness/agent";

import database from "./skills/database.md?raw";
import frontend from "./skills/frontend.md?raw";
import functions from "./skills/functions.md?raw";
import workflowExamples from "./skills/references/workflows.md?raw";
import views from "./skills/views.md?raw";

export const appAgentReferencesDirectory =
  "/workspace/.patchsmith-agent/references";

const withReferencePaths = (content: string) =>
  content.replaceAll("](references/", `](${appAgentReferencesDirectory}/`);

const guides = [
  {
    content: withReferencePaths(frontend),
    description:
      "Frontend: compose components, handle forms/callbacks, or call product tools.",
    filename: "frontend-guide.md",
    name: "patchsmith-frontend",
  },
  {
    content: withReferencePaths(views),
    description: "Views: slots, context, layouts, or repeated instances.",
    filename: "views-guide.md",
    name: "patchsmith-views",
  },
  {
    content: withReferencePaths(functions),
    description:
      "Functions: queries, mutations, external actions, or reactive client hooks.",
    filename: "functions-guide.md",
    name: "patchsmith-functions",
  },
  {
    content: withReferencePaths(database),
    description: "Database: tables, relations, reads/writes, or migrations.",
    filename: "database-guide.md",
    name: "patchsmith-database",
  },
];

// FX embeds skill content in each turn. Keep only pointers in the prompt; guides
// and recipes are read from the VM when their feature branch applies.
export const appAgentSkills = guides.map(({ description, filename, name }) => ({
  content: `Read [${name}](${appAgentReferencesDirectory}/${filename}) when this skill applies.`,
  description,
  name,
})) satisfies readonly HarnessAgentSkill[];

export const appAgentReferences = [
  ...guides.map(({ content, filename }) => ({
    content,
    path: `${appAgentReferencesDirectory}/${filename}`,
  })),
  {
    content: workflowExamples,
    path: `${appAgentReferencesDirectory}/workflows.md`,
  },
];
