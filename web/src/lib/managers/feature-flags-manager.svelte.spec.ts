import { featureFlagsManager } from '#lib/managers/feature-flags-manager.svelte.ts';
import { test } from '#test/unit/fixtures.ts';
import { describe, expect } from 'vitest';

describe('featureFlagsManager', () => {
  test('returns default feature flags before init without throwing', () => {
    expect(() => featureFlagsManager.value).not.toThrow();
    expect(featureFlagsManager.value).toBeDefined();
    expect(typeof featureFlagsManager.value.trash).toBe('boolean');
    expect(typeof featureFlagsManager.value.search).toBe('boolean');
  });

  test('updates feature flags after init', async ({ data }) => {
    data.serverFeatures.trash = false;
    await featureFlagsManager.init();

    expect(featureFlagsManager.value.trash).toBe(false);
  });
});
