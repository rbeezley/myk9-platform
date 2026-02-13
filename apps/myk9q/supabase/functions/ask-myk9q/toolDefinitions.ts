import type { ToolDefinition } from "./types.ts";

export const TOOLS: ToolDefinition[] = [
  {
    name: "search_rules",
    description:
      "Search the rulebook for regulations, requirements, time limits, area sizes, hide counts, or procedures. Use for ANY question about rules or regulations.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for finding rules",
        },
        level: {
          type: "string",
          enum: ["Novice", "Advanced", "Excellent", "Master"],
          description: "Filter by competition level if mentioned",
        },
        element: {
          type: "string",
          enum: ["Container", "Interior", "Exterior", "Buried"],
          description: "Filter by element type if mentioned",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_class_summary",
    description:
      "Get summary of classes including entry counts, status, judges, and scoring progress. Use for questions about class schedules, how many dogs are entered, which classes are running, judges, etc.",
    input_schema: {
      type: "object",
      properties: {
        trial_date: {
          type: "string",
          description: "Filter by trial date (YYYY-MM-DD format)",
        },
        element: {
          type: "string",
          description: "Filter by element (e.g., Interior, Exterior, Container, Buried)",
        },
        level: {
          type: "string",
          description: "Filter by level (e.g., Novice, Advanced, Excellent, Master)",
        },
        class_status: {
          type: "string",
          enum: ["no-status", "setup", "briefing", "break", "in_progress", "completed"],
          description: "Filter by class status",
        },
      },
      required: [],
    },
  },
  {
    name: "get_entry_results",
    description:
      "Get entry results including placements, times, faults, and qualification status. Use for questions about results, placements, times, scores, who qualified, or specific dog/handler performance.",
    input_schema: {
      type: "object",
      properties: {
        element: {
          type: "string",
          description: "Filter by element (e.g., Interior, Exterior, Handler Discrimination)",
        },
        level: {
          type: "string",
          description: "Filter by level (e.g., Novice, Master)",
        },
        trial_date: {
          type: "string",
          description: "Filter by trial date. Accepts: day of week ('Saturday', 'Sunday'), US format ('9/16/2023', '09/16/2023'), or ISO format ('2023-09-16')",
        },
        armband_number: {
          type: "string",
          description: "Filter by armband number",
        },
        handler_name: {
          type: "string",
          description: "Filter by handler name (partial match)",
        },
        dog_name: {
          type: "string",
          description: "Filter by dog call name (partial match)",
        },
        result_status: {
          type: "string",
          enum: ["qualified", "nq", "absent", "excused"],
          description: "Filter by result status",
        },
        top_n: {
          type: "number",
          description: "Get top N placements (e.g., 3 for top 3)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_trial_overview",
    description:
      "Get overview of trials including dates, names, and competition types. Use for questions about trial schedule, what trials are happening, or general event info.",
    input_schema: {
      type: "object",
      properties: {
        trial_date: {
          type: "string",
          description: "Filter by specific date (YYYY-MM-DD)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_entries",
    description:
      "Search for entries across all classes by dog name or handler name. Use when user asks about a specific dog or handler's entries or performance across multiple classes.",
    input_schema: {
      type: "object",
      properties: {
        dog_name: {
          type: "string",
          description: "Dog call name to search (partial match)",
        },
        handler_name: {
          type: "string",
          description: "Handler name to search (partial match)",
        },
      },
      required: [],
    },
  },
];
