import request from 'supertest';
import { AssetMediaController } from 'src/controllers/asset-media.controller.js';
import { AssetMediaStatus } from 'src/dtos/asset-media-response.dto.js';
import { AssetMetadataKey } from 'src/enum.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { AssetMediaService } from 'src/services/asset-media.service.js';
import { factory } from 'test/small.factory.js';
import { ControllerContext, automock, controllerSetup, mockBaseService } from 'test/utils.js';

const makeUploadDto = (options?: { omit: string }): Record<string, any> => {
  const dto: Record<string, any> = {
    fileCreatedAt: new Date().toISOString(),
    fileModifiedAt: new Date().toISOString(),
    isFavorite: 'false',
  };

  const omit = options?.omit;
  if (omit) {
    delete dto[omit];
  }

  return dto;
};

describe(AssetMediaController.name, () => {
  let ctx: ControllerContext;
  const assetData = Buffer.from('123');
  const filename = 'example.png';
  const service = mockBaseService(AssetMediaService);

  beforeAll(async () => {
    ctx = await controllerSetup(AssetMediaController, [
      { provide: LoggingRepository, useValue: automock(LoggingRepository, { strict: false }) },
      { provide: AssetMediaService, useValue: service },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    service.uploadAsset.mockResolvedValue({ status: AssetMediaStatus.DUPLICATE, id: factory.uuid() });

    ctx.reset();
  });

  describe('POST /assets', () => {
    it('should accept metadata', async () => {
      const mobileMetadata = { key: AssetMetadataKey.MobileApp, value: { iCloudId: '123' } };
      const { status } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({
          ...makeUploadDto(),
          metadata: JSON.stringify([mobileMetadata]),
        });

      expect(service.uploadAsset).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ metadata: [mobileMetadata] }),
        expect.objectContaining({ originalName: 'example.png' }),
        undefined,
      );

      expect(status).toBe(200);
    });

    it('should handle invalid metadata json', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({
          ...makeUploadDto(),
          metadata: 'not-a-string-string',
        });

      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.validationError([
          { path: ['metadata'], message: 'Invalid input: expected JSON string, received string' },
        ]),
      );
    });

    it('should require `fileCreatedAt`', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto({ omit: 'fileCreatedAt' }) });
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.validationError([
          { path: ['fileCreatedAt'], message: 'Invalid input: expected ISO 8601 datetime string, received undefined' },
        ]),
      );
    });

    it('should require `fileModifiedAt`', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field(makeUploadDto({ omit: 'fileModifiedAt' }));
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.validationError([
          { path: ['fileModifiedAt'], message: 'Invalid input: expected ISO 8601 datetime string, received undefined' },
        ]),
      );
    });

    it('should accept a non-UTC timezone offset', async () => {
      const fileCreatedAt = '2026-05-28T19:51:20.555+02:00';
      const { status } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto(), fileCreatedAt });

      expect(status).toBe(200);
      expect(service.uploadAsset).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          fileCreatedAt: new Date(fileCreatedAt),
        }),
        expect.objectContaining({ originalName: 'example.png' }),
        undefined,
      );
    });

    it('should reject a timezone-less datetime', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto(), fileCreatedAt: '2026-05-28T19:51:20.555706' });

      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.validationError([
          { path: ['fileCreatedAt'], message: 'Invalid input: expected ISO 8601 datetime string, received string' },
        ]),
      );
    });

    it('should throw if `isFavorite` is not a boolean', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto(), isFavorite: 'not-a-boolean' });
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.validationError([
          { path: ['isFavorite'], message: 'Invalid option: expected one of "true"|"false"' },
        ]),
      );
    });

    it('should throw if `visibility` is not an enum', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto(), visibility: 'not-an-option' });
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.validationError([
          { path: ['visibility'], message: expect.stringContaining('Invalid option: expected one of') },
        ]),
      );
    });

    // TODO figure out how to deal with `sendFile`

    // TODO figure out how to deal with `sendFile`
    describe('GET /assets/:id/thumbnail', () => {
      it('should reject size=original', async () => {
        const { status } = await request(ctx.getHttpServer()).get(`/assets/${factory.uuid()}/thumbnail?size=original`);
        expect(status).toBe(400);
        expect(service.viewThumbnail).not.toHaveBeenCalled();
      });
    });

    describe('Chunked upload endpoints', () => {
      it('should initialize chunked upload', async () => {
        const uploadId = factory.uuid();
        service.initUpload.mockResolvedValue({
          uploadId,
          chunkSize: 50 * 1024 * 1024,
          status: 'initialized' as any,
        });

        const { status, body } = await request(ctx.getHttpServer())
          .post('/assets/upload/init')
          .send({
            filename: 'test.mp4',
            fileSize: 1000000,
            checksum: 'd2947b871a706081be194569951b7db246907957',
            fileCreatedAt: new Date().toISOString(),
            fileModifiedAt: new Date().toISOString(),
          });

        expect(status).toBe(201);
        expect(body).toEqual(expect.objectContaining({ uploadId, status: 'initialized' }));
        expect(service.initUpload).toHaveBeenCalled();
      });

      it('should upload a chunk', async () => {
        const uploadId = factory.uuid();
        service.uploadChunk.mockResolvedValue({
          uploadId,
          chunkIndex: 0,
          received: 3,
          status: 'in_progress' as any,
        });

        const { status, body } = await request(ctx.getHttpServer())
          .post(`/assets/upload/${uploadId}/chunk/0`)
          .attach('assetData', assetData, 'chunk-0');

        expect(status).toBe(201);
        expect(body).toEqual(expect.objectContaining({ uploadId, chunkIndex: 0 }));
        expect(service.uploadChunk).toHaveBeenCalled();
      });

      it('should complete chunked upload', async () => {
        const uploadId = factory.uuid();
        const assetId = factory.uuid();
        service.completeUpload.mockResolvedValue({
          id: assetId,
          status: AssetMediaStatus.CREATED,
        });

        const { status, body } = await request(ctx.getHttpServer())
          .post(`/assets/upload/${uploadId}/complete`)
          .send({});

        expect(status).toBe(201);
        expect(body).toEqual({ id: assetId, status: AssetMediaStatus.CREATED });
        expect(service.completeUpload).toHaveBeenCalled();
      });
    });
  });
});
