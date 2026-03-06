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
