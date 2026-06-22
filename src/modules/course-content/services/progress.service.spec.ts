import { Test } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProgressService } from './progress.service';
import { CourseSection } from '../schemas/course-section.schema';
import { CourseVideo } from '../schemas/course-video.schema';
import { VideoProgress } from '../schemas/video-progress.schema';
import { CourseVideoStats } from '../schemas/course-video-stats.schema';
import { CourseStats } from '../schemas/course-stats.schema';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';

describe('ProgressService', () => {
  let service: ProgressService;

  const mockUser: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    email: 'student@test.com',
    username: 'student',
    role: 'student',
    roleId: new Types.ObjectId().toString(),
    permissions: [],
    reputationScore: 0,
    githubLinked: false,
    emailVerified: true,
    preferences: {},
  };

  const mockCourseId = new Types.ObjectId().toString();
  const mockVideoId = new Types.ObjectId().toString();
  const mockSectionId = new Types.ObjectId().toString();

  const mockSection = {
    _id: new Types.ObjectId(mockSectionId),
    courseId: new Types.ObjectId(mockCourseId),
  };

  const mockVideo = {
    _id: new Types.ObjectId(mockVideoId),
    sectionId: new Types.ObjectId(mockSectionId),
    title: 'Test Video',
    isDeleted: false,
  };

  const baseMockProgress = {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(mockUser.id),
    videoId: new Types.ObjectId(mockVideoId),
    watched: false,
    watchedProgress: 0.5,
    lastPositionSeconds: 60,
    updatedAt: new Date(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([true]),
  };

  const mockSession = {
    startTransaction: jest.fn(),
    endSession: jest.fn(),
    abortTransaction: jest.fn(),
    withTransaction: jest
      .fn()
      .mockImplementation(async (fn: () => Promise<void>) => {
        await fn();
      }),
  };

  const mockConnection = {
    startSession: jest.fn().mockResolvedValue(mockSession),
  };

  const defaultAggregateChain = {
    exec: jest.fn().mockResolvedValue([]),
    session: jest.fn().mockReturnThis(),
  };

  const defaultDistinctChain = {
    exec: jest.fn().mockResolvedValue([]),
    session: jest.fn().mockReturnThis(),
  };

  const createModule = async (
    overrides: Record<string, unknown> = {},
    useDefaultAgg = true,
  ) => {
    const aggregateChain = useDefaultAgg
      ? defaultAggregateChain
      : {
          exec: jest.fn().mockResolvedValue(overrides.aggResult ?? []),
          session: jest.fn().mockReturnThis(),
        };

    const distinctChain = useDefaultAgg
      ? defaultDistinctChain
      : {
          exec: jest.fn().mockResolvedValue(overrides.distinctResult ?? []),
          session: jest.fn().mockReturnThis(),
        };

    const module = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: getModelToken(CourseSection.name),
          useValue: {
            findById: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockSection),
            }),
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([mockSection]),
              }),
              session: jest.fn().mockReturnThis(),
            }),
            ...overrides,
          },
        },
        {
          provide: getModelToken(CourseVideo.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockVideo),
            }),
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([mockVideo]),
              }),
              session: jest.fn().mockReturnThis(),
            }),
          },
        },
        {
          provide: getModelToken(VideoProgress.name),
          useValue: {
            findOneAndUpdate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(baseMockProgress),
            }),
            aggregate: jest.fn().mockReturnValue(aggregateChain),
            distinct: jest.fn().mockReturnValue(distinctChain),
          },
        },
        {
          provide: getModelToken(CourseVideoStats.name),
          useValue: {
            findOneAndUpdate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
            find: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: getModelToken(CourseStats.name),
          useValue: {
            findOneAndUpdate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: CourseAccessService,
          useValue: {
            canViewCourseForRequest: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();
    return module.get<ProgressService>(ProgressService);
  };

  beforeEach(() => {
    mockEventEmitter.emit.mockClear();
    mockEventEmitter.emitAsync.mockClear();
    mockSession.withTransaction.mockClear();
  });

  it('should be defined', async () => {
    service = await createModule();
    expect(service).toBeDefined();
  });

  describe('upsertProgress', () => {
    it('records progress and returns event type', async () => {
      service = await createModule();
      const result = await service.upsertProgress(
        mockUser,
        mockCourseId,
        mockVideoId,
        {
          watchedProgress: 0.5,
          lastPositionSeconds: 60,
        },
      );

      expect(result.videoId).toBe(mockVideoId);
      expect(result.watchedProgress).toBe(0.5);
      expect(result.eventType).toBe('VIDEO_PROGRESS_UPDATED');
    });

    it('throws BadRequestException when watched=true with watchedProgress below 0.95', async () => {
      service = await createModule();
      await expect(
        service.upsertProgress(mockUser, mockCourseId, mockVideoId, {
          watched: true,
          watchedProgress: 0.5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when watched=true with watchedProgress = 0.89', async () => {
      service = await createModule();
      await expect(
        service.upsertProgress(mockUser, mockCourseId, mockVideoId, {
          watched: true,
          watchedProgress: 0.89,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when watched=true with watchedProgress = 0.90', async () => {
      service = await createModule();
      await expect(
        service.upsertProgress(mockUser, mockCourseId, mockVideoId, {
          watched: true,
          watchedProgress: 0.9,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when watched=true with watchedProgress = 0.94', async () => {
      service = await createModule();
      await expect(
        service.upsertProgress(mockUser, mockCourseId, mockVideoId, {
          watched: true,
          watchedProgress: 0.94,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows watched=true with watchedProgress = 0.95', async () => {
      const acceptableProgress = {
        ...baseMockProgress,
        watched: true,
        watchedProgress: 0.95,
      };
      const module = await Test.createTestingModule({
        providers: [
          ProgressService,
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockSection]),
                }),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockVideo),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockVideo]),
                }),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(VideoProgress.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(acceptableProgress),
              }),
              aggregate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                session: jest.fn().mockReturnThis(),
              }),
              distinct: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideoStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: getModelToken(CourseStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: {
              canViewCourseForRequest: jest.fn().mockResolvedValue(true),
            },
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
          {
            provide: getConnectionToken(),
            useValue: mockConnection,
          },
        ],
      }).compile();

      const svc = module.get<ProgressService>(ProgressService);
      const result = await svc.upsertProgress(
        mockUser,
        mockCourseId,
        mockVideoId,
        {
          watched: true,
          watchedProgress: 0.95,
        },
      );

      expect(result.watched).toBe(true);
    });

    it('allows watched=true with watchedProgress = 0.99', async () => {
      const acceptableProgress = {
        ...baseMockProgress,
        watched: true,
        watchedProgress: 0.99,
      };
      const module = await Test.createTestingModule({
        providers: [
          ProgressService,
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockSection]),
                }),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockVideo),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockVideo]),
                }),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(VideoProgress.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(acceptableProgress),
              }),
              aggregate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                session: jest.fn().mockReturnThis(),
              }),
              distinct: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideoStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: getModelToken(CourseStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: {
              canViewCourseForRequest: jest.fn().mockResolvedValue(true),
            },
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
          {
            provide: getConnectionToken(),
            useValue: mockConnection,
          },
        ],
      }).compile();

      const svc = module.get<ProgressService>(ProgressService);
      const result = await svc.upsertProgress(
        mockUser,
        mockCourseId,
        mockVideoId,
        {
          watched: true,
          watchedProgress: 0.99,
        },
      );

      expect(result.watched).toBe(true);
    });

    it('returns VIDEO_COMPLETED when watched is true with sufficient progress', async () => {
      const completedProgress = {
        ...baseMockProgress,
        watched: true,
        watchedProgress: 1,
      };
      const module = await Test.createTestingModule({
        providers: [
          ProgressService,
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockSection]),
                }),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockVideo),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockVideo]),
                }),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(VideoProgress.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(completedProgress),
              }),
              aggregate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                session: jest.fn().mockReturnThis(),
              }),
              distinct: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                session: jest.fn().mockReturnThis(),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideoStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: getModelToken(CourseStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: {
              canViewCourseForRequest: jest.fn().mockResolvedValue(true),
            },
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
          {
            provide: getConnectionToken(),
            useValue: mockConnection,
          },
        ],
      }).compile();

      const svc = module.get<ProgressService>(ProgressService);
      const result = await svc.upsertProgress(
        mockUser,
        mockCourseId,
        mockVideoId,
        {
          watched: true,
          watchedProgress: 1,
        },
      );

      expect(result.eventType).toBe('VIDEO_COMPLETED');
    });
  });

  it('should be defined', async () => {
    service = await createModule();
    expect(service).toBeDefined();
  });

  describe('upsertProgress', () => {
    it('records progress and returns event type', async () => {
      service = await createModule();
      const result = await service.upsertProgress(
        mockUser,
        mockCourseId,
        mockVideoId,
        {
          watchedProgress: 0.5,
          lastPositionSeconds: 60,
        },
      );

      expect(result.videoId).toBe(mockVideoId);
      expect(result.watchedProgress).toBe(0.5);
      expect(result.eventType).toBe('VIDEO_PROGRESS_UPDATED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'VIDEO_PROGRESS_UPDATED',
        expect.objectContaining({ videoId: mockVideoId }),
      );
    });

    it('throws BadRequestException when watched=true with watchedProgress<0.9', async () => {
      service = await createModule();
      await expect(
        service.upsertProgress(mockUser, mockCourseId, mockVideoId, {
          watched: true,
          watchedProgress: 0.5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns VIDEO_COMPLETED when watched is true with sufficient progress', async () => {
      const completedProgress = {
        ...baseMockProgress,
        watched: true,
        watchedProgress: 1,
      };
      const module = await Test.createTestingModule({
        providers: [
          ProgressService,
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockSection]),
                }),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockVideo),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockVideo]),
                }),
              }),
            },
          },
          {
            provide: getModelToken(VideoProgress.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(completedProgress),
              }),
              aggregate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
              distinct: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideoStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: getModelToken(CourseStats.name),
            useValue: {
              findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: {
              canViewCourseForRequest: jest.fn().mockResolvedValue(true),
            },
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
        ],
      }).compile();

      const svc = module.get<ProgressService>(ProgressService);
      const result = await svc.upsertProgress(
        mockUser,
        mockCourseId,
        mockVideoId,
        {
          watched: true,
          watchedProgress: 1,
        },
      );

      expect(result.eventType).toBe('VIDEO_COMPLETED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'VIDEO_COMPLETED',
        expect.objectContaining({ videoId: mockVideoId }),
      );
    });
  });
});
