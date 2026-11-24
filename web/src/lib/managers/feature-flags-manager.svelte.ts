import { queryClient } from '#lib/queries/client.ts';
import { getServerFeaturesQuery } from '#lib/queries/server-info.query.ts';
import type { ServerFeaturesDto } from '@immich/sdk';

const defaultServerFeatures: ServerFeaturesDto = {
  backups: false,
  configFile: false,
  duplicateDetection: false,
  email: false,
  facialRecognition: false,
  importFaces: false,
  map: false,
  oauth: false,
  oauthAutoLaunch: false,
  ocr: false,
  passwordLogin: true,
  realtimeTranscoding: false,
  reverseGeocoding: false,
  search: true,
  sidecar: true,
  smartSearch: false,
  trash: true,
};

class FeatureFlagsManager {
  #value?: ServerFeaturesDto = $state();

  async init() {
    this.#value = await queryClient.query(getServerFeaturesQuery());
  }

  get value(): ServerFeaturesDto {
    return this.#value ?? queryClient.getQueryData(getServerFeaturesQuery().queryKey) ?? defaultServerFeatures;
  }
}

export const featureFlagsManager = new FeatureFlagsManager();
