import { StackOverflowServer } from "../index.js";
import { jest, describe, test, expect } from "@jest/globals";
import type {
  SearchByErrorInput,
  SearchByTagsInput,
  StackTraceInput,
} from "../types/index.js";

describe("Tool Handlers", () => {
  test("should handle search_by_error correctly", async () => {
    const server = new StackOverflowServer();

    // Mock the searchStackOverflow method
    const searchSpy = jest.spyOn(server as any, "searchStackOverflow");
    searchSpy.mockResolvedValue([]);

    // Create input parameters
    const input: SearchByErrorInput = {
      errorMessage: "TypeError: Cannot read property",
      language: "javascript",
      technologies: ["react"],
      minScore: 5,
      includeComments: true,
      responseFormat: "json",
      limit: 10,
    };

    // Call the handler
    await (server as any).handleSearchByError(input);

    // Verify searchStackOverflow was called with correct parameters
    expect(searchSpy).toHaveBeenCalledWith(
      "TypeError: Cannot read property",
      ["javascript", "react"],
      {
        minScore: 5,
        limit: 10,
        includeComments: true,
      }
    );
  });

  test("should handle search_by_tags correctly", async () => {
    const server = new StackOverflowServer();

    // Mock the searchStackOverflow method
    const searchSpy = jest.spyOn(server as any, "searchStackOverflow");
    searchSpy.mockResolvedValue([]);

    // Create input parameters
    const input: SearchByTagsInput = {
      tags: ["typescript", "jest"],
      minScore: 10,
      includeComments: false,
      responseFormat: "markdown",
      limit: 5,
    };

    // Call the handler
    await (server as any).handleSearchByTags(input);

    // Verify searchStackOverflow was called with correct parameters
    expect(searchSpy).toHaveBeenCalledWith("", ["typescript", "jest"], {
      minScore: 10,
      limit: 5,
      includeComments: false,
    });
  });

  test("should handle analyze_stack_trace correctly", async () => {
    const server = new StackOverflowServer();

    // Mock the searchStackOverflow method
    const searchSpy = jest.spyOn(server as any, "searchStackOverflow");
    searchSpy.mockResolvedValue([]);

    // Create input parameters
    const input: StackTraceInput = {
      stackTrace:
        "Error: Something went wrong\n  at Function.Module._load (module.js:417:25)",
      language: "nodejs",
      includeComments: true,
      responseFormat: "json",
      limit: 3,
    };

    // Call the handler
    await (server as any).handleAnalyzeStackTrace(input);

    // Verify searchStackOverflow was called with correct parameters
    expect(searchSpy).toHaveBeenCalledWith(
      "Error: Something went wrong",
      ["nodejs"],
      {
        minScore: 0,
        limit: 3,
        includeComments: true,
      }
    );
  });
});
