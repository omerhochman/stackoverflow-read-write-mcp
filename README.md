# Stackoverflow MCP Server

A Model Context Protocol server for querying Stack Overflow. This server helps AI models find solutions to programming problems by searching Stack Overflow questions and answers.

## Features

- Search by error messages
- Search by programming language and technology tags
- Stack trace analysis
- Filter results by score/votes
- Include question and answer comments
- Output in JSON or Markdown format

## Installation

You can run the server directly using npx:

```bash
npx -y @gscalzo/stackoverflow-mcp
```

Or install it globally:

```bash
npm install -g @gscalzo/stackoverflow-mcp
```

### Configure the Server

Create or modify your MCP settings file:

- For Claude.app: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- For Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the following configuration:

```json
{
  "mcpServers": {
    "stackoverflow": {
      "command": "npx",
      "args": ["-y", "@gscalzo/stackoverflow-mcp"],
      "env": {
        "STACKOVERFLOW_API_KEY": "your-api-key-optional"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Optional: Stack Overflow API Authentication

The server works without authentication but has rate limits. To increase the rate limits:

1. Get an API key from [Stack Apps](https://stackapps.com/apps/oauth/register)
2. Add the API key to your MCP settings configuration

## Usage

The server provides three main tools:

### 1. search_by_error

Searches Stack Overflow for error-related questions:

```typescript
interface SearchByErrorInput {
  errorMessage: string;          // Required: Error message to search for
  language?: string;            // Optional: Programming language
  technologies?: string[];      // Optional: Related technologies
  minScore?: number;           // Optional: Minimum score threshold
  includeComments?: boolean;    // Optional: Include comments in results
  responseFormat?: "json" | "markdown"; // Optional: Response format
  limit?: number;              // Optional: Maximum number of results
}
```

### 2. search_by_tags

Searches Stack Overflow questions by tags:

```typescript
interface SearchByTagsInput {
  tags: string[];              // Required: Tags to search for
  minScore?: number;          // Optional: Minimum score threshold
  includeComments?: boolean;   // Optional: Include comments in results
  responseFormat?: "json" | "markdown"; // Optional: Response format
  limit?: number;             // Optional: Maximum number of results
}
```

### 3. analyze_stack_trace

Analyzes stack traces to find relevant solutions:

```typescript
interface StackTraceInput {
  stackTrace: string;          // Required: Stack trace to analyze
  language: string;           // Required: Programming language
  includeComments?: boolean;   // Optional: Include comments in results
  responseFormat?: "json" | "markdown"; // Optional: Response format
  limit?: number;             // Optional: Maximum number of results
}
```

## Examples

### Searching by Error Message

```javascript
{
  "name": "search_by_error",
  "arguments": {
    "errorMessage": "TypeError: Cannot read property 'length' of undefined",
    "language": "javascript",
    "technologies": ["react"],
    "minScore": 5,
    "includeComments": true,
    "responseFormat": "markdown",
    "limit": 3
  }
}
```

### Searching by Tags

```javascript
{
  "name": "search_by_tags",
  "arguments": {
    "tags": ["python", "pandas", "dataframe"],
    "minScore": 10,
    "includeComments": true,
    "responseFormat": "json",
    "limit": 5
  }
}
```

### Analyzing Stack Trace

```javascript
{
  "name": "analyze_stack_trace",
  "arguments": {
    "stackTrace": "Error: ENOENT: no such file or directory, open 'config.json'\n    at Object.openSync (fs.js:476:3)\n    at Object.readFileSync (fs.js:377:35)",
    "language": "javascript",
    "includeComments": true,
    "responseFormat": "markdown",
    "limit": 3
  }
}
```

## Response Format

### JSON Output

Responses include:
- Question details (title, body, score, tags, etc.)
- Answers (sorted by votes)
- Optional comments for both questions and answers
- Links to the original Stack Overflow posts

### Markdown Output

The markdown format provides a nicely formatted view with:
- Question title and score
- Question body
- Comments (if requested)
- Answers with acceptance status and score
- Answer comments (if requested)
- Links to the original posts

## Development

1. Build in watch mode:
```bash
npm run watch
```

2. Run tests:
```bash
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
