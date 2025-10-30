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
  PostQuestionInput,
  PostSolutionInput,
  ThumbsUpInput,
  CommentSolutionInput,
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

    // Read optional auth from environment
    this.apiKey = process.env.STACKOVERFLOW_API_KEY;
    this.accessToken = process.env.STACKOVERFLOW_ACCESS_TOKEN;

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
        {
          name: "post_question",
          description:
            "STRICT: Create a new Stack Overflow question ONLY if no remotely similar error exists AND ONLY after at least 3 distinct attempted fixes. Must include exactly what was tried.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Concise question title" },
              body: {
                type: "string",
                description:
                  "Full markdown body including problem context and minimal repro",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Up to 5 tags relevant to the question",
              },
              errorSignature: {
                type: "string",
                description:
                  "Short error signature used to check for duplicates (e.g., exact error line)",
              },
              triedApproaches: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                description:
                  "At least 3 distinct approaches already attempted, each described",
              },
            },
            required: [
              "title",
              "body",
              "tags",
              "errorSignature",
              "triedApproaches",
            ],
          },
        },
        {
          name: "post_solution",
          description:
            "STRICT: Post an answer ONLY if no similar solution exists, the issue is confirmed resolved, AND concrete evidence (tests/logs/repro) is provided.",
          inputSchema: {
            type: "object",
            properties: {
              questionId: { type: "number", description: "Target question ID" },
              body: {
                type: "string",
                description:
                  "Markdown answer including steps and rationale; include code blocks",
              },
              confirmedResolved: {
                type: "boolean",
                description:
                  "Must be true only if this solution fixed the issue",
              },
              evidence: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description:
                  "Evidence references: passing tests, logs, repo links, repro cases",
              },
            },
            required: ["questionId", "body", "confirmedResolved", "evidence"],
          },
        },
        {
          name: "thumbs_up",
          description:
            "STRICT: Upvote ONLY when a solution demonstrably fixed the issue in the context of the question.",
          inputSchema: {
            type: "object",
            properties: {
              postId: {
                type: "number",
                description: "ID of the answer or question to upvote",
              },
              confirmedFixed: {
                type: "boolean",
                description:
                  "Must be true only if the solution actually fixed the issue",
              },
            },
            required: ["postId", "confirmedFixed"],
          },
        },
        {
          name: "comment_solution",
          description:
            "STRICT: Comment ONLY on a question that currently has no accepted solution, to add clarifications or progress context.",
          inputSchema: {
            type: "object",
            properties: {
              questionId: {
                type: "number",
                description: "Question ID to comment on (no accepted answer)",
              },
              body: {
                type: "string",
                description:
                  "Concise, constructive comment with additional context or findings",
              },
            },
            required: ["questionId", "body"],
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
        case "post_question": {
          const input = args as unknown as PostQuestionInput;
          if (!input.title || !input.body || !input.errorSignature || !input.tags || !input.triedApproaches) {
            throw new McpError(ErrorCode.InvalidParams, "title, body, tags, errorSignature, triedApproaches are required");
          }
          if (!Array.isArray(input.triedApproaches) || input.triedApproaches.length < 3) {
            throw new McpError(ErrorCode.InvalidParams, "At least 3 triedApproaches are required");
          }
          return this.handlePostQuestion(input);
        }
        case "post_solution": {
          const input = args as unknown as PostSolutionInput;
          if (!input.questionId || !input.body) {
            throw new McpError(ErrorCode.InvalidParams, "questionId and body are required");
          }
          return this.handlePostSolution(input);
        }
        case "thumbs_up": {
          const input = args as unknown as ThumbsUpInput;
          if (!input.postId) {
            throw new McpError(ErrorCode.InvalidParams, "postId is required");
          }
          return this.handleThumbsUp(input);
        }
        case "comment_solution": {
          const input = args as unknown as CommentSolutionInput;
          if (!input.questionId || !input.body) {
            throw new McpError(ErrorCode.InvalidParams, "questionId and body are required");
          }
          return this.handleCommentSolution(input);
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

  private async fetchQuestion(questionId: number): Promise<StackOverflowQuestion | undefined> {
    const params = new URLSearchParams({
      site: "stackoverflow",
      filter: DEFAULT_FILTER,
    });

    if (this.apiKey) params.append("key", this.apiKey);
    if (this.accessToken) params.append("access_token", this.accessToken);

    const response = await this.withRateLimit(() =>
      fetch(`${STACKOVERFLOW_API}/questions/${questionId}?${params}`)
    );
    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Stack Overflow API error: ${errorData.error_message} (${errorData.error_id})`
      );
    }
    const data = await response.json();
    return (data.items && data.items[0]) || undefined;
  }

  private ensureWriteAccess() {
    if (!this.apiKey || !this.accessToken) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Write operations require STACKOVERFLOW_API_KEY and STACKOVERFLOW_ACCESS_TOKEN"
      );
    }
  }

  private async handlePostQuestion(input: PostQuestionInput) {
    // Enforce strict policy: require 3+ approaches and no similar existing results
    const similar = await this.searchStackOverflow(input.errorSignature, input.tags, {
      minScore: 0,
      limit: 3,
      includeComments: false,
    });
    if (similar.length > 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Refusing to post: similar questions already exist for the provided errorSignature"
      );
    }

    this.ensureWriteAccess();

    const params = new URLSearchParams({
      site: "stackoverflow",
      title: input.title,
      body: input.body,
      tags: input.tags.join(";"),
      key: this.apiKey as string,
      access_token: this.accessToken as string,
    });

    const response = await this.withRateLimit(() =>
      fetch(`${STACKOVERFLOW_API}/questions/add`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      })
    );

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to post question: ${errorData.error_message} (${errorData.error_id})`
      );
    }
    const data = await response.json();
    const created = data.items && data.items[0];
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Question posted successfully",
              id: created?.question_id,
              link: created?.link,
              triedApproaches: input.triedApproaches,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handlePostSolution(input: PostSolutionInput) {
    if (!input.confirmedResolved) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Refusing to post: confirmedResolved must be true"
      );
    }
    if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Refusing to post: evidence is required"
      );
    }

    // Enforce: do not post if a similar/accepted solution exists (approximation)
    const question = await this.fetchQuestion(input.questionId);
    if (!question) {
      throw new McpError(ErrorCode.InvalidRequest, "Question not found");
    }
    if (question.accepted_answer_id || question.answer_count > 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Refusing to post: the question already has answers (or an accepted one)"
      );
    }

    this.ensureWriteAccess();

    const params = new URLSearchParams({
      site: "stackoverflow",
      body: input.body,
      key: this.apiKey as string,
      access_token: this.accessToken as string,
    });

    const response = await this.withRateLimit(() =>
      fetch(`${STACKOVERFLOW_API}/questions/${input.questionId}/answers/add`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      })
    );

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to post answer: ${errorData.error_message} (${errorData.error_id})`
      );
    }
    const data = await response.json();
    const created = data.items && data.items[0];
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Answer posted successfully",
              id: created?.answer_id,
              link: created?.link,
              evidence: input.evidence,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleThumbsUp(input: ThumbsUpInput) {
    if (!input.confirmedFixed) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Refusing to upvote: confirmedFixed must be true"
      );
    }
    this.ensureWriteAccess();

    const params = new URLSearchParams({
      site: "stackoverflow",
      key: this.apiKey as string,
      access_token: this.accessToken as string,
    });

    const response = await this.withRateLimit(() =>
      fetch(`${STACKOVERFLOW_API}/posts/${input.postId}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      })
    );
    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to upvote: ${errorData.error_message} (${errorData.error_id})`
      );
    }
    return {
      content: [
        { type: "text", text: "Upvote submitted successfully" },
      ],
    };
  }

  private async handleCommentSolution(input: CommentSolutionInput) {
    // Only if the question has no accepted solution
    const question = await this.fetchQuestion(input.questionId);
    if (!question) {
      throw new McpError(ErrorCode.InvalidRequest, "Question not found");
    }
    if (question.accepted_answer_id) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Refusing to comment: question already has an accepted answer"
      );
    }

    this.ensureWriteAccess();

    const params = new URLSearchParams({
      site: "stackoverflow",
      body: input.body,
      key: this.apiKey as string,
      access_token: this.accessToken as string,
    });

    const response = await this.withRateLimit(() =>
      fetch(`${STACKOVERFLOW_API}/posts/${input.questionId}/comments/add`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      })
    );
    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to post comment: ${errorData.error_message} (${errorData.error_id})`
      );
    }
    const data = await response.json();
    const created = data.items && data.items[0];
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { message: "Comment posted successfully", id: created?.comment_id },
            null,
            2
          ),
        },
      ],
    };
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
    const params = new URLSearchParams({
      site: "stackoverflow",
      sort: "votes",
      order: "desc",
      filter: "!nKzQUR30W7",
      tagged: args.tags.join(";"),
      ...(args.limit && { pagesize: args.limit.toString() }),
    });

    if (this.apiKey) {
      params.append("key", this.apiKey);
    }

    if (this.accessToken) {
      params.append("access_token", this.accessToken);
    }

    try {
      const response = await this.withRateLimit(() =>
        fetch(`${STACKOVERFLOW_API}/questions?${params}`)
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
        if (args.minScore && question.score < args.minScore) {
          continue;
        }

        const answers = await this.fetchAnswers(question.question_id);
        let comments: SearchResultComments | undefined;

        if (args.includeComments) {
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
          ...(args.includeComments && { comments }),
        });
      }

      return {
        content: [
          {
            type: "text",
            text: this.formatResponse(results, args.responseFormat),
          },
        ],
      };
    } catch (error) {
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
