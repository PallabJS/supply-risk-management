import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { InMemoryConnectorRegistry } from "../../src/connectors/framework/registry.js";
import type { ConnectorConfig } from "../../src/connectors/framework/types.js";

describe("Connector Framework", () => {
  describe("InMemoryConnectorRegistry", () => {
    let registry: InMemoryConnectorRegistry;

    beforeEach(() => {
      registry = new InMemoryConnectorRegistry();
    });

    it("registers and retrieves connectors", () => {
      const config: ConnectorConfig = {
        name: "test-connector",
        type: "TEST",
        enabled: true,
        pollIntervalMs: 1000,
        requestTimeoutMs: 5000,
        maxRetries: 2,
        providerConfig: { url: "http://example.com" },
      };

      registry.registerConnector(config);
      const retrieved = registry.getConnector("test-connector");

      assert.deepEqual(retrieved, config);
    });

    it("lists enabled connectors only", () => {
      const enabled: ConnectorConfig = {
        name: "enabled-connector",
        type: "TEST",
        enabled: true,
        pollIntervalMs: 1000,
        requestTimeoutMs: 5000,
        maxRetries: 2,
        providerConfig: {},
      };

      const disabled: ConnectorConfig = {
        name: "disabled-connector",
        type: "TEST",
        enabled: false,
        pollIntervalMs: 1000,
        requestTimeoutMs: 5000,
        maxRetries: 2,
        providerConfig: {},
      };

      registry.registerConnector(enabled);
      registry.registerConnector(disabled);

      const listEnabled = registry.listEnabled();
      assert.strictEqual(listEnabled.length, 1);
      assert.strictEqual(listEnabled[0]!.name, "enabled-connector");
    });

    it("loads from config array", () => {
      const configs: ConnectorConfig[] = [
        {
          name: "connector1",
          type: "TYPE1",
          enabled: true,
          pollIntervalMs: 1000,
          requestTimeoutMs: 5000,
          maxRetries: 2,
          providerConfig: {},
        },
        {
          name: "connector2",
          type: "TYPE2",
          enabled: true,
          pollIntervalMs: 2000,
          requestTimeoutMs: 5000,
          maxRetries: 2,
          providerConfig: {},
        },
      ];

      const registry = InMemoryConnectorRegistry.fromConfigs(configs);
      assert.strictEqual(registry.listAll().length, 2);
    });

    it("validates connector config", () => {
      const invalidConfig: ConnectorConfig = {
        name: "", // Invalid: empty name
        type: "TEST",
        enabled: true,
        pollIntervalMs: 1000,
        requestTimeoutMs: 5000,
        maxRetries: 2,
        providerConfig: {},
      };

      assert.throws(() => {
        registry.validate(invalidConfig);
      }, /name is required/);
    });

    it("rejects invalid poll interval", () => {
      const invalidConfig: ConnectorConfig = {
        name: "test",
        type: "TEST",
        enabled: true,
        pollIntervalMs: -1, // Invalid: negative
        requestTimeoutMs: 5000,
        maxRetries: 2,
        providerConfig: {},
      };

      assert.throws(() => {
        registry.validate(invalidConfig);
      }, /pollIntervalMs must be a positive integer/);
    });

    it("rejects missing providerConfig", () => {
      const invalidConfig = {
        name: "test",
        type: "TEST",
        enabled: true,
        pollIntervalMs: 1000,
        requestTimeoutMs: 5000,
        maxRetries: 2,
        // Missing providerConfig
      } as unknown as ConnectorConfig;

      assert.throws(() => {
        registry.validate(invalidConfig);
      }, /providerConfig is required/);
    });
  });

  describe("ConnectorConfig validation", () => {
    let registry: InMemoryConnectorRegistry;

    beforeEach(() => {
      registry = new InMemoryConnectorRegistry();
    });

    it("accepts valid minimal config", () => {
      const config: ConnectorConfig = {
        name: "minimal-connector",
        type: "MINIMAL",
        enabled: true,
        pollIntervalMs: 60000,
        requestTimeoutMs: 10000,
        maxRetries: 3,
        providerConfig: { baseUrl: "http://api.example.com" },
      };

      assert.doesNotThrow(() => {
        registry.registerConnector(config);
      });
    });

    it("accepts config with optional fields", () => {
      const config: ConnectorConfig = {
        name: "full-connector",
        type: "FULL",
        enabled: true,
        pollIntervalMs: 60000,
        requestTimeoutMs: 10000,
        maxRetries: 3,
        outputStream: "custom-stream",
        leaseTtlSeconds: 60,
        retryConfig: {
          baseDelayMs: 100,
          maxDelayMs: 10000,
          jitterRatio: 0.1,
        },
        providerConfig: {
          baseUrl: "http://api.example.com",
          apiKey: "${API_KEY}",
        },
      };

      assert.doesNotThrow(() => {
        registry.registerConnector(config);
      });

      const retrieved = registry.getConnector("full-connector");
      assert.strictEqual(retrieved?.outputStream, "custom-stream");
      assert.strictEqual(retrieved?.leaseTtlSeconds, 60);
    });

    it("rejects non-integer pollIntervalMs", () => {
      const invalidConfig: ConnectorConfig = {
        name: "test",
        type: "TEST",
        enabled: true,
        pollIntervalMs: 1000.5, // Float
        requestTimeoutMs: 5000,
        maxRetries: 2,
        providerConfig: {},
      };

      assert.throws(() => {
        registry.validate(invalidConfig);
      }, /pollIntervalMs must be a positive integer/);
    });

    it("rejects negative maxRetries", () => {
      const invalidConfig: ConnectorConfig = {
        name: "test",
        type: "TEST",
        enabled: true,
        pollIntervalMs: 1000,
        requestTimeoutMs: 5000,
        maxRetries: -1, // Negative
        providerConfig: {},
      };

      assert.throws(() => {
        registry.validate(invalidConfig);
      }, /maxRetries must be a non-negative integer/);
    });
  });
});
