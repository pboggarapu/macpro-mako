import { expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// extends Vitest's expect method with methods from react-testing-library
expect.extend(matchers);

// runs a cleanup after each test case (e.g. clearing jsdom)

// Add this to remove all the expected errors in console when running unit tests.
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  if (process.env.MOCK_API_REFINES) {
    vi.mock("@/api/itemExists", () => ({
      itemExists: vi.fn(async (id: string) => {
        const idsThatExist = ["MD-00-0000"];

        return idsThatExist.includes(id);
      }),
    }));
    vi.mock("@/utils/user", () => ({
      isAuthorizedState: vi.fn(async (id: string) => {
        const validStates = ["MD"];

        return validStates.includes(id.substring(0, 2));
      }),
    }));
    // mock the api calls that the frontend uses here
    // vi.mock("@/api/stuff")
  }
});

afterEach(() => {
  if (process.env.SKIP_CLEANUP) return;
  cleanup();
});

afterAll(() => {
  delete process.env.SKIP_CLEANUP;
  vi.restoreAllMocks();
});
