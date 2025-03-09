# Stack Overflow MCP Server Tests

This directory contains unit tests for the Stack Overflow MCP server.

## Test Structure

The tests are organized into the following categories:

1. **Rate Limiting Tests** (`rateLimiting.test.ts`)
   - Tests for the rate limiting functionality
   - Verifies client-side rate limiting
   - Tests handling of API rate limiting responses

2. **API Integration Tests** (`apiIntegration.test.ts`)
   - Tests for the Stack Exchange API integration
   - Verifies correct handling of API responses
   - Tests error handling for API errors

3. **Response Formatting Tests** (`responseFormatting.test.ts`)
   - Tests for the JSON and Markdown formatting
   - Verifies correct structure of formatted responses
   - Tests handling of empty results

4. **Tool Handler Tests** (`toolHandlers.test.ts`)
   - Tests for the MCP tool handlers
   - Verifies correct parameter handling
   - Tests the search and analysis functionality

## Running the Tests

To run the tests, use the following commands:

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Implementation Notes

The tests use Jest as the testing framework and native fetch API mocking for HTTP requests. The StackOverflowServer class has been modified to expose its methods for testing by:

1. Exporting the class
2. Making key methods protected instead of private
3. Adding constructor parameters for API key and access token

## Adding New Tests

When adding new tests:

1. Create a new test file in the `__tests__` directory
2. Import the necessary modules and the StackOverflowServer class
3. Use Jest's describe and test functions to structure your tests
4. Mock the global.fetch function for simulating API responses
5. Use Jest's expect function to make assertions

## Troubleshooting

If you encounter issues with the tests:

1. Make sure all dependencies are installed
2. Check that the test files are correctly importing the StackOverflowServer class
3. Verify that the mocked API responses match the expected format
4. Check for any TypeScript errors in the test files 