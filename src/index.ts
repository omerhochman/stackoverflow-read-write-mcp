#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  SearchByErrorInput,
  SearchByTagsInput,
  StackTraceInput,
  SearchResult,
  StackOverflowQuestion,
  StackOverflowAnswer,
  StackOverflowComment,
  SearchResultComments,
  ApiErrorResponse,
} from "./types/index.js";

const STACKOVERFLOW_API = "https://api.stackexchange.com/2.3";
// Default custom filter that includes bodies, scores, and other essential fields
const DEFAULT_FILTER = "!*MZqiDl8Y0c)yVzXS"; // Custom filter for questions with bodies
const ANSWER_FILTER = "!*MZqiDl8Y0c)yVzXS"; // Custom filter for answers with bodies
const COMMENT_FILTER = "!*Mg-gxeRLu"; // Custom filter for comments

// Rate limiting configuration
const MAX_REQUESTS_PER_WINDOW = 30; // Maximum requests per window
const RATE_LIMIT_WINDOW_MS = 60000; // Window size in milliseconds (1 minute)
const RETRY_AFTER_MS = 2000; // Time to wait before retrying after rate limit

export class StackOverflowServer {
  private server: Server;
  private apiKey?: string;
  private accessToken?: string;
  private requestTimestamps: number[] = []; // Track request timestamps for rate limiting

