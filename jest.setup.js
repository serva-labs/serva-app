// Jest setup — mock native modules that aren't available in test env

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock react-native-sse — we'll provide custom mocks per test
jest.mock("react-native-sse", () => {
  return jest.fn();
});

// Mock expo-clipboard
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(""),
  hasStringAsync: jest.fn().mockResolvedValue(false),
}));

// Mock expo-web-browser
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
  dismissBrowser: jest.fn(),
}));