  constructor() {
    this.server = new Server(
      {
        name: "stackoverflow-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_by_error",
          description: "Search Stack Overflow for error-related questions",
          inputSchema: {
            type: "object",
            properties: {
              errorMessage: {
                type: "string",
                description: "Error message to search for",
              },
              language: {
                type: "string",
                description: "Programming language",
              },
              technologies: {
                type: "array",
                items: { type: "string" },
                description: "Related technologies",
              },
              minScore: {
                type: "number",
                description: "Minimum score threshold",
              },
              includeComments: {
                type: "boolean",
                description: "Include comments in results",
              },
              responseFormat: {
                type: "string",
                enum: ["json", "markdown"],
                description: "Response format",
              },
              limit: {
                type: "number",
                description: "Maximum number of results",
              },
            },
            required: ["errorMessage"],
          },
        },
        {
          name: "search_by_tags",
          description: "Search Stack Overflow questions by tags",
          inputSchema: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Tags to search for",
              },
              minScore: {
                type: "number",
                description: "Minimum score threshold",
              },
              includeComments: {
                type: "boolean",
                description: "Include comments in results",
              },
              responseFormat: {
                type: "string",
                enum: ["json", "markdown"],
                description: "Response format",
              },
              limit: {
                type: "number",
                description: "Maximum number of results",
              },
            },
            required: ["tags"],
          },
        },
        {
          name: "analyze_stack_trace",
          description: "Analyze stack trace and find relevant solutions",
          inputSchema: {
            type: "object",
            properties: {
              stackTrace: {
                type: "string",
                description: "Stack trace to analyze",
              },
              language: {
                type: "string",
                description: "Programming language",
              },
              includeComments: {
                type: "boolean",
                description: "Include comments in results",
              },
              responseFormat: {
                type: "string",
                enum: ["json", "markdown"],
                description: "Response format",
              },
              limit: {
                type: "number",
                description: "Maximum number of results",
              },
            },
            required: ["stackTrace", "language"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new McpError(ErrorCode.InvalidParams, "Arguments are required");
      }

      switch (name) {
        case "search_by_error": {
          const input = args as unknown as SearchByErrorInput;
          if (!input.errorMessage) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "errorMessage is required"
            );
          }
          return this.handleSearchByError(input);
        }
        case "search_by_tags": {
          const input = args as unknown as SearchByTagsInput;
          if (!input.tags) {
            throw new McpError(ErrorCode.InvalidParams, "tags are required");
          }
          return this.handleSearchByTags(input);
        }
        case "analyze_stack_trace": {
          const input = args as unknown as StackTraceInput;
          if (!input.stackTrace || !input.language) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "stackTrace and language are required"
            );
          }
          return this.handleAnalyzeStackTrace(input);
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
    );

    if (this.requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }

  private async withRateLimit<T>(
    fn: () => Promise<T>,
    retries = 3
  ): Promise<T> {
    if (!this.checkRateLimit()) {
      // Exceeded rate limit, wait before retrying
      console.warn("Rate limit exceeded, waiting before retry...");
      await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
      return this.withRateLimit(fn, retries);
    }

    try {
      return await fn();
    } catch (error) {
      if (
        retries > 0 &&
        ((error instanceof Error && error.message.includes("429")) ||
          (typeof error === "object" &&
            error !== null &&
            "status" in error &&
            error.status === 429))
      ) {
        console.warn("Rate limit hit (429), retrying after delay...");
        await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
        return this.withRateLimit(fn, retries - 1);
      }
      throw error;
    }
  }

  private async searchStackOverflow(
    query: string,
    tags?: string[],
    options: {
      minScore?: number;
      limit?: number;
      includeComments?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      site: "stackoverflow",
      sort: "votes",
      order: "desc",
      filter: DEFAULT_FILTER,
      q: query,
      ...(tags && { tagged: tags.join(";") }),
      ...(options.limit && { pagesize: options.limit.toString() }),
    });

    if (this.apiKey) {
      params.append("key", this.apiKey);
    }

    if (this.accessToken) {
      params.append("access_token", this.accessToken);
    }

    try {
      const response = await this.withRateLimit(() =>
        fetch(`${STACKOVERFLOW_API}/search/advanced?${params}`)
      );

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Stack Overflow API error: ${errorData.error_message} (${errorData.error_id})`
        );
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      for (const question of data.items) {
        if (options.minScore && question.score < options.minScore) {
          continue;
        }

        const answers = await this.fetchAnswers(question.question_id);
        let comments: SearchResultComments | undefined;

        if (options.includeComments) {
          const answersMap: { [key: number]: StackOverflowComment[] } = {};
          comments = {
            question: await this.fetchComments(question.question_id),
            answers: answersMap,
          };

          for (const answer of answers) {
            if (answer.answer_id !== undefined) {
              comments.answers[answer.answer_id] = await this.fetchComments(
                answer.answer_id
              );
            }
          }
        }

        results.push({
          question,
          answers,
          ...(options.includeComments && { comments }),
        });
      }

      return results;
    } catch (error) {
      // Handle generic errors
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search Stack Overflow: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async fetchAnswers(
    questionId: number
  ): Promise<StackOverflowAnswer[]> {
    const params = new URLSearchParams({
      site: "stackoverflow",
      filter: ANSWER_FILTER,
      sort: "votes",
      order: "desc",
    });

    if (this.apiKey) {
      params.append("key", this.apiKey);
    }

    if (this.accessToken) {
      params.append("access_token", this.accessToken);
    }

    try {
      const response = await this.withRateLimit(() =>
        fetch(`${STACKOVERFLOW_API}/questions/${questionId}/answers?${params}`)
      );

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Stack Overflow API error: ${errorData.error_message} (${errorData.error_id})`
        );
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch answers: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async fetchComments(postId: number): Promise<StackOverflowComment[]> {
    const params = new URLSearchParams({
      site: "stackoverflow",
      filter: COMMENT_FILTER,
      sort: "votes",
      order: "desc",
    });

    if (this.apiKey) {
      params.append("key", this.apiKey);
    }

    if (this.accessToken) {
      params.append("access_token", this.accessToken);
    }

    try {
      const response = await this.withRateLimit(() =>
        fetch(`${STACKOVERFLOW_API}/posts/${postId}/comments?${params}`)
      );

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Stack Overflow API error: ${errorData.error_message} (${errorData.error_id})`
        );
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch comments: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private formatResponse(
    results: SearchResult[],
    format: "json" | "markdown" = "json"
  ): string {
    if (format === "json") {
      return JSON.stringify(results, null, 2);
    }

    return results
      .map((result) => {
        let markdown = `# ${result.question.title}\n\n`;
        markdown += `**Score:** ${result.question.score} | **Answers:** ${result.question.answer_count}\n\n`;
        markdown += `## Question\n\n${result.question.body}\n\n`;

        if (result.comments?.question) {
          markdown += "### Question Comments\n\n";
          result.comments.question.forEach((comment: StackOverflowComment) => {
            markdown += `- ${comment.body} *(Score: ${comment.score})*\n`;
          });
          markdown += "\n";
        }

        markdown += "## Answers\n\n";
        result.answers.forEach((answer: StackOverflowAnswer) => {
          markdown += `### ${answer.is_accepted ? "✓ " : ""}Answer (Score: ${
            answer.score
          })\n\n`;
          markdown += `${answer.body}\n\n`;

          if (result.comments?.answers[answer.answer_id]) {
            markdown += "#### Answer Comments\n\n";
            result.comments.answers[answer.answer_id].forEach(
              (comment: StackOverflowComment) => {
                markdown += `- ${comment.body} *(Score: ${comment.score})*\n`;
              }
            );
            markdown += "\n";
          }
        });

        markdown += `---\n\n[View on Stack Overflow](${result.question.link})\n\n`;
        return markdown;
      })
      .join("\n\n");
  }

  private async handleSearchByError(args: SearchByErrorInput) {
    const tags = [
      ...(args.language ? [args.language.toLowerCase()] : []),
      ...(args.technologies || []),
    ];

    const results = await this.searchStackOverflow(
      args.errorMessage,
      tags.length > 0 ? tags : undefined,
      {
        minScore: args.minScore,
        limit: args.limit,
        includeComments: args.includeComments,
      }
    );

    return {
      content: [
        {
          type: "text",
          text: this.formatResponse(results, args.responseFormat),
        },
      ],
    };
  }

  private async handleSearchByTags(args: SearchByTagsInput) {
    const results = await this.searchStackOverflow("", args.tags, {
      minScore: args.minScore,
      limit: args.limit,
      includeComments: args.includeComments,
    });

    return {
      content: [
        {
          type: "text",
          text: this.formatResponse(results, args.responseFormat),
        },
      ],
    };
  }

  private async handleAnalyzeStackTrace(args: StackTraceInput) {
    // Extract key error message from stack trace
    const errorLines = args.stackTrace.split("\n");
    const errorMessage = errorLines[0]; // Usually first line contains the main error

    const results = await this.searchStackOverflow(
      errorMessage,
      [args.language.toLowerCase()],
      {
        minScore: 0,
        limit: args.limit,
        includeComments: args.includeComments,
      }
    );

    return {
      content: [
        {
          type: "text",
          text: this.formatResponse(results, args.responseFormat),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Stack Overflow MCP server running on stdio");
  }
}

const server = new StackOverflowServer();
server.run().catch(console.error);
